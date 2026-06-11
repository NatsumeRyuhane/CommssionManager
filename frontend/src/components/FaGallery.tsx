import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import type { CommissionListItem } from "../api/types";
import { Chip } from "./Chip";
import { Cover } from "./Cover";

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

/** FurAffinity-style column layout: items flow into N height-balanced columns,
 *  preserving left-to-right, top-to-bottom order within the balancing.
 *  `columns` is an upper bound; narrow viewports drop to 3 then 2. */
export function FaGallery({
  items,
  columns: maxColumns = 4,
}: {
  items: CommissionListItem[];
  columns?: number;
}) {
  const columns = useViewportColumns(maxColumns);
  const cols: { h: number; items: CommissionListItem[] }[] = Array.from(
    { length: columns },
    () => ({ h: 0, items: [] })
  );
  for (const it of items) {
    const target = cols.reduce((a, b) => (a.h <= b.h ? a : b));
    const ratio =
      it.cover?.width && it.cover?.height ? it.cover.width / it.cover.height : 0.8;
    target.items.push(it);
    target.h += 1 / ratio + 0.1;
  }

  return (
    <div className="fa-grid" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
      {cols.map((col, i) => (
        <div className="fa-col" key={i}>
          {col.items.map((it) => (
            <Link to={`/commissions/${it.id}`} className="fa-tile" key={it.id}>
              <Cover
                cover={it.cover}
                rounded={false}
                size="thumb"
                sizes="(max-width: 859px) 50vw, (max-width: 1179px) 33vw, 25vw"
              />
              <div className="label-row">
                {it.categories[0] && <Chip kind="cat">{it.categories[0]}</Chip>}
                {it.rating !== "general" && (
                  <Chip kind="rating">{it.rating}</Chip>
                )}
              </div>
              <div className="caption">
                <div style={{ fontWeight: 500 }}>{it.title}</div>
                <div className="mono" style={{ opacity: 0.85, fontSize: 10 }}>
                  {it.cover?.width && it.cover?.height
                    ? `${it.cover.width}×${it.cover.height}`
                    : "—"}{" "}
                  · {it.formats.join(",") || "—"}
                </div>
              </div>
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}
