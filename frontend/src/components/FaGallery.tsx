import { Link } from "react-router-dom";

import type { CommissionListItem } from "../api/types";
import { Chip } from "./Chip";
import { Cover } from "./Cover";

/** FurAffinity-style column layout: items flow into N height-balanced columns,
 *  preserving left-to-right, top-to-bottom order within the balancing. */
export function FaGallery({
  items,
  columns = 4,
}: {
  items: CommissionListItem[];
  columns?: number;
}) {
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
              <Cover cover={it.cover} rounded={false} />
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
