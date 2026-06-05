import { useEffect, useState, type PointerEvent } from "react";

import { api } from "../api/client";
import type { Cover } from "../api/types";

interface CoverFocalEditorProps {
  commissionId: number;
  /** Bump this to force a refetch (e.g. after the cover file changes in the stages editor). */
  version?: number;
  /** Notify the parent that focal data changed so siblings can refresh. */
  onChange?: () => void;
}

const RATIOS: { w: number; h: number; label: string }[] = [
  { w: 1, h: 1, label: "1:1" },
  { w: 3, h: 4, label: "3:4" },
  { w: 16, h: 9, label: "16:9" },
];

function clamp(v: number) {
  return Math.max(0, Math.min(1, v));
}

export function CoverFocalEditor({ commissionId, version = 0, onChange }: CoverFocalEditorProps) {
  const [cover, setCover] = useState<Cover | null>(null);
  const [focal, setFocal] = useState<[number, number]>([0.5, 0.5]);
  const [savedFocal, setSavedFocal] = useState<[number, number]>([0.5, 0.5]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pressed, setPressed] = useState(false);
  const [moveLocked, setMoveLocked] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .getCommission(commissionId)
      .then((d) => {
        if (!active) return;
        setCover(d.cover);
        if (d.cover) {
          const next: [number, number] = [d.cover.focal_x ?? 0.5, d.cover.focal_y ?? 0.5];
          setFocal(next);
          setSavedFocal(next);
        }
      })
      .catch((e) => active && setError(String(e)));
    return () => {
      active = false;
    };
  }, [commissionId, version]);

  function pick(e: PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = clamp((e.clientX - rect.left) / rect.width);
    const y = clamp((e.clientY - rect.top) / rect.height);
    setFocal([x, y]);
  }

  async function save() {
    if (!cover) return;
    setBusy(true);
    setError(null);
    try {
      await api.setFocal(cover.file_id, focal[0], focal[1]);
      setSavedFocal(focal);
      onChange?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  function revert() {
    setFocal(savedFocal);
  }

  if (!cover) {
    return (
      <div className="edit-field-group">
        <div className="label">Cover image · focal point</div>
        <div className="cover-focal-empty mono-sm muted">
          No cover yet. Mark a file as cover in a lifecycle stage (★).
        </div>
      </div>
    );
  }

  const dirty = focal[0] !== savedFocal[0] || focal[1] !== savedFocal[1];

  return (
    <div className={`edit-field-group cover-focal-editor${moveLocked ? " is-dragging" : ""}`}>
      <div className="label">Cover image · focal point</div>
      <div
        className={`cover-focal-canvas${moveLocked ? " is-dragging" : ""}`}
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          setPressed(true);
          // first pick animates because moveLocked is still false
          pick(e);
        }}
        onPointerMove={(e) => {
          if (!pressed) return;
          if (!moveLocked) setMoveLocked(true);
          pick(e);
        }}
        onPointerUp={() => {
          setPressed(false);
          setMoveLocked(false);
        }}
        onPointerCancel={() => {
          setPressed(false);
          setMoveLocked(false);
        }}
      >
        <img src={cover.url} alt="" draggable={false} />
        <span
          className="focal-guide focal-guide-h"
          style={{ top: `${focal[1] * 100}%` }}
        />
        <span
          className="focal-guide focal-guide-v"
          style={{ left: `${focal[0] * 100}%` }}
        />
        <span
          className="focal-reticle"
          style={{ left: `${focal[0] * 100}%`, top: `${focal[1] * 100}%` }}
        />
      </div>
      <div className="mono-sm muted" style={{ textAlign: "center", marginTop: 6 }}>
        focal ({focal[0].toFixed(2)}, {focal[1].toFixed(2)})
      </div>
      <div className="cover-focal-previews">
        {RATIOS.map((r) => (
          <div key={r.label} className="cover-focal-preview">
            <div
              className="cover-focal-preview-img"
              style={{ aspectRatio: `${r.w} / ${r.h}` }}
            >
              <img
                src={cover.url}
                alt=""
                draggable={false}
                style={{
                  objectPosition: `${focal[0] * 100}% ${focal[1] * 100}%`,
                }}
              />
            </div>
            <div className="mono-sm" style={{ textAlign: "center", marginTop: 2 }}>
              {r.label}
            </div>
          </div>
        ))}
      </div>
      {dirty && (
        <div className="cover-focal-actions">
          <button
            type="button"
            className="btn sm ghost"
            onClick={revert}
            disabled={busy}
          >
            Revert
          </button>
          <button
            type="button"
            className="btn sm primary"
            onClick={() => void save()}
            disabled={busy}
          >
            {busy ? "Saving…" : "✓ Save focal"}
          </button>
        </div>
      )}
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}
