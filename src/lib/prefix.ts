// src/lib/prefix.ts — helpers for Next ID peek/take (non-breaking)

export type PeekResponse = { prefix: string; next: number; formatted: string };
export type TakeResponse = { prefix: string; taken: number; formatted: string };

const API_BASE = (typeof process !== "undefined" && (process as any).env?.NEXT_PUBLIC_API_BASE) || "";
const base = API_BASE.replace(/\/+$/, "");

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method: init?.method || "GET",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    credentials: "same-origin",
    body: init?.body,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const t = await res.text();
      if (t) msg += `: ${t}`;
    } catch {}
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

/** Get a preview of the next ID without consuming it. */
export async function peekNextId(prefix: string): Promise<string> {
  const data = await api<PeekResponse>(`/prefix/${encodeURIComponent(prefix)}/peek`);
  // Prefer server-provided formatting if available
  return (data as any).formatted ?? `${data.prefix}-${String(data.next).padStart(5, "0")}`;
}

/** Atomically take the next ID and return the formatted full string. */
export async function takeNextId(prefix: string): Promise<string> {
  const data = await api<TakeResponse>(`/prefix/${encodeURIComponent(prefix)}/take`, { method: "POST" });
  return (data as any).formatted ?? `${data.prefix}-${String((data as any).taken ?? (data as any).next).padStart(5, "0")}`;
}

/** Optional: set the counter (used by admin screens). */
export async function setNextCounter(prefix: string, next: number): Promise<void> {
  await api(`/prefix/${encodeURIComponent(prefix)}/set`, {
    method: "POST",
    body: JSON.stringify({ next }),
  });
}
