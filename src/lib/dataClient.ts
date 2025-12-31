// src/lib/dataClient.ts — COMPLETE FILE (robust saves, no UI changes)

import type { Grade } from "@/lib/grades";
import { dxGet, dxPost, dxPatch, dxDelete } from "./directus";

/* ───────────────────────────── Types ───────────────────────────── */

export type DirectusFile = {
  id: string;
  filename_disk: string;
  title: string | null;
};

export type Category = { id: string; label: string; prefix: string; notes?: string };
export type InventoryItem = {
  item_id: string;
  synergy_code: string;
  purchase_order_id: string | null;
  po_line_id: string | null;
  category_id: string | null;
  brand?: string | null;
  model?: string | null;
  description?: string | null;
  serial?: string | null;
  grade?: "A" | "B" | "C" | "D" | "P" | null;
  cost_unit?: number | null;
  msrp?: number | null;
  tester_comment?: string | null;
  tested_by?: string | null;
  tested_at?: string | null;
  listed_price?: number | null;
  status: "INTAKE" | "TESTED" | "POSTED" | "SOLD" | "RMA" | "SCRAP";
  posted_by?: string | null;
  posted_at?: string | null;
};

const LOCALE_BY_MARKETPLACE: Record<string, string> = {
  EBAY_US: "en-US",
  EBAY_GB: "en-GB",
  EBAY_AU: "en-AU",
  EBAY_DE: "de-DE",
  EBAY_FR: "fr-FR",
  EBAY_IT: "it-IT",
  EBAY_ES: "es-ES",
  EBAY_CA: "en-CA",
  EBAY_CA_FR: "fr-CA",
};


const MARKETPLACE = (import.meta as any)?.env?.VITE_EBAY_MARKETPLACE_ID || "EBAY_US";

/* ───────────────────────────── Base URLs ───────────────────────────── */

/** Single source of truth for the backend */
export const API_BASE = String(import.meta.env.VITE_API_URL || "").replace(/\/+$/, "") || "/backend";
export const updateRow = patchRow;

/** For legacy callers in this file, BASE equals API_BASE */
const BASE = API_BASE;

/** Optional dev scraper (otherwise we’ll hit the FastAPI endpoints under API_BASE) */
const SCRAPER_BASE =
  (import.meta as any)?.env?.VITE_SCRAPER_URL
    ? String((import.meta as any).env.VITE_SCRAPER_URL).replace(/\/+$/, "")
    : "";

/** ID server: default to same FastAPI unless you override */
const ID_SERVER = String(import.meta.env.VITE_ID_SERVER || API_BASE).replace(/\/+$/, "");

/**
 * eBay proxy base:
 *  - If VITE_EBAY_PROXY_BASE is set, use it
 *  - If it’s relative, resolve it under API_BASE
 *  - Otherwise fallback to `${API_BASE}/ebay`
 */
function resolveUnderApi(b: string) {
  const s = String(b).trim();
  if (/^https?:\/\//i.test(s)) return s.replace(/\/+$/, ""); // absolute URL
  if (s.startsWith("/")) return s.replace(/\/+$/, "");        // absolute path
  return `${API_BASE.replace(/\/+$/, "")}/${s.replace(/^\/+/, "")}`.replace(/\/+$/, "");
}

// Default to `${API_BASE}/ebay`
const EBAY_BASE_RAW = (import.meta as any).env?.VITE_EBAY_PROXY_BASE ?? "ebay";
export const EBAY_BASE = resolveUnderApi(EBAY_BASE_RAW);

/** Marketplace + taxonomy defaults */
const DEFAULT_TREE_ID = (import.meta as any).env?.VITE_EBAY_CATEGORY_TREE_ID || "0";

/** Optional (only if your proxy does NOT inject Authorization) */
const EBAY_OAUTH_TOKEN = (import.meta as any).env?.VITE_EBAY_OAUTH_TOKEN || undefined;

/* ───────────────────────────── Tiny fetch helpers ───────────────────────────── */

function join(base: string, path: string) {
  if (!path.startsWith("/")) path = "/" + path;
  return base + path;
}

export async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const url = join(API_BASE, path);
  const res = await fetch(url, {
    credentials: "include",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} :: ${url} :: ${text.slice(0, 400)}`);
  }
  if (res.status === 204) return undefined as any;
  return res.json() as Promise<T>;
}

// Nice to see at boot:
if (typeof window !== "undefined") {
  // eslint-disable-next-line no-console
  console.log("[Manager] API_BASE =", API_BASE);
  console.log("[Manager] EBAY_BASE =", EBAY_BASE);
}

async function jfetch<T>(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<T> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), init.timeoutMs ?? 12000);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} on ${url}${text ? ` — ${text.slice(0, 160)}` : ""}`);
    }
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) return (await res.json()) as T;
    return (await res.text()) as unknown as T;
  } finally {
    clearTimeout(t);
  }
}

// replace your current ebayFetch with this:
async function ebayFetch<T = any>(
  path: string,
  params?: Record<string, any>,
  init?: RequestInit & { jsonBody?: any }
): Promise<T> {
  // Build absolute base once
  const base =
    /^https?:\/\//i.test(EBAY_BASE)
      ? EBAY_BASE.replace(/\/+$/, "")
      : `${location.origin}${EBAY_BASE.startsWith("/") ? "" : "/"}${EBAY_BASE}`.replace(/\/+$/, "");

  // ⬇️ KEY LINE: remove leading slashes so base path (/backend/ebay) is preserved
  const rel = String(path || "").replace(/^\/+/, "");
  const url = new URL(rel, base.endsWith("/") ? base : base + "/");

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v == null) continue;
      url.searchParams.set(k, String(v));
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE,
    Accept: "application/json",
  };
  if (EBAY_OAUTH_TOKEN) headers.Authorization = `Bearer ${EBAY_OAUTH_TOKEN}`;

  const res = await fetch(url.toString(), {
    method: init?.method ?? (init?.jsonBody ? "POST" : "GET"),
    credentials: "include", // keep cookies/session
    headers: { ...headers, ...(init?.headers || {}) },
    body: init?.jsonBody ? JSON.stringify(init.jsonBody) : init?.body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`eBay API ${res.status} ${res.statusText} at ${url.pathname}\n${text || ""}`);
  }
  const ct = res.headers.get("content-type") || "";
  return (ct.includes("application/json") ? await res.json() : await res.text()) as T;
}


/* ───────────────────────────── Categories API ───────────────────────────── */

export async function getCategories(): Promise<Category[]> {
  return jfetch<Category[]>(`${BASE}/categories`, { timeoutMs: 8000 });
}

export async function createCategory(input: { label: string; prefix: string }) {
  return jfetch<Category>(`${BASE}/categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateCategory(id: string, patch: Partial<Pick<Category, "label" | "prefix">>) {
  return jfetch<Category>(`${BASE}/categories/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export async function deleteCategory(id: string) {
  await jfetch<void>(`${BASE}/categories/${id}`, { method: "DELETE" });
}

/* ───────────────────────────── Rows API ───────────────────────────── */

export async function getRows(): Promise<InventoryRow[]> {
  const raw = await jfetch<any[]>(`${BASE}/rows`, { timeoutMs: 15000 });
  return raw.map((r) => ({
    ...r,
    // prefer camelCase if present; otherwise take snake_case
    ebayItemUrl: r.ebayItemUrl ?? r.ebay_item_url ?? null,
  }));
}

// Debounced, coalesced saves (one PUT for rapid edits)
type SaveWork = {
  rows: InventoryRow[];
  resolve: () => void;
  reject: (e: any) => void;
};
let saveTimer: number | null = null;
let pending: SaveWork | null = null;
let saveInflight: AbortController | null = null;

export function saveRows(rows: InventoryRow[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    pending = { rows, resolve, reject };
    if (saveTimer !== null) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(flushSave, 350);
  });
}

export async function getSoldAvg(row: any, opts: { limit?: number } = {}) {
  // Prefer explicit SCRAPER_BASE if provided; otherwise hit our FastAPI
  const base = SCRAPER_BASE || BASE;
  const url = new URL(`${base}/sold_avg`);
  url.searchParams.set("row", JSON.stringify(row));
  url.searchParams.set("limit", String(opts.limit ?? 60));
  const r = await fetch(url.toString(), { method: "GET" });
  return r.json();
}

async function flushSave() {
  saveTimer = null;
  const work = pending;
  pending = null;
  if (!work) return;

  // cancel previous silently
  if (saveInflight) {
    try {
      saveInflight.abort();
    } catch {}
    saveInflight = null;
  }

  const body = JSON.stringify(work.rows);
  saveInflight = new AbortController();

  try {
    await jfetch(`${BASE}/rows`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body,
      signal: saveInflight.signal,
      timeoutMs: Math.min(32000, Math.max(12000, Math.ceil(body.length / 250_000) * 4000)),
    });
    work.resolve();
  } catch (e: any) {
    if (e?.name === "AbortError") {
      work.resolve();
      return;
    }
    // quick retry
    try {
      await new Promise((r) => setTimeout(r, 700));
      await jfetch(`${BASE}/rows`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body,
        timeoutMs: 20000,
      });
      work.resolve();
    } catch {
      work.reject(e);
    }
  } finally {
    saveInflight = null;
  }
}

// Single-row patch
export async function patchRow(id: string, patch: Partial<InventoryRow>) {
  // if caller sent camelCase, also include snake_case for compatibility
  const body: any = { ...patch };
  if (patch.hasOwnProperty("ebayItemUrl")) {
    body.ebay_item_url = (patch as any).ebayItemUrl;
  }
  return jfetch<InventoryRow>(`${BASE}/rows/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deleteRow(id: string): Promise<void> {
  const url = `${BASE}/rows/${encodeURIComponent(id)}`;
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} on ${url}${text ? ` — ${text.slice(0, 200)}` : ""}`);
  }
}

/* ───────────────────────────── Health & Prefix ───────────────────────────── */

export async function health(): Promise<{ ok: boolean }> {
  try {
    return await jfetch<{ ok: boolean }>(`${BASE}/health`, { timeoutMs: 4000 });
  } catch {
    return { ok: false };
  }
}

export async function peekPrefix(prefix: string): Promise<string> {
  // Use the ID server base, which defaults to API_BASE
  return jfetch<string>(`${ID_SERVER}/prefix/${encodeURIComponent(prefix)}/peek`, { timeoutMs: 8000 });
}

export async function takePrefix(prefix: string): Promise<string> {
  return jfetch<string>(`${ID_SERVER}/prefix/${encodeURIComponent(prefix)}/take`, { method: "POST" });
}

export async function setNext(prefix: string, next: number): Promise<void> {
  await jfetch(`${ID_SERVER}/prefix/${encodeURIComponent(prefix)}/set`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ next }),
  });
}

/* ───────────────────────────── Market Avg (Browse scraper) ───────────────────────────── */

export type BrowseAvgResult = {
  ok: boolean;
  source?: string; // "cache" | "browse_api"
  currency?: string; // e.g. "USD"
  sampled: number;
  valid: number;
  avg: number;
  rows?: any[];
};

type BrowseAvgOpts = {
  fixed?: boolean; // default true
  condition?: string; // e.g. 'USED'
  currency?: string; // e.g. 'USD'
  limit?: number; // 1..200
};

const AVG_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h
const avgInflight = new Map<string, Promise<BrowseAvgResult>>();

const DIRECTUS_BASE =
  (import.meta as any).env?.VITE_DIRECTUS_URL?.replace(/\/+$/, "") || BASE;

export async function getBrowseAvg(
  q: string,
  opts: { fixed?: boolean; condition?: "USED" | "NEW"; currency?: string; limit?: number } = {}
) {
  const params = new URLSearchParams({
    q,
    limit: String(opts.limit ?? 100),
    priceCurrency: opts.currency ?? "USD",
    filter: [
      (opts.fixed ?? true) ? "buyingOptions:{FIXED_PRICE}" : "",
      opts.condition ? `conditions:{${opts.condition}}` : "",
    ].filter(Boolean).join(","),
  });
  const r = await fetch(`${API_BASE}/browse_avg?${params.toString()}`);
  if (!r.ok) throw new Error(`browse_avg failed: ${r.status}`);
  return r.json();
}

/* ───────────────────────────── eBay (Buy/Commerce/Sell) helpers ───────────────────────────── */

export function getBrowse(params: {
  q?: string;
  category_ids?: string;
  limit?: number;
  offset?: number;
  sort?: string;
  filter?: string;
}) {
  return ebayFetch(`/buy/browse/v1/item_summary/search`, params);
}

export function getSoldInsights(params: {
  q?: string;
  category_ids?: string;
  fieldgroups?: "SOLD_HISTORY" | "ASPECTS";
  limit?: number;
  offset?: number;
}) {
  return ebayFetch(`/buy/marketplace_insights/v1_beta/item_sales/search`, params);
}

export const getSold = getSoldInsights;

export async function getCategorySuggestions(q: string) {
  return ebayFetch(
    `/commerce/taxonomy/v1/category_tree/${encodeURIComponent(DEFAULT_TREE_ID)}/get_category_suggestions`,
    { q: q || "" }
  );
}

export function getItemAspectsForCategory(args: { categoryId: string; treeId?: string }) {
  const treeId = args.treeId ?? DEFAULT_TREE_ID;
  return ebayFetch(
    `/commerce/taxonomy/v1/category_tree/${encodeURIComponent(treeId)}/item_aspects/category/${encodeURIComponent(
      args.categoryId
    )}`
  );
}

export function getListingViolations(params: { listing_id?: string }) {
  return ebayFetch(`/sell/compliance/v1/listing_violation`, params);
}

export async function getPoliciesByMarketplace(marketplaceId: string = MARKETPLACE) {
  const [payment, fulfillment, ret] = await Promise.all([
    ebayFetch(`/sell/account/v1/payment_policy`, { marketplace_id: marketplaceId }),
    ebayFetch(`/sell/account/v1/fulfillment_policy`, { marketplace_id: marketplaceId }),
    ebayFetch(`/sell/account/v1/return_policy`, { marketplace_id: marketplaceId }),
  ]);

  const payments = payment?.paymentPolicies ?? payment?.policies ?? payment ?? [];
  const fulfillments = fulfillment?.fulfillmentPolicies ?? fulfillment?.policies ?? fulfillment ?? [];
  const returns = ret?.returnPolicies ?? ret?.policies ?? ret ?? [];

  return { payment: payments, fulfillment: fulfillments, return: returns };
}

export const getPolicies = () => getPoliciesByMarketplace(MARKETPLACE);

function toEbayAspects(aspects: Record<string, any> | undefined | null) {
  const out: Record<string, string[]> = {};
  if (!aspects) return out;
  for (const [k, v] of Object.entries(aspects)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) out[k] = v.map(String);
    else out[k] = [String(v)];
  }
  return out;
}

/** Update existing offer (ensures locale headers) */
export async function updateOffer(offerId: string, offerInput: any) {
  const locale = LOCALE_BY_MARKETPLACE[MARKETPLACE] || "en-US";

  const res = await fetch(`${EBAY_BASE}/sell/inventory/v1/offer/${encodeURIComponent(offerId)}`, {
    method: "PUT",
    credentials: "include", // 
    headers: {
      "Content-Type": "application/json",
      "Content-Language": locale,
      "Accept-Language": locale,
      "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE,
    },
    body: JSON.stringify(offerInput),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`eBay API ${res.status} ${res.statusText} at ${res.url} ${text}`);
  }
  return res.json().catch(() => ({}));
}

/** Upsert inventory item */
export async function upsertInventoryItem(sku: string, body: any) {
  const locale = LOCALE_BY_MARKETPLACE[MARKETPLACE] || "en-US";
  const pathSku = encodeURIComponent(sku);

  const normalizedBody =
    body && body.product
      ? { ...body, product: { ...body.product, aspects: toEbayAspects(body.product.aspects) } }
      : body;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Content-Language": locale,
    "Accept-Language": locale,
    "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE,
    Accept: "application/json",
  };
  if (EBAY_OAUTH_TOKEN) headers.Authorization = `Bearer ${EBAY_OAUTH_TOKEN}`;

  const res = await fetch(`${EBAY_BASE}/sell/inventory/v1/inventory_item/${pathSku}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(normalizedBody),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`eBay API ${res.status} ${res.statusText} at ${res.url} ${text}`);
  }
  return res.json().catch(() => ({}));
}

/** Create offer (locale headers) */
export async function createOffer(offerInput: any) {
  const locale = LOCALE_BY_MARKETPLACE[MARKETPLACE] || "en-US";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Content-Language": locale,
    "Accept-Language": locale,
    "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE,
    Accept: "application/json",
  };
  if (EBAY_OAUTH_TOKEN) headers.Authorization = `Bearer ${EBAY_OAUTH_TOKEN}`;

  const res = await fetch(`${EBAY_BASE}/sell/inventory/v1/offer`, {
    method: "POST",
    credentials: "include", // ✅
    headers,
    body: JSON.stringify(offerInput),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`eBay API ${res.status} ${res.statusText} at ${res.url} ${text}`);
  }
  return res.json().catch(() => ({}));
}

/** Publish offer */
export async function publishOffer(offerId: string) {
  const locale = LOCALE_BY_MARKETPLACE[MARKETPLACE] || "en-US";

  const headers: Record<string, string> = {
    "Content-Language": locale,
    "Accept-Language": locale,
    "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE,
    Accept: "application/json",
  };
  if (EBAY_OAUTH_TOKEN) headers.Authorization = `Bearer ${EBAY_OAUTH_TOKEN}`;

  const res = await fetch(
    `${EBAY_BASE}/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/publish`,
    { method: "POST", credentials: "include", headers }
  );
  
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`eBay API ${res.status} ${res.statusText} at ${res.url} ${text}`);
  }
  return res.json().catch(() => ({}));
}

// BUY Browse
export function ebayGetItemById(restfulItemId: string) {
  return ebayFetch(`/buy/browse/v1/item/${encodeURIComponent(restfulItemId)}`);
}

// BUY Browse — classic 12–15 digit listing number
export function ebayGetItemByLegacyId(legacyItemId: string) {
  return ebayFetch(`/buy/browse/v1/item/get_item_by_legacy_id`, { legacy_item_id: legacyItemId });
}

export async function ebayGetItemAuto(idOrUrl: string) {
  const trimmed = (idOrUrl || "").trim();
  const looksRestful = trimmed.includes("|");
  const looksNumeric = /^\d{12,15}$/.test(trimmed);
  if (looksRestful) return ebayGetItemById(trimmed);
  if (looksNumeric) return ebayGetItemByLegacyId(trimmed);
  try {
    const u = new URL(trimmed);
    const parts = u.pathname.split("/").filter(Boolean);
    const tail = parts[parts.length - 1] || "";
    if (/^\d{12,15}$/.test(tail)) return ebayGetItemByLegacyId(tail);
    const qId =
      u.searchParams.get("item") || u.searchParams.get("itm") || u.searchParams.get("itemid") || "";
    if (/^\d{12,15}$/.test(qId)) return ebayGetItemByLegacyId(qId);
  } catch {}
  return ebayGetItemByLegacyId(trimmed);
}

/** Convenience wrapper used by the modal (taxonomy) */
export async function getAspects(categoryId: string) {
  return ebayFetch(
    `/commerce/taxonomy/v1/category_tree/${encodeURIComponent(
      DEFAULT_TREE_ID
    )}/item_aspects/category/${encodeURIComponent(categoryId)}`
  );
}

export function getOffersBySku(sku: string) {
  return ebayFetch(`/sell/inventory/v1/offer`, { sku });
}

export function getInventoryLocations(params?: { limit?: number; offset?: number }) {
  return ebayFetch(`/sell/inventory/v1/location`, {
    limit: params?.limit ?? 200,
    offset: params?.offset,
  });
}

export function getItemConditionPolicies(args: { marketplaceId: string; categoryId: string }) {
  const { marketplaceId, categoryId } = args;
  return ebayFetch(
    `/sell/metadata/v1/marketplace/${encodeURIComponent(
      marketplaceId
    )}/get_item_condition_policies`,
    { category_id: categoryId }
  );
}

/* ───────────────────────────── Directus helpers (kept) ───────────────────────────── */

function getDirectusFileUrl(fileId: string): string {
  return `${DIRECTUS_BASE.replace(/\/+$/, "")}/assets/${fileId}`;
}

function getAuthToken(): string | null {
  const USER_KEY = "synergy_auth_token";
  try {
    return localStorage.getItem(USER_KEY);
  } catch {
    return null;
  }
}

/** Alias if you prefer your earlier method names */
export const upsertItem = upsertInventoryItem;

/**
 * Searches our eBay inventory for a similar, already-posted listing
 * based on product details (e.g., model number, name).
 * NOTE: this now targets the *same* FastAPI (API_BASE) to avoid stray :3030 calls.
 */
export async function getExistingEbayListingLink(criteria: {
  productName: string;
  specs: any;
  grade: string;
}): Promise<string | null> {
  try {
    const res = await jfetch(`${API_BASE}/rows/search_posted`, {
      method: "POST",
      credentials: "include", // ✅
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(criteria),
    });
    if (res && typeof (res as any).ebayItemUrl === "string") {
      return (res as any).ebayItemUrl;
    }
    return null;
  } catch (error) {
    console.error("Failed to check for existing eBay listing:", error);
    return null;
  }
}

/* ───────────────────────────── Aggregate client export ───────────────────────────── */

export const dataClient = {
  BASE,
  // categories
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  // rows
  getRows,
  saveRows,
  patchRow,
  deleteRow,
  // health & prefix
  health,
  peekPrefix,
  takePrefix,
  setNext,
  // market avg helpers
  getBrowseAvg,
  getSoldAvg,
  // eBay helpers
  getBrowse,
  getSoldInsights,
  getSold,
  getCategorySuggestions,
  getItemAspectsForCategory,
  getAspects,
  getListingViolations,
  getPoliciesByMarketplace,
  upsertInventoryItem,
  upsertItem,
  createOffer,
  publishOffer,
  ebayGetItemById,
  ebayGetItemByLegacyId,
  ebayGetItemAuto,
  getInventoryLocations,
  getOffersBySku,
  getItemConditionPolicies,
  updateOffer,
  // new function
  getExistingEbayListingLink,
  DIRECTUS_BASE,
  getDirectusFileUrl,
};

export default dataClient;
