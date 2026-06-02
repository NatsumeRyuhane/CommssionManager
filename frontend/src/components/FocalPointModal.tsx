import { useState, type PointerEvent } from "react";

import type { CommissionFile } from "../api/types";

export function FocalPointModal({
  file,
  busy,
  onSave,
  onClose,
}: {
  file: CommissionFile;
  busy: boolean;
  onSave: (x: number, y: number) => void;
  onClose: () => void;
}) {
  const [x, setX] = useState(file.focal_x ?? 0.5);
  const [y, setY] = useState(file.focal_y ?? 0.5);

  function pick(e: PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const nextX = clamp((e.clientX - rect.left) / rect.width);
    const nextY = clamp((e.clientY - rect.top) / rect.height);
    setX(nextX);
    setY(nextY);
  }

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="focal-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="row" style={{ marginBottom: 12 }}>
          <div>
            <strong>Edit focal point</strong>
            <div className="mono-sm muted">
              {Math.round(x * 100)}%, {Math.round(y * 100)}%
            </div>
          </div>
          <span className="spacer" />
          <button className="btn sm ghost" onClick={onClose}>
            Close
          </button>
          <button className="btn sm primary" disabled={busy} onClick={() => onSave(x, y)}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
        <div className="focal-image-wrap" onPointerDown={pick}>
          <img src={file.url} alt="" draggable={false} />
          <span className="focal-reticle" style={{ left: `${x * 100}%`, top: `${y * 100}%` }} />
        </div>
      </div>
    </div>
  );
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}
