import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import type { CommissionListItem } from "../api/types";
import { Chip } from "./Chip";
import { Cover } from "./Cover";
import { Skeleton } from "./Skeleton";

/** Columns that fit the current viewport, capped at `max`. */
function useViewportColumns(max: number) {
  const compute = () => {
    if (typeof window === "undefined") return max;
    const width = window.innerWidth;
    const fit = width >= 1180 ? 4 : width >= 860 ? 3 : 2;
    return Math.min(max, fit);
  };
  const [columns, setColumns] = useState(compute);
  useEffect(() => {
    const onResize = () => setColumns(compute());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // compute only reads window state; max is the sole reactive input
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [max]);
  return columns;
}

/** Aspect ratios (w/h) cycled through skeleton tiles so the loading state mimics
 *  a real, varied waterfall instead of a grid of identical squares. */
const SKELETON_RATIOS = [0.8, 1, 1.3, 0.7, 1.1, 0.9, 1.2, 0.75];

/** FurAffinity-style column layout: items flow into N height-balanced columns,
 *  preserving left-to-right, top-to-bottom order within the balancing.
 *  `columns` is an upper bound; narrow viewports drop to 3 then 2.
 *  `skeletonCount` appends that many shimmer placeholders after the real items,
 *  balanced into the same columns (used while the next page is loading). */
export function FaGallery({
  items,
  columns: maxColumns = 4,
  skeletonCount = 0,
}: {
  items: CommissionListItem[];
  columns?: number;
  skeletonCount?: number;
}) {
  const columns = useViewportColumns(maxColumns);
  const cols: { h: number; items: CommissionListItem[]; skeletons: number[] }[] = Array.from(
    { length: columns },
    () => ({ h: 0, items: [], skeletons: [] })
  );
  for (const it of items) {
    const target = cols.reduce((a, b) => (a.h <= b.h ? a : b));
    // coverless tiles render a square placeholder, so weigh them as 1:1
    const ratio =
      it.cover?.width && it.cover?.height ? it.cover.width / it.cover.height : 1;
    target.items.push(it);
    target.h += 1 / ratio + 0.1;
  }
  // continue the same shortest-column balancing for the placeholders so they
  // pick up where the real tiles left off
  for (let i = 0; i < skeletonCount; i++) {
    const target = cols.reduce((a, b) => (a.h <= b.h ? a : b));
    const ratio = SKELETON_RATIOS[i % SKELETON_RATIOS.length];
    target.skeletons.push(ratio);
    target.h += 1 / ratio + 0.1;
  }

  return (
    <div
      className="fa-grid"
      style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
      aria-busy={skeletonCount > 0 || undefined}
    >
      {cols.map((col, i) => (
        <div className="fa-col" key={i}>
          {col.items.map((it) => {
            const dims =
              it.cover?.width && it.cover?.height
                ? `${it.cover.width}×${it.cover.height}`
                : null;
            // mature/adult tint the tile border instead of wearing a chip
            const ratingClass =
              it.rating === "mature" || it.rating === "adult" ? ` rating-${it.rating}` : "";
            // visitors never receive private items, so the wash only ever
            // shows for a signed-in admin as a "not publicly visible" hint
            const privateClass = it.effective_visibility === "private" ? " is-private" : "";
            return (
              <Link
                to={`/commissions/${it.id}`}
                className={`fa-tile${ratingClass}${privateClass}`}
                key={it.id}
                title={privateClass ? "Not publicly visible" : undefined}
              >
                <Cover
                  cover={it.cover}
                  ratio={it.cover ? undefined : 1}
                  rounded={false}
                  size="thumb"
                  sizes="(max-width: 859px) 50vw, (max-width: 1179px) 33vw, 25vw"
                />
                {it.categories[0] && (
                  <div className="label-row">
                    <Chip kind="cat">{it.categories[0]}</Chip>
                  </div>
                )}
                {(it.title || dims || it.formats.length > 0) && (
                  <div className="caption">
                    <div className="caption-text">
                      {it.title && <div style={{ fontWeight: 500 }}>{it.title}</div>}
                      {dims && (
                        <div className="mono" style={{ opacity: 0.85, fontSize: 10 }}>
                          {dims}
                        </div>
                      )}
                    </div>
                    {it.formats.length > 0 && (
                      <span className="format-badge">{it.formats.join(",")}</span>
                    )}
                  </div>
                )}
              </Link>
            );
          })}
          {col.skeletons.map((ratio, j) => (
            <div className="fa-tile is-skeleton" key={`sk-${j}`} aria-hidden="true">
              <Skeleton style={{ aspectRatio: String(ratio), borderRadius: 0 }} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
