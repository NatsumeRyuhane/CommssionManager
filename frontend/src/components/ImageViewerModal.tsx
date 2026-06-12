import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Loader2, X } from "lucide-react";

import { api } from "../api/client";
import type { CommissionFile, ImagePreset } from "../api/types";
import { useAuth } from "../hooks/useAuth";
import { DerivedImg, PRESET_EDGES, presetUrl } from "./DerivedImg";

interface ResolutionOption {
  label: string;
  preset: ImagePreset | null; // null = original bytes
}

const RESOLUTIONS: ResolutionOption[] = [
  { label: "Original", preset: null },
  { label: "Large", preset: "large" },
  { label: "Medium", preset: "medium" },
  { label: "Small", preset: "small" },
];

const PRESET_STORAGE_KEY = "cmgr:image-viewer-preset";
const MIN_SCALE = 1;
const MAX_SCALE = 8;

function maxEdgeOf(option: ResolutionOption): number | null {
  return option.preset ? PRESET_EDGES[option.preset] : null;
}

function dimensionsFor(file: CommissionFile, maxEdge: number | null): string {
  if (!file.width || !file.height) return maxEdge ? `${maxEdge}px max` : "original";
  const scale = maxEdge ? Math.min(1, maxEdge / Math.max(file.width, file.height)) : 1;
  return `${Math.round(file.width * scale)} x ${Math.round(file.height * scale)}`;
}

function availableResolutions(file: CommissionFile, allowOriginal: boolean): ResolutionOption[] {
  // derivatives are static re-encodes; only the original keeps gif animation,
  // so gifs are always original-only (the server exempts them from the gate too)
  if (file.format === "gif") {
    return RESOLUTIONS.filter((option) => option.preset === null);
  }
  const maxDimension = Math.max(file.width ?? 0, file.height ?? 0);
  // <= keeps the preset matching the source's exact size: same dimensions,
  // but the re-encoded derivative still transfers far fewer bytes than /raw
  const options = RESOLUTIONS.filter((option) => {
    const maxEdge = maxEdgeOf(option);
    if (maxEdge === null) return allowOriginal;
    return !maxDimension || maxEdge <= maxDimension;
  });
  if (!allowOriginal && !options.some((option) => option.preset !== null)) {
    // source smaller than every preset: the smallest derivative re-encodes
    // at native size, which is all a visitor may fetch
    return RESOLUTIONS.filter((option) => option.preset === "small");
  }
  return options;
}

function readStoredPreset(): ImagePreset | null {
  try {
    const raw = window.localStorage.getItem(PRESET_STORAGE_KEY);
    if (raw === "large" || raw === "medium" || raw === "small") return raw;
  } catch {
    /* storage unavailable */
  }
  return null; // original
}

function writeStoredPreset(preset: ImagePreset | null) {
  try {
    window.localStorage.setItem(PRESET_STORAGE_KEY, preset ?? "original");
  } catch {
    /* storage unavailable */
  }
}

/** The remembered preset, clamped to what this file offers: when the preferred
 *  derivative doesn't exist (small source, gif) take the next size down; the
 *  original only resolves when the site allows it for this viewer. */
function resolvePreset(
  file: CommissionFile,
  preferred: ImagePreset | null,
  allowOriginal: boolean,
): ImagePreset | null {
  const options = availableResolutions(file, allowOriginal);
  if (preferred === null && allowOriginal) return null;
  const descending: ImagePreset[] = ["large", "medium", "small"];
  const start = preferred === null ? 0 : descending.indexOf(preferred);
  for (const candidate of descending.slice(start === -1 ? 0 : start)) {
    if (options.some((option) => option.preset === candidate)) return candidate;
  }
  if (options.some((option) => option.preset === null)) return null;
  // nothing at or below the preference: take the smallest offered preset
  return options[options.length - 1]?.preset ?? null;
}

function safeFilename(file: CommissionFile): string {
  const base = (file.label || `image-${file.id}`)
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || `image-${file.id}`;
}

function outputType(
  file: CommissionFile,
  allowOriginal: boolean,
): { format: string; extension: string } {
  if (file.format === "jpg" || file.format === "jpeg") {
    return { format: "jpeg", extension: "jpg" };
  }
  if (file.format === "webp") {
    return { format: "webp", extension: "webp" };
  }
  // png derivatives are lossless, so the server reserves them for write access
  // when original downloads are disabled; visitors get jpeg instead
  if (!allowOriginal) {
    return { format: "jpeg", extension: "jpg" };
  }
  return { format: "png", extension: "png" };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Force the API to stream bytes instead of 302ing to object storage — fetch()
 *  can't carry credentials across a cross-origin redirect to the CDN. */
function streamUrl(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}redirect=0`;
}

/** Fetch a derivative, polling while the server answers 202 (still building). */
async function fetchDerivative(url: string): Promise<Blob> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const response = await fetch(streamUrl(url), { credentials: "include" });
    if (response.status === 202) {
      await new Promise((resolve) => setTimeout(resolve, 900));
      continue;
    }
    if (!response.ok) throw new Error(`Download failed (${response.status})`);
    return response.blob();
  }
  throw new Error("Timed out waiting for the server to build the image");
}

interface Transform {
  scale: number;
  x: number;
  y: number;
}

const IDENTITY: Transform = { scale: 1, x: 0, y: 0 };

/** Zoom toward a stage point (relative to the stage center) keeping it fixed on screen. */
function zoomAt(current: Transform, point: { x: number; y: number }, nextScale: number): Transform {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
  if (scale === 1) return IDENTITY;
  const ratio = scale / current.scale;
  return {
    scale,
    x: point.x - (point.x - current.x) * ratio,
    y: point.y - (point.y - current.y) * ratio,
  };
}

export function ImageViewerModal({
  nodeName,
  images,
  activeFileId,
  onSelect,
  onClose,
}: {
  nodeName: string;
  images: CommissionFile[];
  activeFileId: number;
  onSelect: (fileId: number) => void;
  onClose: () => void;
}) {
  const index = Math.max(0, images.findIndex((file) => file.id === activeFileId));
  const active = images[index];
  const { canWrite } = useAuth();
  // conservative until the site settings answer; the server enforces regardless
  const [publicOriginals, setPublicOriginals] = useState(false);
  const allowOriginal = canWrite || publicOriginals;
  const resolutions = useMemo(
    () => availableResolutions(active, allowOriginal),
    [active, allowOriginal],
  );
  const [preset, setPreset] = useState<ImagePreset | null>(() =>
    resolvePreset(active, readStoredPreset(), allowOriginal),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transform, setTransform] = useState<Transform>(IDENTITY);

  useEffect(() => {
    if (canWrite) return;
    let cancelled = false;
    api
      .getSiteSettings()
      .then((settings) => {
        if (!cancelled) setPublicOriginals(settings.allow_public_original_download);
      })
      .catch(() => {
        if (!cancelled) setPublicOriginals(true); // fail open; the server still enforces
      });
    return () => {
      cancelled = true;
    };
  }, [canWrite]);

  const stageRef = useRef<HTMLDivElement>(null);
  // live pointers on the stage; two of them = pinch
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDistance = useRef(0);
  const moved = useRef(false);
  const transformRef = useRef(transform);
  transformRef.current = transform;

  // switching images re-applies the remembered quality and resets the zoom;
  // allowOriginal arrives async, so it re-resolves the preset too
  useEffect(() => {
    const file = images.find((candidate) => candidate.id === activeFileId);
    if (file) setPreset(resolvePreset(file, readStoredPreset(), allowOriginal));
    setError(null);
    setTransform(IDENTITY);
  }, [activeFileId, images, allowOriginal]);

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && images.length > 1) {
        onSelect(images[(index - 1 + images.length) % images.length].id);
      }
      if (event.key === "ArrowRight" && images.length > 1) {
        onSelect(images[(index + 1) % images.length].id);
      }
    }
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [images, index, onClose, onSelect]);

  const stagePoint = useCallback((clientX: number, clientY: number) => {
    const stage = stageRef.current;
    if (!stage) return { x: 0, y: 0 };
    const rect = stage.getBoundingClientRect();
    return {
      x: clientX - rect.left - rect.width / 2,
      y: clientY - rect.top - rect.height / 2,
    };
  }, []);

  // native listener: React's onWheel can't preventDefault (passive on some browsers),
  // and trackpad pinches arrive as ctrlKey wheel events
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    function onWheel(event: WheelEvent) {
      event.preventDefault();
      const current = transformRef.current;
      const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.002));
      setTransform(
        zoomAt(current, stagePoint(event.clientX, event.clientY), current.scale * factor),
      );
    }
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [stagePoint]);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    moved.current = false;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchDistance.current = Math.hypot(a.x - b.x, a.y - b.y);
    }
    stageRef.current?.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const next = { x: event.clientX, y: event.clientY };
    if (Math.hypot(next.x - previous.x, next.y - previous.y) > 3) moved.current = true;
    pointers.current.set(event.pointerId, next);

    if (pointers.current.size === 2) {
      // pinch: zoom around the midpoint
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDistance.current > 0) {
        const midpoint = stagePoint((a.x + b.x) / 2, (a.y + b.y) / 2);
        setTransform((current) =>
          zoomAt(current, midpoint, current.scale * (distance / pinchDistance.current)),
        );
      }
      pinchDistance.current = distance;
      return;
    }
    if (transformRef.current.scale > 1) {
      // single-pointer pan while zoomed
      setTransform((current) => ({
        ...current,
        x: current.x + (next.x - previous.x),
        y: current.y + (next.y - previous.y),
      }));
    }
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    pinchDistance.current = 0;
  }

  function onStageClick(event: React.MouseEvent<HTMLDivElement>) {
    // dismiss on a clean click on the dark area; drags, pinches, and clicks
    // on the image or floating controls don't close
    if (moved.current) return;
    if ((event.target as HTMLElement).closest("[data-viewer-keep]")) return;
    onClose();
  }

  function onDoubleClick(event: React.MouseEvent<HTMLDivElement>) {
    const point = stagePoint(event.clientX, event.clientY);
    setTransform((current) => zoomAt(current, point, current.scale > 1 ? 1 : 2.5));
  }

  function choosePreset(value: string) {
    const next = value === "original" ? null : (value as ImagePreset);
    setPreset(next);
    writeStoredPreset(next);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      if (preset === null) {
        const response = await fetch(streamUrl(active.url), { credentials: "include" });
        if (!response.ok) throw new Error(`Download failed (${response.status})`);
        downloadBlob(await response.blob(), `${safeFilename(active)}.${active.format || "png"}`);
        return;
      }
      const derivativeUrl = active.image_urls?.[preset];
      if (!derivativeUrl) throw new Error("No derivative available for this image");
      const { format, extension } = outputType(active, allowOriginal);
      const blob = await fetchDerivative(`${derivativeUrl}&format=${format}`);
      downloadBlob(
        blob,
        `${safeFilename(active)}-${dimensionsFor(active, PRESET_EDGES[preset]).replace(/\s/g, "")}.${extension}`,
      );
    } catch (saveError) {
      setError(String(saveError));
    } finally {
      setSaving(false);
    }
  }

  const previous = images[(index - 1 + images.length) % images.length];
  const next = images[(index + 1) % images.length];
  const displaySrc = preset ? presetUrl(active.image_urls, preset, active.url) : active.url;
  // switching file or resolution remounts the <img> (keyed by src), so the
  // stale frame never lingers; until the new source loads — or while the
  // server is still generating the derivative — a status pill shows instead
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const sourceLoading = loadedSrc !== displaySrc;

  return (
    <div
      className="image-viewer-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`${nodeName} images`}
    >
      <div
        ref={stageRef}
        className="image-viewer-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onStageClick}
        onDoubleClick={onDoubleClick}
      >
        <div
          className="image-viewer-canvas"
          data-viewer-keep
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            cursor: transform.scale > 1 ? "grab" : "zoom-in",
          }}
        >
          <DerivedImg
            key={displaySrc}
            src={displaySrc}
            fallbackSrc={active.url}
            alt={active.label || `${nodeName} image ${index + 1}`}
            draggable={false}
            onLoad={() => setLoadedSrc(displaySrc)}
          />
        </div>
      </div>

      {sourceLoading && (
        <div className="image-viewer-loading" data-viewer-keep role="status">
          <Loader2 size={15} className="spin" />
          Preparing image…
        </div>
      )}

      <header className="image-viewer-top" data-viewer-keep>
        <div className="image-viewer-meta">
          <strong>{active.label || `${active.format.toUpperCase()} image`}</strong>
          <span className="mono-sm">
            {nodeName} · {index + 1} of {images.length} · {dimensionsFor(active, null)}
          </span>
        </div>
        <div className="image-viewer-controls">
          <select
            className="field image-viewer-resolution"
            aria-label="Image resolution"
            value={preset ?? "original"}
            onChange={(event) => choosePreset(event.target.value)}
          >
            {resolutions.map((option) => (
              <option key={option.preset ?? "original"} value={option.preset ?? "original"}>
                {option.label} · {dimensionsFor(active, maxEdgeOf(option))}
              </option>
            ))}
          </select>
          <button
            className="btn sm image-viewer-btn"
            type="button"
            disabled={saving}
            onClick={() => void save()}
          >
            <Download size={15} />
            {saving ? "Saving..." : "Save image"}
          </button>
          <button
            className="image-viewer-close"
            type="button"
            onClick={onClose}
            title="Close image viewer"
            aria-label="Close image viewer"
          >
            <X size={18} />
          </button>
        </div>
      </header>

      {images.length > 1 && (
        <>
          <button
            className="image-viewer-nav previous"
            type="button"
            data-viewer-keep
            onClick={() => onSelect(previous.id)}
            title="Previous image"
            aria-label="Previous image"
          >
            <ChevronLeft size={26} />
          </button>
          <button
            className="image-viewer-nav next"
            type="button"
            data-viewer-keep
            onClick={() => onSelect(next.id)}
            title="Next image"
            aria-label="Next image"
          >
            <ChevronRight size={26} />
          </button>
        </>
      )}

      {error && (
        <div className="image-viewer-error error-text" data-viewer-keep>
          {error}
        </div>
      )}
      {images.length > 1 && (
        <div
          className="image-viewer-thumbnails"
          data-viewer-keep
          aria-label={`${nodeName} image thumbnails`}
        >
          {images.map((file, imageIndex) => (
            <button
              key={file.id}
              type="button"
              className={file.id === active.id ? "active" : ""}
              onClick={() => onSelect(file.id)}
              aria-label={`View image ${imageIndex + 1}`}
              aria-current={file.id === active.id}
            >
              <DerivedImg
                src={presetUrl(file.image_urls, "thumb", file.url)}
                fallbackSrc={file.url}
                alt=""
                loading="lazy"
                draggable={false}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
