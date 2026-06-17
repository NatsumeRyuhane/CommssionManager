import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Download, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { api } from "../api/client";
import type {
  CommissionDetail,
  CommissionFile,
  CommissionNode,
  CommissionStatus,
  CommissionUpdate,
  CommissionVisibility,
  CommissionVisibilityUpdate,
  Rating,
  Visibility,
  VisibilityFieldKey,
} from "../api/types";
import { Chip } from "../components/Chip";
import { CopyJsonButton } from "../components/CopyJsonButton";
import { CoverFocalEditor, type StagedFocal } from "../components/CoverFocalEditor";
import { Skeleton } from "../components/Skeleton";
import { StagesEditor } from "../components/StagesEditor";
import { TaxonomyPicker } from "../components/TaxonomyPicker";
import { TopBar } from "../components/TopBar";
import { FieldVisibilityToggle, VisibilityToggle } from "../components/VisibilityToggle";
import { useAuth } from "../hooks/useAuth";

const RATINGS: { value: Rating; label: string }[] = [
  { value: "general", label: "General" },
  { value: "mature", label: "Mature" },
  { value: "adult", label: "Adult" },
];

const STATUSES: { value: CommissionStatus; label: string }[] = [
  { value: "ongoing", label: "Ongoing" },
  { value: "completed", label: "Completed" },
];

/** Field keys whose visibility override is editable inline next to its
 * corresponding edit-page form group. The map keeps the FieldGroup → key
 * pairing in one place so adding a new field doesn't drift between the
 * settings UI and the visibility schema. */
const EDITABLE_FIELDS: Record<VisibilityFieldKey, string> = {
  title: "Title",
  description: "Description",
  labels: "Categories & tags",
  rating: "Rating",
  characters: "Characters",
  artists: "Artists",
  confirmed_at: "Confirmed",
  price: "Price",
};

/** Idle window before a burst of edits is flushed to the backend. */
const AUTOSAVE_DELAY_MS = 5000;

/** The independent save units the page debounces and flushes one by one. The
 * stages editor persists its own structural edits immediately and is not part
 * of this set. */
type SaveUnit = "metadata" | "focal" | "visibility";

/** Visible auto-save state. `dirty` means a flush is scheduled; `error` means
 * the last flush left some change unsaved (out of sync) until the user retries
 * by editing again or discards via refresh-from-server. */
type SaveStatus = "saved" | "dirty" | "saving" | "error";

/** The metadata fields the page debounces into a single PATCH. */
interface MetaFields {
  title: string;
  description: string;
  confirmedAt: string;
  priceAmount: string;
  priceCurrency: string;
  rating: Rating;
  status: CommissionStatus;
  categories: string[];
  tags: string[];
  characters: string[];
  artists: string[];
}

/** Build the PATCH body from the live form fields. Kept pure so the same shape
 * drives both the network call and the change-detection signature. */
function metaPayload(m: MetaFields): CommissionUpdate {
  return {
    title: m.title.trim() || null,
    description: m.description || null,
    confirmed_at: m.confirmedAt || null,
    price_amount: m.priceAmount || null,
    price_currency: m.priceAmount ? m.priceCurrency : null,
    rating: m.rating,
    status: m.status,
    category_names: m.categories,
    tag_names: m.tags,
    character_names: m.characters,
    artist_names: m.artists,
  };
}

/** Map a loaded commission into the form-field representation, mirroring the
 * defaults the inputs apply so the change-detection baseline matches. */
function fieldsFromDetail(d: CommissionDetail): MetaFields {
  return {
    title: d.title ?? "",
    description: d.description ?? "",
    confirmedAt: d.confirmed_at ? d.confirmed_at.slice(0, 10) : "",
    priceAmount: d.price_amount ?? "",
    priceCurrency: d.price_currency ?? "USD",
    rating: d.rating ?? "general",
    status: d.status ?? "ongoing",
    categories: d.categories,
    tags: d.tags,
    characters: d.characters,
    artists: d.artists,
  };
}

/** Whole-shot visibility replay: the backend applies per-id maps, so we ship
 * the full live state. Title/description are dropped — the backend rejects
 * non-null overrides on them and the UI exposes no toggle. */
function visibilityPayload(v: CommissionVisibility): CommissionVisibilityUpdate {
  return {
    visibility: v.visibility,
    fields: Object.fromEntries(
      v.fields
        .filter((f) => f.field !== "title" && f.field !== "description")
        .map((f) => [f.field, f.public]),
    ),
    nodes: Object.fromEntries(v.nodes.map((n) => [n.id, n.visibility])),
    files: Object.fromEntries(
      v.nodes.flatMap((n) => n.files.map((f) => [f.id, f.visibility] as const)),
    ),
  };
}

/**
 * Commission edit page. Edits live entirely on this page now — the standalone
 * VisibilityPage was folded in: every field group, stage header, and file tile
 * has an inline Public/Private/Inherit toggle.
 *
 * Saving is automatic: metadata, the staged cover focal, and visibility edits
 * are buffered and flushed five seconds after the user stops typing, applied to
 * the backend one unit at a time. A unit that fails to apply is surfaced as an
 * out-of-sync warning the user can clear by discarding (refetch from server).
 */
export function EditPage() {
  const { id } = useParams();
  const commissionId = Number(id);
  const validId = Number.isInteger(commissionId) && commissionId > 0;
  const navigate = useNavigate();
  const { canWrite, loading: authLoading } = useAuth();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [confirmedAt, setConfirmedAt] = useState("");
  const [priceAmount, setPriceAmount] = useState("");
  const [priceCurrency, setPriceCurrency] = useState("USD");
  const [rating, setRating] = useState<Rating>("general");
  const [status, setStatus] = useState<CommissionStatus>("ongoing");
  const [categories, setCategories] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [characters, setCharacters] = useState<string[]>([]);
  const [artists, setArtists] = useState<string[]>([]);

  // Mirror of GET /visibility — mutated in place by every inline toggle and
  // shipped back wholesale on the next auto-save pass. Lookups by field name
  // use a derived map below to avoid scanning the array on every render.
  const [visibility, setVisibility] = useState<CommissionVisibility | null>(null);

  // Surfaced from StagesEditor via onPendingUploadsChange. Done is disabled
  // until both counts reach zero so the admin can't navigate away mid-upload
  // (which would unmount the editor and lose the upload state — the bytes
  // still land server-side but the user never sees the success/failure).
  const [pendingUploads, setPendingUploads] = useState({ uploading: 0, failed: 0 });
  const hasPendingUploads = pendingUploads.uploading > 0 || pendingUploads.failed > 0;

  // `busy` only gates the destructive Delete action now; metadata/focal/
  // visibility persist through the debounced auto-save below.
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // block auto-save until the commission loads, so the form's empty defaults
  // can't overwrite real data before it arrives
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState<string | null>(
    validId ? null : "Commission not found.",
  );
  const [coverVersion, setCoverVersion] = useState(0);
  const bumpCoverVersion = () => setCoverVersion((v) => v + 1);
  // focal edits stage here and flush with the next auto-save pass
  const [pendingFocal, setPendingFocal] = useState<StagedFocal | null>(null);

  // ── Auto-save bookkeeping ────────────────────────────────────────────────
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  // Units edited since the last successful flush. Refs (not state) so the
  // debounce timer reads the live set without re-subscribing.
  const dirtyRef = useRef<Set<SaveUnit>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Holds the in-flight flush so concurrent callers (Done, unmount, stages
  // reload) coalesce onto it and await the same settle, instead of racing or
  // getting a premature result.
  const activeFlushRef = useRef<Promise<boolean> | null>(null);
  // Always points at the latest flush closure so the stale timer callback still
  // sees current form/visibility state.
  const flushRef = useRef<() => Promise<boolean>>(() => Promise.resolve(true));
  // JSON signature of the last metadata known to be in sync with the server.
  const savedMetaSigRef = useRef<string>("");

  // (Re)arm the idle timer. Showing "dirty" while a save is mid-flight would be
  // misleading, so the status only steps back to dirty when not actively saving.
  const scheduleSave = useCallback(() => {
    setSaveStatus((s) => (s === "saving" ? s : "dirty"));
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void flushRef.current(), AUTOSAVE_DELAY_MS);
  }, []);

  const markDirty = useCallback(
    (unit: SaveUnit) => {
      dirtyRef.current.add(unit);
      scheduleSave();
    },
    [scheduleSave],
  );

  const reloadVisibility = useCallback(async () => {
    if (!validId) return;
    try {
      setVisibility(await api.getCommissionVisibility(commissionId));
    } catch {
      // visibility state stays null; toggles render unobtrusively as nothing
    }
  }, [commissionId, validId]);

  // Flat lookup maps from the visibility tree — handed to StagesEditor so the
  // stage-header and file-tile toggles read from our live state instead of the
  // server snapshot StagesEditor fetched. Without this the toggles look broken:
  // the click stages the change (it lands on Save) but the rendered value
  // doesn't update.
  const visibilityOverrides = useMemo(() => {
    const nodes = new Map<number, import("../api/types").Visibility | null>();
    const files = new Map<number, import("../api/types").Visibility | null>();
    if (visibility) {
      for (const n of visibility.nodes) {
        nodes.set(n.id, n.visibility);
        for (const f of n.files) files.set(f.id, f.visibility);
      }
    }
    return { nodes, files };
  }, [visibility]);

  // Bumped per load so a superseded fetch (id change, or a refresh racing an
  // in-flight load) can't apply stale data over newer state.
  const loadSeqRef = useRef(0);

  const loadCommission = useCallback(async () => {
    if (!validId) return;
    const seq = ++loadSeqRef.current;
    setInitialLoading(true);
    setInitialError(null);
    // Visibility is non-essential — only the inline toggles need it — so fetch
    // it in the background and apply it when it lands (or null it on failure).
    // Awaiting it here would needlessly gate the whole editor on a slow request.
    api
      .getCommissionVisibility(commissionId)
      .then((v) => seq === loadSeqRef.current && setVisibility(v))
      .catch(() => seq === loadSeqRef.current && setVisibility(null));
    // The commission load gates the editor: its failure is fatal (nothing to edit).
    let commission: CommissionDetail;
    try {
      commission = await api.getCommission(commissionId);
    } catch (err) {
      if (seq === loadSeqRef.current) {
        setInitialError(String(err));
        setInitialLoading(false);
      }
      return;
    }
    if (seq !== loadSeqRef.current) return; // superseded
    const f = fieldsFromDetail(commission);
    setTitle(f.title);
    setDescription(f.description);
    setConfirmedAt(f.confirmedAt);
    setPriceAmount(f.priceAmount);
    setPriceCurrency(f.priceCurrency);
    setRating(f.rating);
    setStatus(f.status);
    setCategories(f.categories);
    setTags(f.tags);
    setCharacters(f.characters);
    setArtists(f.artists);
    // (Visibility is owned by the background fetch above, not set here.)
    // Re-baseline the auto-save bookkeeping against the freshly loaded snapshot.
    // This doubles as the discard path (refresh-from-server), so any buffered or
    // out-of-sync edits are dropped right here.
    savedMetaSigRef.current = JSON.stringify(metaPayload(f));
    dirtyRef.current = new Set();
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setPendingFocal(null);
    setSaveError(null);
    setSaveStatus("saved");
    bumpCoverVersion();
    setInitialLoading(false);
  }, [commissionId, validId]);

  useEffect(() => {
    void loadCommission();
  }, [loadCommission]);

  // Live metadata fields as the auto-save payload sees them.
  function currentMeta(): MetaFields {
    return {
      title,
      description,
      confirmedAt,
      priceAmount,
      priceCurrency,
      rating,
      status,
      categories,
      tags,
      characters,
      artists,
    };
  }

  // Detect metadata edits by signature diff against the last in-sync snapshot,
  // so the initial load and discard/refresh resets aren't mistaken for edits.
  useEffect(() => {
    if (initialLoading) return;
    const sig = JSON.stringify(metaPayload(currentMeta()));
    if (sig !== savedMetaSigRef.current) markDirty("metadata");
    else dirtyRef.current.delete("metadata");
    // currentMeta reads exactly the field states listed in the dep array
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    initialLoading,
    title,
    description,
    confirmedAt,
    priceAmount,
    priceCurrency,
    rating,
    status,
    categories,
    tags,
    characters,
    artists,
  ]);

  // A staged cover-focal edit is a pending change; clearing it drops the unit.
  useEffect(() => {
    if (initialLoading) return;
    if (pendingFocal) markDirty("focal");
    else dirtyRef.current.delete("focal");
  }, [pendingFocal, initialLoading, markDirty]);

  // Guard against losing buffered edits to a tab close / reload.
  useEffect(() => {
    if (saveStatus === "saved") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [saveStatus]);

  // Best-effort flush on unmount (e.g. breadcrumb navigation) so edits inside
  // the idle window still reach the server. Post-unmount state updates are
  // harmless no-ops; the network calls are what matter.
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (dirtyRef.current.size > 0) void flushRef.current();
    },
    [],
  );

  if (!authLoading && !canWrite) {
    return (
      <div className="app">
        <TopBar />
        <div style={{ padding: 48, textAlign: "center" }} className="muted">
          Editing requires admin sign-in.
        </div>
      </div>
    );
  }

  if (initialError) {
    return (
      <div className="app">
        <TopBar />
        <div style={{ padding: 24 }} className="error-text">{initialError}</div>
      </div>
    );
  }

  function setCommissionVisibility(value: Visibility | null) {
    setVisibility((current) =>
      current ? { ...current, visibility: value } : current,
    );
    markDirty("visibility");
  }

  function setFieldVisibility(field: VisibilityFieldKey, value: boolean | null) {
    setVisibility((current) =>
      current
        ? {
            ...current,
            fields: current.fields.map((f) =>
              f.field === field ? { ...f, public: value } : f,
            ),
          }
        : current,
    );
    markDirty("visibility");
  }

  function setNodeVisibility(node: CommissionNode, value: Visibility | null) {
    setVisibility((current) =>
      current
        ? {
            ...current,
            nodes: current.nodes.map((n) =>
              n.id === node.id ? { ...n, visibility: value } : n,
            ),
          }
        : current,
    );
    markDirty("visibility");
  }

  function setFileVisibility(file: CommissionFile, value: Visibility | null) {
    setVisibility((current) =>
      current
        ? {
            ...current,
            nodes: current.nodes.map((n) => ({
              ...n,
              files: n.files.map((f) =>
                f.id === file.id ? { ...f, visibility: value } : f,
              ),
            })),
          }
        : current,
    );
    markDirty("visibility");
  }

  function fieldVis(field: VisibilityFieldKey) {
    return visibility?.fields.find((f) => f.field === field) ?? null;
  }

  // Admins are redirected here from the detail view, so delete lives on this
  // topbar — it's the only place a signed-in admin can reach the action.
  async function onDelete() {
    const label = title.trim() || `commission #${commissionId}`;
    if (!confirm(`Delete “${label}”? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteCommission(commissionId);
      navigate("/");
    } catch (err) {
      setError(String(err));
      setBusy(false);
    }
  }

  // One persistence pass, applying the buffered units one at a time. Never run
  // concurrently — runFlush() serializes callers onto a single in-flight pass.
  async function doFlush(): Promise<boolean> {
    const units = dirtyRef.current;
    dirtyRef.current = new Set();
    setSaveStatus("saving");
    setSaveError(null);

    // Human-readable names of the units that failed, surfaced in the warning.
    const failed: string[] = [];

    if (units.has("metadata")) {
      const fields = currentMeta();
      const sig = JSON.stringify(metaPayload(fields));
      try {
        await api.updateCommission(commissionId, metaPayload(fields));
        savedMetaSigRef.current = sig;
      } catch (err) {
        failed.push(`details (${String(err)})`);
      }
    }
    if (units.has("focal") && pendingFocal) {
      try {
        await api.setFocal(
          pendingFocal.fileId,
          pendingFocal.x,
          pendingFocal.y,
          pendingFocal.zoom,
        );
        // Reconcile the focal editor against the now-saved value: clearing the
        // stage and bumping the version drops its "pending" indicator.
        setPendingFocal(null);
        bumpCoverVersion();
      } catch (err) {
        failed.push(`cover focal (${String(err)})`);
      }
    }
    if (units.has("visibility") && visibility) {
      try {
        await api.updateCommissionVisibility(commissionId, visibilityPayload(visibility));
      } catch (err) {
        failed.push(`visibility (${String(err)})`);
      }
    }

    if (failed.length > 0) {
      setSaveError(`Couldn't save ${failed.join("; ")}.`);
      setSaveStatus("error");
      return false;
    }
    // Edits that arrived during the flush schedule the next pass.
    if (dirtyRef.current.size > 0) {
      scheduleSave();
      return false;
    }
    setSaveStatus("saved");
    return true;
  }

  // Flush the buffered edits one unit at a time. Returns true when nothing is
  // left unsaved (safe to navigate away). A unit that fails is NOT re-queued —
  // it stays visible but out of sync until the user edits again or discards via
  // refresh-from-server. Concurrent callers await the in-flight pass rather than
  // getting an immediate, premature result.
  async function runFlush(): Promise<boolean> {
    if (activeFlushRef.current) return activeFlushRef.current;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (initialLoading || !validId || dirtyRef.current.size === 0) {
      setSaveStatus((s) => (s === "dirty" ? "saved" : s));
      return saveStatus !== "error";
    }
    const pass = doFlush();
    activeFlushRef.current = pass;
    try {
      return await pass;
    } finally {
      activeFlushRef.current = null;
    }
  }
  // Keep the timer callback pointed at the latest closure.
  flushRef.current = runFlush;

  // Leave the editor for the read-only view, persisting any buffered edits
  // first. Stays put if the flush left something unsaved so the warning shows.
  async function finishEditing() {
    if (await runFlush()) navigate(`/commissions/${commissionId}`);
  }

  // Discard buffered/out-of-sync edits and re-pull authoritative server state.
  function refreshFromServer() {
    void loadCommission();
  }

  return (
    <div className="app">
      <TopBar>
        <span className="mono-sm muted">editing</span>
        {hasPendingUploads && (
          <span
            className="mono-sm muted edit-pending-uploads-hint"
            role="status"
            title={
              pendingUploads.failed > 0
                ? "Retry or dismiss the failed upload(s) before leaving — Done navigates away and the upload state would be lost."
                : "Wait for uploads to finish — Done navigates away and the upload state would be lost."
            }
          >
            {pendingUploadsHint(pendingUploads)}
          </span>
        )}
        {/* Admin actions that lived on the detail topbar before admins were
            redirected straight to /edit — restored here so they remain
            reachable. Delete is danger-styled and sits before the passive
            save-status indicator and the Done button to avoid being mistaken
            for them. */}
        <CopyJsonButton id={commissionId} />
        <a className="btn sm" href={api.filesExportUrl(commissionId)} download>
          <Download />
          Export zip
        </a>
        <button
          type="button"
          className="btn sm danger"
          onClick={() => void onDelete()}
          disabled={busy || initialLoading}
        >
          <Trash2 />
          Delete
        </button>
        {!initialLoading && <SaveStatusIndicator status={saveStatus} error={saveError} />}
        {saveStatus === "error" && (
          <button
            type="button"
            className="btn sm"
            onClick={refreshFromServer}
            title="Discard the out-of-sync changes and reload this commission from the server"
          >
            <RefreshCw />
            Discard &amp; refresh
          </button>
        )}
        <button
          type="button"
          className="btn sm primary"
          onClick={() => void finishEditing()}
          disabled={busy || initialLoading || hasPendingUploads}
          title={
            hasPendingUploads
              ? "Wait for uploads to finish before leaving the editor."
              : undefined
          }
        >
          <Check />
          Done
        </button>
      </TopBar>

      {/* Breadcrumb mirrors DetailPage so navigation reads the same on both
          pages — the title reflects the *current* draft (local input state),
          not the server snapshot, so the user can see what they're naming the
          commission as they type. */}
      <div className="detail-crumb">
        <Link to="/" className="mono-sm muted">← gallery</Link>
        <span className="mono-sm muted">/</span>
        <strong
          className="detail-crumb-title"
          style={title.trim() ? undefined : { color: "var(--mute)", fontWeight: 400 }}
        >
          {title.trim() || "Untitled Commission"}
        </strong>
        <span className="mono-sm muted">#{String(commissionId).padStart(3, "0")}</span>
      </div>

      {/* Edits persist through the debounced auto-save; the form element only
          groups the fields. Block native submit so Enter can't trigger a
          reload. */}
      <form
        id="commission-edit-form"
        onSubmit={(e) => e.preventDefault()}
        className="edit-page"
      >
        {initialLoading ? (
          <EditSkeleton />
        ) : (
          <>
        <div className="edit-main">
          {/* Title and description don't carry a per-commission visibility
              toggle — the override doesn't make sense at the record level
              (a hidden title on an otherwise-public commission looks broken
              to readers). The site-wide default applies; configure under
              Settings → Visibility. The backend rejects non-null overrides
              on these fields as a matching guard. */}
          <FieldGroup label="Title">
            <input
              className="field edit-title-input"
              value={title}
              placeholder="Untitled Commission"
              onChange={(e) => setTitle(e.target.value)}
            />
          </FieldGroup>

          <FieldGroup label="Description">
            <textarea
              className="field edit-description-input"
              rows={2}
              placeholder="Description…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </FieldGroup>

          <div style={{ marginTop: 18 }}>
            <StagesEditor
              commissionId={commissionId}
              onChange={() => {
                bumpCoverVersion();
                // Nodes or files may have appeared/disappeared (upload, delete,
                // move). Flush any buffered field/visibility edits first so the
                // reload below doesn't clobber them, then pull a fresh
                // visibility snapshot so the per-row toggles cover the new shape.
                void (async () => {
                  await flushRef.current();
                  await reloadVisibility();
                })();
              }}
              visibilityOverrides={visibilityOverrides}
              onNodeVisibilityChange={setNodeVisibility}
              onFileVisibilityChange={setFileVisibility}
              onPendingUploadsChange={setPendingUploads}
            />
          </div>

          {error && <div className="error-text" style={{ marginTop: 12 }}>{error}</div>}
          {saveStatus === "error" && saveError && (
            <div className="error-text" style={{ marginTop: 12 }} role="alert">
              {saveError} Your edits are kept on the page — keep editing to retry,
              or use “Discard &amp; refresh” to reload from the server.
            </div>
          )}
        </div>

        <aside className="edit-rail">
          {visibility && (
            <div className="edit-commission-visibility">
              <div className="edit-field-label-row">
                <strong>Commission</strong>
                <VisibilityToggle
                  value={visibility.visibility}
                  effective={visibility.effective_visibility}
                  onChange={setCommissionVisibility}
                  ariaLabel="Commission visibility"
                />
              </div>
              <div className="mono-sm muted">
                Default for every stage / file with no override. Precedence:
                site default → commission → stage → file.
              </div>
            </div>
          )}

          <CoverFocalEditor
            commissionId={commissionId}
            version={coverVersion}
            onStage={setPendingFocal}
          />
          <FieldGroup
            label={EDITABLE_FIELDS.confirmed_at}
            visibility={
              fieldVis("confirmed_at") && (
                <FieldVisibilityToggle
                  value={fieldVis("confirmed_at")!.public}
                  effective={fieldVis("confirmed_at")!.effective_public}
                  onChange={(v) => setFieldVisibility("confirmed_at", v)}
                  ariaLabel="Confirmed-at visibility"
                />
              )
            }
          >
            <input
              className="field"
              type="date"
              value={confirmedAt}
              onChange={(e) => setConfirmedAt(e.target.value)}
            />
          </FieldGroup>
          <FieldGroup
            label={EDITABLE_FIELDS.price}
            visibility={
              fieldVis("price") && (
                <FieldVisibilityToggle
                  value={fieldVis("price")!.public}
                  effective={fieldVis("price")!.effective_public}
                  onChange={(v) => setFieldVisibility("price", v)}
                  ariaLabel="Price visibility"
                />
              )
            }
          >
            <div className="row gap-4">
              <input
                className="field"
                style={{ flex: 1 }}
                value={priceAmount}
                onChange={(e) => setPriceAmount(e.target.value)}
                placeholder="0"
              />
              <select
                className="field"
                style={{ width: 80 }}
                value={priceCurrency}
                onChange={(e) => setPriceCurrency(e.target.value)}
              >
                <option>USD</option>
                <option>JPY</option>
                <option>CNY</option>
                <option>EUR</option>
              </select>
            </div>
          </FieldGroup>

          <FieldGroup
            label="Rating · pick one"
            visibility={
              fieldVis("rating") && (
                <FieldVisibilityToggle
                  value={fieldVis("rating")!.public}
                  effective={fieldVis("rating")!.effective_public}
                  onChange={(v) => setFieldVisibility("rating", v)}
                  ariaLabel="Rating visibility"
                />
              )
            }
          >
            <div className="row gap-4 wrap">
              {RATINGS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRating(r.value)}
                  className="chip-button"
                >
                  <Chip kind="rating" ghost={rating !== r.value}>
                    {rating === r.value ? "✓ " : ""}
                    {r.label}
                  </Chip>
                </button>
              ))}
            </div>
          </FieldGroup>

          {/* Status has no inline visibility toggle: it isn't gated per-field
              (it's shown to everyone), unlike rating/labels/etc. */}
          <FieldGroup label="Status · pick one">
            <div className="row gap-4 wrap">
              {STATUSES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setStatus(s.value)}
                  className="chip-button"
                >
                  <Chip kind="status" ghost={status !== s.value}>
                    {status === s.value ? "✓ " : ""}
                    {s.label}
                  </Chip>
                </button>
              ))}
            </div>
          </FieldGroup>

          <FieldGroup
            label={EDITABLE_FIELDS.labels}
            visibility={
              fieldVis("labels") && (
                <FieldVisibilityToggle
                  value={fieldVis("labels")!.public}
                  effective={fieldVis("labels")!.effective_public}
                  onChange={(v) => setFieldVisibility("labels", v)}
                  ariaLabel="Categories and tags visibility"
                />
              )
            }
          >
            <div className="edit-labels-grid">
              <div>
                <div className="mono-sm muted" style={{ marginBottom: 4 }}>
                  Categories
                </div>
                <TaxonomyPicker kind="category" values={categories} onChange={setCategories} />
              </div>
              <div>
                <div className="mono-sm muted" style={{ marginBottom: 4 }}>
                  Tags
                </div>
                <TaxonomyPicker kind="tag" values={tags} onChange={setTags} />
              </div>
            </div>
          </FieldGroup>
          <FieldGroup
            label={EDITABLE_FIELDS.characters}
            visibility={
              fieldVis("characters") && (
                <FieldVisibilityToggle
                  value={fieldVis("characters")!.public}
                  effective={fieldVis("characters")!.effective_public}
                  onChange={(v) => setFieldVisibility("characters", v)}
                  ariaLabel="Characters visibility"
                />
              )
            }
          >
            <TaxonomyPicker kind="character" values={characters} onChange={setCharacters} />
          </FieldGroup>
          <FieldGroup
            label={EDITABLE_FIELDS.artists}
            visibility={
              fieldVis("artists") && (
                <FieldVisibilityToggle
                  value={fieldVis("artists")!.public}
                  effective={fieldVis("artists")!.effective_public}
                  onChange={(v) => setFieldVisibility("artists", v)}
                  ariaLabel="Artists visibility"
                />
              )
            }
          >
            <TaxonomyPicker kind="artist" values={artists} onChange={setArtists} />
          </FieldGroup>
        </aside>
          </>
        )}
      </form>
    </div>
  );
}

/**
 * Loading placeholder for the editor: mirrors the two-column edit-page grid
 * (main content + side rail) so the form doesn't jump in once the commission
 * loads, replacing the old flash of empty inputs.
 */
function EditSkeleton() {
  return (
    <>
      <div className="edit-main" aria-busy="true">
        <Skeleton w={48} h={12} style={{ marginBottom: 8 }} />
        <Skeleton w="60%" h={34} style={{ marginBottom: 20 }} />
        <Skeleton w={88} h={12} style={{ marginBottom: 8 }} />
        <Skeleton w="100%" h={60} style={{ marginBottom: 24 }} />
        <Skeleton w={120} h={16} style={{ marginBottom: 12 }} />
        <div className="col gap-12">
          <Skeleton w="100%" h={140} />
          <Skeleton w="100%" h={140} />
        </div>
      </div>
      <aside className="edit-rail" aria-busy="true">
        <Skeleton w="100%" h={52} />
        <Skeleton w="100%" h={180} />
        {[0, 1, 2, 3].map((i) => (
          <div key={i}>
            <Skeleton w={90} h={12} style={{ marginBottom: 6 }} />
            <Skeleton w="100%" h={36} />
          </div>
        ))}
      </aside>
    </>
  );
}

/** Passive auto-save state shown in the edit topbar — the page persists on its
 * own, so this replaces the old explicit Save button. */
function SaveStatusIndicator({
  status,
  error,
}: {
  status: SaveStatus;
  error: string | null;
}) {
  if (status === "saving") {
    return (
      <span className="mono-sm muted inline-ic" role="status">
        <Loader2 size={14} className="spin" />
        Saving…
      </span>
    );
  }
  if (status === "dirty") {
    return (
      <span className="mono-sm muted" role="status">
        Unsaved changes…
      </span>
    );
  }
  if (status === "error") {
    return (
      <span
        className="mono-sm error-text inline-ic"
        role="status"
        title={error ?? undefined}
      >
        <AlertTriangle size={14} />
        Some changes didn&rsquo;t save
      </span>
    );
  }
  return (
    <span className="mono-sm muted inline-ic" role="status">
      <Check size={14} />
      Saved
    </span>
  );
}

/** Human-readable summary of the pending upload counts, rendered next to the
 * Done button while it is disabled. The shape ("N uploading, M failed")
 * mirrors what the user sees on the tiles themselves. */
function pendingUploadsHint(counts: { uploading: number; failed: number }): string {
  const parts: string[] = [];
  if (counts.uploading > 0) parts.push(`${counts.uploading} uploading`);
  if (counts.failed > 0) parts.push(`${counts.failed} failed — retry or dismiss`);
  return parts.join(", ");
}

/**
 * Labeled wrapper for a form section. The optional `visibility` slot renders a
 * three-state Public/Private/Inherit toggle next to the label so every editable
 * field carries its visibility control inline.
 */
function FieldGroup({
  label,
  children,
  visibility,
}: {
  label: string;
  children: React.ReactNode;
  visibility?: React.ReactNode;
}) {
  return (
    <div className="edit-field-group">
      <div className="edit-field-label-row">
        <div className="label">{label}</div>
        {visibility}
      </div>
      {children}
    </div>
  );
}
