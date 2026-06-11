import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";

import type { CommissionFile, ImagePreset } from "../api/types";
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

function maxEdgeOf(option: ResolutionOption): number | null {
  return option.preset ? PRESET_EDGES[option.preset] : null;
}

function dimensionsFor(file: CommissionFile, maxEdge: number | null): string {
  if (!file.width || !file.height) return maxEdge ? `${maxEdge}px max` : "original";
  const scale = maxEdge ? Math.min(1, maxEdge / Math.max(file.width, file.height)) : 1;
  return `${Math.round(file.width * scale)} x ${Math.round(file.height * scale)}`;
}

function availableResolutions(file: CommissionFile): ResolutionOption[] {
  // derivatives are static re-encodes; only the original keeps gif animation
  if (file.format === "gif") return RESOLUTIONS.filter((option) => option.preset === null);
  const maxDimension = Math.max(file.width ?? 0, file.height ?? 0);
  return RESOLUTIONS.filter((option) => {
    const maxEdge = maxEdgeOf(option);
    return maxEdge === null || !maxDimension || maxEdge < maxDimension;
  });
}

function defaultPreset(file: CommissionFile, options: ResolutionOption[]): ImagePreset | null {
  if (file.format === "gif") return null;
  return options.some((option) => option.preset === "medium") ? "medium" : null;
}

function safeFilename(file: CommissionFile): string {
  const base = (file.label || `image-${file.id}`)
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || `image-${file.id}`;
}

function outputType(file: CommissionFile): { format: string; extension: string } {
  if (file.format === "jpg" || file.format === "jpeg") {
    return { format: "jpeg", extension: "jpg" };
  }
  if (file.format === "webp") {
    return { format: "webp", extension: "webp" };
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

/** Fetch a derivative, polling while the server answers 202 (still building). */
async function fetchDerivative(url: string): Promise<Blob> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const response = await fetch(url, { credentials: "include" });
    if (response.status === 202) {
      await new Promise((resolve) => setTimeout(resolve, 900));
      continue;
    }
    if (!response.ok) throw new Error(`Download failed (${response.status})`);
    return response.blob();
  }
  throw new Error("Timed out waiting for the server to build the image");
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
  const resolutions = useMemo(() => availableResolutions(active), [active]);
  const [preset, setPreset] = useState<ImagePreset | null>(() =>
    defaultPreset(active, availableResolutions(active)),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const file = images.find((candidate) => candidate.id === activeFileId);
    if (file) setPreset(defaultPreset(file, availableResolutions(file)));
    setError(null);
  }, [activeFileId, images]);

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

  async function save() {
    setSaving(true);
    setError(null);
    try {
      if (preset === null) {
        const response = await fetch(active.url, { credentials: "include" });
        if (!response.ok) throw new Error(`Download failed (${response.status})`);
        downloadBlob(await response.blob(), `${safeFilename(active)}.${active.format || "png"}`);
        return;
      }
      const derivativeUrl = active.image_urls?.[preset];
      if (!derivativeUrl) throw new Error("No derivative available for this image");
      const { format, extension } = outputType(active);
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

  return (
    <div className="image-viewer-overlay" onMouseDown={onClose}>
      <div
        className="image-viewer"
        role="dialog"
        aria-modal="true"
        aria-label={`${nodeName} images`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="image-viewer-head">
          <div>
            <strong>{active.label || `${active.format.toUpperCase()} image`}</strong>
            <span className="mono-sm muted">
              {nodeName} · {index + 1} of {images.length} · {dimensionsFor(active, null)}
            </span>
          </div>
          <div className="row gap-8">
            <select
              className="field image-viewer-resolution"
              aria-label="Image resolution"
              value={preset ?? "original"}
              onChange={(event) =>
                setPreset(
                  event.target.value === "original"
                    ? null
                    : (event.target.value as ImagePreset),
                )
              }
            >
              {resolutions.map((option) => (
                <option key={option.preset ?? "original"} value={option.preset ?? "original"}>
                  {option.label} · {dimensionsFor(active, maxEdgeOf(option))}
                </option>
              ))}
            </select>
            <button className="btn sm" type="button" disabled={saving} onClick={() => void save()}>
              <Download size={15} />
              {saving ? "Saving..." : "Save image"}
            </button>
            <button
              className="icon-btn"
              type="button"
              onClick={onClose}
              title="Close image viewer"
              aria-label="Close image viewer"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="image-viewer-stage">
          {images.length > 1 && (
            <button
              className="image-viewer-nav previous"
              type="button"
              onClick={() => onSelect(previous.id)}
              title="Previous image"
              aria-label="Previous image"
            >
              <ChevronLeft size={28} />
            </button>
          )}
          <DerivedImg
            src={displaySrc}
            fallbackSrc={active.url}
            alt={active.label || `${nodeName} image ${index + 1}`}
          />
          {images.length > 1 && (
            <button
              className="image-viewer-nav next"
              type="button"
              onClick={() => onSelect(next.id)}
              title="Next image"
              aria-label="Next image"
            >
              <ChevronRight size={28} />
            </button>
          )}
        </div>

        {error && <div className="image-viewer-error error-text">{error}</div>}
        {images.length > 1 && (
          <div className="image-viewer-thumbnails" aria-label={`${nodeName} image thumbnails`}>
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
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
