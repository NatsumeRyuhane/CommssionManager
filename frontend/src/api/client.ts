import type {
  ApiKey,
  ApiKeyCreate,
  ApiKeyCreated,
  CommissionCreate,
  CommissionDetail,
  CommissionFile,
  CommissionListItem,
  CommissionNode,
  CommissionUpdate,
  CommissionVisibility,
  CommissionVisibilityUpdate,
  ListParams,
  MeResponse,
  Paged,
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
  reorderNodes: (commissionId: number, nodeIds: number[]) =>
    request<CommissionNode[]>(`/commissions/${commissionId}/nodes/reorder`, {
      method: "POST",
      body: JSON.stringify({ node_ids: nodeIds }),
    }),
  deleteNode: (nodeId: number) => request<void>(`/nodes/${nodeId}`, { method: "DELETE" }),

  // files
  uploadFile: (nodeId: number, file: File, label?: string) => {
    const form = new FormData();
    form.append("upload", file);
    if (label) form.append("label", label);
    return uploadForm<CommissionFile>(`/nodes/${nodeId}/files`, form);
  },
  deleteFile: (fileId: number) => request<void>(`/files/${fileId}`, { method: "DELETE" }),
  setFocal: (fileId: number, focalX: number, focalY: number) => {
    const form = new FormData();
    form.append("focal_x", String(focalX));
    form.append("focal_y", String(focalY));
    return uploadForm<CommissionFile>(`/files/${fileId}/focal`, form, "PATCH");
  },

  labels: () => request<{ id: number; name: string; type: string }[]>("/labels"),
  characters: () => request<{ id: number; name: string }[]>("/characters"),
  artists: () => request<{ id: number; name: string }[]>("/artists"),
};
