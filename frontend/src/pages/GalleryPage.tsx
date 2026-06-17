import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Loader2, Plus, Search, Users } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { api } from "../api/client";
import type { CommissionListItem, CommissionStatus, Rating } from "../api/types";
import { Chip } from "../components/Chip";
import { FaGallery } from "../components/FaGallery";
import { TopBar } from "../components/TopBar";
import { useAuth } from "../hooks/useAuth";

const PAGE_SIZE = 24;

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const RATING_ORDER: Rating[] = ["general", "mature", "adult"];
const STATUS_ORDER: CommissionStatus[] = ["ongoing", "completed"];
const MAX_RATING_KEY = "cmgr:max-rating";

/** Sentinel the API recognizes in a list filter to mean "nothing set" for that
 * field. Mirrors NONE_SENTINEL in the backend crud layer. */
const NONE_SENTINEL = "__none__";

/** The site starts SFW: only the stored gate can raise it past General. */
function readMaxRating(): Rating {
  try {
    const raw = window.localStorage.getItem(MAX_RATING_KEY);
    if (raw === "mature" || raw === "adult") return raw;
  } catch {
    /* storage unavailable */
  }
  return "general";
}

function FilterChips({
  label,
  kind,
  options,
  selected,
  onToggle,
}: {
  label: string;
  kind: "cat" | "tag" | "char" | "artist";
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const noneSelected = selected.includes(NONE_SENTINEL);
  return (
    <>
      <div className="label">{label}</div>
      <div className="row wrap gap-4" style={{ marginBottom: 12 }}>
        {/* special filter: match commissions with nothing set for this field */}
        <button
          type="button"
          className="chip-button"
          aria-pressed={noneSelected}
          onClick={() => onToggle(NONE_SENTINEL)}
          title={`Show commissions with no ${label.toLowerCase()}`}
        >
          <Chip kind={kind} ghost={!noneSelected}>
            {noneSelected ? "✓ " : ""}
            (none)
          </Chip>
        </button>
        {options.map((value) => (
          <button
            key={value}
            type="button"
            className="chip-button"
            aria-pressed={selected.includes(value)}
            onClick={() => onToggle(value)}
          >
            <Chip kind={kind} ghost={!selected.includes(value)}>
              {selected.includes(value) ? "✓ " : ""}
              {value}
            </Chip>
          </button>
        ))}
      </div>
    </>
  );
}

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
  const [tags, setTags] = useState<string[]>([]);
  const [chars, setChars] = useState<string[]>([]);
  const [artists, setArtists] = useState<string[]>([]);
  const [ratings, setRatings] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [maxRating, setMaxRating] = useState<Rating>(readMaxRating);
  const [sort, setSort] = useState<"date" | "title">("date");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [filterOpen, setFilterOpen] = useState(false);
  const [allCats, setAllCats] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [allChars, setAllChars] = useState<string[]>([]);
  const [allArtists, setAllArtists] = useState<string[]>([]);

  // ratings the content gate lets through, in cumulative order
  const allowedRatings = RATING_ORDER.slice(0, RATING_ORDER.indexOf(maxRating) + 1);

  function setGate(next: Rating) {
    setMaxRating(next);
    try {
      window.localStorage.setItem(MAX_RATING_KEY, next);
    } catch {
      /* storage unavailable */
    }
    // explicit rating filters above the lowered gate are pruned
    const kept = RATING_ORDER.slice(0, RATING_ORDER.indexOf(next) + 1);
    setRatings((current) => current.filter((r) => kept.includes(r as Rating)));
  }

  // filter options come from the taxonomy, not the current page
  useEffect(() => {
    api
      .labels()
      .then((ls) => {
        setAllCats(ls.filter((l) => l.type === "category").map((l) => l.name).sort());
        setAllTags(ls.filter((l) => l.type === "tag").map((l) => l.name).sort());
      })
      .catch(() => undefined);
    api
      .characters()
      .then((rows) => setAllChars(rows.map((row) => row.name).sort()))
      .catch(() => undefined);
    api
      .artists()
      .then((rows) => setAllArtists(rows.map((row) => row.name).sort()))
      .catch(() => undefined);
  }, []);

  // reset to the first page whenever the query changes
  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [q, cats, tags, chars, artists, ratings, statuses, maxRating, sort, order]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listCommissionsPaged({
        q: q || undefined,
        categories: cats,
        tags,
        characters: chars,
        artists,
        status: statuses,
        // explicit picks are already gate-pruned; otherwise the gate itself
        // filters (an all-open gate needs no param)
        rating: ratings.length
          ? ratings
          : allowedRatings.length === RATING_ORDER.length
            ? []
            : allowedRatings,
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
    // allowedRatings is derived from maxRating
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, cats, tags, chars, artists, ratings, statuses, maxRating, sort, order, limit]);

  const activeCount =
    cats.length +
    tags.length +
    chars.length +
    artists.length +
    ratings.length +
    statuses.length +
    (q ? 1 : 0);

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
        <div
          className="rating-gate"
          role="group"
          aria-label="Maximum content rating"
          title="Show content rated up to the selected level"
        >
          {RATING_ORDER.map((r) => (
            <button
              key={r}
              type="button"
              className={maxRating === r ? `active ${r}` : ""}
              aria-pressed={maxRating === r}
              onClick={() => setGate(r)}
            >
              {capitalize(r)}
            </button>
          ))}
        </div>
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
              <FilterChips
                label="Categories"
                kind="cat"
                options={allCats}
                selected={cats}
                onToggle={(value) => toggle(cats, setCats, value)}
              />
              <FilterChips
                label="Tags"
                kind="tag"
                options={allTags}
                selected={tags}
                onToggle={(value) => toggle(tags, setTags, value)}
              />
              <FilterChips
                label="Characters"
                kind="char"
                options={allChars}
                selected={chars}
                onToggle={(value) => toggle(chars, setChars, value)}
              />
              <FilterChips
                label="Artists"
                kind="artist"
                options={allArtists}
                selected={artists}
                onToggle={(value) => toggle(artists, setArtists, value)}
              />
              <div className="label">Rating</div>
              <div className="row wrap gap-4" style={{ marginBottom: 12 }}>
                {RATING_ORDER.map((r) => {
                  const gated = !allowedRatings.includes(r);
                  return (
                    <button
                      key={r}
                      type="button"
                      className="chip-button"
                      disabled={gated}
                      aria-pressed={ratings.includes(r)}
                      onClick={() => toggle(ratings, setRatings, r)}
                      title={gated ? "Raise the content gate to include this rating" : undefined}
                    >
                      <Chip kind="rating" ghost={!ratings.includes(r)}>
                        {ratings.includes(r) ? "✓ " : ""}
                        {capitalize(r)}
                      </Chip>
                    </button>
                  );
                })}
              </div>
              <div className="label">Status</div>
              <div className="row wrap gap-4" style={{ marginBottom: 12 }}>
                {STATUS_ORDER.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="chip-button"
                    aria-pressed={statuses.includes(s)}
                    onClick={() => toggle(statuses, setStatuses, s)}
                  >
                    <Chip kind="status" ghost={!statuses.includes(s)}>
                      {statuses.includes(s) ? "✓ " : ""}
                      {capitalize(s)}
                    </Chip>
                  </button>
                ))}
              </div>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <button
                  className="btn sm ghost"
                  onClick={() => {
                    setQ("");
                    setCats([]);
                    setTags([]);
                    setChars([]);
                    setArtists([]);
                    setRatings([]);
                    setStatuses([]);
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
