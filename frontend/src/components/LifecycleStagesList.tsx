import { useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { Star, Trash2, Upload, X } from "lucide-react";

import type { CommissionFile, CommissionNode } from "../api/types";
import { Chip } from "./Chip";
import { Cover } from "./Cover";
import { ImageViewerModal } from "./ImageViewerModal";

const NODE_DRAG_TYPE = "application/x-cmgr-node-id";
const FILE_DRAG_TYPE = "application/x-cmgr-file-id";

function filesFromDrop(dataTransfer: DataTransfer): File[] {
  const files = Array.from(dataTransfer.files);
  if (files.length > 0) return files;
  return Array.from(dataTransfer.items).flatMap((item) => {
    if (item.kind !== "file") return [];
    const file = item.getAsFile();
    return file ? [file] : [];
  });
}

export interface FileUploadPreview {
  id: string;
  nodeId: number;
  fileName: string;
  format: string;
  isImage: boolean;
  previewUrl: string | null;
  progress: number;
  status: "uploading" | "failed";
  error?: string;
}

interface LifecycleStagesListProps {
  nodes: CommissionNode[];
  currentStage?: string | null;
  coverFileId?: number | null;
  busy?: boolean;
  uploads?: FileUploadPreview[];
  onMoveFile?: (file: CommissionFile, targetNodeId: number) => void;
  onReorderFile?: (nodeId: number, draggedFileId: number, targetFileId: number) => void;
  onReorderNode?: (draggedNodeId: number, targetNodeId: number) => void;
  onUpload?: (node: CommissionNode, files: File[]) => void;
  onDismissUpload?: (id: string) => void;
  onSetCover?: (file: CommissionFile) => void;
  onDeleteFile?: (file: CommissionFile) => void;
  onEditDate?: (node: CommissionNode) => void;
  renderStageActions?: (node: CommissionNode, index: number) => ReactNode;
}

/**
 * Renders a list of lifecycle stage sections for the provided nodes.
 *
 * @param nodes - Array of stage nodes to render; each node's files are shown within its stage
 * @param currentStage - Name of the current stage (used to mark the active stage)
 * @param coverFileId - ID of the file currently used as the commission cover
 * @param busy - When true, interactive controls are disabled
 * @param onMoveFile - Optional callback invoked when a file is moved into a different stage
 * @param onReorderFile - Optional callback invoked when a file is reordered within its stage
 * @param onReorderNode - Optional callback invoked when a stage is reordered
 * @param onUpload - Optional callback invoked with (node, files) when files are uploaded to a stage
 * @param onSetCover - Optional callback invoked when a file is set as the cover
 * @param onDeleteFile - Optional callback invoked when a file is deleted
 * @param onEditDate - Optional callback invoked when the stage date edit action is triggered
 * @param renderStageActions - Optional renderer for per-stage extra action elements; called with (node, index)
 * @returns A React element representing the lifecycle stages list
 */
export function LifecycleStagesList({
  nodes,
  currentStage,
  coverFileId,
  busy = false,
  uploads = [],
  onMoveFile,
  onReorderFile,
  onReorderNode,
  onUpload,
  onDismissUpload,
  onSetCover,
  onDeleteFile,
  onEditDate,
  renderStageActions,
}: LifecycleStagesListProps) {
  const [viewer, setViewer] = useState<{ nodeId: number; fileId: number } | null>(null);
  const filesById = useMemo(() => {
    const out = new Map<number, CommissionFile>();
    for (const node of nodes) {
      for (const file of node.files) out.set(file.id, file);
    }
    return out;
  }, [nodes]);
  const viewerNode = viewer ? nodes.find((node) => node.id === viewer.nodeId) : null;
  const viewerImages = viewerNode?.files.filter((file) => file.is_image) ?? [];

  return (
    <>
      <div className="lifecycle-list">
        {nodes.map((node, index) => (
          <LifecycleStage
            key={node.id}
            node={node}
            currentStage={currentStage}
            coverFileId={coverFileId}
            busy={busy}
            uploads={uploads.filter((upload) => upload.nodeId === node.id)}
            filesById={filesById}
            onMoveFile={onMoveFile}
            onReorderFile={onReorderFile}
            onReorderNode={onReorderNode}
            onUpload={onUpload}
            onDismissUpload={onDismissUpload}
            onSetCover={onSetCover}
            onDeleteFile={onDeleteFile}
            onEditDate={onEditDate}
            onOpenImage={(fileId) => setViewer({ nodeId: node.id, fileId })}
            stageActions={renderStageActions?.(node, index)}
          />
        ))}
      </div>
      {viewer && viewerNode && viewerImages.length > 0 && (
        <ImageViewerModal
          nodeName={viewerNode.name}
          images={viewerImages}
          activeFileId={viewer.fileId}
          onSelect={(fileId) => setViewer({ nodeId: viewer.nodeId, fileId })}
          onClose={() => setViewer(null)}
        />
      )}
    </>
  );
}

/**
 * Render a lifecycle stage panel with header controls and a grid of file tiles.
 *
 * The panel supports optional drag-and-drop reordering/moving, file upload, date editing,
 * and per-file actions (set cover, delete) depending on the provided callbacks and node state.
 *
 * @param node - The lifecycle node/stage data to render (name, files, flags, dates).
 * @param currentStage - The name of the currently active stage, used to show a "current" chip.
 * @param coverFileId - File id treated as the stage cover; used to mark the cover tile.
 * @param busy - When true, disables user interactions (drag handles, buttons).
 * @param filesById - Map of file id → file used to resolve files during drop operations.
 * @param onMoveFile - Called when a file is moved into this stage: `(file, targetNodeId)`.
 * @param onReorderFile - Called when a file is reordered within this stage.
 * @param onReorderNode - Called when a stage is reordered via drag handle: `(draggedNodeId, targetNodeId)`.
 * @param onUpload - Called when files are selected for upload into this stage: `(node, files)`.
 * @param onSetCover - Called to mark a specific file as the stage cover: `(file)`.
 * @param onDeleteFile - Called to delete a file from the stage: `(file)`.
 * @param onEditDate - Called to request editing the stage's start date: `(node)`.
 * @param stageActions - Optional React node inserted into the stage header for custom actions.
 * @returns A JSX element representing the rendered lifecycle stage panel.
 */
function LifecycleStage({
  node,
  currentStage,
  coverFileId,
  busy,
  uploads,
  filesById,
  onMoveFile,
  onReorderFile,
  onReorderNode,
  onUpload,
  onDismissUpload,
  onSetCover,
  onDeleteFile,
  onEditDate,
  onOpenImage,
  stageActions,
}: {
  node: CommissionNode;
  currentStage?: string | null;
  coverFileId?: number | null;
  busy: boolean;
  uploads: FileUploadPreview[];
  filesById: Map<number, CommissionFile>;
  onMoveFile?: (file: CommissionFile, targetNodeId: number) => void;
  onReorderFile?: (nodeId: number, draggedFileId: number, targetFileId: number) => void;
  onReorderNode?: (draggedNodeId: number, targetNodeId: number) => void;
  onUpload?: (node: CommissionNode, files: File[]) => void;
  onDismissUpload?: (id: string) => void;
  onSetCover?: (file: CommissionFile) => void;
  onDeleteFile?: (file: CommissionFile) => void;
  onEditDate?: (node: CommissionNode) => void;
  onOpenImage: (fileId: number) => void;
  stageActions?: ReactNode;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [dropActive, setDropActive] = useState(false);
  const canMove = Boolean(onMoveFile);
  const canReorderFiles = Boolean(onReorderFile);
  const canUpload = Boolean(onUpload && !node.is_detached && !busy);
  const canReorder = Boolean(onReorderNode && !node.is_detached);
  const uploadingCount = uploads.filter((upload) => upload.status === "uploading").length;
  const failedCount = uploads.length - uploadingCount;

  function drop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDropActive(false);
    const droppedFiles = canUpload ? filesFromDrop(e.dataTransfer) : [];
    if (droppedFiles.length > 0) {
      onUpload?.(node, droppedFiles);
      return;
    }
    const draggedNodeId = Number(e.dataTransfer.getData(NODE_DRAG_TYPE));
    if (draggedNodeId && canReorder) {
      onReorderNode?.(draggedNodeId, node.id);
      return;
    }
    const fileId = Number(
      e.dataTransfer.getData(FILE_DRAG_TYPE) || e.dataTransfer.getData("text/plain"),
    );
    const file = filesById.get(fileId);
    if (!file || file.node_id === node.id) return;
    onMoveFile?.(file, node.id);
  }

  return (
    <div
      className={`lifecycle-stage ${node.is_detached ? "detached" : ""} ${dropActive ? "drop-active" : ""}`}
      onDragOver={(e) => {
        const types = Array.from(e.dataTransfer.types);
        const draggingNode = types.includes(NODE_DRAG_TYPE);
        const draggingFile = types.includes(FILE_DRAG_TYPE);
        const droppingFiles =
          types.includes("Files") ||
          Array.from(e.dataTransfer.items).some((item) => item.kind === "file");
        const canHandle =
          (draggingNode && canReorder) ||
          (draggingFile && (canMove || canReorderFiles)) ||
          (droppingFiles && canUpload);
        if (!canHandle) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = draggingNode || draggingFile ? "move" : "copy";
        setDropActive(true);
      }}
      onDragLeave={() => setDropActive(false)}
      onDrop={canMove || canReorderFiles || canReorder || canUpload ? drop : undefined}
    >
      <div className="lifecycle-stage-head">
        {canReorder && (
          <button
            type="button"
            className="lifecycle-stage-handle"
            draggable={!busy}
            disabled={busy}
            title="Drag to reorder stage"
            aria-label={`Drag ${node.name} to reorder`}
            onDragStart={(e) => {
              e.dataTransfer.setData(NODE_DRAG_TYPE, String(node.id));
              e.dataTransfer.setData("text/plain", `node:${node.id}`);
              e.dataTransfer.effectAllowed = "move";
            }}
          >
            <span className="lifecycle-stage-handle-dots" aria-hidden="true" />
          </button>
        )}
        <strong>{node.name}</strong>
        {node.is_detached && <Chip kind="rating">detached</Chip>}
        {node.name === currentStage && <Chip kind="cat">current</Chip>}
        <span className="mono-sm muted">
          {node.files.length} files
          {uploadingCount > 0 && ` · ${uploadingCount} uploading`}
          {failedCount > 0 && ` · ${failedCount} failed`}
        </span>
        <span className="spacer" />
        {onEditDate && !node.is_detached ? (
          <button
            type="button"
            className="lifecycle-date-button mono-sm"
            disabled={busy}
            onClick={() => onEditDate(node)}
            title="Change lifecycle date"
          >
            {node.started_at ? node.started_at.slice(0, 10) : "Set date"}
          </button>
        ) : (
          node.started_at && <span className="mono-sm">{node.started_at.slice(0, 10)}</span>
        )}
        {canUpload && (
          <>
            <button
              type="button"
              className="icon-btn"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
              title="Upload files"
              aria-label="Upload files"
            >
              <Upload size={16} strokeWidth={2} />
            </button>
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files?.length) onUpload?.(node, Array.from(e.target.files));
                e.target.value = "";
              }}
            />
          </>
        )}
        {stageActions}
      </div>
      {node.files.length === 0 && uploads.length === 0 ? (
        <div className="lifecycle-empty mono-sm muted">
          {canMove || canUpload ? "Drop files here" : "No files"}
        </div>
      ) : (
        <div className="lifecycle-file-grid">
          {node.files.map((file) => (
            <LifecycleFileTile
              key={file.id}
              file={file}
              isCover={file.id === coverFileId}
              busy={busy}
              nodeId={node.id}
              filesById={filesById}
              onMoveFile={onMoveFile}
              onReorderFile={onReorderFile}
              onSetCover={onSetCover}
              onDeleteFile={onDeleteFile}
              onOpenImage={onOpenImage}
            />
          ))}
          {uploads.map((upload) => (
            <LifecycleUploadTile
              key={upload.id}
              upload={upload}
              onDismiss={onDismissUpload}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LifecycleUploadTile({
  upload,
  onDismiss,
}: {
  upload: FileUploadPreview;
  onDismiss?: (id: string) => void;
}) {
  const failed = upload.status === "failed";
  const statusLabel = failed ? "Upload failed" : `${upload.progress}% uploaded`;

  return (
    <div className={`lifecycle-file lifecycle-upload ${failed ? "failed" : ""}`}>
      <div className="lifecycle-file-cover lifecycle-upload-cover">
        <div className="imgph" style={{ aspectRatio: "1" }}>
          {upload.isImage && upload.previewUrl ? (
            <img src={upload.previewUrl} alt="" />
          ) : (
            upload.format
          )}
        </div>
        <div
          className="lifecycle-upload-overlay"
          role={failed ? "alert" : "status"}
          aria-label={`${upload.fileName}: ${statusLabel}`}
          title={upload.error}
        >
          <strong>{failed ? "Failed" : `${upload.progress}%`}</strong>
          {failed && <span>Upload failed</span>}
        </div>
        {failed && onDismiss && (
          <button
            type="button"
            className="lifecycle-upload-dismiss"
            onClick={() => onDismiss(upload.id)}
            title="Dismiss failed upload"
            aria-label={`Dismiss failed upload for ${upload.fileName}`}
          >
            <X size={15} strokeWidth={2.5} />
          </button>
        )}
      </div>
      <div className="lifecycle-file-label">{upload.fileName}</div>
    </div>
  );
}

/**
 * Renders a file tile showing a preview (image or placeholder), label, and optional action buttons.
 *
 * @param file - The CommissionFile to display
 * @param isCover - Whether this file is the stage's current cover
 * @param busy - When true, interactive controls are disabled
 * @param onMoveFile - Optional callback invoked as `onMoveFile(file, targetNodeId)` when the file is dragged to another stage
 * @param onReorderFile - Optional callback invoked when the file is dragged onto another file in the same stage
 * @param onSetCover - Optional callback invoked with the file when the user sets it as the cover
 * @param onDeleteFile - Optional callback invoked with the file when the user requests deletion
 * @returns A JSX element representing the file tile with preview, label, and conditional action buttons
 */
function LifecycleFileTile({
  file,
  isCover,
  busy,
  nodeId,
  filesById,
  onMoveFile,
  onReorderFile,
  onSetCover,
  onDeleteFile,
  onOpenImage,
}: {
  file: CommissionFile;
  isCover: boolean;
  busy: boolean;
  nodeId: number;
  filesById: Map<number, CommissionFile>;
  onMoveFile?: (file: CommissionFile, targetNodeId: number) => void;
  onReorderFile?: (nodeId: number, draggedFileId: number, targetFileId: number) => void;
  onSetCover?: (file: CommissionFile) => void;
  onDeleteFile?: (file: CommissionFile) => void;
  onOpenImage: (fileId: number) => void;
}) {
  const editable = Boolean(onSetCover || onDeleteFile);
  const [reorderTarget, setReorderTarget] = useState(false);
  const draggable = Boolean(!busy && (onMoveFile || onReorderFile));
  return (
    <div
      className={`lifecycle-file${reorderTarget ? " reorder-target" : ""}`}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData(FILE_DRAG_TYPE, String(file.id));
        e.dataTransfer.setData("text/plain", String(file.id));
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragEnd={() => setReorderTarget(false)}
      onDragOver={(e) => {
        if (!Array.from(e.dataTransfer.types).includes(FILE_DRAG_TYPE)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        setReorderTarget(true);
      }}
      onDragLeave={() => setReorderTarget(false)}
      onDrop={(e) => {
        const draggedId = Number(e.dataTransfer.getData(FILE_DRAG_TYPE));
        if (!draggedId) return;
        e.preventDefault();
        e.stopPropagation();
        setReorderTarget(false);
        const dragged = filesById.get(draggedId);
        if (!dragged || dragged.id === file.id) return;
        if (dragged.node_id === nodeId) {
          onReorderFile?.(nodeId, dragged.id, file.id);
        } else {
          onMoveFile?.(dragged, nodeId);
        }
      }}
    >
      <div className={isCover ? "lifecycle-file-cover is-cover" : "lifecycle-file-cover"}>
        {file.is_image ? (
          <button
            type="button"
            className="lifecycle-file-open"
            onClick={() => onOpenImage(file.id)}
            title="Open image viewer"
            aria-label={`Open ${file.label || file.format} in image viewer`}
          >
            <Cover
              cover={{
                file_id: file.id,
                url: file.url,
                image_urls: file.image_urls,
                width: file.width,
                height: file.height,
                focal_x: file.focal_x,
                focal_y: file.focal_y,
                focal_zoom: file.focal_zoom,
              }}
              ratio={1}
              size="thumb"
            />
          </button>
        ) : (
          <div className="imgph" style={{ aspectRatio: "1" }}>
            {file.format}
          </div>
        )}
      </div>
      <div className="lifecycle-file-label">{file.label || file.format}</div>
      {editable && (
        <div className="lifecycle-file-actions">
          {file.is_image && onSetCover && (
            <button
              type="button"
              className={`icon-btn star${isCover ? " is-cover" : ""}`}
              disabled={busy || isCover}
              onClick={() => !isCover && onSetCover(file)}
              title={isCover ? "Current cover" : "Set as cover"}
              aria-pressed={isCover}
            >
              <Star size={16} strokeWidth={2} fill={isCover ? "currentColor" : "none"} />
            </button>
          )}
          {onDeleteFile && (
            <button
              type="button"
              className="icon-btn danger"
              disabled={busy}
              onClick={() => onDeleteFile(file)}
              title="Delete file"
            >
              <Trash2 size={16} strokeWidth={2} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
