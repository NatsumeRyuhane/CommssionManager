import { useEffect, useMemo, useState } from "react";

import { api } from "../api/client";
import type { Artist } from "../api/types";
import { Chip } from "../components/Chip";
import { TopBar } from "../components/TopBar";
import { useAuth } from "../hooks/useAuth";

interface ArtistHandle {
  platform: string;
  handle: string;
}

const PLATFORMS = [
  "twitter",
  "furaffinity",
  "pixiv",
  "mihuashi",
  "bluesky",
  "website",
  "other",
];

export function ArtistsPage() {
  const { canWrite, loading: authLoading } = useAuth();
  const [artists, setArtists] = useState<Artist[]>([]);
  const [query, setQuery] = useState("");
  const [resolveQuery, setResolveQuery] = useState<string | null>(null);
  const [initialArtistId, setInitialArtistId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      setArtists(await api.artists());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!authLoading && canWrite) void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, canWrite]);

  const rows = useMemo(
    () => artists.map((artist) => ({ artist, handles: parseHandles(artist.info_xml) })),
    [artists]
  );

  const matches = useMemo(() => {
    const needle = normalize(query);
    if (!needle) return [];
    return rows.flatMap((row) => {
      const nameMatch = normalize(row.artist.name).includes(needle);
      const handleMatches = row.handles.filter((handle) => normalize(handle.handle).includes(needle));
      if (nameMatch && handleMatches.length === 0) {
        return [{ artist: row.artist, handle: null as ArtistHandle | null }];
      }
      return handleMatches.map((handle) => ({ artist: row.artist, handle }));
    });
  }, [query, rows]);

  if (!authLoading && !canWrite) {
    return (
      <div className="app">
        <TopBar />
        <div style={{ padding: 48, textAlign: "center" }} className="muted">
          Artist management requires admin sign-in.
        </div>
      </div>
    );
  }

  async function renameArtist(artist: Artist) {
    const name = window.prompt("Artist name", artist.name);
    if (!name || !name.trim() || name.trim() === artist.name) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateArtist(artist.id, { name: name.trim() });
      setArtists((items) => items.map((item) => (item.id === updated.id ? updated : item)));
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function deleteArtist(artist: Artist) {
    if (!confirm(`Delete artist “${artist.name}”? Existing commission links will be removed.`)) return;
    setSaving(true);
    setError(null);
    try {
      await api.deleteArtist(artist.id);
      setArtists((items) => items.filter((item) => item.id !== artist.id));
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="app">
      <TopBar>
        <button
          className="btn sm primary"
          onClick={() => {
            setInitialArtistId(null);
            setResolveQuery("");
          }}
        >
          + New artist
        </button>
      </TopBar>

      <main className="artists-page">
        <div className="settings-heading">
          <div>
            <h1>Artists</h1>
            <div className="mono-sm muted">
              {artists.length} configured artists · handles are stored in artist info XML
            </div>
          </div>
        </div>

        {error && <div className="error-text" style={{ marginBottom: 12 }}>{error}</div>}

        <section className="artist-search-panel">
          <label className="label">Add / find by handle</label>
          <div className="artist-search">
            <input
              className="field"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && query.trim()) {
                  e.preventDefault();
                  setInitialArtistId(matches[0]?.artist.id ?? null);
                  setResolveQuery(query.trim());
                }
              }}
              placeholder="Paste handle, URL, or artist name"
            />
            <button
              className="btn"
              disabled={!query.trim()}
              onClick={() => {
                setInitialArtistId(matches[0]?.artist.id ?? null);
                setResolveQuery(query.trim());
              }}
            >
              Resolve
            </button>
          </div>
          {query.trim() && (
            <div className="artist-match-list">
              {matches.length > 0 ? (
                matches.slice(0, 8).map((match, index) => (
                  <button
                    type="button"
                    className="artist-match-row"
                    key={`${match.artist.id}-${match.handle?.platform ?? "name"}-${index}`}
                    onClick={() => {
                      setInitialArtistId(match.artist.id);
                      setResolveQuery(match.handle?.handle ?? query.trim());
                    }}
                  >
                    {match.handle ? <PlatformBadge platform={match.handle.platform} /> : <span />}
                    <span className="mono">{match.handle?.handle ?? match.artist.name}</span>
                    <span className="mono-sm muted">→</span>
                    <Chip kind="artist">{match.artist.name}</Chip>
                  </button>
                ))
              ) : (
                <div className="artist-no-match">
                  <span>No artist matches this handle.</span>
                  <button className="btn sm primary" onClick={() => setResolveQuery(query.trim())}>
                    Resolve
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        {loading ? (
          <div className="mono-sm muted">Loading artists…</div>
        ) : (
          <section className="artist-card-grid">
            {rows.map(({ artist, handles }) => (
              <article className="artist-card" key={artist.id}>
                <div className="artist-card-head">
                  <div className="artist-avatar">{artist.name.slice(0, 1).toUpperCase()}</div>
                  <div>
                    <strong>{artist.name}</strong>
                    <div className="mono-sm muted">{handles.length} handles</div>
                  </div>
                  <span className="spacer" />
                  <button className="btn sm" disabled={saving} onClick={() => void renameArtist(artist)}>
                    Rename
                  </button>
                  <button
                    className="btn sm danger"
                    disabled={saving}
                    onClick={() => void deleteArtist(artist)}
                  >
                    Delete
                  </button>
                </div>
                <div className="artist-handle-list">
                  {handles.length === 0 && <div className="mono-sm muted">No handles configured.</div>}
                  {handles.map((handle, index) => (
                    <div className="artist-handle-row" key={`${handle.platform}-${handle.handle}-${index}`}>
                      <PlatformBadge platform={handle.platform} />
                      <span className="mono">{handle.handle}</span>
                      <span className="mono-sm muted">{handle.platform}</span>
                    </div>
                  ))}
                </div>
                <button
                  className="btn sm"
                  disabled={saving}
                  onClick={() => {
                    setInitialArtistId(artist.id);
                    setResolveQuery("");
                  }}
                >
                  + Add handle
                </button>
              </article>
            ))}
          </section>
        )}
      </main>

      {resolveQuery !== null && (
        <ArtistResolveDialog
          query={resolveQuery}
          artists={artists}
          initialArtistId={initialArtistId}
          busy={saving}
          onClose={() => {
            setResolveQuery(null);
            setInitialArtistId(null);
          }}
          onSaved={(artist) => {
            setArtists((items) => {
              const exists = items.some((item) => item.id === artist.id);
              return exists
                ? items.map((item) => (item.id === artist.id ? artist : item))
                : [...items, artist].sort((a, b) => a.name.localeCompare(b.name));
            });
            setResolveQuery(null);
            setInitialArtistId(null);
            setQuery("");
          }}
          onError={setError}
          setBusy={setSaving}
        />
      )}
    </div>
  );
}

function ArtistResolveDialog({
  query,
  artists,
  initialArtistId,
  busy,
  onClose,
  onSaved,
  onError,
  setBusy,
}: {
  query: string;
  artists: Artist[];
  initialArtistId: number | null;
  busy: boolean;
  onClose: () => void;
  onSaved: (artist: Artist) => void;
  onError: (message: string | null) => void;
  setBusy: (busy: boolean) => void;
}) {
  const [mode, setMode] = useState<"new" | "existing">(initialArtistId ? "existing" : "new");
  const [name, setName] = useState(handleToName(query));
  const [platform, setPlatform] = useState(guessPlatform(query));
  const [handle, setHandle] = useState(query);
  const [artistId, setArtistId] = useState(initialArtistId ?? artists[0]?.id ?? 0);

  async function save() {
    const cleanHandle = handle.trim();
    if (mode === "new" && !name.trim()) return;
    if (mode === "existing" && !artistId) return;
    setBusy(true);
    onError(null);
    try {
      if (mode === "new") {
        const created = await api.createArtist({
          name: name.trim(),
          info_xml: handlesToXml(cleanHandle ? [{ platform, handle: cleanHandle }] : []),
        });
        onSaved(created);
      } else {
        const artist = artists.find((item) => item.id === artistId);
        if (!artist) return;
        const handles = parseHandles(artist.info_xml);
        const nextHandles =
          cleanHandle && !handles.some((item) => sameHandle(item, { platform, handle: cleanHandle }))
            ? [...handles, { platform, handle: cleanHandle }]
            : handles;
        const updated = await api.updateArtist(artist.id, {
          info_xml: handlesToXml(nextHandles, artist.info_xml),
        });
        onSaved(updated);
      }
    } catch (e) {
      onError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="artist-resolve-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="artist-resolve-head">
          <div>
            <strong>{query ? "Resolve handle" : "New artist"}</strong>
            <div className="mono-sm muted">Create a profile or attach the handle to an existing artist.</div>
          </div>
          <button className="btn sm ghost" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="resolve-mode-grid">
          <button className={mode === "new" ? "resolve-mode active" : "resolve-mode"} onClick={() => setMode("new")}>
            <strong>Create new artist</strong>
            <span>Start a new profile with this handle.</span>
          </button>
          <button
            className={mode === "existing" ? "resolve-mode active" : "resolve-mode"}
            onClick={() => setMode("existing")}
            disabled={artists.length === 0}
          >
            <strong>Add to existing</strong>
            <span>Attach it to an artist already configured.</span>
          </button>
        </div>

        {mode === "new" ? (
          <label>
            <span className="label">Artist name</span>
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        ) : (
          <label>
            <span className="label">Artist</span>
            <select className="field" value={artistId} onChange={(e) => setArtistId(Number(e.target.value))}>
              {artists.map((artist) => (
                <option key={artist.id} value={artist.id}>
                  {artist.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="settings-form-grid two">
          <label>
            <span className="label">Platform</span>
            <select className="field" value={platform} onChange={(e) => setPlatform(e.target.value)}>
              {PLATFORMS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">Handle / URL</span>
            <input className="field" value={handle} onChange={(e) => setHandle(e.target.value)} />
          </label>
        </div>

        <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : mode === "new" ? "Create artist" : "Add handle"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PlatformBadge({ platform }: { platform: string }) {
  return <span className="platform-badge">{platform.slice(0, 2).toUpperCase()}</span>;
}

function parseHandles(infoXml: string | null): ArtistHandle[] {
  if (!infoXml?.trim()) return [];
  try {
    const doc = new DOMParser().parseFromString(infoXml, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) return [];
    return Array.from(doc.getElementsByTagName("handle"))
      .map((node) => ({
        platform: node.getAttribute("platform") || "other",
        handle: node.textContent?.trim() ?? "",
      }))
      .filter((item) => item.handle);
  } catch {
    return [];
  }
}

function handlesToXml(handles: ArtistHandle[], existingXml?: string | null): string | null {
  const doc = parseArtistDocument(existingXml);
  let handlesNode = doc.documentElement.querySelector("handles");
  if (!handlesNode) {
    handlesNode = doc.createElement("handles");
    doc.documentElement.appendChild(handlesNode);
  }
  handlesNode.replaceChildren(
    ...handles.map((item) => {
      const node = doc.createElement("handle");
      node.setAttribute("platform", item.platform);
      node.textContent = item.handle;
      return node;
    })
  );
  return new XMLSerializer().serializeToString(doc);
}

function parseArtistDocument(infoXml?: string | null): XMLDocument {
  const fallback = new DOMParser().parseFromString("<artist />", "application/xml");
  if (!infoXml?.trim()) return fallback;
  const doc = new DOMParser().parseFromString(infoXml, "application/xml");
  return doc.getElementsByTagName("parsererror").length ? fallback : doc;
}

function normalize(value: string): string {
  return value.replace(/^@/, "").toLowerCase().trim();
}

function sameHandle(a: ArtistHandle, b: ArtistHandle): boolean {
  return a.platform === b.platform && normalize(a.handle) === normalize(b.handle);
}

function guessPlatform(value: string): string {
  const lower = value.toLowerCase();
  if (lower.includes("furaffinity")) return "furaffinity";
  if (lower.includes("pixiv")) return "pixiv";
  if (lower.includes("mihuashi")) return "mihuashi";
  if (lower.includes("bsky") || lower.includes("bluesky")) return "bluesky";
  if (lower.startsWith("http")) return "website";
  return "twitter";
}

function handleToName(value: string): string {
  return value
    .replace(/^https?:\/\//, "")
    .replace(/^@/, "")
    .split(/[/?#]/)[0]
    .replace(/[_\-.]+/g, " ")
    .trim();
}
