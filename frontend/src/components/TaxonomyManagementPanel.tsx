import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";

import { api } from "../api/client";
import type { AliasOut, Character, Label, LabelType } from "../api/types";
import { Chip } from "./Chip";

export type ManagedKind = "category" | "tag" | "character";

interface Item {
  id: number;
  name: string;
  aliases: AliasOut[];
}

interface Adapter {
  list(): Promise<Item[]>;
  create(name: string): Promise<Item>;
  rename(id: number, name: string): Promise<Item>;
  remove(id: number): Promise<void>;
  addAlias(id: number, alias: string): Promise<Item>;
  removeAlias(aliasId: number): Promise<void>;
  chipKind: "cat" | "tag" | "char";
  singular: string;
  plural: string;
}

function toItem(row: Label | Character): Item {
  return { id: row.id, name: row.name, aliases: row.aliases };
}

function adapterFor(kind: ManagedKind): Adapter {
  if (kind === "category" || kind === "tag") {
    const labelType: LabelType = kind;
    return {
      list: async () => (await api.labels({ type: labelType })).map(toItem),
      create: async (name) => toItem(await api.createLabel(name, labelType)),
      rename: async (id, name) => toItem(await api.updateLabel(id, { name })),
      remove: (id) => api.deleteLabel(id),
      addAlias: async (id, alias) => toItem(await api.addLabelAlias(id, alias)),
      removeAlias: (aliasId) => api.deleteLabelAlias(aliasId),
      chipKind: kind === "category" ? "cat" : "tag",
      singular: kind,
      plural: `${kind}s`,
    };
  }
  return {
    list: async () => (await api.characters()).map(toItem),
    create: async (name) => toItem(await api.createCharacter(name)),
    rename: async (id, name) => toItem(await api.updateCharacter(id, { name })),
    remove: (id) => api.deleteCharacter(id),
    addAlias: async (id, alias) => toItem(await api.addCharacterAlias(id, alias)),
    removeAlias: (aliasId) => api.deleteCharacterAlias(aliasId),
    chipKind: "char",
    singular: "character",
    plural: "characters",
  };
}

interface PanelProps {
  kind: ManagedKind;
  title: string;
  description: string;
}

export function TaxonomyManagementPanel({ kind, title, description }: PanelProps) {
  const adapter = useMemo(() => adapterFor(kind), [kind]);
  const [items, setItems] = useState<Item[]>([]);
  const [filter, setFilter] = useState("");
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The id whose row is currently in "add alias" mode (inline input visible).
  const [aliasingId, setAliasingId] = useState<number | null>(null);
  const [aliasText, setAliasText] = useState("");

  async function reload() {
    setLoading(true);
    try {
      setItems(await adapter.list());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  async function run<T>(op: () => Promise<T>): Promise<T | null> {
    setBusy(true);
    setError(null);
    try {
      return await op();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    const created = await run(() => adapter.create(name));
    if (created) {
      setNewName("");
      await reload();
    }
  }

  async function handleRename(item: Item) {
    const next = window.prompt(`Rename "${item.name}" to:`, item.name);
    if (!next || !next.trim() || next.trim() === item.name) return;
    const updated = await run(() => adapter.rename(item.id, next.trim()));
    if (updated) await reload();
  }

  async function handleDelete(item: Item) {
    if (!window.confirm(`Delete ${adapter.singular} "${item.name}"? Existing commissions keep their references until re-saved.`)) {
      return;
    }
    const ok = await run(() => adapter.remove(item.id));
    if (ok !== null) await reload();
  }

  async function handleAddAlias(item: Item) {
    const alias = aliasText.trim();
    if (!alias) return;
    const updated = await run(() => adapter.addAlias(item.id, alias));
    if (updated) {
      setAliasingId(null);
      setAliasText("");
      await reload();
    }
  }

  async function handleDeleteAlias(aliasId: number) {
    const ok = await run(() => adapter.removeAlias(aliasId));
    if (ok !== null) await reload();
  }

  const needle = filter.trim().toLowerCase();
  const filtered = needle
    ? items.filter(
        (i) =>
          i.name.toLowerCase().includes(needle) ||
          i.aliases.some((a) => a.alias.toLowerCase().includes(needle))
      )
    : items;

  return (
    <section>
      <div className="settings-heading">
        <div>
          <h1>{title}</h1>
          <div className="mono-sm muted">{description}</div>
        </div>
      </div>

      {error && (
        <div className="error-text" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div className="settings-panel">
        <div className="settings-panel-title">Add {adapter.singular}</div>
        <div className="row gap-8">
          <input
            className="field"
            style={{ maxWidth: 320 }}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleCreate();
              }
            }}
            placeholder={`New ${adapter.singular} name`}
            disabled={busy}
          />
          <button
            type="button"
            className="btn primary"
            disabled={busy || !newName.trim()}
            onClick={() => void handleCreate()}
          >
            <Plus size={14} strokeWidth={2.5} /> Create
          </button>
        </div>
      </div>

      <div className="settings-panel">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
          <div className="settings-panel-title">
            All {adapter.plural} ({items.length})
          </div>
          <input
            className="field"
            style={{ maxWidth: 260 }}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by name or alias…"
          />
        </div>

        {loading ? (
          <div className="mono-sm muted">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="mono-sm muted">
            {items.length === 0 ? `No ${adapter.plural} yet.` : "No matches."}
          </div>
        ) : (
          <div className="taxonomy-mgmt-list">
            {filtered.map((item) => (
              <div className="taxonomy-mgmt-row" key={item.id}>
                <div className="taxonomy-mgmt-name">
                  <Chip kind={adapter.chipKind}>{item.name}</Chip>
                </div>
                <div className="taxonomy-mgmt-aliases">
                  {item.aliases.map((a) => (
                    <Chip
                      kind={adapter.chipKind}
                      ghost
                      key={a.id}
                      onRemove={() => void handleDeleteAlias(a.id)}
                    >
                      {a.alias}
                    </Chip>
                  ))}
                  {item.aliases.length === 0 && (
                    <span className="mono-sm muted">no aliases</span>
                  )}
                </div>
                {aliasingId === item.id ? (
                  <div className="row gap-4">
                    <input
                      className="field"
                      style={{ width: 160 }}
                      value={aliasText}
                      autoFocus
                      onChange={(e) => setAliasText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void handleAddAlias(item);
                        } else if (e.key === "Escape") {
                          setAliasingId(null);
                          setAliasText("");
                        }
                      }}
                      placeholder="new alias…"
                      disabled={busy}
                    />
                    <button
                      type="button"
                      className="btn sm primary"
                      disabled={busy || !aliasText.trim()}
                      onClick={() => void handleAddAlias(item)}
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
                  </div>
                ) : (
                  <div className="row gap-4">
                    <button
                      type="button"
                      className="icon-btn"
                      disabled={busy}
                      onClick={() => {
                        setAliasingId(item.id);
                        setAliasText("");
                      }}
                      title="Add alias"
                      aria-label="Add alias"
                    >
                      <Plus size={14} strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      disabled={busy}
                      onClick={() => void handleRename(item)}
                      title="Rename"
                      aria-label="Rename"
                    >
                      <Pencil size={14} strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn danger"
                      disabled={busy}
                      onClick={() => void handleDelete(item)}
                      title={`Delete ${adapter.singular}`}
                      aria-label={`Delete ${adapter.singular}`}
                    >
                      <Trash2 size={14} strokeWidth={2} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
