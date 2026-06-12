import { useEffect, useMemo, useState } from "react";
import { Copy, Plus, X } from "lucide-react";

import { api } from "../api/client";
import type {
  ApiKey,
  SiteSettings,
  StorageSettings,
  Visibility,
  VisibilityFieldKey,
  VisibilityPreset,
  VisibilitySettings,
} from "../api/types";
import { ArtistsPanel } from "../components/ArtistsPanel";
import { Chip } from "../components/Chip";
import { ExportsPanel } from "../components/ExportsPanel";
import { TaxonomyManagementPanel } from "../components/TaxonomyManagementPanel";
import { ToggleSwitch } from "../components/ToggleSwitch";
import { TopBar } from "../components/TopBar";
import { useAuth } from "../hooks/useAuth";

type Tab =
  | "site"
  | "categories"
  | "tags"
  | "characters"
  | "artists"
  | "api"
  | "visibility"
  | "storage"
  | "exports";

const FIELD_ROWS: { key: VisibilityFieldKey; label: string; note?: string }[] = [
  { key: "title", label: "Title" },
  { key: "description", label: "Description" },
  { key: "labels", label: "Categories & tags" },
  { key: "rating", label: "Rating" },
  { key: "characters", label: "Characters" },
  { key: "artists", label: "Artists" },
  { key: "confirmed_at", label: "Confirmed at", note: "usually private" },
  { key: "price", label: "Price", note: "usually private" },
];

const PRESETS: { value: VisibilityPreset; label: string; desc: string }[] = [
  {
    value: "public_by_default",
    label: "Public by default",
    desc: "New commissions appear publicly unless a narrower override is set.",
  },
  {
    value: "private_by_default",
    label: "Private by default",
    desc: "New commissions stay hidden until explicitly released.",
  },
  {
    value: "custom",
    label: "Custom",
    desc: "Use the field and stage defaults below as the source of truth.",
  },
];

/**
 * Render the admin settings page with tabbed controls for site, API keys, visibility, storage, taxonomy, artists, and exports.
 *
 * Displays an admin-only UI that loads settings (site, API keys, visibility, storage) from the server, provides per-tab panels for editing and saving, and shows a brief message when the current user is not an admin.
 *
 * @returns The settings page UI as a React element.
 */
export function SettingsPage() {
  const { me, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<Tab>("site");
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [site, setSite] = useState<SiteSettings | null>(null);
  const [visibility, setVisibility] = useState<VisibilitySettings | null>(null);
  const [storage, setStorage] = useState<StorageSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const isAdmin = me?.kind === "admin";

  async function reload() {
    if (!isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const [nextKeys, nextSite, nextVisibility, nextStorage] = await Promise.all([
        api.listApiKeys(),
        api.getSiteSettings(),
        api.getVisibilitySettings(),
        api.getStorageSettings(),
      ]);
      setKeys(nextKeys);
      setSite(nextSite);
      setVisibility(nextVisibility);
      setStorage(nextStorage);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!authLoading) void reload();
    // reload is intentionally not a dependency; it closes over the current auth state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAdmin]);

  if (!authLoading && !isAdmin) {
    return (
      <div className="app">
        <TopBar />
        <div style={{ padding: 48, textAlign: "center" }} className="muted">
          Settings require admin sign-in.
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <TopBar siteTitle={site?.site_title ?? "Commissions"}>
        <span className="mono-sm muted">admin settings</span>
      </TopBar>
      <div className="settings-shell">
        <aside className="settings-sidebar">
          <div className="settings-section-label">General</div>
          <button className={`settings-tab ${tab === "site" ? "active" : ""}`} onClick={() => setTab("site")}>
            Site
          </button>
          <button
            className={`settings-tab ${tab === "visibility" ? "active" : ""}`}
            onClick={() => setTab("visibility")}
          >
            Visibility
          </button>

          <div className="settings-section-label">Taxonomy</div>
          <button
            className={`settings-tab ${tab === "categories" ? "active" : ""}`}
            onClick={() => setTab("categories")}
          >
            Categories
          </button>
          <button
            className={`settings-tab ${tab === "tags" ? "active" : ""}`}
            onClick={() => setTab("tags")}
          >
            Tags
          </button>
          <button
            className={`settings-tab ${tab === "characters" ? "active" : ""}`}
            onClick={() => setTab("characters")}
          >
            Characters
          </button>
          <button
            className={`settings-tab ${tab === "artists" ? "active" : ""}`}
            onClick={() => setTab("artists")}
          >
            Artists
          </button>

          <div className="settings-section-label">System</div>
          <button className={`settings-tab ${tab === "api" ? "active" : ""}`} onClick={() => setTab("api")}>
            API keys
          </button>
          <button
            className={`settings-tab ${tab === "storage" ? "active" : ""}`}
            onClick={() => setTab("storage")}
          >
            Storage
          </button>
          <button
            className={`settings-tab ${tab === "exports" ? "active" : ""}`}
            onClick={() => setTab("exports")}
          >
            Exports
          </button>
        </aside>

        <main className="settings-content">
          {loading && <div className="mono-sm muted">Loading settings…</div>}
          {error && <div className="error-text">{error}</div>}
          {!loading && !error && tab === "site" && site && visibility && (
            <SitePanel
              site={site}
              visibility={visibility}
              busy={saving}
              onChange={setSite}
              onSave={async (rows) => {
                setSaving(true);
                setError(null);
                try {
                  const cleaned = rows
                    .map((row) => ({ ...row, stage_name: row.stage_name.trim() }))
                    .filter((row) => row.stage_name);
                  // one editor, two stores: ordered names feed the site stage
                  // template, the full rows feed the visibility stage defaults
                  const previousStageNames = site.default_stage_names;
                  const nextSite = await api.updateSiteSettings({
                    site_title: site.site_title,
                    default_stage_names: cleaned.map((row) => row.stage_name),
                    allow_public_original_download: site.allow_public_original_download,
                  });
                  let nextVisibility;
                  try {
                    nextVisibility = await api.updateVisibilitySettings({
                      stage_defaults: cleaned.map((row, index) => ({
                        stage_name: row.stage_name,
                        visibility: row.visibility,
                        position: index,
                        note: row.note || null,
                      })),
                    });
                  } catch (visibilityError) {
                    // keep the two stores in step: revert the template before
                    // surfacing the error (best effort — the revert may fail too)
                    await api
                      .updateSiteSettings({ default_stage_names: previousStageNames })
                      .catch(() => undefined);
                    throw visibilityError;
                  }
                  setSite(nextSite);
                  setVisibility(nextVisibility);
                } catch (e) {
                  setError(String(e));
                } finally {
                  setSaving(false);
                }
              }}
            />
          )}
          {!loading && !error && tab === "api" && (
            <ApiKeysPanel
              keys={keys}
              createdKey={createdKey}
              busy={saving}
              onCreated={(fullKey, nextKeys) => {
                setCreatedKey(fullKey);
                setKeys(nextKeys);
              }}
              onCopyCreated={() => {
                if (createdKey) void navigator.clipboard?.writeText(createdKey);
              }}
              onRevoke={async (key) => {
                if (!confirm(`Revoke API key “${key.name}”? This cannot be undone.`)) return;
                setSaving(true);
                setError(null);
                try {
                  const revoked = await api.revokeApiKey(key.id);
                  setKeys((rows) => rows.map((row) => (row.id === revoked.id ? revoked : row)));
                } catch (e) {
                  setError(String(e));
                } finally {
                  setSaving(false);
                }
              }}
            />
          )}
          {!loading && !error && tab === "visibility" && visibility && (
            <VisibilityPanel
              value={visibility}
              busy={saving}
              onChange={setVisibility}
              onSave={async () => {
                setSaving(true);
                setError(null);
                try {
                  // stage defaults are managed from the Site tab's stage editor
                  const body = {
                    preset: visibility.preset,
                    default_commission_visibility: visibility.default_commission_visibility,
                    default_stage_visibility: visibility.default_stage_visibility,
                    fields: visibility.fields,
                  };
                  setVisibility(await api.updateVisibilitySettings(body));
                } catch (e) {
                  setError(String(e));
                } finally {
                  setSaving(false);
                }
              }}
            />
          )}
          {!loading && !error && tab === "storage" && storage && <StoragePanel storage={storage} />}
          {tab === "categories" && (
            <TaxonomyManagementPanel
              kind="category"
              title="Categories"
              description="Top-level buckets for commissions. Categories use the green chip and cannot be reused as tags."
            />
          )}
          {tab === "tags" && (
            <TaxonomyManagementPanel
              kind="tag"
              title="Tags"
              description="Free-form tags applied to commissions. Aliases resolve to the canonical tag when typed in the picker."
            />
          )}
          {tab === "characters" && (
            <TaxonomyManagementPanel
              kind="character"
              title="Characters"
              description="Named characters that appear in commissions. Aliases let alternative names (i18n, nicknames) resolve to the same row."
            />
          )}
          {tab === "artists" && <ArtistsPanel />}
          {tab === "exports" && <ExportsPanel />}
        </main>
      </div>
    </div>
  );
}

const STAGE_ROW_DRAG_TYPE = "application/x-cmgr-stage-row";

interface StageRow {
  /** Client-side identity so list keys survive reorders and removals. */
  id: string;
  stage_name: string;
  visibility: Visibility;
  note: string;
}

const newRowId = () =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

/** The single stage editor drives both stores, so its initial state merges
 *  them: template names in order (visibility/note from the matching stage
 *  default), then any leftover stage defaults that weren't in the template. */
function mergeStageRows(site: SiteSettings, visibility: VisibilitySettings): StageRow[] {
  const byName = new Map(
    visibility.stage_defaults.map((row) => [row.stage_name.toLowerCase(), row]),
  );
  const rows: StageRow[] = site.default_stage_names.map((name) => {
    const match = byName.get(name.toLowerCase());
    if (match) byName.delete(name.toLowerCase());
    return {
      id: newRowId(),
      stage_name: name,
      visibility: match?.visibility ?? visibility.default_stage_visibility,
      note: match?.note ?? "",
    };
  });
  for (const row of byName.values()) {
    rows.push({
      id: newRowId(),
      stage_name: row.stage_name,
      visibility: row.visibility,
      note: row.note ?? "",
    });
  }
  return rows;
}

function SitePanel({
  site,
  visibility,
  busy,
  onChange,
  onSave,
}: {
  site: SiteSettings;
  visibility: VisibilitySettings;
  busy: boolean;
  onChange: (next: SiteSettings) => void;
  onSave: (rows: StageRow[]) => void;
}) {
  const [rows, setRows] = useState<StageRow[]>(() => mergeStageRows(site, visibility));
  const [newStage, setNewStage] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  // re-derive the editor from the canonical server state after a save;
  // keying on updated_at (not the objects) keeps in-progress edits to other
  // fields from resetting the rows on every keystroke
  useEffect(() => {
    setRows(mergeStageRows(site, visibility));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site.updated_at, visibility.updated_at]);

  const names = rows.map((row) => row.stage_name.trim()).filter(Boolean);
  const hasDuplicates = new Set(names.map((name) => name.toLowerCase())).size !== names.length;
  // an empty template is valid: new commissions then start stage-less
  const canSave = !busy && Boolean(site.site_title.trim()) && !hasDuplicates;

  function setRow(index: number, patch: Partial<StageRow>) {
    setRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    const name = newStage.trim();
    if (!name) return;
    setRows([
      ...rows,
      { id: newRowId(), stage_name: name, visibility: visibility.default_stage_visibility, note: "" },
    ]);
    setNewStage("");
  }

  function reorder(from: number, to: number) {
    if (from === to) return;
    const next = [...rows];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setRows(next);
  }

  return (
    <section>
      <div className="settings-heading">
        <div>
          <h1>Site</h1>
          <div className="mono-sm muted">
            {site.updated_at ? `Updated ${site.updated_at.slice(0, 10)}` : "Default settings"}
          </div>
        </div>
        <button className="btn primary" disabled={!canSave} onClick={() => onSave(rows)}>
          {busy ? "Saving…" : "Save site"}
        </button>
      </div>

      <div className="settings-panel">
        <div className="settings-panel-title">General</div>
        <label style={{ display: "block", maxWidth: 360 }}>
          <span className="label">Site title</span>
          <input
            className="field"
            value={site.site_title}
            onChange={(e) => onChange({ ...site, site_title: e.target.value })}
            placeholder="Commissions"
            maxLength={120}
          />
        </label>
      </div>

      <div className="settings-panel">
        <div className="settings-panel-title">Default lifecycle stages</div>
        <div className="mono-sm muted" style={{ marginBottom: 12 }}>
          Applied when a commission is created; the first stage renders topmost. Each
          stage&apos;s visibility is the default for stages of that name.
        </div>
        <div className="row gap-8" style={{ marginBottom: 12 }}>
          <input
            className="field"
            style={{ maxWidth: 280 }}
            placeholder="New stage name (e.g. Lineart)"
            value={newStage}
            onChange={(e) => setNewStage(e.target.value.replace(/,/g, ""))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addRow();
              }
            }}
          />
          <button
            type="button"
            className="btn sm"
            onClick={addRow}
            disabled={busy || !newStage.trim()}
          >
            <Plus />
            Add stage
          </button>
        </div>
        <div className="stage-default-list">
          {rows.length === 0 && (
            <div className="mono-sm muted">No stages — new commissions start empty.</div>
          )}
          {rows.map((row, index) => (
            <div
              key={row.id}
              className={`stage-default-row${dropIndex === index ? " reorder-target" : ""}`}
              onDragOver={(e) => {
                if (!Array.from(e.dataTransfer.types).includes(STAGE_ROW_DRAG_TYPE)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDropIndex(index);
              }}
              onDragLeave={() => setDropIndex((current) => (current === index ? null : current))}
              onDrop={(e) => {
                e.preventDefault();
                setDropIndex(null);
                if (dragIndex !== null) reorder(dragIndex, index);
                setDragIndex(null);
              }}
            >
              <button
                type="button"
                className="lifecycle-stage-handle"
                draggable={!busy}
                disabled={busy}
                title="Drag to reorder stage"
                aria-label={`Drag ${row.stage_name || "stage"} to reorder`}
                onDragStart={(e) => {
                  e.dataTransfer.setData(STAGE_ROW_DRAG_TYPE, String(index));
                  e.dataTransfer.effectAllowed = "move";
                  setDragIndex(index);
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                  setDropIndex(null);
                }}
              >
                <span className="lifecycle-stage-handle-dots" aria-hidden="true" />
              </button>
              <input
                className="field"
                value={row.stage_name}
                placeholder="Delivered"
                // commas would split the stored template back into stages
                onChange={(e) => setRow(index, { stage_name: e.target.value.replace(/,/g, "") })}
              />
              <select
                className="field"
                value={row.visibility}
                onChange={(e) => setRow(index, { visibility: e.target.value as Visibility })}
              >
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
              <input
                className="field"
                value={row.note}
                onChange={(e) => setRow(index, { note: e.target.value })}
                placeholder="note"
              />
              <button
                className="btn sm danger"
                disabled={busy}
                onClick={() => setRows(rows.filter((_, i) => i !== index))}
                title="Remove stage"
                aria-label="Remove stage"
              >
                <X />
              </button>
            </div>
          ))}
        </div>
        {hasDuplicates && (
          <div className="error-text" style={{ marginTop: 8 }}>
            Stage names must be unique.
          </div>
        )}
      </div>

      <div className="settings-panel">
        <div className="settings-panel-title">Downloads</div>
        <div className="settings-list">
          <div className="settings-list-row">
            <div>
              <strong>Allow original downloads</strong>
              <span className="mono-sm muted">
                {" "}
                · when off, visitors only get resampled lossy image variants
              </span>
            </div>
            <ToggleSwitch
              checked={site.allow_public_original_download}
              onChange={(next) => onChange({ ...site, allow_public_original_download: next })}
              label="Allow visitors to download original files"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function ApiKeysPanel({
  keys,
  createdKey,
  busy,
  onCreated,
  onCopyCreated,
  onRevoke,
}: {
  keys: ApiKey[];
  createdKey: string | null;
  busy: boolean;
  onCreated: (fullKey: string, keys: ApiKey[]) => void;
  onCopyCreated: () => void;
  onRevoke: (key: ApiKey) => void;
}) {
  const [name, setName] = useState("");
  const [read, setRead] = useState(true);
  const [write, setWrite] = useState(false);
  const activeKeys = useMemo(() => keys.filter((key) => !key.revoked_at).length, [keys]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const scopes = [read && "read", write && "write"].filter(Boolean) as string[];
    if (!name.trim() || scopes.length === 0) return;
    const created = await api.createApiKey({ name: name.trim(), scopes });
    onCreated(created.full_key, [created, ...keys]);
    setName("");
    setRead(true);
    setWrite(false);
  }

  return (
    <section>
      <div className="settings-heading">
        <div>
          <h1>API keys</h1>
          <div className="mono-sm muted">{activeKeys} active keys</div>
        </div>
      </div>

      <form className="settings-panel" onSubmit={(e) => void create(e)}>
        <div className="settings-panel-title">Generate key</div>
        <div className="settings-form-grid">
          <label>
            <span className="label">Name</span>
            <input
              className="field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="n8n automation"
            />
          </label>
          <div>
            <span className="label">Scopes</span>
            <label className="check-row">
              <input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} />
              read
            </label>
            <label className="check-row">
              <input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} />
              write
            </label>
          </div>
          <div className="settings-form-actions">
            <button className="btn primary" disabled={busy || !name.trim() || (!read && !write)}>
              Generate
            </button>
          </div>
        </div>
      </form>

      {createdKey && (
        <div className="settings-notice">
          <strong>New key</strong>
          <code>{createdKey}</code>
          <button className="btn sm" onClick={onCopyCreated}>
            <Copy />
            Copy
          </button>
        </div>
      )}

      <div className="settings-table-wrap">
        <table className="settings-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Key</th>
              <th>Scopes</th>
              <th>Created</th>
              <th>Last used</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {keys.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  No API keys yet.
                </td>
              </tr>
            )}
            {keys.map((key) => {
              const revoked = Boolean(key.revoked_at);
              return (
                <tr key={key.id} className={revoked ? "is-muted" : ""}>
                  <td>{key.name}</td>
                  <td className="mono-sm">{key.prefix}••••</td>
                  <td>
                    <div className="row gap-4 wrap">
                      {key.scopes.split(/\s+/).map((scope) => (
                        <Chip key={scope} kind="tag">
                          {scope}
                        </Chip>
                      ))}
                      {revoked && <Chip kind="rating">revoked</Chip>}
                    </div>
                  </td>
                  <td className="mono-sm">{key.created_at.slice(0, 10)}</td>
                  <td className="mono-sm">{key.last_used_at ? key.last_used_at.slice(0, 10) : "never"}</td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      className="btn sm danger"
                      disabled={busy || revoked}
                      onClick={() => onRevoke(key)}
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function VisibilityPanel({
  value,
  busy,
  onChange,
  onSave,
}: {
  value: VisibilitySettings;
  busy: boolean;
  onChange: (next: VisibilitySettings) => void;
  onSave: () => void;
}) {
  function setField(field: VisibilityFieldKey, next: boolean) {
    onChange({ ...value, fields: { ...value.fields, [field]: next } });
  }

  return (
    <section>
      <div className="settings-heading">
        <div>
          <h1>Visibility</h1>
          <div className="mono-sm muted">Global defaults; commission, stage, and file overrides win later.</div>
        </div>
        <button className="btn primary" disabled={busy} onClick={onSave}>
          {busy ? "Saving…" : "Save presets"}
        </button>
      </div>

      <div className="settings-panel">
        <div className="settings-panel-title">Default preset</div>
        <div className="preset-grid">
          {PRESETS.map((preset) => (
            <button
              type="button"
              key={preset.value}
              className={`preset-option ${value.preset === preset.value ? "active" : ""}`}
              onClick={() => onChange({ ...value, preset: preset.value })}
            >
              <span className="radio-dot" />
              <strong>{preset.label}</strong>
              <span>{preset.desc}</span>
            </button>
          ))}
        </div>
        <div className="settings-form-grid two">
          <SelectVisibility
            label="Default commission visibility"
            value={value.default_commission_visibility}
            onChange={(next) => onChange({ ...value, default_commission_visibility: next })}
          />
          <SelectVisibility
            label="Default stage visibility"
            value={value.default_stage_visibility}
            onChange={(next) => onChange({ ...value, default_stage_visibility: next })}
          />
        </div>
      </div>

      <div className="settings-panel">
        <div className="settings-panel-title">Field defaults</div>
        <div className="settings-list">
          {FIELD_ROWS.map((row) => (
            <div className="settings-list-row" key={row.key}>
              <div>
                <strong>{row.label}</strong>
                {row.note && <span className="mono-sm muted"> · {row.note}</span>}
              </div>
              <ToggleSwitch
                checked={value.fields[row.key]}
                onChange={(next) => setField(row.key, next)}
                label={`${row.label} public`}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="settings-note">
        <strong>Precedence:</strong> global preset → commission override → stage override → file override.
        Per-stage defaults (template order and visibility) are managed under Site → Default
        lifecycle stages.
      </div>
    </section>
  );
}

function SelectVisibility({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Visibility;
  onChange: (value: Visibility) => void;
}) {
  return (
    <label>
      <span className="label">{label}</span>
      <select className="field" value={value} onChange={(e) => onChange(e.target.value as Visibility)}>
        <option value="public">Public</option>
        <option value="private">Private</option>
      </select>
    </label>
  );
}

function StoragePanel({ storage }: { storage: StorageSettings }) {
  return (
    <section>
      <div className="settings-heading">
        <div>
          <h1>Storage</h1>
          <div className="mono-sm muted">Read-only summary from environment configuration.</div>
        </div>
      </div>
      <div className="settings-panel storage-summary">
        <div>
          <span className="label">Backend</span>
          <strong>{storage.backend}</strong>
        </div>
        <div>
          <span className="label">Configurable via</span>
          <strong>{storage.configurable_via}</strong>
        </div>
        {storage.local_root && (
          <div>
            <span className="label">Local root</span>
            <code>{storage.local_root}</code>
          </div>
        )}
        {storage.s3_bucket && (
          <div>
            <span className="label">Bucket</span>
            <code>{storage.s3_bucket}</code>
          </div>
        )}
        {storage.s3_endpoint && (
          <div>
            <span className="label">Endpoint</span>
            <code>{storage.s3_endpoint}</code>
          </div>
        )}
        {storage.cdn_base_url && (
          <div>
            <span className="label">CDN base URL</span>
            <code>{storage.cdn_base_url}</code>
          </div>
        )}
      </div>
    </section>
  );
}
