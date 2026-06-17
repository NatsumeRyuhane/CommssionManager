import type { CSSProperties } from "react";

/**
 * A single shimmering placeholder block. Purely presentational: marked
 * `aria-hidden` so assistive tech skips it (the surrounding region should carry
 * its own `aria-busy`/status). Pass `w`/`h`/`radius` for the common cases or
 * `style` for anything else (e.g. `aspectRatio`).
 */
export function Skeleton({
  w,
  h,
  radius = "var(--r)",
  className,
  style,
}: {
  w?: number | string;
  h?: number | string;
  radius?: number | string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={`skeleton${className ? ` ${className}` : ""}`}
      aria-hidden="true"
      style={{ display: "block", width: w, height: h, borderRadius: radius, ...style }}
    />
  );
}
