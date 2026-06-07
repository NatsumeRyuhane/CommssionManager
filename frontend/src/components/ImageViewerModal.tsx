import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";

import type { CommissionFile } from "../api/types";

interface ResolutionOption {
  label: string;
  maxEdge: number | null;
}

const RESOLUTIONS: ResolutionOption[] = [
  { label: "Original", maxEdge: null },
  { label: "Large", maxEdge: 2048 },
  { label: "Medium", maxEdge: 1280 },
  { label: "Small", maxEdge: 640 },
];

function dimensionsFor(file: CommissionFile, maxEdge: number | null): string {
  if (!file.width || !file.height) return maxEdge ? `${maxEdge}px max` : "original";
  const scale = maxEdge ? Math.min(1, maxEdge / Math.max(file.width, file.height)) : 1;
  return `${Math.round(file.width * scale)} x ${Math.round(file.height * scale)}`;
}

function availableResolutions(file: CommissionFile): ResolutionOption[] {
  const maxDimension = Math.max(file.width ?? 0, file.height ?? 0);
  return RESOLUTIONS.filter(
    ({ maxEdge }) => maxEdge === null || !maxDimension || maxEdge < maxDimension,
  );
}

function safeFilename(file: CommissionFile): string {
  const base = (file.label || `image-${file.id}`)
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || `image-${file.id}`;
}

function outputType(file: CommissionFile): { mime: string; extension: string } {
  if (file.format === "jpg" || file.format === "jpeg") {
    return { mime: "image/jpeg", extension: "jpg" };
  }
  if (file.format === "webp") {
    return { mime: "image/webp", extension: "webp" };
  }
  return { mime: "image/png", extension: "png" };
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

async function resizeImage(blob: Blob, maxEdge: number, file: CommissionFile): Promise<Blob> {
  const image = await createImageBitmap(blob);
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    image.close();
    throw new Error("Browser could not create an image canvas");
  }
  context.drawImage(image, 0, 0, width, height);
  image.close();
  const { mime } = outputType(file);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error("Browser could not resize image"))),
      mime,
      0.92,
    );
  });
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
  const [maxEdge, setMaxEdge] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMaxEdge(null);
    setError(null);
  }, [activeFileId]);

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
      const response = await fetch(active.url, { credentials: "include" });
      if (!response.ok) throw new Error(`Download failed (${response.status})`);
      const source = await response.blob();
      if (maxEdge === null) {
        downloadBlob(source, `${safeFilename(active)}.${active.format || "png"}`);
        return;
      }
      const resized = await resizeImage(source, maxEdge, active);
      const { extension } = outputType(active);
      downloadBlob(
        resized,
        `${safeFilename(active)}-${dimensionsFor(active, maxEdge).replace(/\s/g, "")}.${extension}`,
      );
    } catch (saveError) {
      setError(String(saveError));
    } finally {
      setSaving(false);
    }
  }

  const previous = images[(index - 1 + images.length) % images.length];
  const next = images[(index + 1) % images.length];

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
              aria-label="Save image resolution"
              value={maxEdge ?? "original"}
              onChange={(event) =>
                setMaxEdge(event.target.value === "original" ? null : Number(event.target.value))
              }
            >
              {resolutions.map((option) => (
                <option key={option.maxEdge ?? "original"} value={option.maxEdge ?? "original"}>
                  {option.label} · {dimensionsFor(active, option.maxEdge)}
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
          <img src={active.url} alt={active.label || `${nodeName} image ${index + 1}`} />
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
                <img src={file.url} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
