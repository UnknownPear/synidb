/**
 * Directus helper with safe dev fallback:
 * - If VITE_DIRECTUS_URL is set, use it (prod or explicit config)
 * - Otherwise use a same-origin /api proxy (Vite) to avoid CORS in dev
 */

type DxDebug = {
  method?: string;
  url?: string;
  status?: number;
  error?: string;
  response?: any;
};

const ENV_URL = (import.meta as any).env?.VITE_DIRECTUS_URL?.toString()?.replace(/\/+$/, "");
const TOKEN = (import.meta as any).env?.VITE_DIRECTUS_TOKEN?.toString() || "";
const USE_CREDENTIALS = String((import.meta as any).env?.VITE_DIRECTUS_CREDENTIALS || "").toLowerCase() === "true";

// If no env URL, assume dev and use Vite proxy at same origin.
const BASE = ENV_URL || "/api";

export const DirectusEnv = {
  hasUrl: Boolean(ENV_URL),
  hasToken: Boolean(TOKEN),
  base: BASE,
};

const DIRECTUS_URL = (import.meta.env.VITE_DIRECTUS_URL || "").replace(/\/+$/, "");

function auth() {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (TOKEN) h.Authorization = `Bearer ${TOKEN}`;
  return h;
}

export async function dxGet<T>(path: string, params?: Record<string, any>): Promise<T> {
  const qs = params ? `?${new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, typeof v === "object" ? JSON.stringify(v) : String(v)])
  )}` : "";
  const r = await fetch(`${DIRECTUS_URL}${path}${qs}`, { headers: auth() });
  if (!r.ok) throw new Error(`GET ${path} ${r.status}`);
  const j = await r.json();
  return j.data ?? j;
}

export async function dxPost<T>(path: string, body?: any): Promise<T> {
  const r = await fetch(`${DIRECTUS_URL}${path}`, { method: "POST", headers: auth(), body: JSON.stringify(body ?? {}) });
  if (!r.ok) throw new Error(`POST ${path} ${r.status}`);
  const j = await r.json();
  return j.data ?? j;
}

export async function dxPatch<T>(path: string, body?: any): Promise<T> {
  const r = await fetch(`${DIRECTUS_URL}${path}`, { method: "PATCH", headers: auth(), body: JSON.stringify(body ?? {}) });
  if (!r.ok) throw new Error(`PATCH ${path} ${r.status}`);
  const j = await r.json();
  return j.data ?? j;
}

export async function dxDelete<T>(path: string): Promise<T> {
  const r = await fetch(`${DIRECTUS_URL}${path}`, { method: "DELETE", headers: auth() });
  if (!r.ok) throw new Error(`DELETE ${path} ${r.status}`);
  const j = await r.json();
  return j.data ?? j;
}

let _dxDebug: DxDebug | null = null;
export function getDxDebug() {
  return _dxDebug;
}

function normalizePath(path: string) {
  return path.startsWith("/") ? path : `/${path}`;
}

async function handleJson(res: Response) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return res.json();
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Core fetch wrapper
 */
export async function dx(path: string, init: RequestInit = {}) {
  const url = `${BASE}${normalizePath(path)}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };

  // Attach token by default if provided (can be overridden per-call)
  if (TOKEN && !("authorization" in Object.keys(headers).reduce((acc, k) => ({ ...acc, [k.toLowerCase()]: (headers as any)[k] }), {}))) {
    headers["Authorization"] = `Bearer ${TOKEN}`;
  }

  const reqInit: RequestInit = {
    ...init,
    headers,
    // only include credentials if explicitly enabled
    ...(USE_CREDENTIALS ? { credentials: "include" } : {}),
  };

  _dxDebug = { method: (reqInit.method || "GET").toUpperCase(), url };

  try {
    const res = await fetch(url, reqInit);
    _dxDebug.status = res.status;

    const data = await handleJson(res);
    if (!res.ok) {
      _dxDebug.error = typeof data === "string" ? data : data?.errors?.[0]?.message || "Request failed";
      _dxDebug.response = data;
      throw new Error(_dxDebug.error);
    }

    _dxDebug.response = data;
    return data;
  } catch (err: any) {
    _dxDebug = { ...( _dxDebug || {} ), error: err?.message || "Failed to fetch" };
    throw err;
  }
}

/**
 * API helpers used by AuthPage
 */

export type AppUser = { id: number; name: string; initials: string; role?: string; active?: boolean };

/** List active users (sorted by name) */
export async function listUsers(): Promise<AppUser[]> {
  const qs = new URLSearchParams();
  qs.set("filter[active][_eq]", "true");
  ["id", "name", "initials", "role", "active"].forEach((f) => qs.append("fields[]", f));
  qs.set("sort", "name");

  const data = await dx(`/items/app_users?${qs.toString()}`, { method: "GET" });
  // Directus returns { data: [...] }
  const rows = Array.isArray((data as any)?.data) ? (data as any).data : [];
  return rows as AppUser[];
}

/** Create user record */
export async function createUser(payload: { name: string; initials: string }): Promise<AppUser> {
  const body = JSON.stringify({ name: payload.name, initials: payload.initials, active: true });
  const data = await dx("/items/app_users", { method: "POST", body });
  const row = (data as any)?.data;
  if (!row) throw new Error("No data returned from Directus");
  return row as AppUser;
}

/** Current Directus user (if authenticated) */
export async function whoAmI(): Promise<any> {
  // If token-based auth is used and allowed to read /users/me
  return dx("/users/me", { method: "GET" }).catch(() => null);
}
export async function listUsersByRole(role: string): Promise<AppUser[]> {
  const qs = new URLSearchParams();
  qs.set("filter[active][_eq]", "true");
  qs.set("filter[role][_eq]", role);       // <- role filter
  ["id", "name", "initials", "role", "active"].forEach((f) => qs.append("fields[]", f));
  qs.set("sort", "name");

  const data = await dx(`/items/app_users?${qs.toString()}`, { method: "GET" });
  return (Array.isArray((data as any)?.data) ? (data as any).data : []) as AppUser[];
}