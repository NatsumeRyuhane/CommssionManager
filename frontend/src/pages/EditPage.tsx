import { useCallback, useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { api } from "../api/client";
import type {
  CommissionFile,
  CommissionNode,
  CommissionUpdate,
  CommissionVisibility,
  Rating,
  Visibility,
  VisibilityFieldKey,
} from "../api/types";
import { Chip } from "../components/Chip";
import { CoverFocalEditor, type StagedFocal } from "../components/CoverFocalEditor";
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

/**
 * Commission edit page. Edits live entirely on this page now — the standalone
 * VisibilityPage was folded in: every field group, stage header, and file tile
 * has an inline Public/Private/Inherit toggle whose changes are committed in
 * the same Save as the metadata form.
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
  const [categories, setCategories] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [characters, setCharacters] = useState<string[]>([]);
  const [artists, setArtists] = useState<string[]>([]);

  // Mirror of GET /visibility — mutated in place by every inline toggle and
  // shipped back wholesale on Save. Lookups by field name use a derived map
  // below to avoid scanning the array on every render.
  const [visibility, setVisibility] = useState<CommissionVisibility | null>(null);

  // Surfaced from StagesEditor via onPendingUploadsChange. Save is disabled
  // until both counts reach zero so the admin can't navigate away mid-upload
  // (which would unmount the editor and lose the upload state — the bytes
  // still land server-side but the user never sees the success/failure).
  const [pendingUploads, setPendingUploads] = useState({ uploading: 0, failed: 0 });
  const hasPendingUploads = pendingUploads.uploading > 0 || pendingUploads.failed > 0;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // block saves until the commission loads, so a quick Save can't overwrite
  // real data with the form's empty defaults
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState<string | null>(
    validId ? null : "Commission not found.",
  );
  const [coverVersion, setCoverVersion] = useState(0);
  const bumpCoverVersion = () => setCoverVersion((v) => v + 1);
  // focal edits stage here and commit together with the form submit
  const [pendingFocal, setPendingFocal] = useState<StagedFocal | null>(null);

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

  useEffect(() => {
    if (!validId) return;
    let cancelled = false;
    setInitialLoading(true);
    setInitialError(null);
    Promise.all([
      api.getCommission(commissionId),
      api.getCommissionVisibility(commissionId),
    ])
      .then(([d, v]) => {
        if (cancelled) return;
        setTitle(d.title ?? "");
        setDescription(d.description ?? "");
        setConfirmedAt(d.confirmed_at ? d.confirmed_at.slice(0, 10) : "");
        setPriceAmount(d.price_amount ?? "");
        setPriceCurrency(d.price_currency ?? "USD");
        setRating(d.rating ?? "general");
        setCategories(d.categories);
        setTags(d.tags);
        setCharacters(d.characters);
        setArtists(d.artists);
        setVisibility(v);
      })
      .catch((e) => !cancelled && setInitialError(String(e)))
      .finally(() => !cancelled && setInitialLoading(false));
    return () => {
      cancelled = true;
    };
  }, [commissionId, validId]);

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
  }

  function fieldVis(field: VisibilityFieldKey) {
    return visibility?.fields.find((f) => f.field === field) ?? null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (initialLoading) return;
    setBusy(true);
    setError(null);
    const payload: CommissionUpdate = {
      title: title.trim() || null,
      description: description || null,
      confirmed_at: confirmedAt || null,
      price_amount: priceAmount || null,
      price_currency: priceAmount ? priceCurrency : null,
      rating,
      category_names: categories,
      tag_names: tags,
      character_names: characters,
      artist_names: artists,
    };
    try {
      await api.updateCommission(commissionId, payload);
      if (pendingFocal) {
        await api.setFocal(
          pendingFocal.fileId,
          pendingFocal.x,
          pendingFocal.y,
          pendingFocal.zoom,
        );
      }
      if (visibility) {
        // Whole-shot replay: the backend accepts per-id maps and applies
        // each row, so we ship the full state. Nodes/files added by the
        // stages editor mid-session are absent from this state but get
        // refetched after every onChange so the next save covers them.
        // Title and description are omitted from the field map — the
        // backend rejects non-null overrides on those fields and the
        // frontend doesn't expose a toggle for them, so a stale `false`
        // round-tripping through Save would needlessly 422.
        await api.updateCommissionVisibility(commissionId, {
          visibility: visibility.visibility,
          fields: Object.fromEntries(
            visibility.fields
              .filter((f) => f.field !== "title" && f.field !== "description")
              .map((f) => [f.field, f.public]),
          ),
          nodes: Object.fromEntries(
            visibility.nodes.map((n) => [n.id, n.visibility]),
          ),
          files: Object.fromEntries(
            visibility.nodes.flatMap((n) =>
              n.files.map((f) => [f.id, f.visibility] as const),
            ),
          ),
        });
      }
      navigate(`/commissions/${commissionId}`);
    } catch (err) {
      // stay on the page: form fields, visibility toggles, and any staged
      // focal edit are kept
      setError(String(err));
    } finally {
      setBusy(false);
    }
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
                ? "Retry or dismiss the failed upload(s) before saving — Save navigates away and the upload state would be lost."
                : "Wait for uploads to finish — Save navigates away and the upload state would be lost."
            }
          >
            {pendingUploadsHint(pendingUploads)}
          </span>
        )}
        <button
          type="button"
          className="btn sm"
          onClick={() => navigate(`/commissions/${commissionId}`)}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn sm primary"
          form="commission-edit-form"
          onClick={(e) => {
            const form = (e.currentTarget.form ??
              document.getElementById("commission-edit-form")) as HTMLFormElement | null;
            form?.requestSubmit();
          }}
          disabled={busy || initialLoading || hasPendingUploads}
        >
          {!busy && <Check />}
          {busy ? "Saving…" : "Save"}
        </button>
      </TopBar>

      <form id="commission-edit-form" onSubmit={submit} className="edit-page">
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
                // move). Pull a fresh visibility snapshot so the per-row
                // toggles cover the new shape.
                void reloadVisibility();
              }}
              visibilityOverrides={visibilityOverrides}
              onNodeVisibilityChange={setNodeVisibility}
              onFileVisibilityChange={setFileVisibility}
              onPendingUploadsChange={setPendingUploads}
            />
          </div>

          {error && <div className="error-text" style={{ marginTop: 12 }}>{error}</div>}
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
      </form>
    </div>
  );
}

/** Human-readable summary of the pending upload counts, rendered next to the
 * Save button while Save is disabled. The shape ("N uploading, M failed")
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
