import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api/client";
import type { CommissionListItem, ListParams } from "../api/types";
import { Chip } from "../components/Chip";
import { FaGallery } from "../components/FaGallery";
import { TopBar } from "../components/TopBar";
import { useAuth } from "../hooks/useAuth";

export function GalleryPage() {
  const { canWrite } = useAuth();
  const [items, setItems] = useState<CommissionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [cats, setCats] = useState<string[]>([]);
  const [ratings, setRatings] = useState<string[]>([]);
  const [sort, setSort] = useState<"date" | "title">("date");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [filterOpen, setFilterOpen] = useState(false);

  const params: ListParams = useMemo(
    () => ({ q: q || undefined, categories: cats, rating: ratings, sort, order }),
    [q, cats, ratings, sort, order]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listCommissions(params)
      .then((res) => !cancelled && setItems(res))
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [params]);

  const allCats = useMemo(
    () => Array.from(new Set(items.flatMap((i) => i.categories))).sort(),
    [items]
  );
  const activeCount = cats.length + ratings.length + (q ? 1 : 0);

  function toggle(list: string[], set: (v: string[]) => void, value: string) {
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  return (
    <div className="app">
      <TopBar>
        <span className="mono-sm muted">{items.length} works</span>
        <div style={{ position: "relative" }}>
          <button className="btn sm" onClick={() => setFilterOpen((v) => !v)}>
            🔍 Search &amp; filter
            {activeCount > 0 && (
              <span className="mono-sm muted" style={{ marginLeft: 6 }}>
                {activeCount} active
              </span>
            )}
            <span style={{ marginLeft: 4 }}>{filterOpen ? "▴" : "▾"}</span>
          </button>
          {filterOpen && (
            <div className="popover">
              <div className="row gap-8" style={{ marginBottom: 12 }}>
                <input
                  className="field"
                  placeholder="Search title, description…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="label">Categories</div>
              <div className="row wrap gap-4" style={{ marginBottom: 12 }}>
                {allCats.length === 0 && <span className="mono-sm muted">none yet</span>}
                {allCats.map((c) => (
                  <span
                    key={c}
                    onClick={() => toggle(cats, setCats, c)}
                    style={{ cursor: "pointer" }}
                  >
                    <Chip kind="cat" ghost={!cats.includes(c)}>
                      {cats.includes(c) ? "✓ " : ""}
                      {c}
                    </Chip>
                  </span>
                ))}
              </div>
              <div className="label">Rating</div>
              <div className="row wrap gap-4" style={{ marginBottom: 12 }}>
                {["general", "mature", "adult"].map((r) => (
                  <span
                    key={r}
                    onClick={() => toggle(ratings, setRatings, r)}
                    style={{ cursor: "pointer" }}
                  >
                    <Chip kind="rating" ghost={!ratings.includes(r)}>
                      {ratings.includes(r) ? "✓ " : ""}
                      {r}
                    </Chip>
                  </span>
                ))}
              </div>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <button
                  className="btn sm ghost"
                  onClick={() => {
                    setQ("");
                    setCats([]);
                    setRatings([]);
                  }}
                >
                  Reset all
                </button>
                <span className="mono-sm">{items.length} results</span>
              </div>
            </div>
          )}
        </div>
        <button
          className="btn sm"
          onClick={() => {
            if (sort === "date") setOrder(order === "desc" ? "asc" : "desc");
            else setSort("date");
          }}
        >
          Sort: {sort} {order === "desc" ? "↓" : "↑"}
        </button>
        {canWrite && (
          <Link to="/commissions/new" className="btn sm primary">
            + New
          </Link>
        )}
      </TopBar>

      {loading && <div style={{ padding: 24 }} className="mono-sm">Loading…</div>}
      {error && <div style={{ padding: 24 }} className="error-text">{error}</div>}
      {!loading && !error && items.length === 0 && (
        <div style={{ padding: 48, textAlign: "center" }} className="muted">
          No commissions yet.
          {canWrite && " Click “+ New” to add one."}
        </div>
      )}
      {!loading && items.length > 0 && <FaGallery items={items} columns={4} />}
    </div>
  );
}
