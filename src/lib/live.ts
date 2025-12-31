// src/lib/live.ts

export type LiveHandlers = {
  onCategoryCreated?: (cat: { id: string; label: string; prefix: string }) => void;
  onCategoryUpdated?: (before: any, after: any) => void;
  onCategoryDeleted?: (cat: { id: string; label: string; prefix: string }) => void;
  onRowUpserted?: (row: any) => void;
  onRowBulkUpserted?: (count: number) => void;
  onRowDeleted?: (synergyId: string) => void;
  onPrefixSet?: (data: { prefix: string; next: number }) => void;
  onMessageNew?: (msg: any) => void;
};

const API_BASE =
  (typeof process !== "undefined" && (process as any).env?.NEXT_PUBLIC_API_BASE) || "";

// Must match the key used in AuthPage.tsx / api.ts
const USER_KEY = "synergy_user";

export function connectLive(apiBase = API_BASE, h: LiveHandlers = {}) {
  const base = (apiBase || "").replace(/\/+$/, "");

  // --- SECURITY FIX: Get User ID for Stream Auth ---
  let queryParams = "";
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (raw) {
      const user = JSON.parse(raw);
      if (user && user.id) {
        queryParams = `?user_id=${user.id}`;
      }
    }
  } catch (e) {
    // If parsing fails, we connect without ID. 
    // In Production (Vultr), this will fail (401). 
    // In Local (Debug), this will work fine.
  }
  // -------------------------------------------------

  // Append the query params to the URL
  const ev = new EventSource(`${base}/events${queryParams}`, { withCredentials: true });

  const parse = (e: MessageEvent) => {
    try { return JSON.parse(e.data as any); } catch { return null; }
  };

  ev.addEventListener("category.created", (e) => {
    const p = parse(e as MessageEvent); if (p) h.onCategoryCreated?.(p);
  });
  ev.addEventListener("category.updated", (e) => {
    const p = parse(e as MessageEvent); h.onCategoryUpdated?.(p?.before, p?.after);
  });
  ev.addEventListener("category.deleted", (e) => {
    const p = parse(e as MessageEvent); if (p) h.onCategoryDeleted?.(p);
  });

  ev.addEventListener("row.upserted", (e) => {
    const p = parse(e as MessageEvent); if (p) h.onRowUpserted?.(p);
  });
  ev.addEventListener("row.bulkUpserted", (e) => {
    const p = parse(e as MessageEvent); h.onRowBulkUpserted?.(p?.count ?? 0);
  });
  ev.addEventListener("row.deleted", (e) => {
    const p = parse(e as MessageEvent); if (p?.synergyId) h.onRowDeleted?.(p.synergyId);
  });

  ev.addEventListener("prefix.set", (e) => {
    const p = parse(e as MessageEvent); if (p) h.onPrefixSet?.(p);
  });
  
  ev.addEventListener("message.new", (e) => {
    const p = parse(e as MessageEvent);
    if (p) h.onMessageNew?.(p);
  });

  ev.addEventListener("error", (err) => {
    // Browser auto-reconnects, but if auth fails (401/403), 
    // it might eventually stop trying.
    // console.log("SSE Error", err); 
  });

  return () => { try { ev.close(); } catch {} };
}