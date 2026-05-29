import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { api } from "../api/client";
import type { CommissionDetail } from "../api/types";
import { Chip } from "../components/Chip";
import { Cover } from "../components/Cover";
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
  // Detached pinned first, then stages newest -> oldest (matches the wireframe).
  const lifecycle = [...detached, ...[...regular].reverse()];
  const currentStage = data.current_stage;

  return (
    <div className="app">
      <TopBar>
        {canWrite && <CopyJsonButton id={data.id} />}
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

      {/* TOP HALF — hero + side rail */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--rule)" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="page-title">
            <div className="row gap-8 wrap" style={{ marginBottom: 6 }}>
              {data.categories.map((c) => (
                <Chip key={c} kind="cat">{c}</Chip>
              ))}
              <Chip kind="rating">{data.rating}</Chip>
              {data.tags.map((t) => (
                <Chip key={t} kind="tag">{t}</Chip>
              ))}
            </div>
            <h1>{data.title}</h1>
            <div className="sub mono">
              commission #{String(data.id).padStart(3, "0")}
              {data.completed_at ? ` · ${data.completed_at}` : ""}
              {data.cover?.width ? ` · ${data.cover.width}×${data.cover.height}` : ""}
              {data.formats.length ? ` · ${data.formats.join("/")}` : ""}
            </div>
          </div>
          <div style={{ padding: "8px 48px 28px" }}>
            <div style={{ maxWidth: 460, margin: "0 auto" }}>
              <Cover cover={data.cover} />
            </div>
          </div>
        </div>

        {/* side rail */}
        <aside
          style={{
            width: 300,
            borderLeft: "1px solid var(--rule)",
            padding: "28px 24px",
            flexShrink: 0,
          }}
        >
          {data.description && (
            <>
              <div className="label">Description</div>
              <p style={{ marginTop: 0 }}>{data.description}</p>
            </>
          )}
          <Meta label="Characters">
            {data.characters.map((c) => <Chip key={c} kind="char">{c}</Chip>)}
          </Meta>
          <Meta label="Artists">
            {data.artists.map((a) => <Chip key={a} kind="artist">{a}</Chip>)}
          </Meta>
          {canWrite && (data.price_amount || data.confirmed_at) && (
            <div
              style={{
                marginTop: 16,
                padding: "10px 12px",
                background: "var(--paper-2)",
                borderRadius: 6,
              }}
            >
              <div className="mono-sm" style={{ marginBottom: 4 }}>🔒 admin-only</div>
              {data.price_amount && (
                <div className="mono-sm">
                  Price: {data.price_amount} {data.price_currency}
                </div>
              )}
              {data.confirmed_at && (
                <div className="mono-sm">Confirmed: {data.confirmed_at.slice(0, 10)}</div>
              )}
            </div>
          )}
        </aside>
      </div>

      {/* BOTTOM HALF — vertical lifecycle */}
      <div style={{ padding: "24px 48px", maxWidth: 760 }}>
        <h2 style={{ fontSize: 16, margin: "0 0 12px" }}>Lifecycle</h2>
        {lifecycle.map((node) => (
          <div
            key={node.id}
            style={{
              border: node.is_detached ? "1px dashed var(--warn)" : "1px solid var(--rule)",
              borderRadius: 8,
              padding: "12px 14px",
              marginBottom: 12,
              background: node.is_detached ? "rgba(182,85,42,0.05)" : "var(--paper)",
            }}
          >
            <div className="row" style={{ marginBottom: node.files.length ? 10 : 0 }}>
              <strong>{node.name}</strong>
              {node.is_detached && <Chip kind="rating">detached</Chip>}
              {node.name === currentStage && <Chip kind="cat">current</Chip>}
              <span className="spacer" />
              {node.started_at && (
                <span className="mono-sm">{node.started_at.slice(0, 10)}</span>
              )}
            </div>
            {node.files.length > 0 && (
              <div className="row wrap gap-8">
                {node.files.map((f) => (
                  <div key={f.id} style={{ width: 96 }}>
                    {f.is_image ? (
                      <Cover
                        cover={{
                          file_id: f.id,
                          url: f.url,
                          width: f.width,
                          height: f.height,
                          focal_x: f.focal_x,
                          focal_y: f.focal_y,
                        }}
                        ratio={1}
                      />
                    ) : (
                      <div className="imgph" style={{ aspectRatio: "1" }}>
                        {f.format}
                      </div>
                    )}
                    <div
                      className="mono-sm"
                      style={{ fontSize: 9, marginTop: 2, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}
                    >
                      {f.label || f.format}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div className="label">{label}</div>
      <div className="row wrap gap-4">{children}</div>
    </div>
  );
}
