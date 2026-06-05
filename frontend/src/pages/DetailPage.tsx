import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { api } from "../api/client";
import type { CommissionDetail } from "../api/types";
import { Chip } from "../components/Chip";
import { Cover } from "../components/Cover";
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
      {copied ? "✓ copied!" : "{} Copy API JSON"}
    </button>
  );
}

export function DetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canWrite } = useAuth();
  const [data, setData] = useState<CommissionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.getCommission(Number(id)).then(setData).catch((e) => setError(String(e)));
  }, [id]);

  async function onDelete() {
    if (!data) return;
    if (!confirm(`Delete “${data.title}”? This cannot be undone.`)) return;
    await api.deleteCommission(data.id);
    navigate("/");
  }

  if (error) return <div className="app"><TopBar /><div style={{ padding: 24 }} className="error-text">{error}</div></div>;
  if (!data) return <div className="app"><TopBar /><div style={{ padding: 24 }} className="mono-sm">Loading…</div></div>;

  const regular = data.nodes.filter((n) => !n.is_detached);
  const detached = data.nodes.filter((n) => n.is_detached && n.files.length > 0);
  const lifecycle = [...detached, ...regular];
  const currentStage = data.current_stage;
  const paddedId = String(data.id).padStart(3, "0");

  const isPublic = data.effective_visibility !== "private";
  const subBits = [
    `commission #${paddedId}`,
    data.completed_at || null,
    data.cover?.width && data.cover?.height ? `${data.cover.width}×${data.cover.height}` : null,
    data.formats.length ? data.formats.join("/") : null,
  ].filter(Boolean) as string[];

  return (
    <div className="app">
      <TopBar>
        {canWrite && <CopyJsonButton id={data.id} />}
        {canWrite && (
          <Link to={`/commissions/${data.id}/visibility`} className="btn sm">
            👁 Visibility
          </Link>
        )}
        {canWrite && (
          <a className="btn sm" href={api.filesExportUrl(data.id)} download>
            ↗ Export zip
          </a>
        )}
        {canWrite && (
          <Link to={`/commissions/${data.id}/edit`} className="btn sm primary">
            ✎ Edit
          </Link>
        )}
        {canWrite && (
          <button className="btn sm danger" onClick={() => void onDelete()}>
            🗑 Delete
          </button>
        )}
      </TopBar>

      {/* breadcrumb sub-header */}
      <div className="detail-crumb">
        <Link to="/" className="mono-sm muted">← gallery</Link>
        <span className="mono-sm muted">/</span>
        <strong className="detail-crumb-title">{data.title}</strong>
        <span className="mono-sm muted">#{paddedId}</span>
        <span className="spacer" />
        <span
          className="mono-sm detail-visibility"
          style={{ color: isPublic ? "var(--accent)" : "var(--warn)" }}
        >
          {isPublic ? "🌐 public" : "🔒 private"}
          {currentStage && (
            <span className="muted" style={{ marginLeft: 8 }}>· stage: {currentStage}</span>
          )}
        </span>
      </div>

      {/* hero + side rail */}
      <div className="detail-hero">
        <div className="detail-hero-main">
          <div className="page-title">
            <div className="row gap-8 wrap" style={{ marginBottom: 10 }}>
              {data.categories.map((c) => (
                <Chip key={c} kind="cat">{c}</Chip>
              ))}
              {data.rating && <Chip kind="rating">{data.rating}</Chip>}
              {data.tags.map((t) => (
                <Chip key={t} kind="tag">{t}</Chip>
              ))}
            </div>
            <h1>{data.title}</h1>
            {subBits.length > 0 && (
              <div className="sub mono">{subBits.join(" · ")}</div>
            )}
          </div>
          <div className="detail-cover-wrap">
            <div className="detail-cover">
              <Cover cover={data.cover} />
            </div>
          </div>
          {data.description && (
            <p className="detail-description">{data.description}</p>
          )}
        </div>

        <aside className="detail-rail">
          <div className="detail-rail-visibility">
            <span className="mono-sm">visibility:</span>
            <span style={{ color: isPublic ? "var(--accent)" : "var(--warn)" }}>
              {isPublic ? "🌐 public" : "🔒 private"}
            </span>
            {canWrite && (
              <>
                <span className="spacer" />
                <Link
                  to={`/commissions/${data.id}/visibility`}
                  className="mono-sm"
                  style={{ color: "var(--accent)" }}
                >
                  edit
                </Link>
              </>
            )}
          </div>

          {data.completed_at && (
            <MetaRow label="Date" value={data.completed_at} pub />
          )}
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
              {data.characters.map((c) => <Chip key={c} kind="char">{c}</Chip>)}
            </MetaBlock>
          )}
          {data.artists.length > 0 && (
            <MetaBlock label="Artists">
              {data.artists.map((a) => <Chip key={a} kind="artist">{a}</Chip>)}
            </MetaBlock>
          )}
          {currentStage && (
            <MetaBlock label="Current stage">
              <Chip kind="cat">{currentStage}</Chip>
            </MetaBlock>
          )}
        </aside>
      </div>

      {/* lifecycle */}
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
          currentStage={currentStage}
          coverFileId={data.cover?.file_id ?? null}
        />
      </div>
    </div>
  );
}

function MetaRow({ label, value, pub }: { label: string; value: string; pub: boolean }) {
  return (
    <div className="detail-meta-row">
      <span className="row gap-4">
        <span className="label" style={{ margin: 0 }}>{label}</span>
        <span style={{ fontSize: 10, color: pub ? "var(--accent)" : "var(--warn)" }}>
          {pub ? "🌐" : "🔒"}
        </span>
      </span>
      <span style={{ fontSize: 13 }}>{value}</span>
    </div>
  );
}

function MetaBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="detail-meta-block">
      <div className="label">{label}</div>
      <div className="row wrap gap-4">{children}</div>
    </div>
  );
}
