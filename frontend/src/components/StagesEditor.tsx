import { useCallback, useEffect, useRef, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { api, ApiError, directPutWithProgress } from "../api/client";
import type {
  CommissionDetail,
  CommissionFile,
  CommissionNode,
  StorageCapabilities,
  Visibility,
} from "../api/types";
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
  visibilityOverrides,
  onNodeVisibilityChange,
  onFileVisibilityChange,
  onPendingUploadsChange,
}: {
  commissionId: number;
  onChange?: () => void;
  /** Edit-mode-only: live override maps the parent (edit page) is buffering
   * between Save round-trips. When supplied, the per-stage and per-file
   * toggles read from these instead of the snapshot in `detail.nodes` so
   * clicks reflect immediately even though the server data hasn't reloaded.
   * Without this the toggles look broken — the change is staged but the
   * tile keeps showing the old value. */
  visibilityOverrides?: {
    nodes: Map<number, Visibility | null>;
    files: Map<number, Visibility | null>;
  };
  /** Optional: forwarded to `LifecycleStagesList` so the edit page can hoist
   * per-stage visibility changes into its pending-changes buffer. When omitted
   * the toggles are simply not rendered (read-only contexts). */
  onNodeVisibilityChange?: (node: CommissionNode, next: Visibility | null) => void;
  onFileVisibilityChange?: (file: CommissionFile, next: Visibility | null) => void;
  /** Optional: fires whenever the upload tile set changes (success, failure,
   * retry, dismiss). The edit page reads this to gate Save while bytes are
   * in flight or a tile is waiting on retry/dismiss. */
  onPendingUploadsChange?: (counts: { uploading: number; failed: number }) => void;
}) {
  const [detail, setDetail] = useState<CommissionDetail | null>(null);
  const [newStage, setNewStage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateNode, setDateNode] = useState<CommissionNode | null>(null);
  const [uploads, setUploads] = useState<FileUploadPreview[]>([]);
  const [capabilities, setCapabilities] = useState<StorageCapabilities | null>(null);
  const uploadSequence = useRef(0);
  const previewUrls = useRef(new Map<string, string>());
  // Mirrors `uploads` so async callbacks (deferred-move, retry) can read the
  // current drag-aware nodeId without depending on a stale closure.
  const uploadsRef = useRef<FileUploadPreview[]>([]);
  uploadsRef.current = uploads;

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

  useEffect(() => {
    // Capabilities are sampled once per editor mount. New uploads pick up
    // toggle changes on the next reload; in-flight uploads keep the path
    // they started with, so a mid-upload toggle change never leaves bytes
    // stranded in S3 with no session to finalize.
    api
      .getStorageCapabilities()
      .then(setCapabilities)
      .catch(() => setCapabilities(null));
  }, []);

  useEffect(
    () => () => {
      for (const url of previewUrls.current.values()) URL.revokeObjectURL(url);
      previewUrls.current.clear();
    },
    [],
  );

  // Surface upload counts to the parent (edit page) so it can disable Save
  // while bytes are in flight or a tile is awaiting retry/dismiss.
  useEffect(() => {
    if (!onPendingUploadsChange) return;
    const uploading = uploads.filter(
      (u) => u.status === "uploading" || u.status === "processing",
    ).length;
    const failed = uploads.filter((u) => u.status === "failed").length;
    onPendingUploadsChange({ uploading, failed });
  }, [uploads, onPendingUploadsChange]);

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

  function updateUpload(id: string, patch: Partial<FileUploadPreview>) {
    setUploads((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    );
  }

  // Direct path: server mints a presigned PUT; the browser ships bytes straight
  // to the bucket; we finalize via the app once they land. Reads
  // `preview.originalNodeId` as the upload destination so retry honors any
  // pre-retry drag (which sets originalNodeId := nodeId before re-running).
  async function runDirectUpload(preview: FileUploadPreview): Promise<CommissionFile> {
    const session = await api.createUploadSession(preview.originalNodeId, {
      filename: preview.file.name,
      content_type: preview.file.type || "application/octet-stream",
      size_bytes: preview.file.size,
    });
    updateUpload(preview.id, { sessionId: session.session_id });

    try {
      await directPutWithProgress(session.upload_url, preview.file, {
        headers: session.upload_headers,
        onProgress: (progress) => updateUpload(preview.id, { progress }),
      });
    } catch (putError) {
      // Don't silently fall back to the proxied endpoint — bytes may already
      // be in S3 under the same key; that would risk a duplicate file. Cancel
      // the pending session so the orphaned object gets cleaned up.
      try {
        await api.cancelUpload(session.session_id);
      } catch {
        /* best-effort cleanup */
      }
      throw putError;
    }

    updateUpload(preview.id, { status: "processing", progress: 100 });
    return api.finalizeUpload(session.session_id);
  }

  async function runProxiedUpload(preview: FileUploadPreview): Promise<CommissionFile> {
    return api.uploadFile(preview.originalNodeId, preview.file, {
      onProgress: (progress) => updateUpload(preview.id, { progress }),
    });
  }

  // Full upload lifecycle: run the transport, deferred-move if the user
  // dragged the tile during upload, then reload + drop the preview. Failures
  // surface as `status: "failed"` for the user to retry or dismiss.
  async function completeUpload(preview: FileUploadPreview): Promise<void> {
    try {
      const file = await (preview.directPath
        ? runDirectUpload(preview)
        : runProxiedUpload(preview));

      // Re-read the current nodeId so a drag that happened *during* the
      // upload is honored. The closure's `preview.nodeId` is stale; the
      // ref carries the live state.
      const live = uploadsRef.current.find((u) => u.id === preview.id);
      const finalNodeId = live?.nodeId ?? preview.nodeId;
      if (finalNodeId !== preview.originalNodeId) {
        await api.moveFile(file.id, finalNodeId);
      }

      await reload();
      removeUpload(preview.id);
      onChange?.();
    } catch (uploadError) {
      const message =
        uploadError instanceof ApiError
          ? uploadError.message
          : String(uploadError);
      updateUpload(preview.id, { status: "failed", error: message });
    }
  }

  function upload(node: CommissionNode, files: File[]) {
    // Snapshot capability state at the moment of upload so a mid-batch toggle
    // change doesn't half-route the same selection. Each preview carries its
    // own `directPath` so retries keep the transport they started with.
    const useDirect = capabilities?.direct_upload_available === true;

    const previews: FileUploadPreview[] = files.map((file) => {
      const id = `${node.id}-${Date.now()}-${uploadSequence.current++}`;
      const isImage = file.type.startsWith("image/");
      const previewUrl = isImage ? URL.createObjectURL(file) : null;
      if (previewUrl) previewUrls.current.set(id, previewUrl);
      return {
        id,
        nodeId: node.id,
        originalNodeId: node.id,
        file,
        directPath: useDirect,
        fileName: file.name,
        format: file.name.split(".").pop()?.toLowerCase() || "file",
        isImage,
        previewUrl,
        progress: 0,
        status: "uploading" as const,
      };
    });

    setUploads((current) => [...current, ...previews]);
    // Uploads run in the background — the per-tile preview communicates progress.
    // We deliberately don't flip `busy`: the user should still be able to rename
    // stages, reorder, edit dates, and start more uploads while bytes are in flight.
    setError(null);

    for (const preview of previews) void completeUpload(preview);
  }

  function retryUpload(id: string) {
    const preview = uploadsRef.current.find((u) => u.id === id);
    if (!preview || preview.status === "uploading" || preview.status === "processing") return;
    // The user may have dragged the failed tile before clicking retry — treat
    // the current nodeId as the new "where the user wants this" by syncing
    // originalNodeId to it. After the retry succeeds, the deferred-move check
    // is a no-op because originalNodeId === nodeId.
    const reset: FileUploadPreview = {
      ...preview,
      originalNodeId: preview.nodeId,
      progress: 0,
      status: "uploading",
      error: undefined,
      sessionId: undefined,
    };
    setUploads((current) => current.map((u) => (u.id === id ? reset : u)));
    void completeUpload(reset);
  }

  function moveUpload(id: string, targetNodeId: number) {
    setUploads((current) =>
      current.map((u) => (u.id === id ? { ...u, nodeId: targetNodeId } : u)),
    );
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
        onMoveUpload={moveUpload}
        onRetryUpload={retryUpload}
        nodeVisibilityOverrides={visibilityOverrides?.nodes}
        fileVisibilityOverrides={visibilityOverrides?.files}
        onNodeVisibilityChange={onNodeVisibilityChange}
        onFileVisibilityChange={onFileVisibilityChange}
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
