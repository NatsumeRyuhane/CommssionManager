import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Globe, Link2, Pencil, Plus, Trash2, X } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { api } from "../api/client";
import type {
  CharacterPage as CharacterPageData,
  CharacterPageCommission,
  CharacterPageSet,
} from "../api/types";
import { Chip } from "../components/Chip";
import { CommissionPickerModal } from "../components/CommissionPickerModal";
import { Cover } from "../components/Cover";
import { TopBar } from "../components/TopBar";
import { useAuth } from "../hooks/useAuth";

type SetEditState =
  | { mode: "create" }
  | { mode: "rename"; setId: number; title: string; description: string | null };

type PickerState =
  | { kind: "main-reference" }
  | { kind: "set-items"; setId: number; setTitle: string };

/** Render a character's shareable profile page.
 *
 *  Public viewers see the about + main reference + curated commission
 *  bookshelves. Admins can additionally create / rename / delete sets,
 *  add or remove commissions in a set, and pin / change the main
 *  reference. The page draws nothing until the API responds, then
 *  switches to a 404-style empty state if no page exists yet — the admin
 *  CTA there creates the page row in place.
 */
export function CharacterPage() {
  const { id } = useParams();
  const { canWrite } = useAuth();
  const characterId = id ? Number(id) : NaN;

  const [data, setData] = useState<CharacterPageData | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingAbout, setEditingAbout] = useState(false);
  const [aboutDraft, setAboutDraft] = useState("");
  const [setEdit, setSetEdit] = useState<SetEditState | null>(null);
  const [setDraft, setSetDraft] = useState({ title: "", description: "" });
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [busy, setBusy] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMissing(false);
    try {
      const page = await api.getCharacterPage(characterId);
      setData(page);
    } catch (e: unknown) {
      const err = e as { status?: number; message?: string };
      if (err?.status === 404) setMissing(true);
      else setError(err?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [characterId]);

  useEffect(() => {
    if (Number.isNaN(characterId)) return;
    void load();
  }, [characterId, load]);

  const sortedSets = useMemo(
    () => (data ? [...data.sets].sort((a, b) => a.position - b.position) : []),
    [data],
  );

  // ---- about ------------------------------------------------------------
  function startEditAbout() {
    setAboutDraft(data?.about ?? "");
    setEditingAbout(true);
  }
  async function saveAbout() {
    setBusy(true);
    try {
      const updated = await api.upsertCharacterPage(characterId, {
        about: aboutDraft || null,
      });
      setData(updated);
      setEditingAbout(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function createPage() {
    setBusy(true);
    try {
      const created = await api.upsertCharacterPage(characterId, { about: null });
      setData(created);
      setMissing(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function deletePage() {
    if (!confirm("Delete this character page and all its sets? This cannot be undone."))
      return;
    setBusy(true);
    try {
      await api.deleteCharacterPage(characterId);
      setData(null);
      setMissing(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  // ---- sets -------------------------------------------------------------
  function startCreateSet() {
    setSetDraft({ title: "", description: "" });
    setSetEdit({ mode: "create" });
  }
  function startRenameSet(s: CharacterPageSet) {
    setSetDraft({ title: s.title, description: s.description ?? "" });
    setSetEdit({ mode: "rename", setId: s.id, title: s.title, description: s.description });
  }
  async function saveSet() {
    if (!setEdit) return;
    setBusy(true);
    try {
      const body = {
        title: setDraft.title.trim(),
        description: setDraft.description.trim() || null,
      };
      if (!body.title) return;
      if (setEdit.mode === "create") {
        await api.createCharacterPageSet(characterId, body);
      } else {
        await api.updateCharacterPageSet(setEdit.setId, body);
      }
      setSetEdit(null);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function deleteSet(setId: number) {
    if (!confirm("Delete this set? The commissions stay in the gallery.")) return;
    setBusy(true);
    try {
      await api.deleteCharacterPageSet(setId);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function removeItem(itemId: number) {
    setBusy(true);
    try {
      await api.deleteCharacterPageSetItem(itemId);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  // ---- picker outcomes --------------------------------------------------
  async function handlePickerConfirm(commissionIds: number[]) {
    if (!picker) return;
    if (picker.kind === "main-reference") {
      const updated = await api.upsertCharacterPage(characterId, {
        main_reference_commission_id: commissionIds[0] ?? null,
      });
      setData(updated);
      return;
    }
    await api.addCharacterPageSetItems(picker.setId, commissionIds);
    await load();
  }

  async function clearMainReference() {
    setBusy(true);
    try {
      const updated = await api.upsertCharacterPage(characterId, {
        main_reference_commission_id: null,
      });
      setData(updated);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  // ---- copy share link --------------------------------------------------
  function copyShareLink() {
    const url = `${window.location.origin}/characters/${characterId}`;
    void navigator.clipboard?.writeText(url);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  // ---- render -----------------------------------------------------------
  if (loading)
    return (
      <div className="app">
        <TopBar />
        <div style={{ padding: 24 }} className="mono-sm">
          Loading…
        </div>
      </div>
    );

  if (missing) {
    return (
      <div className="app">
        <TopBar />
        <div style={{ padding: 64, textAlign: "center" }}>
          <h2 style={{ marginTop: 0 }}>No page yet</h2>
          <p className="muted" style={{ maxWidth: 480, margin: "0 auto" }}>
            This character doesn’t have a shareable page yet.
            {canWrite && " Create one to start curating commissions into bookshelves."}
          </p>
          {canWrite && (
            <button
              className="btn primary"
              style={{ marginTop: 16 }}
              onClick={() => void createPage()}
              disabled={busy}
            >
              <Plus />
              Create page
            </button>
          )}
          <div style={{ marginTop: 24 }}>
            <Link to="/characters" className="btn sm">
              ← Back to characters
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (error || !data)
    return (
      <div className="app">
        <TopBar />
        <div style={{ padding: 24 }} className="error-text">
          {error ?? "Page not found."}
        </div>
      </div>
    );

  const initial = data.character_name.charAt(0).toUpperCase() || "?";
  const isPublicPage = true;

  return (
    <div className="app">
      <TopBar>
        {canWrite && (
          <button className="btn sm" onClick={copyShareLink}>
            {linkCopied ? <Check /> : <Link2 />}
            {linkCopied ? "copied!" : "Copy link"}
          </button>
        )}
        {canWrite && (
          <button className="btn sm danger" onClick={() => void deletePage()} disabled={busy}>
            <Trash2 />
            Delete
          </button>
        )}
      </TopBar>

      <div className="detail-crumb">
        <Link to="/characters" className="mono-sm muted">
          ← characters
        </Link>
        <span className="mono-sm muted">/</span>
        <strong className="detail-crumb-title">{data.character_name}</strong>
        <span className="spacer" />
        {isPublicPage && (
          <span className="mono-sm inline-ic" style={{ color: "var(--accent)" }}>
            <Globe size={12} />
            public page
          </span>
        )}
      </div>

      <div className="char-banner" />
      <div className="char-identity">
        <div className="char-profile-pic">{initial}</div>
        <div className="identity-body">
          <h1>{data.character_name}</h1>
          <div className="row gap-8 wrap" style={{ marginTop: 6 }}>
            <Chip kind="char">{data.commission_count} commissions</Chip>
            <Chip kind="char">
              {data.sets.length} curated set{data.sets.length === 1 ? "" : "s"}
            </Chip>
            {data.main_reference && <Chip kind="char">ref-sheet ✓</Chip>}
          </div>
        </div>
      </div>

      <div className="char-body">
        <div className="char-about-row">
          <div>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
              <div className="label" style={{ margin: 0 }}>
                About
              </div>
              {canWrite && !editingAbout && (
                <button className="btn sm ghost" onClick={startEditAbout}>
                  <Pencil />
                  edit
                </button>
              )}
            </div>
            {editingAbout ? (
              <div className="col gap-8">
                <textarea
                  className="field"
                  rows={5}
                  value={aboutDraft}
                  onChange={(e) => setAboutDraft(e.target.value)}
                  placeholder="Free-form bio shown on the public page."
                  autoFocus
                />
                <div className="row gap-4">
                  <button
                    className="btn sm primary"
                    onClick={() => void saveAbout()}
                    disabled={busy}
                  >
                    Save
                  </button>
                  <button
                    className="btn sm"
                    onClick={() => setEditingAbout(false)}
                    disabled={busy}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : data.about ? (
              <p style={{ margin: 0, color: "var(--ink-2)", lineHeight: 1.7 }}>{data.about}</p>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                {canWrite
                  ? "No bio yet — click ‘edit’ to add one."
                  : "No description yet."}
              </p>
            )}
          </div>

          <div>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
              <div className="label" style={{ margin: 0 }}>
                Main reference
              </div>
              {data.main_reference ? (
                <span className="mono-sm" style={{ color: "var(--accent)" }}>
                  pinned
                </span>
              ) : (
                <span className="mono-sm muted">none</span>
              )}
            </div>
            {data.main_reference ? (
              <Link
                to={`/commissions/${data.main_reference.commission_id}`}
                className="char-main-ref"
              >
                <Cover cover={data.main_reference.cover} rounded={false} size="medium" />
              </Link>
            ) : (
              <div className="char-main-ref placeholder">
                no reference pinned
              </div>
            )}
            {canWrite && (
              <div className="row gap-4" style={{ marginTop: 8 }}>
                <button
                  className="btn sm"
                  onClick={() => setPicker({ kind: "main-reference" })}
                >
                  {!data.main_reference && <Plus />}
                  {data.main_reference ? "Change reference" : "Pin reference"}
                </button>
                {data.main_reference && (
                  <button
                    className="btn sm ghost"
                    onClick={() => void clearMainReference()}
                    disabled={busy}
                  >
                    Clear
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <hr className="char-section-divider" />

        <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Curated sets</h2>
          <span className="mono-sm muted">
            {canWrite
              ? "Admin-picked from the gallery"
              : "Each tile links to the underlying commission"}
          </span>
        </div>

        {sortedSets.length === 0 && (
          <p className="muted">
            {canWrite
              ? "No sets yet — create one to start curating commissions."
              : "No curated sets yet."}
          </p>
        )}

        {sortedSets.map((s) => (
          <BookshelfRow
            key={s.id}
            set={s}
            editable={canWrite}
            onAdd={() => setPicker({ kind: "set-items", setId: s.id, setTitle: s.title })}
            onRename={() => startRenameSet(s)}
            onDelete={() => void deleteSet(s.id)}
            onRemoveItem={(itemId) => void removeItem(itemId)}
          />
        ))}

        {canWrite && (
          <button className="btn" onClick={startCreateSet} disabled={busy}>
            <Plus />
            New set
          </button>
        )}
      </div>

      {setEdit && (
        <div className="modal-overlay" onClick={() => setSetEdit(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>
              {setEdit.mode === "create" ? "New set" : "Edit set"}
            </h2>
            <div className="col gap-8">
              <input
                className="field"
                placeholder="Title (e.g. Portraits & headshots)"
                value={setDraft.title}
                onChange={(e) => setSetDraft((d) => ({ ...d, title: e.target.value }))}
                autoFocus
              />
              <textarea
                className="field"
                rows={3}
                placeholder="One-line description (optional)"
                value={setDraft.description}
                onChange={(e) => setSetDraft((d) => ({ ...d, description: e.target.value }))}
              />
            </div>
            <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button className="btn" onClick={() => setSetEdit(null)} disabled={busy}>
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={() => void saveSet()}
                disabled={busy || !setDraft.title.trim()}
              >
                {setEdit.mode === "create" ? "Create" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {picker?.kind === "set-items" && (
        <CommissionPickerModal
          title={`Add commissions to “${picker.setTitle}”`}
          characterId={characterId}
          excludeSetId={picker.setId}
          onClose={() => setPicker(null)}
          onConfirm={handlePickerConfirm}
        />
      )}
      {picker?.kind === "main-reference" && (
        <CommissionPickerModal
          title="Pin a main reference"
          characterId={characterId}
          singleSelect
          initialSelection={
            data.main_reference ? [data.main_reference.commission_id] : []
          }
          onClose={() => setPicker(null)}
          onConfirm={handlePickerConfirm}
        />
      )}
    </div>
  );
}

function BookshelfRow({
  set,
  editable,
  onAdd,
  onRename,
  onDelete,
  onRemoveItem,
}: {
  set: CharacterPageSet;
  editable: boolean;
  onAdd: () => void;
  onRename: () => void;
  onDelete: () => void;
  onRemoveItem: (itemId: number) => void;
}) {
  return (
    <div className="bookshelf">
      <div className="char-section-head">
        <div>
          <div className="row gap-8">
            <strong style={{ fontSize: 16 }}>{set.title}</strong>
            <span className="mono-sm muted">
              {set.items.length} commission{set.items.length === 1 ? "" : "s"}
            </span>
          </div>
          {set.description && (
            <div className="mono-sm" style={{ color: "var(--ink-2)", marginTop: 2 }}>
              {set.description}
            </div>
          )}
        </div>
        {editable && (
          <div className="row gap-4">
            <button className="btn sm" onClick={onRename}>
              <Pencil />
              edit
            </button>
            <button className="btn sm" onClick={onAdd}>
              <Plus />
              add commissions
            </button>
            <button className="btn sm danger" onClick={onDelete} title="Delete set" aria-label="Delete set">
              <Trash2 />
            </button>
          </div>
        )}
      </div>
      <div className="bookshelf-row">
        {set.items.map((it) => (
          <BookshelfTile
            key={it.id}
            commission={it.commission}
            editable={editable}
            onRemove={() => onRemoveItem(it.id)}
          />
        ))}
        {editable && (
          <button type="button" className="bookshelf-add" onClick={onAdd}>
            <span className="plus">+</span>
            <span className="mono-sm">add commissions</span>
          </button>
        )}
        {!editable && set.items.length === 0 && (
          <span className="mono-sm muted">No commissions in this set yet.</span>
        )}
      </div>
    </div>
  );
}

function BookshelfTile({
  commission,
  editable,
  onRemove,
}: {
  commission: CharacterPageCommission;
  editable: boolean;
  onRemove: () => void;
}) {
  return (
    <div className="bookshelf-tile">
      <Link to={`/commissions/${commission.commission_id}`}>
        <Cover cover={commission.cover} rounded={false} size="thumb" />
        <div className="caption">{commission.title}</div>
      </Link>
      {editable && (
        <button
          type="button"
          className="remove"
          title="Remove from set"
          onClick={onRemove}
          aria-label="Remove"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}
