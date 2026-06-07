import { useCallback, useEffect, useRef, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { api } from "../api/client";
import type { CommissionDetail, CommissionFile, CommissionNode } from "../api/types";
import { LifecycleStagesList, type FileUploadPreview } from "./LifecycleStagesList";
import { NodeDateModal } from "./NodeDateModal";

/**
 * Edit-mode panel for managing commission lifecycle stages, their files, and cover selection.
 *
 * Renders controls to add, rename, delete, and reorder stages; upload, move, and delete files;
 * choose a cover file; and edit per-stage dates. Upon any successful operation that changes
 * commission data, the component reloads its state and calls the optional `onChange` callback.
 *
 * @param commissionId - ID of the commission being edited
 * @param onChange - Optional callback invoked after successful mutations and reloads
 */
export function StagesEditor({
  commissionId,
  onChange,
}: {
  commissionId: number;
  onChange?: () => void;
}) {
  const [detail, setDetail] = useState<CommissionDetail | null>(null);
  const [newStage, setNewStage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateNode, setDateNode] = useState<CommissionNode | null>(null);
  const [uploads, setUploads] = useState<FileUploadPreview[]>([]);
  const uploadSequence = useRef(0);
  const previewUrls = useRef(new Map<string, string>());

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

  useEffect(
    () => () => {
      for (const url of previewUrls.current.values()) URL.revokeObjectURL(url);
      previewUrls.current.clear();
    },
    [],
  );

  /**
   * Execute an async operation while managing busy and error state, reload the commission data on success, and invoke the optional `onChange` callback.
   *
   * @param op - The asynchronous operation to perform.
   * @returns Nothing.
   */
  async function run(op: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await op();
      await reload();
      onChange?.();
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
  const displayNodes = detached ? [detached, ...regular] : regular;

  /**
   * Create a new stage from the current `newStage` input and clear the input field.
   *
   * If the trimmed `newStage` is empty, the function does nothing. Otherwise it creates
   * a stage using the trimmed name and resets `newStage` to an empty string.
   */
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

  function reorderStage(draggedNodeId: number, targetNodeId: number) {
    const ids = regular.map((n) => n.id);
    const from = ids.indexOf(draggedNodeId);
    const to = ids.indexOf(targetNodeId);
    if (from === -1 || to === -1 || from === to) return;
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    void run(() => api.reorderNodes(commissionId, ids));
  }

  function reorderFile(nodeId: number, draggedFileId: number, targetFileId: number) {
    const node = detail?.nodes.find((item) => item.id === nodeId);
    if (!node) return;
    const ids = node.files.map((file) => file.id);
    const from = ids.indexOf(draggedFileId);
    const to = ids.indexOf(targetFileId);
    if (from === -1 || to === -1 || from === to) return;
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    void run(() => api.reorderFiles(nodeId, ids));
  }

  function removeUpload(id: string) {
    setUploads((current) => current.filter((upload) => upload.id !== id));
    const previewUrl = previewUrls.current.get(id);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrls.current.delete(id);
    }
  }

  function upload(node: CommissionNode, files: File[]) {
    const pending = files.map((file) => {
      const id = `${node.id}-${Date.now()}-${uploadSequence.current++}`;
      const isImage = file.type.startsWith("image/");
      const previewUrl = isImage ? URL.createObjectURL(file) : null;
      if (previewUrl) previewUrls.current.set(id, previewUrl);
      return {
        file,
        preview: {
          id,
          nodeId: node.id,
          fileName: file.name,
          format: file.name.split(".").pop()?.toLowerCase() || "file",
          isImage,
          previewUrl,
          progress: 0,
          status: "uploading" as const,
        },
      };
    });

    setUploads((current) => [...current, ...pending.map(({ preview }) => preview)]);
    setBusy(true);
    setError(null);

    void Promise.allSettled(
      pending.map(async ({ file, preview }) => {
        try {
          await api.uploadFile(node.id, file, {
            onProgress: (progress) => {
              setUploads((current) =>
                current.map((upload) =>
                  upload.id === preview.id ? { ...upload, progress } : upload,
                ),
              );
            },
          });
          return preview.id;
        } catch (uploadError) {
          setUploads((current) =>
            current.map((upload) =>
              upload.id === preview.id
                ? { ...upload, status: "failed", error: String(uploadError) }
                : upload,
            ),
          );
          throw uploadError;
        }
      }),
    )
      .then(async (results) => {
        const succeededIds = results.flatMap((result) =>
          result.status === "fulfilled" ? [result.value] : [],
        );
        const failed = results.length - succeededIds.length;
        if (succeededIds.length > 0) {
          await reload();
          for (const id of succeededIds) removeUpload(id);
          onChange?.();
        }
        if (failed > 0) {
          setError(`${failed} ${failed === 1 ? "file" : "files"} failed to upload.`);
        }
      })
      .finally(() => setBusy(false));
  }

  /**
   * Moves a commission file to another node (stage).
   *
   * If the file is already assigned to the target node, no action is taken.
   *
   * @param file - The commission file to move
   * @param targetNodeId - ID of the destination node
   */
  function moveFile(file: CommissionFile, targetNodeId: number) {
    if (file.node_id === targetNodeId) return;
    void run(() => api.moveFile(file.id, targetNodeId));
  }

  /**
   * Update the currently selected node's date and close the node date modal.
   *
   * @param date - The date to set as an ISO date string, or `null` to remove the date
   */
  function saveNodeDate(date: string | null) {
    if (!dateNode) return;
    void run(async () => {
      await api.updateNodeDate(dateNode.id, date);
      setDateNode(null);
    });
  }

  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 18, margin: "0 0 4px" }}>Stages &amp; files</h2>
      <div className="mono-sm muted" style={{ marginBottom: 12 }}>
        Detached files appear first for review. Upload per stage, drag files between stages, and
        pick a cover (★). Deleted-stage files move to Detached. The cover&rsquo;s focal point is
        edited from the right rail.
      </div>

      <div className="row gap-8" style={{ marginBottom: 12 }}>
        <input
          className="field"
          placeholder="New stage name (e.g. Lineart)"
          value={newStage}
          onChange={(e) => setNewStage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addStage())}
          style={{ maxWidth: 280 }}
        />
        <button
          type="button"
          className="icon-btn add"
          onClick={addStage}
          disabled={busy || !newStage.trim()}
          title="Add stage"
          aria-label="Add stage"
        >
          <Plus size={18} strokeWidth={2.5} />
        </button>
      </div>

      <LifecycleStagesList
        nodes={displayNodes}
        currentStage={detail.current_stage}
        coverFileId={detail.cover?.file_id ?? null}
        busy={busy}
        uploads={uploads}
        onMoveFile={moveFile}
        onReorderFile={reorderFile}
        onReorderNode={reorderStage}
        onUpload={upload}
        onDismissUpload={removeUpload}
        onSetCover={(file) => void run(() => api.updateCommission(commissionId, { cover_file_id: file.id }))}
        onDeleteFile={(file) => {
          if (window.confirm(`Delete file “${file.label || file.format}”?`)) {
            void run(() => api.deleteFile(file.id));
          }
        }}
        onEditDate={setDateNode}
        renderStageActions={(node) => {
          if (node.is_detached) return null;
          return (
            <>
              <button
                type="button"
                className="icon-btn"
                onClick={() => rename(node)}
                disabled={busy}
                title="Rename stage"
                aria-label="Rename stage"
              >
                <Pencil size={16} strokeWidth={2} />
              </button>
              <button
                type="button"
                className="icon-btn danger"
                onClick={() => remove(node)}
                disabled={busy}
                title="Delete stage"
                aria-label="Delete stage"
              >
                <Trash2 size={16} strokeWidth={2} />
              </button>
            </>
          );
        }}
      />

      {error && <div className="error-text" style={{ marginTop: 10 }}>{error}</div>}
      {dateNode && (
        <NodeDateModal
          node={dateNode}
          busy={busy}
          onSave={saveNodeDate}
          onClose={() => setDateNode(null)}
        />
      )}
    </section>
  );
}
