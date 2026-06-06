import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";

import { api } from "../api/client";
import type { Artist } from "../api/types";
import { Chip } from "./Chip";

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

export function ArtistsPanel() {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [query, setQuery] = useState("");
  const [resolveQuery, setResolveQuery] = useState<string | null>(null);
  const [initialArtistId, setInitialArtistId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Per-artist inline alias-add state.
  const [aliasingId, setAliasingId] = useState<number | null>(null);
  const [aliasText, setAliasText] = useState("");

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
    void reload();
  }, []);

  const rows = useMemo(
    () => artists.map((artist) => ({ artist, handles: parseHandles(artist.info_xml) })),
    [artists]
  );

  const matches = useMemo(() => {
    const needle = normalize(query);
    if (!needle) return [];
    return rows.flatMap((row) => {
      const nameMatch = normalize(row.artist.name).includes(needle);
      const aliasMatch = row.artist.aliases.some((a) =>
        normalize(a.alias).includes(needle)
      );
      const handleMatches = row.handles.filter((handle) =>
        normalize(handle.handle).includes(needle)
      );
      if ((nameMatch || aliasMatch) && handleMatches.length === 0) {
        return [{ artist: row.artist, handle: null as ArtistHandle | null }];
      }
      return handleMatches.map((handle) => ({ artist: row.artist, handle }));
    });
  }, [query, rows]);

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
    if (!confirm(`Delete artist "${artist.name}"? Existing commission links will be removed.`)) return;
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

  async function addAlias(artist: Artist) {
    const alias = aliasText.trim();
    if (!alias) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.addArtistAlias(artist.id, alias);
      setArtists((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      setAliasingId(null);
      setAliasText("");
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function removeAlias(aliasId: number) {
    setSaving(true);
    setError(null);
    try {
      await api.deleteArtistAlias(aliasId);
      await reload();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <div className="settings-heading">
        <div>
          <h1>Artists</h1>
          <div className="mono-sm muted">
            {artists.length} configured · platform handles stored in artist info XML; aliases resolve typed names
          </div>
        </div>
        <button
          className="btn primary"
          onClick={() => {
            setInitialArtistId(null);
            setResolveQuery("");
          }}
        >
          <Plus size={14} strokeWidth={2.5} /> New artist
        </button>
      </div>

      {error && <div className="error-text" style={{ marginBottom: 12 }}>{error}</div>}

      <section className="artist-search-panel">
        <label className="label">Add / find by handle or alias</label>
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
            placeholder="Paste handle, URL, alias, or artist name"
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
                <span>No artist matches.</span>
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
                  <div className="mono-sm muted">
                    {handles.length} handles · {artist.aliases.length} aliases
                  </div>
                </div>
                <span className="spacer" />
                <button
                  className="icon-btn"
                  disabled={saving}
                  onClick={() => void renameArtist(artist)}
                  title="Rename artist"
                  aria-label="Rename artist"
                >
                  <Pencil size={14} strokeWidth={2} />
                </button>
                <button
                  className="icon-btn danger"
                  disabled={saving}
                  onClick={() => void deleteArtist(artist)}
                  title="Delete artist"
                  aria-label="Delete artist"
                >
                  <Trash2 size={14} strokeWidth={2} />
                </button>
              </div>

              <div className="artist-card-section">
                <div className="label">Aliases</div>
                <div className="row wrap gap-4">
                  {artist.aliases.map((a) => (
                    <Chip kind="artist" ghost key={a.id} onRemove={() => void removeAlias(a.id)}>
                      {a.alias}
                    </Chip>
                  ))}
                  {aliasingId === artist.id ? (
                    <span className="row gap-4">
                      <input
                        className="field"
                        style={{ width: 140 }}
                        value={aliasText}
                        autoFocus
                        onChange={(e) => setAliasText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void addAlias(artist);
                          } else if (e.key === "Escape") {
                            setAliasingId(null);
                            setAliasText("");
                          }
                        }}
                        placeholder="alias…"
                        disabled={saving}
                      />
                      <button
                        type="button"
                        className="btn sm primary"
                        disabled={saving || !aliasText.trim()}
                        onClick={() => void addAlias(artist)}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => {
                          setAliasingId(null);
                          setAliasText("");
                        }}
                        title="Cancel"
                        aria-label="Cancel"
                      >
                        <X size={14} strokeWidth={2} />
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="icon-btn"
                      disabled={saving}
                      onClick={() => {
                        setAliasingId(artist.id);
                        setAliasText("");
                      }}
                      title="Add alias"
                      aria-label="Add alias"
                    >
                      <Plus size={14} strokeWidth={2} />
                    </button>
                  )}
                </div>
              </div>

              <div className="artist-card-section">
                <div className="label">Platform handles</div>
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
                  <Plus size={12} strokeWidth={2.5} /> Add handle
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

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
    </section>
  );
}

// ---------------------------------------------------------------- handle resolver

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
          <button className="icon-btn" onClick={onClose} title="Cancel" aria-label="Cancel">
            <X size={14} strokeWidth={2} />
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
