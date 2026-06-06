import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, X } from "lucide-react";

import { api } from "../api/client";
import type { LabelType } from "../api/types";
import { Chip } from "./Chip";

export type TaxonomyKind = "category" | "tag" | "character" | "artist";

interface Match {
  id: number;
  name: string;
  aliases: string[];
}

interface Adapter {
  search(q: string): Promise<Match[]>;
  create(name: string): Promise<Match>;
  addAlias(id: number, alias: string): Promise<Match>;
  chipKind: "cat" | "tag" | "char" | "artist";
  label: string;
}

function toMatch(row: {
  id: number;
  name: string;
  aliases: { alias: string }[];
}): Match {
  return { id: row.id, name: row.name, aliases: row.aliases.map((a) => a.alias) };
}

function adapterFor(kind: TaxonomyKind): Adapter {
  switch (kind) {
    case "category":
    case "tag": {
      const labelType: LabelType = kind === "category" ? "category" : "tag";
      return {
        search: async (q) =>
          (await api.labels({ q, type: labelType })).map(toMatch),
        create: async (name) => toMatch(await api.createLabel(name, labelType)),
        addAlias: async (id, alias) => toMatch(await api.addLabelAlias(id, alias)),
        chipKind: kind === "category" ? "cat" : "tag",
        label: kind,
      };
    }
    case "character":
      return {
        search: async (q) => (await api.characters({ q })).map(toMatch),
        create: async (name) => toMatch(await api.createCharacter(name)),
        addAlias: async (id, alias) =>
          toMatch(await api.addCharacterAlias(id, alias)),
        chipKind: "char",
        label: "character",
      };
    case "artist":
      return {
        search: async (q) => (await api.artists({ q })).map(toMatch),
        create: async (name) =>
          toMatch(await api.createArtist({ name })),
        addAlias: async (id, alias) =>
          toMatch(await api.addArtistAlias(id, alias)),
        chipKind: "artist",
        label: "artist",
      };
  }
}

interface TaxonomyPickerProps {
  kind: TaxonomyKind;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}

export function TaxonomyPicker({ kind, values, onChange, placeholder }: TaxonomyPickerProps) {
  const adapter = useMemo(() => adapterFor(kind), [kind]);
  const [q, setQ] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [pendingName, setPendingName] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const lowerValues = useMemo(
    () => new Set(values.map((v) => v.toLowerCase())),
    [values]
  );

  // Debounced search
  useEffect(() => {
    const needle = q.trim();
    if (!needle) {
      setMatches([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = window.setTimeout(async () => {
      try {
        const m = await adapter.search(needle);
        setMatches(m);
      } catch {
        setMatches([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => window.clearTimeout(t);
  }, [q, adapter]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    function onDocDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);

  function add(name: string) {
    if (!lowerValues.has(name.toLowerCase())) {
      onChange([...values, name]);
    }
    setQ("");
    setMatches([]);
    setOpen(false);
  }

  function remove(name: string) {
    onChange(values.filter((v) => v !== name));
  }

  function handleEnter() {
    const trimmed = q.trim();
    if (!trimmed) return;
    if (matches.length > 0) {
      // Pick top match; its canonical name is what gets added even if user
      // typed an alias.
      add(matches[0].name);
      return;
    }
    setPendingName(trimmed);
  }

  function aliasHint(m: Match): string | null {
    const needle = q.trim().toLowerCase();
    if (!needle) return null;
    if (m.name.toLowerCase().includes(needle)) return null;
    return m.aliases.find((a) => a.toLowerCase().includes(needle)) ?? null;
  }

  const needle = q.trim();
  const hasExactName = matches.some(
    (m) => m.name.toLowerCase() === needle.toLowerCase()
  );

  return (
    <div className="taxonomy-picker" ref={containerRef}>
      <div className="taxonomy-picker-chips row wrap gap-4">
        {values.map((v) => (
          <Chip key={v} kind={adapter.chipKind} onRemove={() => remove(v)}>
            {v}
          </Chip>
        ))}
      </div>
      <input
        className="field taxonomy-picker-input"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => q.trim() && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleEnter();
          } else if (e.key === "Escape") {
            setOpen(false);
          } else if (e.key === "Backspace" && !q && values.length > 0) {
            remove(values[values.length - 1]);
          }
        }}
        placeholder={placeholder ?? `Search or add ${adapter.label}…`}
      />
      {open && needle && (
        <div className="taxonomy-picker-dropdown">
          {matches.map((m) => {
            const via = aliasHint(m);
            const already = lowerValues.has(m.name.toLowerCase());
            return (
              <button
                type="button"
                key={m.id}
                className="taxonomy-picker-row"
                disabled={already}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(m.name)}
              >
                <span className="taxonomy-picker-row-name">{m.name}</span>
                {via && (
                  <span className="mono-sm muted">via &ldquo;{via}&rdquo;</span>
                )}
                {already && <span className="mono-sm muted">added</span>}
              </button>
            );
          })}
          {loading && (
            <div className="taxonomy-picker-row mono-sm muted">Searching…</div>
          )}
          {!loading && !hasExactName && (
            <button
              type="button"
              className="taxonomy-picker-row taxonomy-picker-create"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setPendingName(needle)}
            >
              <Plus size={14} strokeWidth={2.5} />
              <span>
                Add &ldquo;{needle}&rdquo; as a new {adapter.label}…
              </span>
            </button>
          )}
        </div>
      )}

      {pendingName !== null && (
        <CreateOrAliasDialog
          adapter={adapter}
          name={pendingName}
          onCancel={() => setPendingName(null)}
          onResolved={(canonicalName) => {
            setPendingName(null);
            add(canonicalName);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- dialog

interface CreateOrAliasDialogProps {
  adapter: Adapter;
  name: string;
  onCancel: () => void;
  onResolved: (canonicalName: string) => void;
}

function CreateOrAliasDialog({
  adapter,
  name,
  onCancel,
  onResolved,
}: CreateOrAliasDialogProps) {
  const [mode, setMode] = useState<"create" | "alias">("create");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aliasParent, setAliasParent] = useState<Match | null>(null);

  async function submitCreate() {
    setBusy(true);
    setError(null);
    try {
      const created = await adapter.create(name);
      onResolved(created.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function submitAlias() {
    if (!aliasParent) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await adapter.addAlias(aliasParent.id, name);
      onResolved(updated.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={onCancel}>
      <div
        className="modal taxonomy-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="row" style={{ justifyContent: "space-between" }}>
          <strong style={{ fontSize: 15 }}>
            No match for &ldquo;{name}&rdquo;
          </strong>
          <button
            type="button"
            className="icon-btn"
            onClick={onCancel}
            title="Cancel"
            aria-label="Cancel"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        <div className="taxonomy-modal-tabs">
          <button
            type="button"
            className={`taxonomy-modal-tab${mode === "create" ? " active" : ""}`}
            onClick={() => setMode("create")}
          >
            Create new {adapter.label}
          </button>
          <button
            type="button"
            className={`taxonomy-modal-tab${mode === "alias" ? " active" : ""}`}
            onClick={() => setMode("alias")}
          >
            Add as alias of existing
          </button>
        </div>

        {mode === "create" && (
          <div className="col gap-8">
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              Create a brand-new {adapter.label} named{" "}
              <span style={{ color: "var(--ink)" }}>
                &ldquo;{name}&rdquo;
              </span>
              .
            </p>
            {error && <div className="error-text">{error}</div>}
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn ghost"
                onClick={onCancel}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={busy}
                onClick={() => void submitCreate()}
              >
                {busy ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        )}

        {mode === "alias" && (
          <div className="col gap-8">
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              Link &ldquo;{name}&rdquo; as an alias of an existing{" "}
              {adapter.label}. Future picks of either name will resolve to the
              same row.
            </p>
            <AliasParentPicker
              adapter={adapter}
              selected={aliasParent}
              onSelect={setAliasParent}
            />
            {error && <div className="error-text">{error}</div>}
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn ghost"
                onClick={onCancel}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={busy || !aliasParent}
                onClick={() => void submitAlias()}
              >
                {busy
                  ? "Linking…"
                  : aliasParent
                  ? `Add as alias of "${aliasParent.name}"`
                  : "Pick a parent first"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- alias-parent sub-picker

interface AliasParentPickerProps {
  adapter: Adapter;
  selected: Match | null;
  onSelect: (m: Match) => void;
}

function AliasParentPicker({ adapter, selected, onSelect }: AliasParentPickerProps) {
  const [q, setQ] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const needle = q.trim();
    if (!needle) {
      setMatches([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = window.setTimeout(async () => {
      try {
        setMatches(await adapter.search(needle));
      } catch {
        setMatches([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => window.clearTimeout(t);
  }, [q, adapter]);

  return (
    <div className="alias-parent-picker">
      <input
        className="field"
        placeholder={`Search ${adapter.label}…`}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
      />
      {loading && <div className="mono-sm muted">Searching…</div>}
      {!loading && q.trim() && matches.length === 0 && (
        <div className="mono-sm muted">
          No existing {adapter.label} matches &ldquo;{q.trim()}&rdquo;.
        </div>
      )}
      {matches.length > 0 && (
        <div className="alias-parent-list">
          {matches.map((m) => (
            <button
              type="button"
              key={m.id}
              className={`alias-parent-row${
                selected?.id === m.id ? " selected" : ""
              }`}
              onClick={() => onSelect(m)}
            >
              <span>{m.name}</span>
              {m.aliases.length > 0 && (
                <span className="mono-sm muted">
                  alias: {m.aliases.join(", ")}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
