import { useEffect, useMemo, useState } from "react";
import { Braces, Check, Download, Globe, Lock, Pencil, Trash2 } from "lucide-react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";

import { api } from "../api/client";
import type { Character, CommissionDetail } from "../api/types";
import { Chip } from "../components/Chip";
import { LifecycleStagesList } from "../components/LifecycleStagesList";
import { TopBar } from "../components/TopBar";
import { useAuth } from "../hooks/useAuth";

function CopyJsonButton({ id }: { id: number }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    const payload = await api.copyJson(id);
    await navigator.clipboard?.writeText(JSON.stringify(payload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button className="btn sm mono" onClick={() => void copy()} title="Copy commission JSON for agents">
      {copied ? <Check /> : <Braces />}
      {copied ? "copied!" : "Copy API JSON"}
    </button>
  );
}

/**
 * Render the read-only commission detail page. Admins are bounced to /edit on
 * entry (the edit view is a strict superset of detail), so this page renders
 * the visitor experience: metadata, cover, lifecycle stages, side rail.
 *
 * @returns The commission detail page UI as a JSX element
 */
export function DetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { me, loading: authLoading, canWrite } = useAuth();
  const [data, setData] = useState<CommissionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [characterIndex, setCharacterIndex] = useState<Map<string, Character>>(new Map());

  useEffect(() => {
    if (!id) return;
    api.getCommission(Number(id)).then(setData).catch((e) => setError(String(e)));
  }, [id]);

  useEffect(() => {
    if (!data?.characters.length) return;
    let cancelled = false;
    api
      .characters()
      .then((rows) => {
        if (cancelled) return;
        const next = new Map<string, Character>();
        for (const row of rows) next.set(row.name.toLowerCase(), row);
        setCharacterIndex(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [data?.characters]);

  const characterChips = useMemo(
    () =>
      (data?.characters ?? []).map((name) => {
        const match = characterIndex.get(name.toLowerCase());
        return { name, id: match?.id, hasPage: match?.has_page ?? false };
      }),
    [data?.characters, characterIndex],
  );

  async function onDelete() {
    if (!data) return;
    if (!confirm(`Delete “${data.title || `commission #${data.id}`}”? This cannot be undone.`)) return;
    await api.deleteCommission(data.id);
    navigate("/");
  }

  // Edit view is a strict superset of detail for admins — redirect so the
  // rail's metadata is editable in place. Wait for auth to resolve so we don't
  // briefly render the detail view and then jump (use `replace` so the back
  // button skips the detail route entirely).
  if (!authLoading && me?.kind === "admin" && id) {
    return <Navigate to={`/commissions/${id}/edit`} replace />;
  }

  if (error) return <div className="app"><TopBar /><div style={{ padding: 24 }} className="error-text">{error}</div></div>;
  if (!data) return <div className="app"><TopBar /><div style={{ padding: 24 }} className="mono-sm">Loading…</div></div>;

  const regular = data.nodes.filter((n) => !n.is_detached);
  const detached = data.nodes.filter((n) => n.is_detached && n.files.length > 0);
  const lifecycle = [...detached, ...regular];
  const paddedId = String(data.id).padStart(3, "0");

  const isPublic = data.effective_visibility !== "private";
  // no dimensions, file types, or dates here: those are per-file/per-stage
  // facts that vary across the lifecycle, so the stage tiles carry them
  const subBits = [`commission #${paddedId}`];

  return (
    <div className="app">
      <TopBar>
        {canWrite && <CopyJsonButton id={data.id} />}
        {canWrite && (
          <a className="btn sm" href={api.filesExportUrl(data.id)} download>
            <Download />
            Export zip
          </a>
        )}
        {canWrite && (
          <Link to={`/commissions/${data.id}/edit`} className="btn sm primary">
            <Pencil />
            Edit
          </Link>
        )}
        {canWrite && (
          <button className="btn sm danger" onClick={() => void onDelete()}>
            <Trash2 />
            Delete
          </button>
        )}
      </TopBar>

      {/* breadcrumb sub-header */}
      <div className="detail-crumb">
        <Link to="/" className="mono-sm muted">← gallery</Link>
        <span className="mono-sm muted">/</span>
        <strong
          className="detail-crumb-title"
          style={data.title ? undefined : { color: "var(--mute)", fontWeight: 400 }}
        >
          {data.title || "Untitled Commission"}
        </strong>
        <span className="mono-sm muted">#{paddedId}</span>
        <span className="spacer" />
        <span
          className="mono-sm detail-visibility inline-ic"
          style={{ color: isPublic ? "var(--accent)" : "var(--warn)" }}
        >
          {isPublic ? <Globe size={12} /> : <Lock size={12} />}
          {isPublic ? "public" : "private"}
        </span>
      </div>

      {/* scrolling content + sticky side rail; images open in the viewer from the stage list */}
      <div className="detail-layout">
        <div className="detail-main">
          <div className="page-title">
            <div className="row gap-8 wrap" style={{ marginBottom: 10 }}>
              {data.categories.map((c) => (
                <Chip key={c} kind="cat">{c}</Chip>
              ))}
              {data.rating && (
                <Chip kind="rating">
                  {data.rating.charAt(0).toUpperCase() + data.rating.slice(1)}
                </Chip>
              )}
              {data.tags.map((t) => (
                <Chip key={t} kind="tag">{t}</Chip>
              ))}
            </div>
            {/* the muted color keeps the placeholder distinguishable from a
                commission literally titled "Untitled Commission" */}
            <h1 style={data.title ? undefined : { color: "var(--mute)" }}>
              {data.title || "Untitled Commission"}
            </h1>
            {subBits.length > 0 && (
              <div className="sub mono">{subBits.join(" · ")}</div>
            )}
          </div>
          {data.description && (
            <p className="detail-description">{data.description}</p>
          )}

          <div className="detail-lifecycle">
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
              <div className="row gap-8">
                <strong style={{ fontSize: 15 }}>Lifecycle</strong>
                <span className="mono-sm muted">
                  {regular.length} stages{detached.length ? " · detached present" : ""}
                </span>
              </div>
            </div>
            <LifecycleStagesList
              nodes={lifecycle}
              coverFileId={data.cover?.file_id ?? null}
            />
          </div>
        </div>

        <aside className="detail-rail">
          <div className="detail-rail-inner">
            <div className="detail-rail-visibility">
              <span className="mono-sm">visibility:</span>
              <span className="inline-ic" style={{ color: isPublic ? "var(--accent)" : "var(--warn)" }}>
                {isPublic ? <Globe size={12} /> : <Lock size={12} />}
                {isPublic ? "public" : "private"}
              </span>
            </div>

            {canWrite && data.confirmed_at && (
              <MetaRow label="Confirmed" value={data.confirmed_at.slice(0, 10)} pub={false} />
            )}
            {canWrite && data.price_amount && (
              <MetaRow
                label="Price"
                value={`${data.price_amount}${data.price_currency ? ` ${data.price_currency}` : ""}`}
                pub={false}
              />
            )}

            {data.characters.length > 0 && (
              <MetaBlock label="Characters">
                {characterChips.map((c) => (
                  <Chip
                    key={c.name}
                    kind="char"
                    to={c.id != null ? `/characters/${c.id}` : undefined}
                    hasPage={c.hasPage}
                  >
                    {c.name}
                  </Chip>
                ))}
              </MetaBlock>
            )}
            {data.artists.length > 0 && (
              <MetaBlock label="Artists">
                {data.artists.map((a) => <Chip key={a} kind="artist">{a}</Chip>)}
              </MetaBlock>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

/**
 * Render a labeled metadata row that displays a value alongside a publication status icon.
 *
 * @param label - The row label text shown on the left.
 * @param value - The metadata value displayed on the right.
 * @param pub - If `true`, displays a globe icon (public) styled with the accent color; if `false`, displays a lock icon (private) styled with the warning color.
 * @returns The rendered JSX element for the metadata row.
 */
function MetaRow({ label, value, pub }: { label: string; value: string; pub: boolean }) {
  return (
    <div className="detail-meta-row">
      <span className="row gap-4">
        <span className="label" style={{ margin: 0 }}>{label}</span>
        <span
          className="inline-ic"
          title={pub ? "shown publicly" : "private"}
          style={{ color: pub ? "var(--accent)" : "var(--warn)" }}
        >
          {pub ? <Globe size={11} /> : <Lock size={11} />}
        </span>
      </span>
      <span style={{ fontSize: 13 }}>{value}</span>
    </div>
  );
}

/**
 * Renders a titled metadata block that displays its children in a wrapped row.
 *
 * @param label - The block title shown above the content
 * @param children - Elements to render inside the block's wrapped row (e.g., chips or meta items)
 * @returns A JSX element containing the labeled metadata block
 */
function MetaBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="detail-meta-block">
      <div className="label">{label}</div>
      <div className="row wrap gap-4">{children}</div>
    </div>
  );
}
