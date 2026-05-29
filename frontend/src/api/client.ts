import type {
  CommissionCreate,
  CommissionDetail,
  CommissionListItem,
  CommissionUpdate,
  ListParams,
  MeResponse,
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
  for (const key of ["categories", "tags", "rating", "characters", "artists", "formats"] as const) {
    for (const v of params[key] ?? []) sp.append(key, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
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

  labels: () => request<{ id: number; name: string; type: string }[]>("/labels"),
  characters: () => request<{ id: number; name: string }[]>("/characters"),
  artists: () => request<{ id: number; name: string }[]>("/artists"),
};
