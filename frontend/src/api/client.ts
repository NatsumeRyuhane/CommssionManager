import type {
  ApiKey,
  ApiKeyCreate,
  ApiKeyCreated,
  Artist,
  ArtistCreate,
  ArtistUpdate,
  Character,
  CharacterPage,
  CharacterPageCommission,
  CharacterPageDirectoryItem,
  CharacterPageSet,
  CharacterPageSetCreate,
  CharacterPageSetUpdate,
  CharacterPageUpdate,
  CommissionCreate,
  CommissionDetail,
  CommissionFile,
  CommissionListItem,
  CommissionNode,
  CommissionUpdate,
  CommissionVisibility,
  CommissionVisibilityUpdate,
  Label,
  LabelType,
  ListParams,
  MeResponse,
  Paged,
  SiteSettings,
  SiteSettingsUpdate,
  StorageSettings,
  VisibilitySettings,
  VisibilitySettingsUpdate,
} from "./types";

const BASE = "/api/v1";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      /* ignore non-JSON error bodies */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function toQuery(params: ListParams): string {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.sort) sp.set("sort", params.sort);
  if (params.order) sp.set("order", params.order);
  if (params.limit != null) sp.set("limit", String(params.limit));
  if (params.offset != null) sp.set("offset", String(params.offset));
  for (const key of ["categories", "tags", "rating", "characters", "artists", "formats"] as const) {
    for (const v of params[key] ?? []) sp.append(key, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

async function requestPaged(path: string): Promise<Paged<CommissionListItem>> {
  const res = await fetch(`${BASE}${path}`, { credentials: "include" });
  if (!res.ok) throw new ApiError(res.status, res.statusText);
  const items = (await res.json()) as CommissionListItem[];
  const total = Number(res.headers.get("X-Total-Count") ?? items.length);
  return { items, total };
}

async function uploadForm<T>(path: string, form: FormData, method = "POST"): Promise<T> {
  // No Content-Type header: the browser sets the multipart boundary itself.
  const res = await fetch(`${BASE}${path}`, { method, credentials: "include", body: form });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

function uploadFormWithProgress<T>(
  path: string,
  form: FormData,
  onProgress?: (percentage: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE}${path}`);
    xhr.withCredentials = true;
    xhr.responseType = "json";

    xhr.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) return;
      onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response as T);
        return;
      }
      const detail =
        typeof xhr.response?.detail === "string" ? xhr.response.detail : xhr.statusText;
      reject(new ApiError(xhr.status, detail || "Upload failed"));
    });
    xhr.addEventListener("error", () => {
      reject(new ApiError(0, "Upload failed because of a network error"));
    });
    xhr.send(form);
  });
}

export const api = {
  me: () => request<MeResponse>("/auth/me"),
  login: (username: string, password: string) =>
    request<{ access_token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),

  listCommissions: (params: ListParams = {}) =>
    request<CommissionListItem[]>(`/commissions${toQuery(params)}`),
  listCommissionsPaged: (params: ListParams = {}) =>
    requestPaged(`/commissions${toQuery(params)}`),
  databaseExportUrl: () => `${BASE}/exports/database.json`,
  filesExportUrl: (commissionId?: number) =>
    `${BASE}/exports/files.zip${commissionId ? `?commission_id=${commissionId}` : ""}`,
  getCommission: (id: number) => request<CommissionDetail>(`/commissions/${id}`),
  createCommission: (body: CommissionCreate) =>
    request<CommissionDetail>("/commissions", { method: "POST", body: JSON.stringify(body) }),
  updateCommission: (id: number, body: CommissionUpdate) =>
    request<CommissionDetail>(`/commissions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteCommission: (id: number) =>
    request<void>(`/commissions/${id}`, { method: "DELETE" }),
  copyJson: (id: number) => request<Record<string, unknown>>(`/commissions/${id}/copy-json`),
  getCommissionVisibility: (id: number) =>
    request<CommissionVisibility>(`/commissions/${id}/visibility`),
  updateCommissionVisibility: (id: number, body: CommissionVisibilityUpdate) =>
    request<CommissionVisibility>(`/commissions/${id}/visibility`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  // settings
  listApiKeys: () => request<ApiKey[]>("/api-keys"),
  createApiKey: (body: ApiKeyCreate) =>
    request<ApiKeyCreated>("/api-keys", { method: "POST", body: JSON.stringify(body) }),
  revokeApiKey: (id: number) =>
    request<ApiKey>(`/api-keys/${id}/revoke`, { method: "POST" }),
  getSiteSettings: () => request<SiteSettings>("/settings/site"),
  updateSiteSettings: (body: SiteSettingsUpdate) =>
    request<SiteSettings>("/settings/site", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  getVisibilitySettings: () => request<VisibilitySettings>("/settings/visibility"),
  updateVisibilitySettings: (body: VisibilitySettingsUpdate) =>
    request<VisibilitySettings>("/settings/visibility", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  getStorageSettings: () => request<StorageSettings>("/settings/storage"),

  // lifecycle nodes
  listNodes: (commissionId: number) =>
    request<CommissionNode[]>(`/commissions/${commissionId}/nodes`),
  createNode: (commissionId: number, name: string) =>
    request<CommissionNode>(`/commissions/${commissionId}/nodes`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  renameNode: (nodeId: number, name: string) =>
    request<CommissionNode>(`/nodes/${nodeId}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
  updateNodeDate: (nodeId: number, startedAt: string | null) =>
    request<CommissionNode>(`/nodes/${nodeId}`, {
      method: "PATCH",
      body: JSON.stringify({
        started_at: startedAt ? `${startedAt}T00:00:00Z` : null,
      }),
    }),
  reorderNodes: (commissionId: number, nodeIds: number[]) =>
    request<CommissionNode[]>(`/commissions/${commissionId}/nodes/reorder`, {
      method: "POST",
      body: JSON.stringify({ node_ids: nodeIds }),
    }),
  deleteNode: (nodeId: number) => request<void>(`/nodes/${nodeId}`, { method: "DELETE" }),

  // files
  uploadFile: (
    nodeId: number,
    file: File,
    options: { label?: string; onProgress?: (percentage: number) => void } = {},
  ) => {
    const form = new FormData();
    form.append("upload", file);
    if (options.label) form.append("label", options.label);
    return uploadFormWithProgress<CommissionFile>(
      `/nodes/${nodeId}/files`,
      form,
      options.onProgress,
    );
  },
  deleteFile: (fileId: number) => request<void>(`/files/${fileId}`, { method: "DELETE" }),
  moveFile: (fileId: number, nodeId: number) =>
    request<CommissionFile>(`/files/${fileId}/node`, {
      method: "PATCH",
      body: JSON.stringify({ node_id: nodeId }),
    }),
  reorderFiles: (nodeId: number, fileIds: number[]) =>
    request<CommissionFile[]>(`/nodes/${nodeId}/files/reorder`, {
      method: "POST",
      body: JSON.stringify({ file_ids: fileIds }),
    }),
  setFocal: (fileId: number, focalX: number, focalY: number, focalZoom?: number) => {
    const form = new FormData();
    form.append("focal_x", String(focalX));
    form.append("focal_y", String(focalY));
    if (focalZoom != null) form.append("focal_zoom", String(focalZoom));
    return uploadForm<CommissionFile>(`/files/${fileId}/focal`, form, "PATCH");
  },

  // taxonomy: labels (categories + tags)
  labels: (params: { q?: string; type?: LabelType } = {}) => {
    const sp = new URLSearchParams();
    if (params.q) sp.set("q", params.q);
    if (params.type) sp.set("type", params.type);
    const qs = sp.toString();
    return request<Label[]>(`/labels${qs ? `?${qs}` : ""}`);
  },
  createLabel: (name: string, type: LabelType) =>
    request<Label>("/labels", { method: "POST", body: JSON.stringify({ name, type }) }),
  updateLabel: (id: number, body: { name?: string; type?: LabelType }) =>
    request<Label>(`/labels/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteLabel: (id: number) => request<void>(`/labels/${id}`, { method: "DELETE" }),
  addLabelAlias: (id: number, alias: string) =>
    request<Label>(`/labels/${id}/aliases`, {
      method: "POST",
      body: JSON.stringify({ alias }),
    }),
  deleteLabelAlias: (aliasId: number) =>
    request<void>(`/label-aliases/${aliasId}`, { method: "DELETE" }),

  // taxonomy: characters
  characters: (params: { q?: string } = {}) => {
    const sp = new URLSearchParams();
    if (params.q) sp.set("q", params.q);
    const qs = sp.toString();
    return request<Character[]>(`/characters${qs ? `?${qs}` : ""}`);
  },
  createCharacter: (name: string) =>
    request<Character>("/characters", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  updateCharacter: (id: number, body: { name?: string }) =>
    request<Character>(`/characters/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteCharacter: (id: number) =>
    request<void>(`/characters/${id}`, { method: "DELETE" }),
  addCharacterAlias: (id: number, alias: string) =>
    request<Character>(`/characters/${id}/aliases`, {
      method: "POST",
      body: JSON.stringify({ alias }),
    }),
  deleteCharacterAlias: (aliasId: number) =>
    request<void>(`/character-aliases/${aliasId}`, { method: "DELETE" }),

  // taxonomy: artists
  artists: (params: { q?: string } = {}) => {
    const sp = new URLSearchParams();
    if (params.q) sp.set("q", params.q);
    const qs = sp.toString();
    return request<Artist[]>(`/artists${qs ? `?${qs}` : ""}`);
  },
  createArtist: (body: ArtistCreate) =>
    request<Artist>("/artists", { method: "POST", body: JSON.stringify(body) }),
  updateArtist: (id: number, body: ArtistUpdate) =>
    request<Artist>(`/artists/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteArtist: (id: number) => request<void>(`/artists/${id}`, { method: "DELETE" }),
  addArtistAlias: (id: number, alias: string) =>
    request<Artist>(`/artists/${id}/aliases`, {
      method: "POST",
      body: JSON.stringify({ alias }),
    }),
  deleteArtistAlias: (aliasId: number) =>
    request<void>(`/artist-aliases/${aliasId}`, { method: "DELETE" }),

  // character pages
  listCharacterPages: () =>
    request<CharacterPageDirectoryItem[]>("/character-pages"),
  getCharacterPage: (characterId: number) =>
    request<CharacterPage>(`/characters/${characterId}/page`),
  upsertCharacterPage: (characterId: number, body: CharacterPageUpdate) =>
    request<CharacterPage>(`/characters/${characterId}/page`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteCharacterPage: (characterId: number) =>
    request<void>(`/characters/${characterId}/page`, { method: "DELETE" }),
  listEligibleCommissions: (
    characterId: number,
    params: { onlyTagged?: boolean; excludeSetId?: number } = {},
  ) => {
    const sp = new URLSearchParams();
    if (params.onlyTagged === false) sp.set("only_tagged", "false");
    if (params.excludeSetId != null) sp.set("exclude_set_id", String(params.excludeSetId));
    const qs = sp.toString();
    return request<CharacterPageCommission[]>(
      `/characters/${characterId}/page/eligible-commissions${qs ? `?${qs}` : ""}`,
    );
  },
  createCharacterPageSet: (characterId: number, body: CharacterPageSetCreate) =>
    request<CharacterPageSet>(`/characters/${characterId}/page/sets`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateCharacterPageSet: (setId: number, body: CharacterPageSetUpdate) =>
    request<CharacterPageSet>(`/character-page-sets/${setId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteCharacterPageSet: (setId: number) =>
    request<void>(`/character-page-sets/${setId}`, { method: "DELETE" }),
  reorderCharacterPageSets: (characterId: number, setIds: number[]) =>
    request<CharacterPageSet[]>(`/characters/${characterId}/page/sets/reorder`, {
      method: "POST",
      body: JSON.stringify({ set_ids: setIds }),
    }),
  addCharacterPageSetItems: (setId: number, commissionIds: number[]) =>
    request<CharacterPageSet>(`/character-page-sets/${setId}/items`, {
      method: "POST",
      body: JSON.stringify({ commission_ids: commissionIds }),
    }),
  deleteCharacterPageSetItem: (itemId: number) =>
    request<void>(`/character-page-set-items/${itemId}`, { method: "DELETE" }),
  reorderCharacterPageSetItems: (setId: number, itemIds: number[]) =>
    request<CharacterPageSet>(`/character-page-sets/${setId}/items/reorder`, {
      method: "POST",
      body: JSON.stringify({ item_ids: itemIds }),
    }),
};
