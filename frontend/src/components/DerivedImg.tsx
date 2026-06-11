import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react";

import type { ImagePreset, ImageUrls } from "../api/types";

/** Max edge of each derivative preset; mirrors the backend's preset map. */
export const PRESET_EDGES: Record<ImagePreset, number> = {
  thumb: 240,
  small: 640,
  medium: 1280,
  large: 2048,
};

const MAX_ATTEMPTS = 8;

function retryDelay(attempt: number): number {
  return Math.min(600 * 2 ** attempt, 4000);
}

/** Derivative URL for a preset, or the original bytes when no derivatives exist. */
export function presetUrl(
  urls: ImageUrls | null | undefined,
  preset: ImagePreset,
  fallback: string,
): string {
  return urls?.[preset] ?? fallback;
}

/** srcset over the available derivatives with accurate width descriptors
 *  (the server never upscales, so widths are clamped to the intrinsic size). */
export function presetSrcSet(
  urls: ImageUrls | null | undefined,
  width: number | null,
  height: number | null,
): string | undefined {
  if (!urls) return undefined;
  const maxEdge = Math.max(width ?? 0, height ?? 0);
  const seen = new Set<number>();
  const parts: string[] = [];
  for (const preset of Object.keys(PRESET_EDGES) as ImagePreset[]) {
    const url = urls[preset];
    if (!url) continue;
    const edge = PRESET_EDGES[preset];
    const w = maxEdge && width ? Math.round(width * Math.min(1, edge / maxEdge)) : edge;
    if (seen.has(w)) continue;
    seen.add(w);
    parts.push(`${url} ${w}w`);
  }
  return parts.length > 1 ? parts.join(", ") : undefined;
}

type Phase = "loading" | "waiting" | "fallback";

interface DerivedImgProps extends ImgHTMLAttributes<HTMLImageElement> {
  /** Last-resort source once retries are exhausted (typically the /raw URL). */
  fallbackSrc?: string;
}

/**
 * `<img>` for derivative URLs. While a variant is still being generated the
 * backend answers 202, which surfaces here as an image error: hide the image
 * (the host's hatched placeholder backdrop shows through), then retry with
 * backoff until the derivative lands. Remounting with a new key forces the
 * refetch — 202 responses are no-store, so the browser goes back to network.
 */
export function DerivedImg({ src, srcSet, sizes, fallbackSrc, style, ...rest }: DerivedImgProps) {
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<Phase>("loading");
  const timer = useRef<number | null>(null);

  // a different source starts a fresh retry cycle
  useEffect(() => {
    setAttempt(0);
    setPhase("loading");
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [src]);

  if (!src) return null;

  if (phase === "fallback") {
    return <img src={fallbackSrc} style={style} {...rest} />;
  }

  if (phase === "waiting") {
    return <img style={{ ...style, visibility: "hidden" }} alt={rest.alt ?? ""} />;
  }

  return (
    <img
      key={attempt}
      src={src}
      srcSet={srcSet}
      sizes={sizes}
      style={style}
      {...rest}
      onError={() => {
        if (attempt < MAX_ATTEMPTS) {
          setPhase("waiting");
          timer.current = window.setTimeout(() => {
            setAttempt((current) => current + 1);
            setPhase("loading");
          }, retryDelay(attempt));
        } else if (fallbackSrc) {
          setPhase("fallback");
        } else {
          setPhase("waiting");
        }
      }}
    />
  );
}
