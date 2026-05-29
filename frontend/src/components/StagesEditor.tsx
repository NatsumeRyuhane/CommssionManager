import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "../api/client";
import type { CommissionDetail, CommissionFile, CommissionNode } from "../api/types";
import { Cover } from "./Cover";

interface FileHandlers {
  coverFileId: number | null;
  busy: boolean;
  onDeleteFile: (f: CommissionFile) => void;
  onSetCover: (f: CommissionFile) => void;
}

/** Edit-mode panel for managing a commission's lifecycle stages, files, and cover. */
export function StagesEditor({ commissionId }: { commissionId: number }) {
  const [detail, setDetail] = useState<CommissionDetail | null>(null);
  const [newStage, setNewStage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setDetail(await api.getCommission(commissionId));
    } catch (e) {
      setError(String(e));
    }
  }, [commissionId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function run(op: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await op();
      await reload();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!detail) {
    return <div className="mono-sm muted">Loading stages…</div>;
  }

  const regular = detail.nodes.filter((n) => !n.is_detached);
  const detached = detail.nodes.find((n) => n.is_detached);

  function addStage() {
    if (!newStage.trim()) return;
    void run(async () => {
      await api.createNode(commissionId, newStage.trim());
      setNewStage("");
    });
  }

  function rename(node: CommissionNode) {
    const name = window.prompt("Rename stage", node.name);
    if (name && name.trim() && name.trim() !== node.name) {
      void run(() => api.renameNode(node.id, name.trim()));
    }
  }

  function remove(node: CommissionNode) {
    if (!window.confirm(`Delete stage “${node.name}”? Its files move to Detached.`)) return;
    void run(() => api.deleteNode(node.id));
  }

  function move(index: number, dir: -1 | 1) {
    const ids = regular.map((n) => n.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    void run(() => api.reorderNodes(commissionId, ids));
  }

  function upload(node: CommissionNode, files: FileList) {
    void run(async () => {
      for (const file of Array.from(files)) {
        await api.uploadFile(node.id, file);
      }
    });
  }

  const fh: FileHandlers = {
    coverFileId: detail.cover?.file_id ?? null,
    busy,
    onDeleteFile: (f) => {
      if (window.confirm(`Delete file “${f.label || f.format}”?`)) {
        void run(() => api.deleteFile(f.id));
      }
    },
    onSetCover: (f) => void run(() => api.updateCommission(commissionId, { cover_file_id: f.id })),
  };

  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 18, margin: "0 0 4px" }}>Stages &amp; files</h2>
      <div className="mono-sm muted" style={{ marginBottom: 12 }}>
        Lifecycle stages in order. Upload files per stage; set any image as the cover. Deleting a
        stage moves its files to the Detached holding area.
      </div>

      {regular.map((node, i) => (
        <StageRow
          key={node.id}
          node={node}
          isFirst={i === 0}
          isLast={i === regular.length - 1}
          fh={fh}
          onUp={() => move(i, -1)}
          onDown={() => move(i, 1)}
          onRename={() => rename(node)}
          onDelete={() => remove(node)}
          onUpload={(files) => upload(node, files)}
        />
      ))}

      {detached && detached.files.length > 0 && (
        <div
          style={{
            border: "1px dashed var(--warn)",
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 10,
            background: "rgba(182,85,42,0.05)",
          }}
        >
          <div className="row" style={{ marginBottom: 8 }}>
            <strong>{detached.name}</strong>
            <span className="mono-sm muted">uncategorized · cannot be edited or deleted</span>
          </div>
          <FileGrid node={detached} fh={fh} />
        </div>
      )}

      <div className="row gap-8" style={{ marginTop: 8 }}>
        <input
          className="field"
          placeholder="New stage name (e.g. Lineart)"
          value={newStage}
          onChange={(e) => setNewStage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addStage())}
          style={{ maxWidth: 280 }}
        />
        <button type="button" className="btn sm" onClick={addStage} disabled={busy}>
          + Add stage
        </button>
      </div>

      {error && <div className="error-text" style={{ marginTop: 10 }}>{error}</div>}
    </section>
  );
}

function StageRow({
  node,
  isFirst,
  isLast,
  fh,
  onUp,
  onDown,
  onRename,
  onDelete,
  onUpload,
}: {
  node: CommissionNode;
  isFirst: boolean;
  isLast: boolean;
  fh: FileHandlers;
  onUp: () => void;
  onDown: () => void;
  onRename: () => void;
  onDelete: () => void;
  onUpload: (files: FileList) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <div
      style={{
        border: "1px solid var(--rule)",
        borderRadius: 8,
        padding: "10px 14px",
        marginBottom: 10,
        background: "var(--paper)",
      }}
    >
      <div className="row" style={{ marginBottom: node.files.length ? 10 : 0 }}>
        <strong>{node.name}</strong>
        <span className="mono-sm muted">{node.files.length} files</span>
        <span className="spacer" />
        <button type="button" className="btn sm" onClick={onUp} disabled={fh.busy || isFirst} title="Move up">
          ↑
        </button>
        <button type="button" className="btn sm" onClick={onDown} disabled={fh.busy || isLast} title="Move down">
          ↓
        </button>
        <button type="button" className="btn sm" onClick={() => fileInput.current?.click()} disabled={fh.busy}>
          ⤓ Upload
        </button>
        <button type="button" className="btn sm" onClick={onRename} disabled={fh.busy}>
          Rename
        </button>
        <button type="button" className="btn sm danger" onClick={onDelete} disabled={fh.busy}>
          Delete
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) onUpload(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      <FileGrid node={node} fh={fh} />
    </div>
  );
}

function FileGrid({ node, fh }: { node: CommissionNode; fh: FileHandlers }) {
  if (node.files.length === 0) return null;
  return (
    <div className="row wrap gap-8">
      {node.files.map((f) => {
        const isCover = f.id === fh.coverFileId;
        return (
          <div key={f.id} style={{ width: 96 }}>
            <div style={{ outline: isCover ? "2px solid var(--accent)" : "none", outlineOffset: 2, borderRadius: 4 }}>
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
            </div>
            <div className="mono-sm" style={{ fontSize: 9, marginTop: 2, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {f.label || f.format}
            </div>
            <div className="row gap-4" style={{ justifyContent: "center", marginTop: 2 }}>
              {f.is_image && !isCover && (
                <button type="button" className="btn sm ghost" onClick={() => fh.onSetCover(f)} disabled={fh.busy} title="Set as cover">
                  ★
                </button>
              )}
              {isCover && <span className="mono-sm" style={{ color: "var(--accent)" }}>cover</span>}
              <button type="button" className="btn sm danger" onClick={() => fh.onDeleteFile(f)} disabled={fh.busy} title="Delete file">
                ✕
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
