import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Crosshair, Undo2 } from "lucide-react";

import { api } from "../api/client";
import type { Cover } from "../api/types";
import { DerivedImg, presetUrl } from "./DerivedImg";

/** A pending focal edit the parent form commits alongside the rest of its fields. */
export interface StagedFocal {
  fileId: number;
  x: number;
  y: number;
  zoom: number;
}

interface FocalValue {
  x: number;
  y: number;
  zoom: number;
}

interface CoverFocalEditorProps {
  commissionId: number;
  /** Bump this to force a refetch (e.g. after the cover file changes in the stages editor). */
  version?: number;
  /** Reports the staged focal (null when nothing differs from the saved state).
   *  Must be referentially stable — pass a setState dispatcher. */
  onStage?: (staged: StagedFocal | null) => void;
}

const RATIOS: { w: number; h: number; label: string }[] = [
  { w: 1, h: 1, label: "1:1" },
  { w: 3, h: 4, label: "3:4" },
  { w: 16, h: 9, label: "16:9" },
];

const ZOOM_MIN = 1;
const ZOOM_MAX = 3;

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function focalEq(a: FocalValue, b: FocalValue) {
  return a.x === b.x && a.y === b.y && a.zoom === b.zoom;
}

function fromCover(cover: Cover): FocalValue {
  return {
    x: cover.focal_x ?? 0.5,
    y: cover.focal_y ?? 0.5,
    zoom: cover.focal_zoom ?? 1,
  };
}

/**
 * Staged editor for the cover image focal point and crop zoom.
 *
 * Pointer-drags on the canvas pick the focal point and a slider picks the
 * zoom; nothing is persisted here. Edits are reported to the parent through
 * `onStage` and committed together with the rest of the edit form, so a
 * failed save keeps everything staged on the page. "Center focal" recenters
 * the point; "Revert" restores the last-saved values.
 */
export function CoverFocalEditor({ commissionId, version = 0, onStage }: CoverFocalEditorProps) {
  const [cover, setCover] = useState<Cover | null>(null);
  const [value, setValue] = useState<FocalValue>({ x: 0.5, y: 0.5, zoom: 1 });
  const [saved, setSaved] = useState<FocalValue>({ x: 0.5, y: 0.5, zoom: 1 });
  const [error, setError] = useState<string | null>(null);
  const [pressed, setPressed] = useState(false);
  const [moveLocked, setMoveLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  // refs let the async refetch handler compare against the values current at
  // resolution time without re-running the effect on every drag
  const fileIdRef = useRef<number | null>(null);
  const valueRef = useRef(value);
  const savedRef = useRef(saved);
  valueRef.current = value;
  savedRef.current = saved;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api
      .getCommission(commissionId)
      .then((d) => {
        if (!active) return;
        setCover(d.cover);
        if (d.cover) {
          const next = fromCover(d.cover);
          // version bumps fire on any StagesEditor mutation; when the cover
          // file is unchanged, keep the user's pending edits instead of
          // clobbering them, but drop them if the cover itself changed
          const sameFile = fileIdRef.current === d.cover.file_id;
          const untouched = focalEq(valueRef.current, savedRef.current);
          fileIdRef.current = d.cover.file_id;
          setSaved(next);
          if (!sameFile || untouched) setValue(next);
        } else {
          fileIdRef.current = null;
        }
        setLoading(false);
      })
      .catch((e) => {
        if (!active) return;
        setError(String(e));
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [commissionId, version]);

  const dirty = !focalEq(value, saved);

  // report the staged edit (or its absence) to the parent form
  useEffect(() => {
    if (!onStage) return;
    const fileId = cover?.file_id;
    onStage(fileId != null && dirty ? { fileId, ...value } : null);
  }, [onStage, cover?.file_id, dirty, value]);

  function pick(e: PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = clamp01((e.clientX - rect.left) / rect.width);
    const y = clamp01((e.clientY - rect.top) / rect.height);
    setValue((v) => ({ ...v, x, y }));
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

  const focalOrigin = `${value.x * 100}% ${value.y * 100}%`;

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
        {/* picking is percentage-based on the rendered box, so a derivative
            loses no precision over the original bytes */}
        <DerivedImg
          src={presetUrl(cover.image_urls, "small", cover.url)}
          fallbackSrc={cover.url}
          alt=""
          draggable={false}
        />
        <span
          className="focal-guide focal-guide-h"
          style={{ top: `${value.y * 100}%` }}
        />
        <span
          className="focal-guide focal-guide-v"
          style={{ left: `${value.x * 100}%` }}
        />
        <span
          className="focal-reticle"
          style={{ left: `${value.x * 100}%`, top: `${value.y * 100}%` }}
        />
      </div>
      <div className="focal-zoom-row">
        <span className="mono-sm muted">zoom</span>
        <input
          className="focal-zoom-slider"
          type="range"
          min={ZOOM_MIN}
          max={ZOOM_MAX}
          step={0.05}
          value={value.zoom}
          onChange={(e) => {
            const zoom = Number(e.target.value);
            setValue((v) => ({ ...v, zoom }));
          }}
          aria-label="Cover crop zoom"
        />
        <span className="mono-sm" style={{ minWidth: 42, textAlign: "right" }}>
          ×{value.zoom.toFixed(2)}
        </span>
      </div>
      <div className="mono-sm muted" style={{ textAlign: "center", marginTop: 2 }}>
        focal ({value.x.toFixed(2)}, {value.y.toFixed(2)})
        {dirty && <span className="focal-pending"> · saves with the form</span>}
      </div>
      <div className="cover-focal-previews">
        {RATIOS.map((r) => (
          <div key={r.label} className="cover-focal-preview">
            <div
              className="cover-focal-preview-img"
              style={{ aspectRatio: `${r.w} / ${r.h}` }}
            >
              <DerivedImg
                src={presetUrl(cover.image_urls, "small", cover.url)}
                fallbackSrc={cover.url}
                alt=""
                draggable={false}
                style={{
                  objectPosition: focalOrigin,
                  transformOrigin: focalOrigin,
                  transform: `scale(${value.zoom})`,
                }}
              />
            </div>
            <div className="mono-sm" style={{ textAlign: "center", marginTop: 2 }}>
              {r.label}
            </div>
          </div>
        ))}
      </div>
      <div className="cover-focal-actions">
        <button
          type="button"
          className="btn sm ghost"
          onClick={() => setValue((v) => ({ ...v, x: 0.5, y: 0.5 }))}
          disabled={loading || (value.x === 0.5 && value.y === 0.5)}
          title="Reset the focal point to the image center"
        >
          <Crosshair />
          Center focal
        </button>
        <button
          type="button"
          className="btn sm ghost"
          onClick={() => setValue(saved)}
          disabled={loading || !dirty}
          title="Restore the last-saved focal and zoom"
        >
          <Undo2 />
          Revert
        </button>
      </div>
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}
