import { useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";

import type { CommissionFile, CommissionNode } from "../api/types";
import { Chip } from "./Chip";
import { Cover } from "./Cover";

const NODE_DRAG_TYPE = "application/x-cmgr-node-id";

interface LifecycleStagesListProps {
  nodes: CommissionNode[];
  currentStage?: string | null;
  coverFileId?: number | null;
  busy?: boolean;
  moveTargets?: CommissionNode[];
  onMoveFile?: (file: CommissionFile, targetNodeId: number) => void;
  onReorderNode?: (draggedNodeId: number, targetNodeId: number) => void;
  onUpload?: (node: CommissionNode, files: FileList) => void;
  onSetCover?: (file: CommissionFile) => void;
  onDeleteFile?: (file: CommissionFile) => void;
  onEditDate?: (node: CommissionNode) => void;
  renderStageActions?: (node: CommissionNode, index: number) => ReactNode;
}

export function LifecycleStagesList({
  nodes,
  currentStage,
  coverFileId,
  busy = false,
  moveTargets = nodes,
  onMoveFile,
  onReorderNode,
  onUpload,
  onSetCover,
  onDeleteFile,
  onEditDate,
  renderStageActions,
}: LifecycleStagesListProps) {
  const filesById = useMemo(() => {
    const out = new Map<number, CommissionFile>();
    for (const node of nodes) {
      for (const file of node.files) out.set(file.id, file);
    }
    return out;
  }, [nodes]);

  return (
    <div className="lifecycle-list">
      {nodes.map((node, index) => (
        <LifecycleStage
          key={node.id}
          node={node}
          currentStage={currentStage}
          coverFileId={coverFileId}
          busy={busy}
          filesById={filesById}
          moveTargets={moveTargets}
          onMoveFile={onMoveFile}
          onReorderNode={onReorderNode}
          onUpload={onUpload}
          onSetCover={onSetCover}
          onDeleteFile={onDeleteFile}
          onEditDate={onEditDate}
          stageActions={renderStageActions?.(node, index)}
        />
      ))}
    </div>
  );
}

function LifecycleStage({
  node,
  currentStage,
  coverFileId,
  busy,
  filesById,
  moveTargets,
  onMoveFile,
  onReorderNode,
  onUpload,
  onSetCover,
  onDeleteFile,
  onEditDate,
  stageActions,
}: {
  node: CommissionNode;
  currentStage?: string | null;
  coverFileId?: number | null;
  busy: boolean;
  filesById: Map<number, CommissionFile>;
  moveTargets: CommissionNode[];
  onMoveFile?: (file: CommissionFile, targetNodeId: number) => void;
  onReorderNode?: (draggedNodeId: number, targetNodeId: number) => void;
  onUpload?: (node: CommissionNode, files: FileList) => void;
  onSetCover?: (file: CommissionFile) => void;
  onDeleteFile?: (file: CommissionFile) => void;
  onEditDate?: (node: CommissionNode) => void;
  stageActions?: ReactNode;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [dropActive, setDropActive] = useState(false);
  const canMove = Boolean(onMoveFile);
  const canUpload = Boolean(onUpload && !node.is_detached);
  const canReorder = Boolean(onReorderNode && !node.is_detached);

  function drop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDropActive(false);
    const draggedNodeId = Number(e.dataTransfer.getData(NODE_DRAG_TYPE));
    if (draggedNodeId && canReorder) {
      onReorderNode?.(draggedNodeId, node.id);
      return;
    }
    const fileId = Number(e.dataTransfer.getData("text/plain"));
    const file = filesById.get(fileId);
    if (!file || file.node_id === node.id) return;
    onMoveFile?.(file, node.id);
  }

  return (
    <div
      className={`lifecycle-stage ${node.is_detached ? "detached" : ""} ${dropActive ? "drop-active" : ""}`}
      onDragOver={(e) => {
        const draggingNode = e.dataTransfer.types.includes(NODE_DRAG_TYPE);
        if ((!draggingNode && !canMove) || (draggingNode && !canReorder)) return;
        e.preventDefault();
        setDropActive(true);
      }}
      onDragLeave={() => setDropActive(false)}
      onDrop={canMove || canReorder ? drop : undefined}
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
        <span className="mono-sm muted">{node.files.length} files</span>
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
              className="btn sm"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
            >
              Upload
            </button>
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files?.length) onUpload?.(node, e.target.files);
                e.target.value = "";
              }}
            />
          </>
        )}
        {stageActions}
      </div>
      {node.files.length === 0 ? (
        <div className="lifecycle-empty mono-sm muted">
          {canMove ? "Drop files here" : "No files"}
        </div>
      ) : (
        <div className="lifecycle-file-grid">
          {node.files.map((file) => (
            <LifecycleFileTile
              key={file.id}
              file={file}
              isCover={file.id === coverFileId}
              busy={busy}
              moveTargets={moveTargets}
              onMoveFile={onMoveFile}
              onSetCover={onSetCover}
              onDeleteFile={onDeleteFile}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LifecycleFileTile({
  file,
  isCover,
  busy,
  moveTargets,
  onMoveFile,
  onSetCover,
  onDeleteFile,
}: {
  file: CommissionFile;
  isCover: boolean;
  busy: boolean;
  moveTargets: CommissionNode[];
  onMoveFile?: (file: CommissionFile, targetNodeId: number) => void;
  onSetCover?: (file: CommissionFile) => void;
  onDeleteFile?: (file: CommissionFile) => void;
}) {
  const editable = Boolean(onSetCover || onDeleteFile || onMoveFile);
  return (
    <div
      className="lifecycle-file"
      draggable={Boolean(onMoveFile)}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", String(file.id));
        e.dataTransfer.effectAllowed = "move";
      }}
    >
      <div className={isCover ? "lifecycle-file-cover is-cover" : "lifecycle-file-cover"}>
        {file.is_image ? (
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
        ) : (
          <div className="imgph" style={{ aspectRatio: "1" }}>
            {file.format}
          </div>
        )}
      </div>
      <div className="lifecycle-file-label">{file.label || file.format}</div>
      {editable && (
        <div className="lifecycle-file-actions">
          {onMoveFile && (
            <select
              className="field"
              value=""
              disabled={busy}
              title="Move file"
              onChange={(e) => {
                const target = Number(e.target.value);
                if (target) onMoveFile(file, target);
              }}
            >
              <option value="">Move</option>
              {moveTargets
                .filter((node) => node.id !== file.node_id)
                .map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.name}
                  </option>
                ))}
            </select>
          )}
          {file.is_image && !isCover && onSetCover && (
            <button
              type="button"
              className="btn sm ghost"
              disabled={busy}
              onClick={() => onSetCover(file)}
              title="Set as cover"
            >
              ★
            </button>
          )}
          {isCover && <span className="mono-sm" style={{ color: "var(--accent)" }}>cover</span>}
          {onDeleteFile && (
            <button
              type="button"
              className="btn sm danger"
              disabled={busy}
              onClick={() => onDeleteFile(file)}
              title="Delete file"
            >
              ✕
            </button>
          )}
        </div>
      )}
    </div>
  );
}
