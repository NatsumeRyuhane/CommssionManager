import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Loader2, Plus, Search, Users } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { api } from "../api/client";
import type { CommissionListItem } from "../api/types";
import { Chip } from "../components/Chip";
import { FaGallery } from "../components/FaGallery";
import { TopBar } from "../components/TopBar";
import { useAuth } from "../hooks/useAuth";

const PAGE_SIZE = 24;

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Render the gallery page with search, category and rating filters, sorting controls, and paginated commission results.
 *
 * The component loads available category labels, fetches a paged list of commissions based on the current
 * query/filters/sort/limit, and displays loading, error, empty-state, or a gallery with "Load more" pagination.
 * If the current user can write, a "+ New" link is shown.
 *
 * @returns The gallery page element that contains filter/search UI, sort controls, commission gallery, and pagination controls.
 */
export function GalleryPage() {
  const { canWrite } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<CommissionListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [cats, setCats] = useState<string[]>([]);
  const [ratings, setRatings] = useState<string[]>([]);
  const [sort, setSort] = useState<"date" | "title">("date");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [filterOpen, setFilterOpen] = useState(false);
  const [allCats, setAllCats] = useState<string[]>([]);

  // category options come from the label set, not the current page
  useEffect(() => {
    api
      .labels()
      .then((ls) => setAllCats(ls.filter((l) => l.type === "category").map((l) => l.name).sort()))
      .catch(() => undefined);
  }, []);

  // reset to the first page whenever the query changes
  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [q, cats, ratings, sort, order]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listCommissionsPaged({
        q: q || undefined,
        categories: cats,
        rating: ratings,
        sort,
        order,
        limit,
        offset: 0,
      })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setTotal(res.total);
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [q, cats, ratings, sort, order, limit]);

  const activeCount = cats.length + ratings.length + (q ? 1 : 0);

  function toggle(list: string[], set: (v: string[]) => void, value: string) {
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  // creates immediately from the site's stage template and lands on the edit page
  async function createNew() {
    setCreating(true);
    try {
      const created = await api.createCommission({});
      navigate(`/commissions/${created.id}/edit`);
    } catch (e) {
      setError(String(e));
      setCreating(false);
    }
  }

  return (
    <div className="app">
      <TopBar>
        <span className="mono-sm muted">{total} works</span>
        <Link to="/characters" className="btn sm">
          <Users />
          Characters
        </Link>
        <div style={{ position: "relative" }}>
          <button
            className="btn sm"
            onClick={() => setFilterOpen((v) => !v)}
            aria-expanded={filterOpen}
          >
            <Search />
            Search &amp; filter
            {activeCount > 0 && (
              <span className="filter-count" aria-label={`${activeCount} active filters`}>
                {activeCount}
              </span>
            )}
            {filterOpen ? <ChevronUp /> : <ChevronDown />}
          </button>
          {filterOpen && <div className="popover-scrim" onClick={() => setFilterOpen(false)} />}
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
                      {capitalize(r)}
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
                <span className="mono-sm">{total} results</span>
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
          Sort: {sort}
          {order === "desc" ? <ArrowDown /> : <ArrowUp />}
        </button>
        {canWrite && (
          <button
            className="btn sm primary"
            disabled={creating}
            onClick={() => void createNew()}
          >
            {creating ? <Loader2 className="spin" /> : <Plus />}
            New
          </button>
        )}
      </TopBar>

      {loading && items.length === 0 && (
        <div style={{ padding: 24 }} className="mono-sm inline-ic">
          <Loader2 size={14} className="spin" />
          Loading…
        </div>
      )}
      {error && <div style={{ padding: 24 }} className="error-text">{error}</div>}
      {!loading && !error && items.length === 0 && (
        <div style={{ padding: 48, textAlign: "center" }} className="muted">
          No commissions yet.
          {canWrite && " Click “+ New” to add one."}
        </div>
      )}
      {items.length > 0 && <FaGallery items={items} columns={4} />}
      {items.length < total && (
        <div style={{ textAlign: "center", padding: "8px 0 32px" }}>
          <button
            className="btn"
            disabled={loading}
            onClick={() => setLimit((l) => l + PAGE_SIZE)}
          >
            {loading && <Loader2 className="spin" />}
            {loading ? "Loading…" : `Load more (${items.length} of ${total})`}
          </button>
        </div>
      )}
    </div>
  );
}
