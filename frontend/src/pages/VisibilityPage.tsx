import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { api } from "../api/client";
import type {
  CommissionDetail,
  CommissionFile,
  CommissionVisibility,
  Visibility,
  VisibilityFieldKey,
} from "../api/types";
import { Chip } from "../components/Chip";
import { Cover } from "../components/Cover";
import { TopBar } from "../components/TopBar";
import { useAuth } from "../hooks/useAuth";

const FIELD_LABELS: Record<VisibilityFieldKey, string> = {
  title: "Title",
  description: "Description",
  labels: "Categories & tags",
  rating: "Rating",
  characters: "Characters",
  artists: "Artists",
  completed_at: "Completed date",
  confirmed_at: "Confirmed at",
  price: "Price",
};

export function VisibilityPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canWrite, loading: authLoading } = useAuth();
  const [detail, setDetail] = useState<CommissionDetail | null>(null);
  const [visibility, setVisibility] = useState<CommissionVisibility | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || authLoading || !canWrite) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([api.getCommission(Number(id)), api.getCommissionVisibility(Number(id))])
      .then(([nextDetail, nextVisibility]) => {
        if (cancelled) return;
        setDetail(nextDetail);
        setVisibility(nextVisibility);
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [authLoading, canWrite, id]);

  const filesById = useMemo(() => {
    const out = new Map<number, CommissionFile>();
    for (const node of detail?.nodes ?? []) {
      for (const file of node.files) out.set(file.id, file);
    }
    return out;
  }, [detail]);

  if (!authLoading && !canWrite) {
    return (
      <div className="app">
        <TopBar />
        <div style={{ padding: 48, textAlign: "center" }} className="muted">
          Visibility controls require admin sign-in.
        </div>
      </div>
    );
  }

  async function save() {
    if (!id || !visibility) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateCommissionVisibility(Number(id), {
        visibility: visibility.visibility,
        fields: Object.fromEntries(
          visibility.fields.map((field) => [field.field, field.public])
        ),
        nodes: Object.fromEntries(visibility.nodes.map((node) => [node.id, node.visibility])),
        files: Object.fromEntries(
          visibility.nodes.flatMap((node) =>
            node.files.map((file) => [file.id, file.visibility] as const)
          )
        ),
      });
      setVisibility(updated);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return (
      <div className="app">
        <TopBar />
        <div style={{ padding: 24 }} className="error-text">
          {error}
        </div>
      </div>
    );
  }
  if (loading || !detail || !visibility) {
    return (
      <div className="app">
        <TopBar />
        <div style={{ padding: 24 }} className="mono-sm">
          Loading visibility…
        </div>
      </div>
    );
  }

  function setCommission(value: Visibility | null) {
    setVisibility((current) => (current ? { ...current, visibility: value } : current));
  }

  function setField(fieldKey: VisibilityFieldKey, value: boolean | null) {
    setVisibility((current) =>
      current
        ? {
            ...current,
            fields: current.fields.map((field) =>
              field.field === fieldKey ? { ...field, public: value } : field
            ),
          }
        : current
    );
  }

  function setNode(nodeId: number, value: Visibility | null) {
    setVisibility((current) =>
      current
        ? {
            ...current,
            nodes: current.nodes.map((node) =>
              node.id === nodeId ? { ...node, visibility: value } : node
            ),
          }
        : current
    );
  }

  function setFile(fileId: number, value: Visibility | null) {
    setVisibility((current) =>
      current
        ? {
            ...current,
            nodes: current.nodes.map((node) => ({
              ...node,
              files: node.files.map((file) =>
                file.id === fileId ? { ...file, visibility: value } : file
              ),
            })),
          }
        : current
    );
  }

  return (
    <div className="app">
      <TopBar>
        <Link to={`/commissions/${detail.id}`} className="btn sm">
          View
        </Link>
        <button className="btn sm" onClick={() => navigate(-1)}>
          Cancel
        </button>
        <button className="btn sm primary" disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save"}
        </button>
      </TopBar>

      <div className="visibility-page">
        <div className="settings-heading">
          <div>
            <h1>{detail.title}</h1>
            <div className="mono-sm muted">
              commission #{String(detail.id).padStart(3, "0")} visibility overrides
            </div>
          </div>
          <EffectiveChip value={visibility.effective_visibility} />
        </div>

        <div className="visibility-layout">
          <section className="visibility-section">
            <div className="settings-panel-title">Commission</div>
            <div className="visibility-master">
              <div>
                <strong>Gallery visibility</strong>
                <div className="mono-sm muted">Private hides the entire commission from public read.</div>
              </div>
              <VisibilitySelect
                value={visibility.visibility}
                effective={visibility.effective_visibility}
                onChange={setCommission}
              />
            </div>

            <div className="settings-panel-title">Metadata fields</div>
            <div className="settings-list">
              {visibility.fields.map((field) => (
                <div className="settings-list-row" key={field.field}>
                  <div>
                    <strong>{FIELD_LABELS[field.field]}</strong>
                    <EffectiveText publicValue={field.effective_public} />
                  </div>
                  <FieldVisibilitySelect
                    value={field.public}
                    effective={field.effective_public}
                    onChange={(next) => setField(field.field, next)}
                  />
                </div>
              ))}
            </div>
          </section>

          <section className="visibility-section">
            <div className="settings-panel-title">Lifecycle stages & files</div>
            <div className="visibility-node-list">
              {visibility.nodes.map((node) => (
                <div className="visibility-node" key={node.id}>
                  <div className="visibility-node-head">
                    <div>
                      <strong>{node.name}</strong>
                      {node.is_detached && <Chip kind="rating">detached</Chip>}
                      <EffectiveText visibility={node.effective_visibility} />
                    </div>
                    <VisibilitySelect
                      value={node.visibility}
                      effective={node.effective_visibility}
                      onChange={(next) => setNode(node.id, next)}
                    />
                  </div>
                  {node.files.length === 0 ? (
                    <div className="mono-sm muted" style={{ padding: "8px 12px" }}>
                      no files
                    </div>
                  ) : (
                    node.files.map((file) => {
                      const detailFile = filesById.get(file.id);
                      return (
                        <div className="visibility-file-row" key={file.id}>
                          <FileThumb file={detailFile} fallbackFormat={file.format} />
                          <div className="visibility-file-name">
                            <span>{file.label || detailFile?.label || `${file.format} file`}</span>
                            <EffectiveText visibility={file.effective_visibility} />
                          </div>
                          <VisibilitySelect
                            value={file.visibility}
                            effective={file.effective_visibility}
                            onChange={(next) => setFile(file.id, next)}
                          />
                        </div>
                      );
                    })
                  )}
                </div>
              ))}
            </div>
            <div className="settings-note" style={{ marginTop: 14 }}>
              <strong>Precedence:</strong> global preset → this commission → stage → file.
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function VisibilitySelect({
  value,
  effective,
  onChange,
}: {
  value: Visibility | null;
  effective: Visibility;
  onChange: (value: Visibility | null) => void;
}) {
  return (
    <select
      className="field visibility-select"
      value={value ?? ""}
      onChange={(e) => onChange((e.target.value || null) as Visibility | null)}
      title={`Effective: ${effective}`}
    >
      <option value="">Inherit ({effective})</option>
      <option value="public">Public</option>
      <option value="private">Private</option>
    </select>
  );
}

function FieldVisibilitySelect({
  value,
  effective,
  onChange,
}: {
  value: boolean | null;
  effective: boolean;
  onChange: (value: boolean | null) => void;
}) {
  return (
    <select
      className="field visibility-select"
      value={value == null ? "" : value ? "public" : "private"}
      onChange={(e) => {
        const next = e.target.value;
        onChange(next === "" ? null : next === "public");
      }}
      title={`Effective: ${effective ? "public" : "private"}`}
    >
      <option value="">Inherit ({effective ? "public" : "private"})</option>
      <option value="public">Public</option>
      <option value="private">Private</option>
    </select>
  );
}

function EffectiveChip({ value }: { value: Visibility }) {
  return <Chip kind={value === "public" ? "cat" : "rating"}>{value}</Chip>;
}

function EffectiveText({
  visibility,
  publicValue,
}: {
  visibility?: Visibility;
  publicValue?: boolean;
}) {
  const value = visibility ?? (publicValue ? "public" : "private");
  return (
    <span className="mono-sm muted" style={{ marginLeft: 6 }}>
      effective: {value}
    </span>
  );
}

function FileThumb({
  file,
  fallbackFormat,
}: {
  file: CommissionFile | undefined;
  fallbackFormat: string;
}) {
  if (file?.is_image) {
    return (
      <div className="visibility-thumb">
        <Cover
          cover={{
            file_id: file.id,
            url: file.url,
            width: file.width,
            height: file.height,
            focal_x: file.focal_x,
            focal_y: file.focal_y,
          }}
          ratio={1}
        />
      </div>
    );
  }
  return <div className="visibility-thumb imgph">{fallbackFormat}</div>;
}
