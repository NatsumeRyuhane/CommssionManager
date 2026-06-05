import { useState } from "react";

import type { CommissionNode } from "../api/types";

export function NodeDateModal({
  node,
  busy,
  onSave,
  onClose,
}: {
  node: CommissionNode;
  busy: boolean;
  onSave: (date: string | null) => void;
  onClose: () => void;
}) {
  const [date, setDate] = useState(node.started_at?.slice(0, 10) ?? "");

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="node-date-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="row" style={{ marginBottom: 14 }}>
          <div>
            <strong>Change lifecycle date</strong>
            <div className="mono-sm muted">{node.name}</div>
          </div>
          <span className="spacer" />
          <button className="btn sm ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <label>
          <span className="label">Started date</span>
          <input className="field lg" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
          <button className="btn ghost" disabled={busy} onClick={() => onSave(null)}>
            Clear
          </button>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy} onClick={() => onSave(date || null)}>
            {busy ? "Saving…" : "Save date"}
          </button>
        </div>
      </div>
    </div>
  );
}
