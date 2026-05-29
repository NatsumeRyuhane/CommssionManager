import { useCallback, useEffect, useState } from "react";

import { api } from "../api/client";
import type { CommissionDetail, CommissionNode } from "../api/types";

/** Edit-mode panel for managing a commission's lifecycle stages (nodes). */
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

  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 18, margin: "0 0 4px" }}>Stages &amp; files</h2>
      <div className="mono-sm muted" style={{ marginBottom: 12 }}>
        Lifecycle stages in order. Deleting a stage moves its files to the Detached holding area.
      </div>

      {regular.map((node, i) => (
        <StageRow
          key={node.id}
          node={node}
          isFirst={i === 0}
          isLast={i === regular.length - 1}
          busy={busy}
          onUp={() => move(i, -1)}
          onDown={() => move(i, 1)}
          onRename={() => rename(node)}
          onDelete={() => remove(node)}
        />
      ))}

      {detached && (
        <div
          style={{
            border: "1px dashed var(--warn)",
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 10,
            background: "rgba(182,85,42,0.05)",
          }}
        >
          <div className="row">
            <strong>{detached.name}</strong>
            <span className="mono-sm muted">uncategorized · cannot be edited or deleted</span>
            <span className="spacer" />
            <span className="mono-sm">{detached.files.length} files</span>
          </div>
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
  busy,
  onUp,
  onDown,
  onRename,
  onDelete,
}: {
  node: CommissionNode;
  isFirst: boolean;
  isLast: boolean;
  busy: boolean;
  onUp: () => void;
  onDown: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
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
      <div className="row">
        <strong>{node.name}</strong>
        <span className="mono-sm muted">{node.files.length} files</span>
        <span className="spacer" />
        <button type="button" className="btn sm" onClick={onUp} disabled={busy || isFirst} title="Move up">
          ↑
        </button>
        <button
          type="button"
          className="btn sm"
          onClick={onDown}
          disabled={busy || isLast}
          title="Move down"
        >
          ↓
        </button>
        <button type="button" className="btn sm" onClick={onRename} disabled={busy}>
          Rename
        </button>
        <button type="button" className="btn sm danger" onClick={onDelete} disabled={busy}>
          Delete
        </button>
      </div>
    </div>
  );
}
