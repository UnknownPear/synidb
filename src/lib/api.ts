// src/lib/api.ts
export const DIRECTUS =
  (import.meta as any).env?.VITE_DIRECTUS_URL?.replace(/\/+$/, "") || "";
export const DIRECTUS_TOKEN = (import.meta as any).env?.VITE_DIRECTUS_TOKEN || "";
const RAW_API = (import.meta as any).env?.VITE_API_URL as string | undefined;

export const API_BASE = (() => {
  if (RAW_API && /^https?:\/\//i.test(RAW_API)) return RAW_API.replace(/\/+$/, "");
  const p = RAW_API && RAW_API.trim() ? RAW_API : "/backend";
  return (p.startsWith("/") ? p : `/${p}`).replace(/\/+$/, "");
})();

export const joinPath = (b: string, p: string) => `${b}${p.startsWith("/") ? p : `/${p}`}`;
const ctrl = new AbortController();

export async function dx<T>(path: string, init?: RequestInit & { params?: Record<string, any> }) {
  if (!DIRECTUS) throw new Error("Directus URL not set");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (DIRECTUS_TOKEN) headers["Authorization"] = `Bearer ${DIRECTUS_TOKEN}`;

  let url = `${DIRECTUS}${path}`;
  if (init?.params) {
    const qs = new URLSearchParams(
      Object.entries(init.params).map(([k, v]) => [k, typeof v === "object" ? JSON.stringify(v) : String(v)])
    );
    url += `?${qs}`;
  }

  const r = await fetch(url, { ...init, headers });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  const j = await r.json().catch(() => ({} as any));
  return (j.data ?? j) as T;
}
export const dxGet = <T,>(p: string, params?: any) => dx<T>(p, { method: "GET", params });
export const dxPost = <T,>(p: string, body?: any) => dx<T>(p, { method: "POST", body: JSON.stringify(body ?? {}) });
export const dxPatch = <T,>(p: string, body?: any) => dx<T>(p, { method: "PATCH", body: JSON.stringify(body ?? {}) });
const USER_KEY = "synergy_user";


function getAuthHeaders(customHeaders: HeadersInit = {}): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    // Spread custom headers first (in case we need to override defaults)
    ...(customHeaders as Record<string, string>),
  };

  // Automatically inject X-User-ID if found in LocalStorage
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (raw) {
      const user = JSON.parse(raw);
      if (user && (user.id !== undefined && user.id !== null)) {
        headers["X-User-ID"] = String(user.id);
      }
    }
  } catch (e) {
    // Silent fail if local storage is corrupt, allowing the request to proceed (backend handles 401)
  }

  return headers;
}

// --- UPDATED GET ---
export async function apiGet<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(joinPath(API_BASE, path), {
    method: "GET",
    credentials: "include",
    ...init,
    headers: getAuthHeaders(init.headers || {}),
  });
  
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(`${res.status} ${res.statusText} :: ${JSON.stringify(errorBody)}`);
  }
  return (await res.json()) as T;
}
// --- UPDATED POST ---
export async function apiPost<T>(path: string, body: any, options: RequestInit = {}) {
  const r = await fetch(joinPath(API_BASE, path), {
    method: "POST",
    credentials: "include",
    ...options,
    headers: getAuthHeaders(options.headers || {}),
    body: JSON.stringify(body ?? {}),
  });
  
  if (!r.ok) {
    const errorBody = await r.json().catch(() => ({ detail: r.statusText }));
    throw new Error(`${r.status} ${r.statusText} :: ${JSON.stringify(errorBody)}`);
  }
  return r.json() as Promise<T>;
}

export async function apiPatch<T>(path: string, body: any, options: RequestInit = {}) {
  const r = await fetch(joinPath(API_BASE, path), {
    method: "PATCH",
    credentials: "include",
    ...options,
    headers: getAuthHeaders(options.headers || {}),
    body: JSON.stringify(body ?? {}),
  });
  
  if (!r.ok) {
    const errorBody = await r.json().catch(() => ({ detail: r.statusText }));
    throw new Error(`${r.status} ${r.statusText} :: ${JSON.stringify(errorBody)}`);
  }
  return r.json() as Promise<T>;
}

// --- UPDATED PUT ---
export async function apiPut<T>(path: string, body: any, options: RequestInit = {}) {
  const r = await fetch(joinPath(API_BASE, path), {
    method: "PUT",
    credentials: "include",
    ...options,
    headers: getAuthHeaders(options.headers || {}),
    body: JSON.stringify(body ?? {}),
  });
  
  if (!r.ok) {
    const errorBody = await r.json().catch(() => ({ detail: r.statusText }));
    throw new Error(`${r.status} ${r.statusText} :: ${JSON.stringify(errorBody)}`);
  }
  return r.json() as Promise<T>;
}

// --- UPDATED DELETE ---
export async function apiDelete(path: string) {
  const r = await fetch(joinPath(API_BASE, path), { 
    method: "DELETE", 
    credentials: "include",
    headers: getAuthHeaders({}) 
  });
  
  if (!r.ok) {
    const errorBody = await r.json().catch(() => ({ detail: r.statusText }));
    throw new Error(`${r.status} ${r.statusText} :: ${JSON.stringify(errorBody)}`);
  }
  return r.json();
}

export async function getSynergyPreview(poId: string, lineIds: string[]) {
  const res = await fetch(`/pos/${poId}/synergy_preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ line_ids: lineIds }),
  });
  if (!res.ok) throw new Error(`Preview failed: ${res.status}`);
  return res.json() as Promise<{
    previews: Array<{
      line_id: string;
      synergy_id?: string;
      prefix?: string;
      codes?: string[];
      note?: string;
    }>;
  }>;
}



export function cls(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export function uniqById<T extends { id: string }>(list: T[]): T[] {
  const map = new Map<string, T>();
  list.forEach((x) => map.set(x.id, x));
  return Array.from(map.values());
}

export const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString("en-US", { month: "short", day: "numeric" });