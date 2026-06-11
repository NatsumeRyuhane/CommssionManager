import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Copy, Plus, X } from "lucide-react";

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
  { key: "completed_at", label: "Completed date" },
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
          {!loading && !error && tab === "site" && site && (
            <SitePanel
              value={site}
              busy={saving}
              onChange={setSite}
              onSave={async (stageNames) => {
                setSaving(true);
                setError(null);
                try {
                  setSite(
                    await api.updateSiteSettings({
                      site_title: site.site_title,
                      default_stage_names: stageNames,
                    }),
                  );
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
                  const body = {
                    preset: visibility.preset,
                    default_commission_visibility: visibility.default_commission_visibility,
                    default_stage_visibility: visibility.default_stage_visibility,
                    fields: visibility.fields,
                    stage_defaults: visibility.stage_defaults.map((row, index) => ({
                      stage_name: row.stage_name,
                      visibility: row.visibility,
                      position: index,
                      note: row.note || null,
                    })),
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

function SitePanel({
  value,
  busy,
  onChange,
  onSave,
}: {
  value: SiteSettings;
  busy: boolean;
  onChange: (next: SiteSettings) => void;
  onSave: (stageNames: string[]) => void;
}) {
  // edited as raw text so typed commas/spaces survive; parsed on save
  const [stagesText, setStagesText] = useState(value.default_stage_names.join(", "));
  const stageNames = stagesText.split(",").map((s) => s.trim()).filter(Boolean);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.site_title.trim() || stageNames.length === 0) return;
    onSave(stageNames);
  }

  return (
    <section>
      <div className="settings-heading">
        <div>
          <h1>Site</h1>
          <div className="mono-sm muted">
            {value.updated_at ? `Updated ${value.updated_at.slice(0, 10)}` : "Default settings"}
          </div>
        </div>
      </div>

      <form className="settings-panel" onSubmit={submit}>
        <div className="settings-panel-title">Header</div>
        <div className="settings-form-grid">
          <label>
            <span className="label">Site title</span>
            <input
              className="field"
              value={value.site_title}
              onChange={(e) => onChange({ ...value, site_title: e.target.value })}
              placeholder="Commissions"
              maxLength={120}
            />
          </label>
          <label>
            <span className="label">New-commission stage template</span>
            <input
              className="field"
              value={stagesText}
              onChange={(e) => setStagesText(e.target.value)}
              placeholder="Delivered, Color, Lineart, Sketching"
            />
            <span className="mono-sm muted">
              Comma-separated, applied when a commission is created. First stage renders topmost.
            </span>
          </label>
          <div className="settings-form-actions">
            <button
              className="btn primary"
              disabled={busy || !value.site_title.trim() || stageNames.length === 0}
            >
              {busy ? "Saving…" : "Save site"}
            </button>
          </div>
        </div>
      </form>
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

  function setStage(index: number, patch: Partial<{ stage_name: string; visibility: Visibility; note: string }>) {
    const stage_defaults = value.stage_defaults.map((row, i) =>
      i === index ? { ...row, ...patch } : row
    );
    onChange({ ...value, stage_defaults });
  }

  function moveStage(index: number, dir: -1 | 1) {
    const next = [...value.stage_defaults];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange({ ...value, stage_defaults: next });
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

      <div className="settings-panel">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
          <div className="settings-panel-title" style={{ margin: 0 }}>
            Stage defaults
          </div>
          <button
            className="btn sm"
            onClick={() =>
              onChange({
                ...value,
                stage_defaults: [
                  ...value.stage_defaults,
                  { stage_name: "", visibility: value.default_stage_visibility, position: value.stage_defaults.length, note: "" },
                ],
              })
            }
          >
            <Plus />
            Add stage
          </button>
        </div>
        <div className="stage-default-list">
          {value.stage_defaults.map((stage, index) => (
            <div className="stage-default-row" key={`${stage.id ?? "new"}-${index}`}>
              <input
                className="field"
                value={stage.stage_name}
                onChange={(e) => setStage(index, { stage_name: e.target.value })}
                placeholder="Delivered"
              />
              <select
                className="field"
                value={stage.visibility}
                onChange={(e) => setStage(index, { visibility: e.target.value as Visibility })}
              >
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
              <input
                className="field"
                value={stage.note ?? ""}
                onChange={(e) => setStage(index, { note: e.target.value })}
                placeholder="note"
              />
              <button
                className="btn sm"
                disabled={index === 0}
                onClick={() => moveStage(index, -1)}
                title="Move up"
                aria-label="Move stage up"
              >
                <ArrowUp />
              </button>
              <button
                className="btn sm"
                disabled={index === value.stage_defaults.length - 1}
                onClick={() => moveStage(index, 1)}
                title="Move down"
                aria-label="Move stage down"
              >
                <ArrowDown />
              </button>
              <button
                className="btn sm danger"
                onClick={() =>
                  onChange({
                    ...value,
                    stage_defaults: value.stage_defaults.filter((_, i) => i !== index),
                  })
                }
                title="Remove stage"
                aria-label="Remove stage"
              >
                <X />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="settings-note">
        <strong>Precedence:</strong> global preset → commission override → stage override → file override.
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
