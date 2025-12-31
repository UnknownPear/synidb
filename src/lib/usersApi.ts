import { api, API_BASE } from "./dataClient";

export type AppUser = {
  id: number | string;
  name: string;
  initials: string;
  role: "Admin" | "Poster" | "Tester" | string;
  active: boolean;
  avatar_url: string | null;
  has_password: boolean;
};

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};

  const token = localStorage.getItem("synergy_token");
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const raw = localStorage.getItem("synergy_user");
    if (raw) {
      const u = JSON.parse(raw);
      if (u.id) {
        headers["X-User-ID"] = String(u.id);
      }
    }
  } catch (e) {}

  return headers;
}

type ApiDebug = {
  method: string;
  url: string;
  status?: number;
  error?: string;
  response?: unknown;
} | null;

let _lastDebug: ApiDebug = null;

async function call<T = any>(path: string, init?: RequestInit): Promise<T> {
  const base = String(API_BASE || "").replace(/\/+$/, "");
  const full = path.startsWith("/") ? base + path : base + "/" + path;
  _lastDebug = { method: (init?.method || "GET"), url: full };

  const authHeaders = getAuthHeaders();
  const finalInit = {
    ...init,
    headers: {
      ...authHeaders,
      ...(init?.headers || {}),
    },
  };

  try {
    const out = await api<T>(path, finalInit);
    _lastDebug = { ..._lastDebug, status: 200 };
    return out;
  } catch (e: any) {
    _lastDebug = { ..._lastDebug, error: e?.message || String(e) };
    throw e;
  }
}

export function getApiDebug(): ApiDebug {
  return _lastDebug;
}

export async function whoAmI(): Promise<{ ok: boolean; ts?: number }> {
  return call<{ ok: boolean; ts?: number }>("/health");
}

export async function listUsers(params: { role?: string; active?: boolean } = {}): Promise<AppUser[]> {
  const p = new URLSearchParams();
  if (params.role) {
    p.set("role", params.role);
  }
  if (params.active !== false) {
    p.set("active", "true");
  }
  const qs = p.toString();
  const path = `/auth/users${qs ? `?${qs}` : ""}`;
  return call<AppUser[]>(path);
}

export async function createUser(u: {
  name: string;
  initials: string;
  role?: string;
  active?: boolean;
}): Promise<AppUser> {
  return call<AppUser>("/auth/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: u.name,
      initials: u.initials,
      role: u.role ?? "Tester",
      active: u.active ?? true,
    }),
  });
}

export async function userLogin(userId: number | string, password: string): Promise<any> {
  return call<any>('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: Number(userId), password })
  });
}

export async function setUserPassword(userId: number | string, password: string | null): Promise<{ success: boolean }> {
  return call<{ success: boolean }>(`/auth/users/${userId}/password`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });
}

export async function uploadUserAvatar(userId: number | string, avatarUrl: string): Promise<{ success: boolean; avatar_url: string }> {
  return call<{ success: boolean; avatar_url: string }>(`/auth/users/${userId}/avatar`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ avatar_url: avatarUrl })
  });
}

export async function setUserSkuNumber(userId: number | string, nextNumber: number) {
  return call<{ success: boolean; next_number: number }>(`/auth/users/${userId}/sku-number`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ next_number: nextNumber }),
  });
}