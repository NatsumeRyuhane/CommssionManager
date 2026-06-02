import { useCallback, useEffect, useState } from "react";

import { api } from "../api/client";
import type { CommissionDetail, CommissionFile, CommissionNode } from "../api/types";
import { FocalPointModal } from "./FocalPointModal";
import { LifecycleStagesList } from "./LifecycleStagesList";

/** Edit-mode panel for managing lifecycle stages, files, cover, and focal points. */
export function StagesEditor({ commissionId }: { commissionId: number }) {
  const [detail, setDetail] = useState<CommissionDetail | null>(null);
  const [newStage, setNewStage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focalFile, setFocalFile] = useState<CommissionFile | null>(null);

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
  const displayNodes = detached ? [...regular, detached] : regular;
  const moveTargets = displayNodes;

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

  function moveStage(index: number, dir: -1 | 1) {
    const ids = regular.map((n) => n.id);
    const target = index + dir;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void run(() => api.reorderNodes(commissionId, ids));
  }

  function upload(node: CommissionNode, files: FileList) {
    void run(async () => {
      for (const file of Array.from(files)) {
        await api.uploadFile(node.id, file);
      }
    });
  }

  function moveFile(file: CommissionFile, targetNodeId: number) {
    if (file.node_id === targetNodeId) return;
    void run(() => api.moveFile(file.id, targetNodeId));
  }

  function saveFocal(x: number, y: number) {
    if (!focalFile) return;
    void run(async () => {
      await api.setFocal(focalFile.id, x, y);
      setFocalFile(null);
    });
  }

  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 18, margin: "0 0 4px" }}>Stages &amp; files</h2>
      <div className="mono-sm muted" style={{ marginBottom: 12 }}>
        Lifecycle stages in order. Upload per stage, drag files between stages, set covers, and
        adjust image focal points. Deleted-stage files move to Detached.
      </div>

      <LifecycleStagesList
        nodes={displayNodes}
        currentStage={detail.current_stage}
        coverFileId={detail.cover?.file_id ?? null}
        busy={busy}
        moveTargets={moveTargets}
        onMoveFile={moveFile}
        onUpload={upload}
        onSetCover={(file) => void run(() => api.updateCommission(commissionId, { cover_file_id: file.id }))}
        onDeleteFile={(file) => {
          if (window.confirm(`Delete file “${file.label || file.format}”?`)) {
            void run(() => api.deleteFile(file.id));
          }
        }}
        onEditFocal={setFocalFile}
        renderStageActions={(node) => {
          if (node.is_detached) return null;
          const index = regular.findIndex((item) => item.id === node.id);
          return (
            <>
              <button
                type="button"
                className="btn sm"
                onClick={() => moveStage(index, -1)}
                disabled={busy || index <= 0}
                title="Move up"
              >
                ↑
              </button>
              <button
                type="button"
                className="btn sm"
                onClick={() => moveStage(index, 1)}
                disabled={busy || index === regular.length - 1}
                title="Move down"
              >
                ↓
              </button>
              <button type="button" className="btn sm" onClick={() => rename(node)} disabled={busy}>
                Rename
              </button>
              <button type="button" className="btn sm danger" onClick={() => remove(node)} disabled={busy}>
                Delete
              </button>
            </>
          );
        }}
      />

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
      {focalFile && (
        <FocalPointModal
          file={focalFile}
          busy={busy}
          onSave={saveFocal}
          onClose={() => setFocalFile(null)}
        />
      )}
    </section>
  );
}
