import * as React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CustomCheckbox } from "@/components/ui/custom-checkbox";
import { ThemeToggle } from "@/components/ThemeToggle";
import { openPrintWindow } from "@/helpers/printLabel";
import {
  Barcode,
  Box,
  Boxes,
  Download,
  Factory,
  Filter,
  MoveLeft,
  MoveRight,
  Pencil,
  Plus,
  Minus,
  Printer,
  RefreshCw,
  Search,
  Settings2,
  Tag,
  DollarSign,
  Sparkles,
  Receipt,
  User,
  CreditCard,
  CalendarClock,
  Copy as CopyIcon,
  ArrowUpDown,
  Percent,
  ChevronRight,
  CalendarDays,
  ChevronLeft,
  ListIcon,
  CalendarIcon,
  X,
  XCircle,
  Check,
  Layers3,
  ChevronDown
} from "lucide-react";

/* ---------------- types ---------------- */
type StockRow = {
  synergy_id: string;
  product_name: string;
  msrpDisplay?: string;
  ourPriceDisplay?: string;
  qty_on_hand: number;
  sold_count: number;
  updated_at: string;
  // optionally provided by backend (detail):
  first_added?: string | null;
  last_sold?: string | null;
};
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type SortKey =
  | "synergy_id"
  | "product_name"
  | "msrp"
  | "price"
  | "qty_on_hand"
  | "sold_count"
  | "updated_at";

type DetailPayload = {
  synergy_id: string;
  product_name: string;
  msrpDisplay?: string;
  ourPriceDisplay?: string;
  qty_on_hand: number;
  sold_count: number;
  updated_at: string;
  first_added?: string | null;
  last_sold?: string | null;
};

/* ---- Orders API shapes (UI integration) ---- */
type OrderSummary = {
  order_id: string;
  created_at: string;
  employee?: string | null;
  payment_type?: string | null;
  tax_exempt: boolean;
  tax_rate: number;
  subtotal_cents: number;
  tax_cents: number;
  final_total_cents: number;
};

type OrderLine = {
  kind: "inv" | "misc";
  synergy_id?: string | null;
  product_name?: string | null;
  qty: number;
  unit_price_cents: number;
  line_total_cents: number;
};

// ---- Categories: types + API helpers (add-only) ----
type CatCriterion = {
  prefixes?: string[];       // e.g., ["TOY-","PS5-"]
  words?: string[];          // match in synergy_id
  productWords?: string[];   // match in product_name
  regex?: string;            // optional, one regex per rule
  priority?: number;         // higher wins ties
};

type CategoryRule = {
  id: string;
  name: string;
  color?: string;            // hex or tailwind token
  criteria: CatCriterion;
};

type CategorySuggestRequest = {
  synergyIds: string[];      // ask server for suggestions for these IDs
};

type CategorySuggestResponse = {
  suggestions: Record<string, string>; // sid -> category name
};

// REST helpers (adjust paths if your routes differ)
const API_BASE = "/backend";

async function getCategoryRules(): Promise<CategoryRule[]> {
  const r = await fetch(`${API_BASE}/labels/categories/rules`, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`rules ${r.status}`);
  const raw = await r.json();

  // normalize to {id,name,color,criteria:{prefixes,words,productWords,regex,priority}}
  return (Array.isArray(raw) ? raw : []).map((x: any) => ({
    id: x.id ?? x.name ?? x.label ?? "",
    name: x.name ?? x.label ?? x.id ?? "",
    color: x.color ?? undefined,
    criteria: {
      prefixes: toList(x.criteria?.prefixes ?? x.criteria?.prefix ?? x.criteria?.startsWith ?? x.prefix ?? x.startsWith),
      words: toList(x.criteria?.words ?? x.words),
      productWords: toList(x.criteria?.productWords ?? x.criteria?.product_words ?? x.product_words),
      regex: x.criteria?.regex ?? x.regex ?? undefined,
      priority: Number(x.criteria?.priority ?? x.priority ?? 0) || 0,
    },
  }));
}
async function putCategoryRules(rules: CategoryRule[]): Promise<void> {
  const r = await fetch(`${API_BASE}/labels/categories/rules`, {
    method: "PUT", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ rules })
  });
  if (!r.ok) throw new Error(`save rules ${r.status}`);
}



async function getCategoryOverrides(): Promise<Record<string,string>> {
  const r = await fetch(`${API_BASE}/labels/categories/overrides`, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`overrides ${r.status}`);
  const j = await r.json().catch(() => ({}));
  return unwrapOverrides(j);
}
async function putCategoryOverride(synergyId: string, category: string | null): Promise<void> {
  const r = await fetch(`${API_BASE}/labels/categories/override`, {
    method: "PUT", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ synergyId, category })
  });
  if (!r.ok) throw new Error(`override ${r.status}`);
}

async function getCategoryAliases(): Promise<Record<string,string>> {
  const r = await fetch(`${API_BASE}/labels/categories/aliases`, { headers: {Accept:"application/json"} });
  if (!r.ok) throw new Error(`aliases ${r.status}`);
  return r.json();
}
async function putCategoryAlias(name: string, displayName: string | null): Promise<void> {
  const r = await fetch(`${API_BASE}/labels/categories/alias`, {
    method: "PUT",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ name, displayName }),
  });
  if (!r.ok) throw new Error(`alias ${r.status}`);
}
function toList(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(x => String(x));
  if (typeof v === "string") {
    return v.split(",").map(s => s.trim()).filter(Boolean);
  }
  if (typeof v === "object") return Object.values(v).map(String);
  return [String(v)];
}
async function postCategorySuggest(payload: CategorySuggestRequest): Promise<CategorySuggestResponse> {
  // try POST first
  try {
    const r = await fetch(`${API_BASE}/labels/categories/suggest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    if (r.ok) return r.json();
  } catch { /* fall through */ }

  // fallback: GET /suggest?ids=A,B,C
  const qs = new URLSearchParams({ ids: payload.synergyIds.join(",") }).toString();
  const g = await fetch(`${API_BASE}/labels/categories/suggest?${qs}`, { headers: { Accept: "application/json" } });
  if (!g.ok) return { suggestions: {} };

  const data = await g.json();
  // accept either { suggestions: {sid: "Category"} } or [{sid, category}] shapes
  if (data && typeof data === "object" && data.suggestions) return { suggestions: data.suggestions };
  if (Array.isArray(data)) {
    const map: Record<string,string> = {};
    for (const row of data) {
      if (row && row.sid && row.category) map[row.sid] = row.category;
    }
    return { suggestions: map };
  }
  return { suggestions: {} };
}

async function apiCatGetRules(): Promise<CategoryRule[]> {
  const r = await fetch(`${API_BASE}/labels/categories/rules`, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`rules ${r.status}`);
  const rows = await r.json();
  return Array.isArray(rows) ? rows : [];
}

async function apiCatUpsertRule(rule: CategoryRule): Promise<void> {
  // backend accepts { rules: [...] }
  const r = await fetch(`${API_BASE}/labels/categories/rules`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ rules: [rule] }),
  });
  if (!r.ok) throw new Error(`upsert rule ${r.status}`);
}

async function apiCatGetOverrides(): Promise<Record<string, string>> {
  const r = await fetch(`${API_BASE}/labels/categories/overrides`, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`overrides ${r.status}`);
  return (await r.json()) || {};
}

async function apiCatSetOverride(sid: string, categoryId: string | null): Promise<void> {
  // mapping form is supported by backend
  const r = await fetch(`${API_BASE}/labels/categories/overrides`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ [sid]: categoryId }),
  });
  if (!r.ok) throw new Error(`set override ${r.status}`);
}

async function apiCatSuggest(ids: string[]): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const r = await fetch(`${API_BASE}/labels/categories/suggest?ids=${encodeURIComponent(ids.join(","))}`, {
    headers: { Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`suggest ${r.status}`);
  const data = await r.json();
  return (data && data.suggestions) || {};
}
async function loadCategoryData() {
  const [rules, overrides] = await Promise.allSettled([
    getCategoryRules(),
    getCategoryOverrides(),
  ]);

  if (rules.status === "fulfilled") setCatRules(rules.value || []);
  else { console.warn("category rules failed:", rules.reason); setCatRules([]); }

  if (overrides.status === "fulfilled") setCatOverrides(overrides.value || {});
  else { console.warn("category overrides failed:", overrides.reason); setCatOverrides({}); }

  if (items.length) {
    postCategorySuggest({ synergyIds: items.map(i => i.synergy_id) })
      .then(s => s?.suggestions && setCatAuto(s.suggestions))
      .catch(() => {});
  }
}
function asStrArray(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string") {
    // allow comma-separated lists too
    return v.split(",").map(s => s.trim()).filter(Boolean);
  }
  if (typeof v === "object") return Object.values(v).map(String);
  return [String(v)];
}

function normalizeCategoryRule(r: any): CategoryRule {
  const crit = r?.criteria ?? r?.crit ?? r ?? {};
  const prefixes     = asStrArray(crit.prefixes ?? crit.prefix ?? crit.startsWith);
  const words        = asStrArray(crit.words ?? crit.contains ?? crit.includes);
  const productWords = asStrArray(crit.productWords ?? crit.product_words ?? crit.productContains);
  const regex        = crit.regex ?? crit.pattern ?? null;
  const priority     = Number.isFinite(crit.priority) ? crit.priority
                     : Number.isFinite(crit.prio) ? crit.prio
                     : 0;

  return {
    id: String(r.id ?? r.name ?? Math.random().toString(36).slice(2)),
    name: String(r.name ?? r.label ?? "Unnamed"),
    color: r.color ?? r.colour ?? r.color_hex ?? undefined,
    criteria: { prefixes, words, productWords, regex, priority },
  };
}



function unwrapOverrides(j: any): Record<string, string> {
  if (j && typeof j === "object" && !Array.isArray(j)) {
    return (j.overrides && typeof j.overrides === "object") ? j.overrides : j as Record<string,string>;
  }
  if (Array.isArray(j)) {
    const out: Record<string, string> = {};
    for (const it of j) {
      const sid = it.synergyId ?? it.synergy_id ?? it.sid;
      const cat = it.category ?? it.name;
      if (sid && cat) out[String(sid)] = String(cat);
    }
    return out;
  }
  return {};
}

function unwrapRules(j: any): any[] {
  if (Array.isArray(j)) return j;
  if (Array.isArray(j?.rules)) return j.rules;
  if (Array.isArray(j?.items)) return j.items;
  return [];
}


type OrderDetail = OrderSummary & { lines: OrderLine[] };

function toCentsLoose(v: any): number {
  if (v == null || v === "") return 0;
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  // If looks like whole dollars but API gave dollars, convert to cents;
  // If already cents (>= 100 and integer), keep it.
  if (Math.abs(n) < 1) {
    // e.g., 0.05 (5% tax) – not a money amount; treat as dollars
    return Math.round(n * 100);
  }
  if (Number.isInteger(n) && Math.abs(n) >= 1000) return n; // likely cents already
  if (!Number.isInteger(n)) return Math.round(n * 100); // dollars -> cents
  // Small integers (e.g., 5) are dollars
  return n * 100;
}


function normalizeLine(y: any): OrderLine {
  const unit = toCentsLoose(y.unit_price_cents ?? y.unitPriceCents ?? y.unit_price ?? y.unit ?? 0);
  let line = toCentsLoose(y.line_total_cents ?? y.lineTotalCents ?? y.total ?? unit * (y.qty ?? 1));
  const qty = Number(y.qty ?? 1) || 1;
  if (!line && unit && qty) line = unit * qty;
  return {
    kind: (y.kind ?? y.type ?? "inv") === "misc" ? "misc" : "inv",
    synergy_id: y.synergy_id ?? y.synergyId ?? null,
    product_name: y.product_name ?? y.name ?? null,
    qty,
    unit_price_cents: unit,
    line_total_cents: line,
  };
}

async function fetchOrderDetailSmart(orderId: string): Promise<OrderDetail> {
  // Try new endpoint first
  const r1 = await fetch(`${API_BASE}/labels/orders/${encodeURIComponent(orderId)}`, {
    headers: { Accept: "application/json" },
  });
  if (r1.ok) {
    const data = await r1.json();
    return normalizeDetail(data);
  }
  // Fallback to legacy: /labels/order?order_id=...
  const r2 = await fetch(`${API_BASE}/labels/order?order_id=${encodeURIComponent(orderId)}`, {
    headers: { Accept: "application/json" },
  });
  if (!r2.ok) {
    const t = await r2.text().catch(() => "");
    throw new Error(`Order detail failed (${r2.status}): ${t.slice(0, 160)}`);
  }
  const data = await r2.json();
  // Some legacy payloads nest under "order"
  return normalizeDetail(data.order ?? data);
}

function cents(n?: number | null) {
  return typeof n === "number" ? `$${(n / 100).toFixed(2)}` : "$0.00";
}

// client-side filtering/sorting
type OrdersView = {
  q: string;
  employee: string;
  payment: "any" | "Cash" | "Card" | "Gift Card";
  tax: "any" | "taxed" | "exempt";
  minTotal: string;
  maxTotal: string;
  size: number;
  sort: "new" | "old" | "high" | "low";
};


/* ---------- tiny UI helpers ---------- */
function TinySpinner({ size = 16 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block animate-spin rounded-full border-2 border-primary/30 border-t-primary"
      style={{ width: size, height: size, animationDuration: "800ms" }}
    />
  );
}
const cls = (...a: Array<string | false | undefined>) => a.filter(Boolean).join(" ");
const toNum = (s?: string) => {
  if (!s) return undefined;
  const n = Number(String(s).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : undefined;
};
const fmtMoney = (n?: number) =>
  n == null || Number.isNaN(n) ? "" : `$${n.toFixed(2)}`;

const centsToMoney = (c?: number | null) =>
  typeof c === "number" ? `$${(c / 100).toFixed(2)}` : "—";

/* ---------- robust fetch helpers ---------- */
async function readJsonOrThrow(res: Response) {
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("application/json")) {
    const text = await res.text().catch(() => "");
    throw new Error(`Expected JSON but got "${ct}". Snippet: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function fetchStockApi(params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  const r = await fetch(`${API_BASE}/labels/stock?${qs}`, {
    headers: { Accept: "application/json" },
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`Stock fetch failed (${r.status}): ${txt.slice(0, 200)}`);
  }
  return readJsonOrThrow(r);
}

async function putAdjustQty(synergyId: string, qtyOnHand: number) {
  const r = await fetch(`${API_BASE}/labels/adjust`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ synergyId, qtyOnHand }),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`Adjust failed (${r.status}): ${txt.slice(0, 200)}`);
  }
  return readJsonOrThrow(r);
}

async function ensurePriceOnServer(row: StockRow, newPrice: number) {
  const r = await fetch(`${API_BASE}/labels/ensure`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      productName: row.product_name,
      price: newPrice,
      synergyId: row.synergy_id,
      qty: 0, // do not change counts here
    }),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`Price update failed (${r.status}): ${txt.slice(0, 200)}`);
  }
  return readJsonOrThrow(r);
}

async function fetchDetailBySid(sid: string): Promise<DetailPayload> {
  const r = await fetch(`${API_BASE}/labels/detail?synergy_id=${encodeURIComponent(sid)}`, {
    headers: { Accept: "application/json" },
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`Detail fetch failed (${r.status}): ${txt.slice(0, 200)}`);
  }
  return readJsonOrThrow(r);
}

/* ---- Orders fetchers (UI integration) ---- */
async function fetchOrders(limit = 50): Promise<{ items: any[] }> {
  const r = await fetch(`${API_BASE}/labels/orders?limit=${limit}`, {
    headers: { Accept: "application/json" },
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`Orders fetch failed (${r.status}): ${txt.slice(0, 200)}`);
  }
  return readJsonOrThrow(r);
}

// canonical endpoint
async function fetchOrderById(orderId: string): Promise<OrderDetail> {
  const r = await fetch(`${API_BASE}/labels/orders/${encodeURIComponent(orderId)}`, {
    headers: { Accept: "application/json" },
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`Order detail failed (${r.status}): ${txt.slice(0, 200)}`);
  }
  const raw = await readJsonOrThrow(r);
  return normalizeDetail(raw);
}

// legacy fallback: GET /labels/order?order_id=...
async function fetchOrderByQuery(orderId: string): Promise<any> {
  const r = await fetch(`${API_BASE}/labels/order?order_id=${encodeURIComponent(orderId)}`, {
    headers: { Accept: "application/json" },
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`Legacy order detail failed (${r.status}): ${txt.slice(0, 200)}`);
  }
  return readJsonOrThrow(r);
}

/* ---------- normalization helpers (robust against backend variations) ---------- */
function toCents(v: any): number {
  if (v == null || v === "") return 0;
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  // If it looks like cents already (big whole number), keep it.
  if (Number.isInteger(n) && Math.abs(n) >= 1000) return n; // ≥ $10 in cents
  // Otherwise treat it as dollars.
  return Math.round(n * 100);
}

function normalizeSummary(o: any): OrderSummary {
  const id = (o && (o.order_id || o.orderId || o.sales_id || o.salesId || o.id)) || "";

  const subtotal_cents = toCents(o.subtotal_cents ?? o.subtotal ?? o.subTotal ?? 0);
  const tax_cents      = toCents(o.tax_cents ?? o.sales_tax ?? o.salesTax ?? o.tax ?? 0);
  const ft_raw         = o.final_total_cents ?? o.final_total ?? o.total ?? o.finalTotal;
  const final_total_cents = toCents(ft_raw ?? 0) || (subtotal_cents + tax_cents);

  return {
    order_id: String(id),
    created_at: String(o.created_at || o.date || o.createdAt || new Date().toISOString()),
    employee: o.employee ?? o.clerk ?? null,
    payment_type: o.payment_type ?? o.payment ?? o.paymentType ?? null,
    tax_exempt: Boolean(o.tax_exempt ?? o.taxExempt ?? false),
    tax_rate: typeof o.tax_rate === "number" ? o.tax_rate : Number(o.taxRate || 0) || 0,
    subtotal_cents,
    tax_cents,
    final_total_cents,
  };
}


function normalizeDetail(d: any): OrderDetail {
  const summary = normalizeSummary(d);
  const lines: OrderLine[] = Array.isArray(d.lines)
    ? d.lines.map((ln: any) => ({
        kind: (ln.kind === "manual" || ln.kind === "misc") ? "misc" : "inv",
        synergy_id: ln.synergy_id ?? ln.sid ?? ln.synergyId ?? null,
        product_name: ln.product_name ?? ln.productName ?? ln.name ?? null, // include productName
        qty: Number(ln.qty ?? ln.quantity ?? 1),
        unit_price_cents: toCents(ln.unit_price_cents ?? ln.unitPrice ?? ln.price ?? 0),
        line_total_cents: toCents(
          ln.line_total_cents ?? ln.lineTotal ?? ln.total ?? (ln.qty ?? 1) * (ln.unitPrice ?? ln.price ?? 0)
        ),
      }))
    : [];
  return { ...summary, lines };
}


/* =================================================================== */



async function apiCatSaveRules(rules: CategoryRule[]): Promise<void> {
  const r = await fetch(`/labels/categories/rules`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rules }),
  });
  if (!r.ok) throw new Error(`save rules ${r.status}`);
}



async function apiCatGetAliases(): Promise<Record<string, string>> {
  const r = await fetch(`/labels/categories/aliases`);
  if (!r.ok) throw new Error(`aliases ${r.status}`);
  return await r.json();
}

async function apiCatPutAlias(name: string, displayName: string | null): Promise<void> {
  const r = await fetch(`/labels/categories/alias`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, displayName }),
  });
  if (!r.ok) throw new Error(`alias ${r.status}`);
}

export default function LabelInventoryPage() {
  /* -------- filters & state -------- */
  const [q, setQ] = React.useState("");
  const [inStockOnly, setInStockOnly] = React.useState(true);
  const [prefix, setPrefix] = React.useState("");
  const [minPrice, setMinPrice] = React.useState<string>("");
  const [maxPrice, setMaxPrice] = React.useState<string>("");
  const [hasMsrpOnly, setHasMsrpOnly] = React.useState(false);
  const [dateFrom, setDateFrom] = React.useState<string>("");
  const [dateTo, setDateTo] = React.useState<string>("");

  const [items, setItems] = React.useState<StockRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState<number>(() =>
    Number(localStorage.getItem("inv.pageSize") || 50)
  );

  const [autoRefresh, setAutoRefresh] = React.useState<boolean>(
    () => localStorage.getItem("inv.autoRefresh") === "1"
  );
  const [autoRefreshSec, setAutoRefreshSec] = React.useState<number>(() =>
    Number(localStorage.getItem("inv.autoRefreshSec") || 20)
  );

  const [sortKey, setSortKey] = React.useState<SortKey>("updated_at");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");
  const [selected, setSelected] = React.useState<Record<string, boolean>>({});

  const [showNewLabel, setShowNewLabel] = React.useState(false);
  const [showColumns, setShowColumns] = React.useState<Record<string, boolean>>(
    () => {
      const def = { msrp: true, price: true, onhand: true, sold: true, updated: true };
      try {
        const raw = localStorage.getItem("inv.columns");
        return raw ? { ...def, ...JSON.parse(raw) } : def;
      } catch {
        return def;
      }
    }
  );

  const [adjustOpen, setAdjustOpen] = React.useState<null | StockRow>(null);
  const [adjustQtyValue, setAdjustQtyValue] = React.useState<string>("");
  const [editPriceOpen, setEditPriceOpen] = React.useState<null | StockRow>(null);
  const [editPriceValue, setEditPriceValue] = React.useState<string>("");

  const [nlProduct, setNlProduct] = React.useState("");
  const [nlMsrp, setNlMsrp] = React.useState("");
  const [nlPrice, setNlPrice] = React.useState("");
  const [nlPrefix, setNlPrefix] = React.useState("");
  const [nlQty, setNlQty] = React.useState("1");
  const [nlBusy, setNlBusy] = React.useState(false);

  const [scan, setScan] = React.useState("");
  const [scanBusy, setScanBusy] = React.useState(false);
  const [returnMode, setReturnMode] = React.useState<boolean>(
    () => localStorage.getItem("inv.returnMode") === "1"
  );

  // Product detail modal
  const [detailOpen, setDetailOpen] = React.useState<null | {
    sid: string;
    busy: boolean;
    data?: DetailPayload;
  }>(null);

  // Orders / Logs modal state
  const [ordersOpen, setOrdersOpen] = React.useState(false);
  const [ordersBusy, setOrdersBusy] = React.useState(false);
  const [orders, setOrders] = React.useState<OrderSummary[]>([]);
  const [selectedOrder, setSelectedOrder] = React.useState<OrderDetail | null>(null);
  const [orderError, setOrderError] = React.useState<string | null>(null);

  // ---- Categories state ----
  const [catRules, setCatRules] = React.useState<CategoryRule[]>([]);
  const [catOverrides, setCatOverrides] = React.useState<Record<string,string>>({});
  const [catAuto, setCatAuto] = React.useState<Record<string,string>>({}); // from /suggest (optional)
  const [categoryMode, setCategoryMode] = React.useState<"flat"|"grouped">(
    (localStorage.getItem("inv.categoryMode") as any) || "grouped"
  );
  const [categoryFilter, setCategoryFilter] = React.useState<string[]>(() => {
    const raw = localStorage.getItem("inv.categoryFilter");
    try { return raw ? JSON.parse(raw) : []; } catch { return []; }
  });
  const [collapsedCats, setCollapsedCats] = React.useState<Record<string, boolean>>({});

    
const [catAliases, setCatAliases] = React.useState<Record<string,string>>({});

  const [catModal, setCatModal] = React.useState<{
    open: boolean;
    sid: string | null;
    product?: string;
  }>({ open: false, sid: null });


  React.useEffect(() => {
    localStorage.setItem("inv.categoryMode", categoryMode);
  }, [categoryMode]);
  React.useEffect(() => {
    localStorage.setItem("inv.categoryFilter", JSON.stringify(categoryFilter));
  }, [categoryFilter]);
  React.useEffect(() => {
  getCategoryAliases().then(setCatAliases).catch(() => {});
}, []);

// load once at page open (and whenever you want to refresh from elsewhere)
React.useEffect(() => {
  (async () => {
    try {
      const [rules, overrides] = await Promise.all([apiCatGetRules(), apiCatGetOverrides()]);
      setCatRules(rules || []);
      setCatOverrides(overrides || {});
    } catch (e) {
      console.warn("cat init:", e);
      setCatRules([]);
      setCatOverrides({});
    }
  })();
}, []);
  // compile simple matcher for a rule
  function compileRule(rule: any) {
  const crit = rule.criteria ?? rule.crit ?? {}; // accept both
  const rxStr = crit.regex ?? rule.regex ?? null;
  const rx = rxStr ? new RegExp(String(rxStr), "i") : null;

  // accept alternate key names; coerce to arrays; lowercase for matching
  const pref = toList(crit.prefixes ?? crit.prefix ?? crit.startsWith)
    .map(s => s.toLowerCase());
  const w = toList(crit.words ?? crit.word ?? crit.contains)
    .map(s => s.toLowerCase());
  const pw = toList(crit.productWords ?? crit.product_words ?? crit.nameWords)
    .map(s => s.toLowerCase());

  const prio = Number(crit.priority ?? rule.priority ?? 0) || 0;

  return (row: StockRow) => {
    const sid = (row.synergy_id || "").toLowerCase();
    const name = (row.product_name || "").toLowerCase();

    if (rx && (rx.test(sid) || rx.test(name))) return prio;
    if (pref.some(p => p && sid.startsWith(p))) return prio;
    if (w.some(s => s && sid.includes(s))) return prio;
    if (pw.some(s => s && name.includes(s))) return prio;
    return null;
  };
}


  // Resolve color for a category name (rule color -> deterministic fallback)
  const colorForCategory = React.useCallback((name?: string | null) => {
    if (!name) return "#EEE";
    const rule = catRules.find(r => r.name === name);
    if (rule?.color) return rule.color;
    // fallback: deterministic pastel from name
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
    return `hsl(${h}, 70%, 85%)`;
  }, [catRules]);

  const displayCategory = React.useCallback((name?: string | null) => {
  if (!name) return "—";
  return catAliases[name] || name;
}, [catAliases]);

  // Resolve the category for a row (override > rules > autoSuggestion)
  const pickCategory = React.useMemo(() => {
    const compiled = catRules.map(r => ({r, f: compileRule(r)}));
    return (row: StockRow): string | null => {
      const ov = catOverrides[row.synergy_id];
      if (ov) return ov;

      // rules – pick highest priority score
      let best: {score: number; name: string} | null = null;
      for (const {r, f} of compiled) {
        const score = f(row);
        if (score == null) continue;
        if (!best || score > best.score) best = { score, name: r.name };
      }
      if (best) return best.name;

      // optional suggestions from /suggest
      return catAuto[row.synergy_id] || null;
    };
  }, [catRules, catOverrides, catAuto]);

function safeRegex(pat?: string | null): RegExp | null {
  if (!pat) return null;
  try { return new RegExp(pat, "i"); }
  catch { console.warn("Bad category regex from server:", pat); return null; }
}
  

  async function loadCategoryData() {
  try {
    const [rules, overrides] = await Promise.allSettled([
      getCategoryRules(),
      getCategoryOverrides(),
    ]);

    if (rules.status === "fulfilled") setCatRules(rules.value || []);
    else {
      console.warn("category rules failed:", rules.reason);
      setCatRules([]);
    }

    if (overrides.status === "fulfilled") setCatOverrides(overrides.value || {});
    else {
      console.warn("category overrides failed:", overrides.reason);
      setCatOverrides({});
    }

    // Suggestions are optional. Try, but never block UI on failure.
    if (items.length) {
      postCategorySuggest({ synergyIds: items.map(i => i.synergy_id) })
        .then(s => s?.suggestions && setCatAuto(s.suggestions))
        .catch(() => {});
    }
  } catch (e: any) {
    console.warn("category init failed:", e?.message || e);
  }
}

  // Kick it once on mount + when items first load
  React.useEffect(() => { loadCategoryData(); /* once */ }, []);
  React.useEffect(() => {
    if (items.length) postCategorySuggest({ synergyIds: items.map(i => i.synergy_id) })
      .then(s => s && setCatAuto(s.suggestions || {}))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  const itemCategory: Record<string,string> = React.useMemo(() => {
    const out: Record<string,string> = {};
    for (const r of items) {
      const c = pickCategory(r);
      if (c) out[r.synergy_id] = c;
    }
    return out;
  }, [items, pickCategory]);

  // Legend data (counts per category among filtered items)
  const legend = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const r of items) {
      const c = pickCategory(r) || "Uncategorized";
      map.set(c, (map.get(c) || 0) + 1);
    }
    const arr = Array.from(map.entries()).map(([name, count]) => ({
      name,
      count,
      color: colorForCategory(name)
    }));
    arr.sort((a,b) => b.count - a.count || a.name.localeCompare(b.name));
    return arr;
  }, [items, pickCategory, colorForCategory]);

  // category filter application
  const filteredItems = React.useMemo(() => {
    if (!categoryFilter.length) return items;
    const ok = new Set(categoryFilter);
    return items.filter(r => ok.has(pickCategory(r) || "Uncategorized"));
  }, [items, categoryFilter, pickCategory]);

  // groups for grouped mode
  const groups = React.useMemo(() => {
    const map = new Map<string, StockRow[]>();
    for (const r of filteredItems) {
      const name = pickCategory(r) || "Uncategorized";
      if (!map.has(name)) map.set(name, []);
      map.get(name)!.push(r);
    }
    const result = Array.from(map.entries())
      .map(([name, rows]) => ({ name, color: colorForCategory(name), rows }))
      .sort((a,b) => a.name.localeCompare(b.name));
    return result;
  }, [filteredItems, pickCategory, colorForCategory]);

  // Orders view filters (client-side for now, scalable to server-side later)
  const [ov, setOv] = React.useState({
    q: "",
    employee: "",
    payment: "any" as "any" | "Cash" | "Card" | "Gift Card",
    tax: "any" as "any" | "taxed" | "exempt",
    minTotal: "",
    maxTotal: "",
    sort: "new" as "new" | "old" | "high" | "low",
    size: Number(localStorage.getItem("orders.size") || 50),
    from: "",
    to: "",
  });

  React.useEffect(() => {
    localStorage.setItem("inv.pageSize", String(pageSize));
  }, [pageSize]);
  React.useEffect(() => {
    localStorage.setItem("inv.autoRefresh", autoRefresh ? "1" : "0");
  }, [autoRefresh]);
  React.useEffect(() => {
    localStorage.setItem("inv.autoRefreshSec", String(autoRefreshSec));
  }, [autoRefreshSec]);
  React.useEffect(() => {
    localStorage.setItem("inv.columns", JSON.stringify(showColumns));
  }, [showColumns]);
  React.useEffect(() => {
    localStorage.setItem("inv.returnMode", returnMode ? "1" : "0");
  }, [returnMode]);

  /* -------- fetch & massage data -------- */
  const fetchStock = React.useCallback(async () => {
    try {
      setLoading(true);
      const base: Record<string, string> = {
        page: String(page),
        page_size: String(pageSize),
        in_stock_only: String(inStockOnly),
      };
      if (q.trim()) base.q = q.trim();
      const data = await fetchStockApi(base);
      let rows: StockRow[] = data.items || [];

      if (prefix.trim()) {
        const P = prefix.trim().toUpperCase();
        rows = rows.filter((r) => r.synergy_id.toUpperCase().startsWith(P));
      }
      const minP = minPrice ? Number(minPrice) : undefined;
      const maxP = maxPrice ? Number(maxPrice) : undefined;
      if (minP != null || maxP != null) {
        rows = rows.filter((r) => {
          const price = toNum(r.ourPriceDisplay) ?? 0;
          if (minP != null && price < minP) return false;
          if (maxP != null && price > maxP) return false;
          return true;
        });
      }
      if (hasMsrpOnly) rows = rows.filter((r) => (toNum(r.msrpDisplay) ?? 0) > 0);
      if (dateFrom) {
        const from = new Date(dateFrom + "T00:00:00").getTime();
        rows = rows.filter((r) => new Date(r.updated_at).getTime() >= from);
      }
      if (dateTo) {
        const to = new Date(dateTo + "T23:59:59").getTime();
        rows = rows.filter((r) => new Date(r.updated_at).getTime() <= to);
      }

      rows.sort((a, b) => {
        const dir = sortDir === "asc" ? 1 : -1;
        switch (sortKey) {
          case "synergy_id":
            return a.synergy_id.localeCompare(b.synergy_id) * dir;
          case "product_name":
            return a.product_name.localeCompare(b.product_name) * dir;
          case "msrp":
            return ((toNum(a.msrpDisplay) ?? -1) - (toNum(b.msrpDisplay) ?? -1)) * dir;
          case "price":
            return ((toNum(a.ourPriceDisplay) ?? -1) - (toNum(b.ourPriceDisplay) ?? -1)) * dir;
          case "qty_on_hand":
            return (a.qty_on_hand - b.qty_on_hand) * dir;
          case "sold_count":
            return (a.sold_count - b.sold_count) * dir;
          case "updated_at":
            return (
              (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) *
              dir
            );
          default:
            return 0;
        }
      });

      setItems(rows);
    } catch (e: any) {
      console.error(e);
      alert(e?.message || e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [
    q,
    inStockOnly,
    page,
    pageSize,
    prefix,
    minPrice,
    maxPrice,
    hasMsrpOnly,
    dateFrom,
    dateTo,
    sortKey,
    sortDir,
  ]);

  const loadOrders = React.useCallback(async () => {
    try {
      setOrdersBusy(true);
      setOrderError(null);
      const data = await fetchOrders(ov.size || 50);
      const items: OrderSummary[] = (data.items || []).map((x: any) => normalizeSummary(x));
      setOrders(items);
    } catch (err: any) {
      setOrderError(err?.message || String(err));
      setOrders([]);
    } finally {
      setOrdersBusy(false);
    }
  }, [ov.size]);

  React.useEffect(() => {
    if (ordersOpen) {
      loadOrders();
    }
  }, [ordersOpen, loadOrders]);

  React.useEffect(() => {
    fetchStock();
  }, [fetchStock]);

  React.useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => fetchStock(), Math.max(5, autoRefreshSec) * 1000);
    return () => clearInterval(t);
  }, [autoRefresh, autoRefreshSec, fetchStock]);

  /* -------- actions -------- */
  const handleScanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sid = scan.trim();
    if (!sid) return;
    setScanBusy(true);
    try {
      const r = await fetch(`${API_BASE}/labels/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ synergyId: sid, qty: 1 }),
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        throw new Error(`Scan failed (${r.status}): ${txt.slice(0, 200)}`);
      }
      await readJsonOrThrow(r);
      await fetchStock();
      setScan("");
    } catch (err: any) {
      alert("Scan failed: " + (err?.message ?? err));
    } finally {
      setScanBusy(false);
    }
  };
const moneyCompact = (cents: number) =>
  new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 })
    .format((cents || 0) / 100);

  const reprint = async (row: StockRow) => {
  const val = prompt("How many copies?", "1");
  if (val == null) return;                                  // <-- user hit Cancel: do nothing
  const copies = Math.floor(Number(val));
  if (!Number.isFinite(copies) || copies < 1) return;       // <-- invalid or <1: do nothing

  for (let i = 0; i < copies; i++) {
    await openPrintWindow({
      synergyId: row.synergy_id,
      productName: row.product_name,
      unitPrice: row.msrpDisplay || "",
      ourPrice: row.ourPriceDisplay || "",
      date: new Date().toLocaleDateString("en-US"),
      qty: 1,
    });
  }
  fetchStock();
};

  const pad2 = (n: number) => (n < 10 ? "0" : "") + n;

// Local-date day key like "2025-11-05"
const dayKeyLocal = (v: Date | string) => {
  const d = typeof v === "string" ? new Date(v) : v;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

// Month key like "2025-11" (local)
const monthKeyLocal = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

// Turn "YYYY-MM" into a local Date at the 1st of that month
const monthToDate = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, 1);
};

  const quickAdjust = async (row: StockRow, delta: number) => {
    try {
      const next = Math.max(0, (row.qty_on_hand || 0) + delta);
      await putAdjustQty(row.synergy_id, next);
      await fetchStock();
    } catch (e: any) {
      alert(e?.message || e);
    }
  };

  const openAdjustModal = (row: StockRow) => {
    setAdjustOpen(row);
    setAdjustQtyValue(String(row.qty_on_hand ?? 0));
  };
  const submitAdjustModal = async () => {
    if (!adjustOpen) return;
    const val = Number(adjustQtyValue);
    if (!Number.isInteger(val) || val < 0)
      return alert("Enter a non-negative integer.");
    try {
      await putAdjustQty(adjustOpen.synergy_id, val);
      setAdjustOpen(null);
      await fetchStock();
    } catch (e: any) {
      alert(e?.message || e);
    }
  };

  const openEditPriceModal = (row: StockRow) => {
    setEditPriceOpen(row);
    setEditPriceValue(String(toNum(row.ourPriceDisplay) ?? ""));
  };
  const submitEditPriceModal = async () => {
    if (!editPriceOpen) return;
    const price = Number(editPriceValue);
    if (!Number.isFinite(price) || price < 0) return alert("Enter a valid price.");
    try {
      await ensurePriceOnServer(editPriceOpen, price);
      setEditPriceOpen(null);
      await fetchStock();
    } catch (e: any) {
      alert(e?.message || e);
    }
  };

  const toggleAll = (checked: boolean) => {
    if (checked) {
      const m: Record<string, boolean> = {};
      items.forEach((r) => (m[r.synergy_id] = true));
      setSelected(m);
    } else setSelected({});
  };
  const selectedRows = items.filter((r) => selected[r.synergy_id]);

 const bulkReprint = async () => {
  if (selectedRows.length === 0) return alert("Select at least one item.");
  const val = prompt("How many copies per item?", "1");
  if (val == null) return;                                  // <-- Cancel: do nothing
  const copies = Math.floor(Number(val));
  if (!Number.isFinite(copies) || copies < 1) return;       // <-- invalid: do nothing

  for (const r of selectedRows) {
    for (let i = 0; i < copies; i++) {
      await openPrintWindow({
        synergyId: r.synergy_id,
        productName: r.product_name,
        unitPrice: r.msrpDisplay || "",
        ourPrice: r.ourPriceDisplay || "",
        date: new Date().toLocaleDateString("en-US"),
        qty: 1,
      });
    }
  }
  fetchStock();
};

  const bulkAdjust = async () => {
    if (selectedRows.length === 0) return alert("Select at least one item.");
    const val = prompt("Set qty_on_hand for ALL selected to:", "");
    if (val == null) return;
    const n = Number(val);
    if (!Number.isInteger(n) || n < 0) return alert("Enter a non-negative integer.");
    try {
      for (const r of selectedRows) await putAdjustQty(r.synergy_id, n);
      await fetchStock();
    } catch (e: any) {
      alert(e?.message || e);
    }
  };

  const exportCsv = () =>
    downloadCsv(
      `label_inventory_${new Date().toISOString().slice(0, 10)}.csv`,
      items
    );

    

  const submitNewLabel = async () => {
    if (!nlProduct.trim()) return alert("Product name required.");
    const qty = Math.max(1, Number(nlQty) || 1);
    try {
      setNlBusy(true);
      for (let i = 0; i < qty; i++) {
        await openPrintWindow({
          productName: nlProduct.trim(),
          unitPrice: nlMsrp || "",
          ourPrice: nlPrice || "",
          date: new Date().toLocaleDateString("en-US"),
          prefix: nlPrefix || undefined,
          qty: 1,
        });
      }
      setNlProduct("");
      setNlMsrp("");
      setNlPrice("");
      setNlPrefix("");
      setNlQty("1");
      fetchStock();
    } catch (e: any) {
      alert(e?.message || e);
    } finally {
      setNlBusy(false);
    }
  };

  async function openDetailModal(sid: string) {
    try {
      setDetailOpen({ sid, busy: true });
      const data = await fetchDetailBySid(sid);
      setDetailOpen({ sid, busy: false, data });
    } catch (e: any) {
      alert(e?.message || e);
      setDetailOpen(null);
    }
  }

  /* -------- totals -------- */
  const totals = React.useMemo(() => {
    let skus = items.length;
    let units = 0;
    let value = 0;
    for (const r of items) {
      units += Number(r.qty_on_hand || 0);
      const price = toNum(r.ourPriceDisplay) ?? 0;
      value += price * (r.qty_on_hand || 0);
    }
    return { skus, units, value };
  }, [items]);

  function CalendarView({
  orders,
  ov,
  setOv,
  fetchOrderDetailSmart,
  ordersBusy,
  setOrdersBusy,
  setSelectedOrder,
}: {
  orders: OrderSummary[];
  ov: any; // uses your existing shape; may include view, calMonth, date
  setOv: React.Dispatch<React.SetStateAction<any>>;
  fetchOrderDetailSmart: (orderId: string) => Promise<OrderDetail>;
  ordersBusy: boolean;
  setOrdersBusy: (v: boolean) => void;
  setSelectedOrder: (o: OrderDetail | null) => void;
}) {
  // --- local helpers (self-contained) ---
  const pad2 = (n: number) => (n < 10 ? "0" : "") + n;
  const dayKey = (v: Date | string) => {
    const d = typeof v === "string" ? new Date(v) : v;
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  };
  const monthKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  const ymToDate = (ym: string) => {
    const [y, m] = ym.split("-").map(Number);
    return new Date(y, (m ?? 1) - 1, 1);
  };

  // month being viewed
  const calMonth: string = (ov?.calMonth as string) || monthKey(new Date());
  const first = ymToDate(calMonth);
  const y = first.getFullYear();
  const m = first.getMonth();
  const startDow = first.getDay(); // 0..6 (Sun..Sat)
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  const prevMonth = monthKey(new Date(y, m - 1, 1));
  const nextMonth = monthKey(new Date(y, m + 1, 1));
  const isTodayMonth =
    calMonth === monthKey(new Date());

  // apply your current filters for counts (use a big size to avoid truncation)
  const base = (typeof filteredOrders === "function")
    ? filteredOrders(orders, { ...ov, size: 5000 })
    : orders.slice();

  // bucket by day
  const perDay = React.useMemo(() => {
    const map = new Map<string, { count: number; total: number; list: OrderSummary[] }>();
    for (const o of base) {
      const k = dayKey(o.created_at);
      let v = map.get(k);
      if (!v) { v = { count: 0, total: 0, list: [] }; map.set(k, v); }
      v.count++;
      v.total += o.final_total_cents || 0;
      v.list.push(o);
    }
    return map;
  }, [base]);

  // grid cells (null = leading blank)
  const cells: (Date | null)[] = [
    ...Array.from({ length: startDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(y, m, i + 1)),
  ];

  const monthLabel = new Date(y, m, 1).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });

  const goPrev = () => setOv((v: any) => ({ ...v, calMonth: prevMonth }));
  const goNext = () => setOv((v: any) => ({ ...v, calMonth: nextMonth }));
  const goToday = () =>
    setOv((v: any) => ({ ...v, calMonth: monthKey(new Date()) }));

  const handleDayClick = async (d: Date, e: React.MouseEvent) => {
    const dk = dayKey(d);
    // jump to list view for that day
    setOv((v: any) => ({ ...v, date: dk, view: "list" }));

    // Shift+click: also open newest order for the day in the detail pane
    if (e.shiftKey) {
      const bucket = perDay.get(dk);
      if (bucket?.list?.length) {
        const newest = bucket.list
          .slice()
          .sort(
            (a, b) =>
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime()
          )[0];
        try {
          setOrdersBusy(true);
          const full = await fetchOrderDetailSmart(newest.order_id);
          setSelectedOrder(full);
        } catch {
          /* ignore */
        } finally {
          setOrdersBusy(false);
        }
      }
    }
  };

  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* calendar toolbar */}
      <div className="px-3 py-2 border-b border-border/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            className="h-8 w-8 rounded-md border hover:bg-muted/50 flex items-center justify-center"
            onClick={goPrev}
            title="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="text-sm font-semibold">{monthLabel}</div>
          <button
            className="h-8 w-8 rounded-md border hover:bg-muted/50 flex items-center justify-center"
            onClick={goNext}
            title="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="h-8 px-3 rounded-md border hover:bg-muted/50 text-sm"
            onClick={goToday}
            disabled={isTodayMonth}
            title="Jump to current month"
          >
            Today
          </button>
        </div>
      </div>

      {/* weekday header */}
      <div className="grid grid-cols-7 text-xs uppercase tracking-wide text-muted-foreground border-b border-border/30">
        {weekDays.map((w) => (
          <div key={w} className="px-2 py-2 text-center">{w}</div>
        ))}
      </div>

      {/* month grid with hover tooltip */}
<TooltipProvider delayDuration={150}>
  <div className="grid grid-cols-7 flex-1 min-h-0 overflow-auto">
    {cells.map((d, idx) => {
      if (!d) {
        return (
          <div
            key={`blank-${idx}`}
            className="border-b border-r border-border/20 h-[90px] bg-muted/10"
          />
        );
      }

      const k = dayKey(d);
      const bucket = perDay.get(k);
      const isToday = k === dayKey(new Date());
      const ttTitle =
        `${d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} • ` +
        (bucket
          ? `${bucket.count} order${bucket.count === 1 ? "" : "s"} · $${(bucket.total / 100).toFixed(2)}`
          : "No orders");

      return (
        <Tooltip key={k}>
          <TooltipTrigger asChild>
            <button
              className={
                "relative border-b border-r border-border/20 text-left p-2 h-[90px] hover:bg-muted/20 transition " +
                (isToday ? "bg-primary/5 ring-1 ring-primary/30" : "")
              }
              onClick={(e) => handleDayClick(d, e)}
              title={ttTitle} /* native title as fallback */
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">{d.getDate()}</span>
                {bucket && (
                  <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full bg-muted/40">
                    <CalendarDays className="h-3 w-3" />
                    {bucket.count}
                  </span>
                )}
              </div>

              {bucket ? (
                <div className="mt-2 text-[11px] text-muted-foreground">
                  ${ (bucket.total / 100).toFixed(2) }
                </div>
              ) : (
                <div className="mt-2 text-[11px] text-muted-foreground opacity-60">—</div>
              )}
            </button>
          </TooltipTrigger>

          <TooltipContent side="top" align="center" className="z-[70] max-w-[260px]">
            <div className="text-[11px] leading-5">
              <div className="font-semibold mb-1">
                {d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
              </div>

              {bucket ? (
                <>
                  <div className="mb-1">
                    {bucket.count} orders • ${ (bucket.total / 100).toFixed(2) }
                  </div>

                  <div className="space-y-0.5">
                    {bucket.list
                      .slice()
                      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                      .slice(0, 5)
                      .map((o, i) => (
                        <div key={o.order_id || i} className="flex items-center justify-between gap-3">
                          <span className="font-mono truncate max-w-[140px]">{o.order_id || "—"}</span>
                          <span className="tabular-nums">
                            ${ ((o.final_total_cents || 0) / 100).toFixed(2) }
                          </span>
                        </div>
                      ))}
                    {bucket.list.length > 5 && (
                      <div className="text-muted-foreground">
                        +{bucket.list.length - 5} more…
                      </div>
                    )}
                  </div>

                  <div className="mt-1 text-muted-foreground">
                    Click to filter • Shift+Click opens newest
                  </div>
                </>
              ) : (
                <div>No orders</div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      );
    })}
  </div>
</TooltipProvider>

      {ordersBusy && (
        <div className="px-3 py-2 text-xs text-muted-foreground border-t border-border/30">
          Loading order…
        </div>
      )}
    </div>
  );
}

  /* -------- header cell w/ sort affordance -------- */
  const Header = ({
    label,
    keyName,
    className,
    icon,
  }: {
    label: string;
    keyName: SortKey;
    className?: string;
    icon?: React.ReactNode;
  }) => (
    <button
      type="button"
      onClick={() => {
        if (sortKey === keyName) setSortDir(sortDir === "asc" ? "desc" : "asc");
        else {
          setSortKey(keyName);
          setSortDir("asc");
        }
      }}
      className={cls(
        "group flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
        "hover:text-foreground transition-all duration-200",
        sortKey === keyName && "text-primary",
        className
      )}
      title="Sort"
    >
      {icon && <span className="opacity-60 group-hover:opacity-100 transition-opacity">{icon}</span>}
      <span>{label}</span>
      <span
        className={cls(
          "ml-1 text-sm transition-all duration-200",
          sortKey === keyName ? "opacity-100 scale-110" : "opacity-0 scale-90"
        )}
      >
        {sortKey === keyName ? (sortDir === "asc" ? "↑" : "↓") : ""}
      </span>
    </button>
  );

  // row renderer (reused in flat + grouped)
  const RowView = (r: StockRow) => {
    const msrpNum = toNum(r.msrpDisplay);
    const priceNum = toNum(r.ourPriceDisplay);
    const catName = pickCategory(r);
    const bg = colorForCategory(catName);
    return (
      <div
        key={r.synergy_id}
        className="grid grid-cols-[40px,180px,1fr,140px,120px,120px,120px,100px,180px] items-center px-4 py-3.5 hover:bg-muted/10 transition-colors group"
      >
        {/* Checkbox */}
        <div>
          <CustomCheckbox
            checked={!!selected[r.synergy_id]}
            onCheckedChange={(checked) =>
              setSelected((m) => ({ ...m, [r.synergy_id]: checked }))
            }
          />
        </div>

        {/* Synergy ID + Actions */}
        <div className="flex items-center gap-2">
          <button
            className="font-mono text-sm font-medium text-foreground hover:text-primary transition-colors underline decoration-dotted underline-offset-2"
            title="Copy Synergy ID"
            onClick={() => navigator.clipboard.writeText(r.synergy_id)}
          >
            {r.synergy_id}
          </button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => reprint(r)}
            className="h-8 px-2 opacity-0 group-hover:opacity-100 border-border/50 hover:border-primary/50 hover:bg-primary/5 rounded-lg gap-1.5 transition-all duration-200"
          >
            <Printer className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => openDetailModal(r.synergy_id)}
            className="h-8 px-2 opacity-0 group-hover:opacity-100 border-border/50 hover:border-primary/50 hover:bg-primary/5 rounded-lg gap-1.5 transition-all duration-200"
            title="View full details"
          >
            <Search className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Product Name + optional First/Last inline */}
        <div className="truncate pr-4 text-sm font-medium text-foreground">
          <div className="truncate">{r.product_name}</div>
          {(r.first_added || r.last_sold) && (
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {r.first_added ? `First: ${new Date(r.first_added).toLocaleDateString()}` : null}
              {r.first_added && r.last_sold ? " · " : ""}
              {r.last_sold ? `Last sold: ${new Date(r.last_sold).toLocaleDateString()}` : null}
            </div>
          )}
        </div>

      <div className="flex items-center gap-2">
  {catName ? (
    <button
      type="button"
      title="Click to set/clear override · Alt+Click to rename display name"
      className="px-2 py-1 rounded-md text-xs font-semibold border border-border/50 hover:border-primary/50 hover:bg-primary/5 transition-colors"
      style={{ background: bg, color: "#000" }}
      onClick={async (e) => {
        // ALT+Click → rename the *display* name only (prefix/rule unchanged)
        if (e.altKey) {
          try {
            const current = catAliases[catName] || catName;
            const next = prompt(
              `Rename display name for category "${catName}".\n(Leave empty to reset to "${catName}")`,
              current
            );
            if (next === null) return; // cancel
            await putCategoryAlias(catName, next.trim() === "" ? null : next.trim());
            const updated = await getCategoryAliases().catch(() => ({} as Record<string,string>));
            setCatAliases(updated);
          } catch (err: any) {
            alert(err?.message || String(err));
          }
          return;
        }

        // Default click → open full Category Settings modal
        setCatModal({ open: true, sid: r.synergy_id, product: r.product_name });
      }}
    >
      {displayCategory(catName)}
    </button>
  ) : (
   <div className="flex items-center gap-2">
  <button
    type="button"
    title="Category settings"
    className="px-2 py-1 rounded-md text-xs font-semibold border border-border/50 hover:border-primary/50 hover:bg-primary/5 transition-colors"
    style={{ background: bg, color: "#000" }} // keep your bg/color calc
    onClick={() => setCatModal({ open: true, sid: r.synergy_id, product: r.product_name })}
  >
    {catName || "Uncategorized"}
  </button>
</div>
  )}
</div>

        {/* MSRP */}
        {showColumns.msrp && (
          <div className="text-right text-sm text-muted-foreground tabular-nums font-medium">
            {fmtMoney(msrpNum)}
          </div>
        )}

        {/* Price with Edit */}
        {showColumns.price && (
          <div className="flex items-center justify-end gap-2">
            <span className="text-sm font-semibold text-foreground tabular-nums">
              {fmtMoney(priceNum)}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => openEditPriceModal(r)}
              className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 border-border/50 hover:border-primary/50 hover:bg-primary/5 rounded-lg transition-all duration-200"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {/* Quantity Controls */}
        {showColumns.onhand && (
          <div className="flex items-center justify-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => quickAdjust(r, -1)}
              className="h-8 w-8 p-0 border-border/50 hover:border-primary/50 hover:bg-primary/5 rounded-lg transition-all duration-200"
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <button
              className={cls(
                "h-8 min-w-[48px] px-3 rounded-lg text-sm font-bold transition-all duration-200 cursor-pointer",
                r.qty_on_hand > 0
                  ? "bg-primary/10 text-primary hover:bg-primary/20"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
              title="Click to set exact quantity"
              onClick={() => openAdjustModal(r)}
            >
              {r.qty_on_hand}
            </button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => quickAdjust(r, +1)}
              className="h-8 w-8 p-0 border-border/50 hover:border-primary/50 hover:bg-primary/5 rounded-lg transition-all duration-200"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {/* Sold Count */}
        {showColumns.sold && (
          <div className="text-center text-sm font-medium text-muted-foreground">
            {r.sold_count}
          </div>
        )}

        {/* Updated At */}
        {showColumns.updated && (
          <div className="text-right text-xs text-muted-foreground">
            {new Date(r.updated_at).toLocaleString()}
          </div>
        )}
      </div>
    );
  };

  /* -------- streamlined layout -------- */
  return (
  <>
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 space-y-5">
        {/* Clean Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border/40">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-gradient-to-br from-primary to-accent rounded-xl shadow-sm">
                <Tag className="h-6 w-6 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">Label Inventory</h1>
              <ThemeToggle />
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Boxes className="h-4 w-4 text-primary" />
                <span className="font-semibold text-foreground">{totals.skus}</span> SKUs
              </div>
              <div className="flex items-center gap-1.5">
                <Box className="h-4 w-4 text-primary" />
                <span className="font-semibold text-foreground">{totals.units}</span> Units
              </div>
              <div className="flex items-center gap-1.5">
                <DollarSign className="h-4 w-4 text-primary" />
                <span className="font-semibold text-foreground">{fmtMoney(totals.value)}</span>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowNewLabel((v) => !v)}
              className="border-border/50 hover:bg-accent/10 hover:border-primary/50 gap-2"
            >
              <Factory className="h-4 w-4" />
              {showNewLabel ? "Hide" : "New Label"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOrdersOpen(true)}
              className="border-border/50 hover:bg-accent/10 hover:border-primary/50 gap-2"
              title="View recent orders / logs"
            >
              <Receipt className="h-4 w-4" /> Orders / Logs
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportCsv}
              className="border-border/50 hover:bg-accent/10 hover:border-primary/50 gap-2"
            >
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setPage(1); fetchStock(); }}
              disabled={loading}
              className="border-border/50 hover:bg-accent/10 hover:border-primary/50 gap-2"
            >
              {loading ? <TinySpinner size={16} /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Scan Bar */}
        <Card className="p-4 border-border/50">
          <form onSubmit={handleScanSubmit} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex-1 relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input
                placeholder={`Scan ${returnMode ? "(RETURN)" : "(SALE)"} — Enter Synergy ID`}
                value={scan}
                onChange={(e) => setScan(e.target.value)}
                className="pl-10 h-10 bg-background border-border/50 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-lg transition-all"
              />
            </div>
            <Button
              type="submit"
              disabled={scanBusy}
              className="h-10 px-5 bg-gradient-to-r from-primary to-accent hover:shadow-md text-white font-medium rounded-lg gap-2 transition-all"
            >
              {scanBusy ? (
                <>
                  <TinySpinner size={16} /> Processing
                </>
              ) : (
                <>
                  <Barcode className="h-4 w-4" /> Record
                </>
              )}
            </Button>
            <label className="flex items-center gap-2 px-3 py-2 bg-muted/30 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
              <CustomCheckbox checked={returnMode} onCheckedChange={setReturnMode} />
              <span className="text-sm font-medium text-foreground">Return Mode</span>
            </label>
          </form>
        </Card>

        {/* New Label Panel */}
        {showNewLabel && (
          <Card className="p-5 border-border/50">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1.5 bg-gradient-to-br from-primary to-accent rounded-lg">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <h3 className="text-base font-semibold text-foreground">Create New Label</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
              <Input placeholder="Product name" value={nlProduct} onChange={(e) => setNlProduct(e.target.value)} className="h-10 bg-background border-border/50 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-lg" />
              <Input placeholder="MSRP (e.g. 39.99)" value={nlMsrp} onChange={(e) => setNlMsrp(e.target.value)} className="h-10 bg-background border-border/50 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-lg" />
              <Input placeholder="Our price (e.g. 29.99)" value={nlPrice} onChange={(e) => setNlPrice(e.target.value)} className="h-10 bg-background border-border/50 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-lg" />
              <Input placeholder="Prefix (optional)" value={nlPrefix} onChange={(e) => setNlPrefix(e.target.value)} className="h-10 bg-background border-border/50 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-lg" />
              <Input placeholder="Copies" value={nlQty} onChange={(e) => setNlQty(e.target.value)} className="h-10 bg-background border-border/50 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-lg" />
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-border/30">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Settings2 className="h-3.5 w-3.5" />
                <span>Creates Synergy ID, prints labels, and syncs inventory</span>
              </div>
              <Button onClick={submitNewLabel} disabled={nlBusy} className="h-10 px-5 bg-gradient-to-r from-primary to-accent hover:shadow-md text-white font-medium rounded-lg gap-2 transition-all">
                {nlBusy ? (
                  <>
                    <TinySpinner size={16} /> Printing
                  </>
                ) : (
                  <>
                    <Printer className="h-4 w-4" /> Create & Print
                  </>
                )}
              </Button>
            </div>
          </Card>
        )}

        {/* Filters Panel */}
        <Card className="p-4 border-border/50">
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
              <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <Input placeholder="Search product or ID..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-10 h-9 bg-background border-border/50 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-lg" />
              </div>
              <Input placeholder="Prefix" value={prefix} onChange={(e) => setPrefix(e.target.value)} className="h-9 bg-background border-border/50 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-lg" />
              <Input placeholder="Min $" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} className="h-9 bg-background border-border/50 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-lg" />
              <Input placeholder="Max $" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} className="h-9 bg-background border-border/50 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-lg" />
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 bg-background border-border/50 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-lg" />
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 bg-background border-border/50 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-lg" />
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border/30">
              <label className="flex items-center gap-2 cursor-pointer group">
                <CustomCheckbox checked={inStockOnly} onCheckedChange={setInStockOnly} />
                <span className="text-sm font-medium text-foreground">In Stock Only</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer group">
                <CustomCheckbox checked={hasMsrpOnly} onCheckedChange={setHasMsrpOnly} />
                <span className="text-sm font-medium text-foreground">Has MSRP</span>
              </label>

              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Size:</span>
                <select className="h-8 border-border/50 rounded-lg px-2 bg-background text-foreground text-sm focus:ring-1 focus:ring-primary/20 focus:border-primary" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                  {[25, 50, 100, 150, 200].map((n) => (<option key={n} value={n}>{n}</option>))}
                </select>
              </div>

              <div className="flex items-center gap-2 text-sm">
                <CustomCheckbox checked={autoRefresh} onCheckedChange={setAutoRefresh} />
                <span className="text-muted-foreground">Refresh every</span>
                <input className="w-12 h-8 border-border/50 rounded-lg px-2 bg-background text-foreground text-sm focus:ring-1 focus:ring-primary/20 focus:border-primary" value={autoRefreshSec} onChange={(e) => setAutoRefreshSec(Number(e.target.value || 0))} />
                <span className="text-muted-foreground">sec</span>
              </div>

              {/* Group toggle */}
              <div className="flex items-center gap-2 text-sm ml-auto">
                <Layers3 className="h-4 w-4 text-muted-foreground" />
                <label className="flex items-center gap-2 cursor-pointer">
                  <CustomCheckbox checked={categoryMode === "grouped"} onCheckedChange={(v) => setCategoryMode(v ? "grouped" : "flat")} />
                  <span className="text-foreground">Group by Category</span>
                </label>
              </div>

              <div className="flex items-center gap-3">
                <Filter className="h-4 w-4 text-muted-foreground" />
                {["msrp", "price", "onhand", "sold", "updated"].map((key) => (
                  <label key={key} className="flex items-center gap-1.5 cursor-pointer">
                    <CustomCheckbox checked={(showColumns as any)[key]} onCheckedChange={(checked) => setShowColumns((s) => ({ ...s, [key]: checked }))} />
                    <span className="text-xs font-medium text-foreground">{key.charAt(0).toUpperCase() + key.slice(1)}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Bulk Actions */}
        <div className="flex items-center gap-2.5">
          <label className="flex items-center gap-2 cursor-pointer group">
            <CustomCheckbox checked={items.length > 0 && selectedRows.length === items.length} onCheckedChange={toggleAll} />
            <span className="text-sm font-medium text-foreground">Select All</span>
          </label>
          <Button variant="outline" size="sm" onClick={bulkReprint} disabled={selectedRows.length === 0} className="border-border/50 hover:bg-accent/10 hover:border-primary/50 gap-2 disabled:opacity-50">
            <Printer className="h-4 w-4" /> Bulk Reprint
          </Button>
          <Button variant="outline" size="sm" onClick={bulkAdjust} disabled={selectedRows.length === 0} className="border-border/50 hover:bg-accent/10 hover:border-primary/50 gap-2 disabled:opacity-50">
            <Boxes className="h-4 w-4" /> Bulk Adjust
          </Button>
          {selectedRows.length > 0 && (
            <div className="ml-2 px-2.5 py-1 bg-gradient-to-r from-primary/10 to-accent/10 text-primary rounded-lg text-sm font-semibold border border-primary/20">
              {selectedRows.length} selected
            </div>
          )}
        </div>

        {/* Data Table */}
        <Card className="overflow-hidden border-border/50">
          {/* Legend bar (click to filter) */}
          <div className="px-4 py-2 border-b border-border/30 bg-muted/10 overflow-x-auto">
            <div className="flex items-center gap-2 min-w-max">
              <button
                className={cls(
                  "px-2 py-1 rounded-full text-xs border",
                  categoryFilter.length === 0 ? "bg-primary/10 border-primary/30 text-primary" : "border-border/50 text-foreground hover:bg-muted/50"
                )}
                onClick={() => setCategoryFilter([])}
                title="Clear category filter"
              >
                All ({items.length})
              </button>
              {legend.map((c) => (
                <button
                  key={c.name}
                  onClick={() =>
                    setCategoryFilter((curr) => {
                      const on = curr.includes(c.name);
                      return on ? curr.filter(x => x !== c.name) : [...curr, c.name];
                    })
                  }
                  className={cls(
                    "px-2 py-1 rounded-full text-xs border inline-flex items-center gap-2",
                    categoryFilter.includes(c.name) ? "border-primary/40 bg-primary/10 text-primary" : "border-border/50 hover:bg-muted/50"
                  )}
                  title={c.name}
                >
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                  <span className="truncate max-w-[220px]">{c.name}</span>
                  <span className="opacity-70">({c.count})</span>
                </button>
              ))}
            </div>
          </div>

          {/* Group controls */}
          {categoryMode === "grouped" && (
            <div className="px-4 py-2 text-xs text-muted-foreground flex items-center gap-2 bg-muted/10 border-b border-border/30">
              <span>{filteredItems.length} items · {groups.length} categories</span>
              <span className="mx-2 h-3 w-px bg-border/60" />
              <button className="underline hover:text-foreground" onClick={() => setCollapsedCats({})}>expand all</button>
              <button
                className="underline hover:text-foreground"
                onClick={() => {
                  const next: Record<string, boolean> = {};
                  for (const g of groups) next[g.name] = true;
                  setCollapsedCats(next);
                }}
              >
                collapse all
              </button>
            </div>
          )}

          {/* Table Header (Category col kept) */}
          <div className="grid grid-cols-[40px,180px,1fr,140px,120px,120px,120px,100px,180px] items-center px-4 py-3 bg-muted/20 border-b border-border/30">
            <div />
            <Header label="Synergy ID" keyName="synergy_id" icon={<Tag className="h-3.5 w-3.5" />} />
            <Header label="Product" keyName="product_name" icon={<Box className="h-3.5 w-3.5" />} />
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Category</div>
            {showColumns.msrp && (<Header label="MSRP" keyName="msrp" className="justify-end" icon={<DollarSign className="h-3.5 w-3.5" />} />)}
            {showColumns.price && (<Header label="Price" keyName="price" className="justify-end" icon={<DollarSign className="h-3.5 w-3.5" />} />)}
            {showColumns.onhand && (<Header label="On Hand" keyName="qty_on_hand" className="justify-center" icon={<Boxes className="h-3.5 w-3.5" />} />)}
            {showColumns.sold && (<Header label="Sold" keyName="sold_count" className="justify-center" />)}
            {showColumns.updated && (<Header label="Updated" keyName="updated_at" className="justify-end" icon={<RefreshCw className="h-3.5 w-3.5" />} />)}
          </div>

          {/* Table Body */}
          <div className="divide-y divide-border/20">
            {loading ? (
              <div className="p-12 text-center">
                <div className="inline-flex items-center gap-3 text-muted-foreground">
                  <TinySpinner size={20} />
                  <span className="text-sm font-medium">Loading inventory...</span>
                </div>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="p-12 text-center">
                <div className="inline-flex flex-col items-center gap-3">
                  <Box className="h-10 w-10 text-muted-foreground/40" />
                  <p className="text-sm font-medium text-muted-foreground">No items found</p>
                </div>
              </div>
            ) : categoryMode === "grouped" ? (
              <>
                {groups.map((g) => {
                  const isCollapsed = !!collapsedCats[g.name];
                  return (
                    <div key={g.name} className="border-b border-border/20">
                      <button
                        className="w-full px-4 py-2 bg-muted/20 hover:bg-muted/30 transition flex items-center gap-2"
                        onClick={() => setCollapsedCats(c => ({ ...c, [g.name]: !isCollapsed }))}
                        title={isCollapsed ? "Expand" : "Collapse"}
                      >
                        {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        <span className="inline-flex items-center gap-2 text-sm font-semibold">
                          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: g.color }} />
                          {g.name}
                        </span>
                        <span className="ml-2 text-xs text-muted-foreground">({g.rows.length})</span>
                      </button>
                      {!isCollapsed && g.rows.map(RowView)}
                    </div>
                  );
                })}
              </>
            ) : (
              filteredItems.map(RowView)
            )}
          </div>
        </Card>

        {/* Pagination */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Page <span className="font-semibold text-foreground">{page}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="border-border/50 hover:bg-accent/10 hover:border-primary/50 gap-2 disabled:opacity-50"
            >
              <MoveLeft className="h-4 w-4" /> Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              className="border-border/50 hover:bg-accent/10 hover:border-primary/50 gap-2"
            >
              Next <MoveRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>

    {/* Adjust Quantity Modal */}
    {adjustOpen && (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setAdjustOpen(null)}>
        <div className="bg-card rounded-xl p-6 w-full max-w-md shadow-xl border border-border/50" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-gradient-to-br from-primary to-accent rounded-lg">
              <Boxes className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Adjust Quantity</h3>
              <p className="text-xs text-muted-foreground font-mono">{adjustOpen.synergy_id}</p>
            </div>
          </div>
          <Input value={adjustQtyValue} onChange={(e) => setAdjustQtyValue(e.target.value)} className="mb-4 h-11 bg-background border-border/50 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-lg text-base font-semibold" placeholder="Enter quantity" autoFocus />
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => setAdjustOpen(null)} className="h-10 px-4 border-border/50 hover:bg-muted rounded-lg">Cancel</Button>
            <Button onClick={submitAdjustModal} className="h-10 px-5 bg-gradient-to-r from-primary to-accent hover:shadow-md text-white font-medium rounded-lg transition-all">Save Changes</Button>
          </div>
        </div>
      </div>
    )}

    {/* Edit Price Modal */}
    {editPriceOpen && (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setEditPriceOpen(null)}>
        <div className="bg-card rounded-xl p-6 w-full max-w-md shadow-xl border border-border/50" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-gradient-to-br from-primary to-accent rounded-lg">
              <DollarSign className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Edit Price</h3>
              <p className="text-xs text-muted-foreground font-mono">{editPriceOpen.synergy_id}</p>
            </div>
          </div>
          <Input placeholder="New price (e.g. 29.99)" value={editPriceValue} onChange={(e) => setEditPriceValue(e.target.value)} className="mb-4 h-11 bg-background border-border/50 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-lg text-base font-semibold" autoFocus />
          <div className="flex items-center justify-end gap-2 mb-3">
            <Button variant="outline" onClick={() => setEditPriceOpen(null)} className="h-10 px-4 border-border/50 hover:bg-muted rounded-lg">Cancel</Button>
            <Button onClick={submitEditPriceModal} className="h-10 px-5 bg-gradient-to-r from-primary to-accent hover:shadow-md text-white font-medium rounded-lg transition-all">Update Price</Button>
          </div>
          <div className="p-2.5 bg-muted/20 rounded-lg border border-border/20">
            <p className="text-xs text-muted-foreground">
              Updates via <code className="font-mono text-primary">POST /labels/ensure</code> (quantities unchanged)
            </p>
          </div>
        </div>
      </div>
    )}

    {/* Product Details Modal */}
    {detailOpen && (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDetailOpen(null)}>
        <div className="bg-card rounded-xl p-6 w-full max-w-lg shadow-xl border border-border/50" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-primary to-accent rounded-lg" />
              <div>
                <h3 className="text-base font-semibold text-foreground">Product Details</h3>
                <p className="text-xs text-muted-foreground font-mono">{detailOpen.sid}</p>
              </div>
            </div>
            <Button variant="outline" onClick={() => setDetailOpen(null)} className="h-8 px-3">Close</Button>
          </div>

          {detailOpen.busy ? (
            <div className="py-8 text-center text-muted-foreground flex items-center justify-center gap-2">
              <TinySpinner size={18} /> Loading…
            </div>
          ) : detailOpen.data ? (
            <div className="space-y-3">
              <div className="text-sm font-semibold">{detailOpen.data.product_name}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Our Price:</span>
                  <span className="font-semibold">
                    {detailOpen.data.ourPriceDisplay ? `$${Number(detailOpen.data.ourPriceDisplay).toFixed(2)}` : "—"}
                  </span>
                  {detailOpen.data.msrpDisplay && (
                    <span className="text-xs text-muted-foreground line-through">
                      ${Number(detailOpen.data.msrpDisplay).toFixed(2)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">On Hand:</span>
                  <span className="font-semibold">{detailOpen.data.qty_on_hand}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Sold Count:</span>
                  <span className="font-semibold">{detailOpen.data.sold_count}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Updated:</span>
                  <span className="font-mono">
                    {new Date(detailOpen.data.updated_at).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">First Added:</span>
                  <span className="font-mono">
                    {detailOpen.data.first_added ? new Date(detailOpen.data.first_added).toLocaleDateString() : "—"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Last Sold:</span>
                  <span className="font-mono">
                    {detailOpen.data.last_sold ? new Date(detailOpen.data.last_sold).toLocaleDateString() : "—"}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-destructive">No data.</div>
          )}
        </div>
      </div>
    )}

    {/* Orders / Logs Modal */}
    {ordersOpen && (
      <div
        className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm p-4 flex items-center justify-center overflow-y-auto"
        onClick={() => {
          setOrdersOpen(false);
          setSelectedOrder(null);
          setOrderError(null);
        }}
      >
        <div
          className="bg-card rounded-xl w-full max-w-6xl shadow-xl border border-border/50 overflow-hidden my-6 max-h-[calc(100vh-3rem)] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border/40 shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-primary to-accent rounded-lg">
                <Receipt className="h-5 w-5 text-white" />
              </div>
              <h3 className="text-base font-semibold text-foreground">Recent Orders / Logs</h3>
            </div>

            {/* Right actions (icon-only) */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                title="Refresh"
                aria-label="Refresh"
                onClick={async () => {
                  try {
                    setOrdersBusy(true);
                    setOrderError(null);
                    const data = await fetchOrders(ov.size || 50);
                    const items: OrderSummary[] = (data.items || []).map((x: any) => normalizeSummary(x));
                    setOrders(items);
                  } catch (err: any) {
                    setOrderError(err?.message || String(err));
                  } finally {
                    setOrdersBusy(false);
                  }
                }}
              >
                {ordersBusy ? <TinySpinner size={14} /> : <RefreshCw className="h-4 w-4" />}
              </Button>

              <Button
                variant="outline"
                size="icon"
                title="Export CSV"
                aria-label="Export CSV"
                onClick={() => {
                  const rows = filteredOrders(orders, ov);
                  const csv = [
                    ["order_id","created_at","employee","payment_type","subtotal","tax","total"].join(","),
                    ...rows.map((o) => [
                      o.order_id, o.created_at, o.employee || "", o.payment_type || "",
                      (o.subtotal_cents/100).toFixed(2), (o.tax_cents/100).toFixed(2), (o.final_total_cents/100).toFixed(2),
                    ].map(s => `"${String(s).replace(/"/g,'""')}"`).join(","))
                  ].join("\n");
                  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `orders_${new Date().toISOString().slice(0,10)}.csv`;
                  document.body.appendChild(a);
                  a.click();
                  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 400);
                }}
              >
                <Download className="h-4 w-4" />
              </Button>

              <div className="hidden md:flex items-center gap-1">
                <Button variant={ov.view === "list" ? "default" : "outline"} size="icon" title="List view" aria-label="List view" onClick={() => setOv(v => ({ ...v, view: "list" }))}>
                  <ListIcon className="h-4 w-4" />
                </Button>
                <Button
                  variant={ov.view === "calendar" ? "default" : "outline"}
                  size="icon"
                  title="Calendar view"
                  aria-label="Calendar view"
                  onClick={() => setOv(v => ({
                    ...v,
                    view: "calendar",
                    calMonth: v.calMonth || (typeof monthKeyLocal === "function"
                      ? monthKeyLocal(new Date())
                      : new Date().toISOString().slice(0,7))
                  }))}
                >
                  <CalendarIcon className="h-4 w-4" />
                </Button>
              </div>

              <Button
                variant="outline"
                size="icon"
                title="Close"
                aria-label="Close"
                onClick={() => {
                  setOrdersOpen(false);
                  setSelectedOrder(null);
                  setOrderError(null);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Filters row */}
          <div className="px-4 py-3 border-b border-border/40">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <ArrowUpDown className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <select className="h-9 pl-8 pr-7 w-[160px] border rounded bg-background" value={ov.sort} onChange={(e) => setOv({ ...ov, sort: e.target.value as any })} title="Sort">
                  <option value="new">Newest first</option>
                  <option value="old">Oldest first</option>
                  <option value="high">Total (high → low)</option>
                  <option value="low">Total (low → high)</option>
                </select>
              </div>

              <div className="relative flex-1 min-w-[260px]">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Order ID / Synergy / text" value={ov.q} onChange={(e) => setOv({ ...ov, q: e.target.value })} className="pl-8 h-9" />
              </div>

              <div className="relative">
                <User className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Employee" value={ov.employee} onChange={(e) => setOv({ ...ov, employee: e.target.value })} className="pl-8 h-9 w-[160px]" />
              </div>

              <div className="relative">
                <CreditCard className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <select className="h-9 pl-8 pr-7 w-[160px] border rounded bg-background" value={ov.payment} onChange={(e) => setOv({ ...ov, payment: e.target.value as any })} title="Payment">
                  <option value="any">Any Payment</option>
                  <option value="Cash">Cash</option>
                  <option value="Card">Card</option>
                  <option value="Gift Card">Gift Card</option>
                </select>
              </div>

              <div className="relative">
                <Percent className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <select className="h-9 pl-8 pr-7 w-[140px] border rounded bg-background" value={ov.tax} onChange={(e) => setOv({ ...ov, tax: e.target.value as any })} title="Tax">
                  <option value="any">Any Tax</option>
                  <option value="taxed">Taxed</option>
                  <option value="exempt">Tax Exempt</option>
                </select>
              </div>

              <div className="relative">
                <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Min total $" value={ov.minTotal} onChange={(e) => setOv({ ...ov, minTotal: e.target.value })} className="pl-8 h-9 w-[130px]" />
              </div>
              <div className="relative">
                <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Max total $" value={ov.maxTotal} onChange={(e) => setOv({ ...ov, maxTotal: e.target.value })} className="pl-8 h-9 w-[130px]" />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Size</span>
                <select
                  className="h-9 w-[84px] border rounded bg-background"
                  value={ov.size}
                  onChange={(e) => {
                    const s = Number(e.target.value);
                    setOv({ ...ov, size: s });
                    localStorage.setItem("orders.size", String(s));
                  }}
                  title="Page size"
                >
                  {[25,50,100,200,500].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>

              <div className="h-6 w-px bg-border/60 mx-1 hidden md:block" />

              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" title="Apply filters" aria-label="Apply filters" onClick={() => loadOrders()}>
                  <Check className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  title="Clear filters"
                  aria-label="Clear filters"
                  onClick={() => {
                    setOv(v => ({
                      ...v,
                      q: "",
                      employee: "",
                      payment: "any",
                      tax: "any",
                      minTotal: "",
                      maxTotal: "",
                      sort: "new",
                      date: undefined,
                    }));
                  }}
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {ov.date && (
              <div className="mt-2 text-xs">
                <button
                  className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-muted hover:bg-muted/70 transition"
                  onClick={() => setOv(v => ({ ...v, date: undefined }))}
                  title="Clear day filter"
                >
                  <CalendarClock className="h-3.5 w-3.5" />
                  {ov.date}
                  <span className="ml-1 text-muted-foreground">✕</span>
                </button>
              </div>
            )}
          </div>

          {/* Body */}
          <div className="p-4 flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 overflow-hidden">
            {/* LEFT: List or Calendar */}
            <Card className="border-border/50 min-h-0 flex flex-col overflow-hidden">
              <div className="px-4 py-2 border-b border-border/40 flex items-center justify-between shrink-0">
                <span className="text-sm font-semibold text-foreground">{ov.view === "calendar" ? "Calendar" : "Results"}</span>
                {ov.view !== "calendar" && (
                  <span className="text-xs text-muted-foreground">
                    {(() => {
                      const base = filteredOrders(orders, ov);
                      const shown = ov.date ? base.filter(o => String(o.created_at).slice(0,10) === ov.date) : base;
                      return `${shown.length} shown`;
                    })()}
                  </span>
                )}
              </div>

              {ov.view === "calendar" ? (
                <CalendarView
                  orders={orders}
                  ov={ov}
                  setOv={setOv}
                  fetchOrderDetailSmart={fetchOrderDetailSmart}
                  ordersBusy={ordersBusy}
                  setOrdersBusy={setOrdersBusy}
                  setSelectedOrder={setSelectedOrder}
                />
              ) : (
                <>
                  <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-border/20">
                    {(() => {
                      const base = filteredOrders(orders, ov);
                      const shown = ov.date ? base.filter(o => String(o.created_at).slice(0,10) === ov.date) : base;
                      return shown.length === 0 ? (
                        <div className="p-4 text-sm text-muted-foreground">
                          {orderError ? orderError : "No orders yet, or the /labels/orders endpoint isn’t available."}
                        </div>
                      ) : (
                        shown.map((o) => {
                          const oid = o.order_id || "";
                          const disabled = !oid;
                          return (
                            <button
                              key={oid || Math.random().toString(36).slice(2)}
                              className={
                                "w-full text-left px-4 py-3 transition flex items-center justify-between gap-3 " +
                                (disabled ? "opacity-60 cursor-not-allowed" : "hover:bg-muted/10")
                              }
                              onClick={async () => {
                                if (!oid) { setOrderError("Selected row has no order_id in payload."); return; }
                                try {
                                  setOrdersBusy(true);
                                  setOrderError(null);
                                  const full = await fetchOrderDetailSmart(oid);
                                  setSelectedOrder(full);
                                } catch (err: any) {
                                  setOrderError(err?.message || String(err));
                                } finally {
                                  setOrdersBusy(false);
                                }
                              }}
                              title={disabled ? "No order_id present" : "View details"}
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-sm font-semibold break-all">{oid || "—"}</span>
                                  <button
                                    type="button"
                                    className="p-1 rounded hover:bg-muted"
                                    title="Copy"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (oid) navigator.clipboard.writeText(oid);
                                    }}
                                  >
                                    <CopyIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                  </button>
                                </div>
                                <div className="text-xs text-muted-foreground mt-0.5">
                                  <span className="inline-flex items-center gap-1 mr-3">
                                    <CalendarClock className="h-3.5 w-3.5" />
                                    {new Date(o.created_at).toLocaleString()}
                                  </span>
                                  <span className="inline-flex items-center gap-1 mr-3">
                                    <User className="h-3.5 w-3.5" />
                                    {o.employee || "—"}
                                  </span>
                                  <span className="inline-flex items-center gap-1">
                                    <CreditCard className="h-3.5 w-3.5" />
                                    {o.payment_type || "—"}
                                  </span>
                                </div>
                              </div>
                              <div className="text-sm font-semibold tabular-nums shrink-0">
                                {centsToMoney(o.final_total_cents)}
                              </div>
                            </button>
                          );
                        })
                      );
                    })()}
                  </div>

                  <div className="px-4 py-3 text-center text-sm text-muted-foreground border-t border-border/40 shrink-0">
                    <Button variant="outline" size="sm" onClick={() => loadOrders()} disabled={ordersBusy}>
                      {ordersBusy ? <TinySpinner size={14} /> : "Load more (same filters)"}
                    </Button>
                  </div>
                </>
              )}
            </Card>

            {/* RIGHT detail */}
            <Card className="border-border/50 min-h-0 flex flex-col overflow-hidden">
              <div className="px-4 py-2 border-b border-border/40 flex items-center justify-between shrink-0">
                <span className="text-sm font-semibold text-foreground">Order Detail</span>
                {ordersBusy && <TinySpinner size={14} />}
              </div>

              {!selectedOrder ? (
                <div className="p-4 text-sm text-muted-foreground">Select an order on the left to see lines, totals, and metadata.</div>
              ) : (
                <div className="flex-1 min-h-0 overflow-auto p-4 space-y-3">
                  {/* top summary */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold break-all">{selectedOrder.order_id}</span>
                        <button type="button" className="p-1 rounded hover:bg-muted" title="Copy" onClick={() => navigator.clipboard.writeText(selectedOrder.order_id)}>
                          <CopyIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      </div>
                      <div className="text-xs text-muted-foreground">{new Date(selectedOrder.created_at).toLocaleString()}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Final Total</div>
                      <div className="text-base font-semibold">{centsToMoney(selectedOrder.final_total_cents ?? 0)}</div>
                    </div>
                  </div>

                  {/* meta */}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <User className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground shrink-0">Employee:</span>
                      <span className="font-medium truncate">{selectedOrder.employee || "—"}</span>
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      <CreditCard className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground shrink-0">Payment:</span>
                      <span className="font-medium truncate">{selectedOrder.payment_type || "—"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Tax Exempt:</span>
                      <span className="font-medium">{selectedOrder.tax_exempt ? "Yes" : "No"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Tax Rate:</span>
                      <span className="font-medium">
                        {Number.isFinite(selectedOrder.tax_rate) ? `${(selectedOrder.tax_rate * 100).toFixed(2)}%` : "—"}
                      </span>
                    </div>
                  </div>

                  {/* lines */}
                  <div className="border rounded-lg border-border/40 overflow-hidden">
                    <div className="px-3 py-2 bg-muted/20 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Lines</div>
                    <div className="divide-y divide-border/20">
                      {selectedOrder.lines.length === 0 ? (
                        <div className="p-3 text-sm text-muted-foreground">No lines</div>
                      ) : (
                        selectedOrder.lines.map((ln, idx) => (
                          <div key={idx} className="px-3 py-2 text-sm grid grid-cols-[1fr,70px,90px] gap-3">
                            <div className="min-w-0">
                              <div className="font-medium truncate">{ln.product_name || (ln.synergy_id ? `[${ln.synergy_id}]` : "(misc)")}</div>
                              <div className="text-xs text-muted-foreground">
                                {ln.kind.toUpperCase()}
                                {ln.synergy_id ? ` · ${ln.synergy_id}` : ""}
                              </div>
                            </div>
                            <div className="text-right tabular-nums">× {ln.qty}</div>
                            <div className="text-right tabular-nums">{centsToMoney(ln.line_total_cents ?? 0)}</div>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="px-3 py-2 border-t border-border/30 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span className="tabular-nums">{centsToMoney(selectedOrder.subtotal_cents ?? 0)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Tax</span>
                        <span className="tabular-nums">{centsToMoney(selectedOrder.tax_cents ?? 0)}</span>
                      </div>
                      <div className="flex items-center justify-between font-semibold">
                        <span>Total</span>
                        <span className="tabular-nums">{centsToMoney(selectedOrder.final_total_cents ?? 0)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          </div>

          {!ordersBusy && orders.length === 0 && !orderError && (
            <div className="px-4 pb-4 text-xs text-muted-foreground">
              Tip: this panel expects <code className="font-mono">GET /labels/orders</code> and{" "}
              <code className="font-mono">GET /labels/orders/:id</code>. It will also fall back to{" "}
              <code className="font-mono">GET /labels/order?order_id=…</code> if needed.
            </div>
          )}
        </div>
      </div>
    )}

    {/* ===================== Category Modal ===================== */}
    {catModal.open && catModal.sid && (
      <div
        className="fixed inset-0 z-[999] flex items-center justify-center"
        style={{ background: "rgba(0,0,0,.45)" }}
        onClick={(e) => {
          if (e.target === e.currentTarget) setCatModal({ open: false, sid: null });
        }}
      >
        <div className="w-[560px] max-w-[92vw] rounded-xl border border-border bg-card text-foreground shadow-xl">
          <div className="p-4 border-b border-border/70 flex items-center justify-between">
            <div>
              <div className="text-sm text-muted-foreground">Category settings</div>
              <div className="text-base font-semibold">
                {catModal.sid} <span className="text-muted-foreground font-normal">· {catModal.product || ""}</span>
              </div>
            </div>
            <button className="h-8 px-3 rounded-md border border-border hover:bg-muted/20" onClick={() => setCatModal({ open: false, sid: null })}>
              Close
            </button>
          </div>

          <ModalBodyCategory
            sid={catModal.sid}
            rules={catRules}
            overrides={catOverrides}
            onApply={async (nextCategoryName) => {
              try {
                await apiCatSetOverride(catModal.sid!, nextCategoryName);
                const next = await apiCatGetOverrides();
                setCatOverrides(next || {});
                setCatModal({ open: false, sid: null });
              } catch (e: any) {
                alert(e?.message || String(e));
              }
            }}
            onNewRule={async (label, color) => {
              const id = `cat:${label.toLowerCase().replace(/[^a-z0-9:_\.\-]+/g, "-")}`.replace(/-+/g, "-");
              const rule: CategoryRule = {
                id,
                label,
                color: color || null,
                criteria: [{ kind: "prefix", value: label }],
              };
              await apiCatUpsertRule(rule);
              const fresh = await apiCatGetRules();
              setCatRules(fresh || []);
              return id;
            }}
            fetchSuggest={async (sid) => {
              try {
                const s = await apiCatSuggest([sid]);
                return s[sid] || "";
              } catch {
                return "";
              }
            }}
          />
        </div>
      </div>
    )}
  </>
);


/* ---------- CSV export (kept) ---------- */
function downloadCsv(filename: string, rows: StockRow[]) {
  const cols = [
    "synergy_id",
    "product_name",
    "msrpDisplay",
    "ourPriceDisplay",
    "qty_on_hand",
    "sold_count",
    "updated_at",
  ];

  // SANITIZATION HELPER
  const sanitize = (val: string) => {
    if (!val) return "";
    // If it starts with a formula trigger, escape it with a single quote
    if (/^[=+\-@]/.test(val)) {
      return "'" + val;
    }
    return val;
  };

  const esc = (v: any) => {
    const s = v == null ? "" : String(v);
    const safeS = sanitize(s); // Apply sanitization
    // Wrap in quotes if it contains delimiters
    return safeS.includes(",") || safeS.includes('"') || safeS.includes("\n")
      ? `"${safeS.replace(/"/g, '""')}"`
      : safeS;
  };

  const csv = [cols.join(",")]
    .concat(rows.map((r) => cols.map((c) => esc((r as any)[c])).join(",")))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 600);
}

function ModalBodyCategory(props: {
  sid: string;
  rules: CategoryRule[];
  overrides: Record<string, string>;
  onApply: (categoryId: string | null) => Promise<void>;
  onNewRule: (label: string, color?: string) => Promise<string>; // returns new id
  fetchSuggest: (sid: string) => Promise<string>;
}) {
  const { sid, rules, overrides, onApply, onNewRule, fetchSuggest } = props;
  const currentOverrideId = overrides[sid] || null;

  const [selected, setSelected] = React.useState<string | "">(currentOverrideId || "");
  const [busy, setBusy] = React.useState(false);
  const [suggest, setSuggest] = React.useState<string>("");

  // quick add
  const [newLabel, setNewLabel] = React.useState("");
  const [newColor, setNewColor] = React.useState("");

  React.useEffect(() => {
    setSelected(currentOverrideId || "");
  }, [currentOverrideId, sid]);

  React.useEffect(() => {
    (async () => {
      const s = await fetchSuggest(sid);
      setSuggest(s || "");
    })();
  }, [sid]);

  const categories = React.useMemo(
    () =>
      (rules || [])
        .map((r) => ({ id: r.id, text: (r as any).name ?? (r as any).label ?? r.id })).sort((a, b) => (a.text || '').localeCompare(b.text || '')),
    [rules]
  );

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-1 gap-3">
        <div className="text-sm">
          <div className="text-muted-foreground mb-1">Suggested</div>
          <div className="inline-flex items-center gap-2 rounded-md border border-border bg-muted/10 px-2 py-1">
            <span className="text-sm font-medium">{suggest || "(none)"}</span>
            {!!suggest && (
              <button
                className="text-xs underline hover:no-underline"
                onClick={() => setSelected(findRuleIdByLabel(categories, suggest) || "")}
              >
                Use suggestion
              </button>
            )}
          </div>
        </div>

        <div>
          <div className="text-sm text-muted-foreground mb-1">Override</div>
          <div className="flex items-center gap-2">
            <select
              className="h-9 min-w-[240px] rounded-md border border-border bg-card px-2 text-sm text-foreground"
              value={selected}
              onChange={(e) => setSelected(e.currentTarget.value)}
            >
              <option value="">(no override)</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.text}
                </option>
              ))}
            </select>

            <button
              disabled={busy}
              className="h-9 px-3 rounded-md border border-border bg-primary/10 hover:bg-primary/20"
              onClick={async () => {
                setBusy(true);
                try {
                  await onApply(selected || null);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Save
            </button>

            {!!currentOverrideId && (
              <button
                disabled={busy}
                className="h-9 px-3 rounded-md border border-border hover:bg-muted/20"
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onApply(null);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Clear
              </button>
            )}
          </div>
          {!!currentOverrideId && (
            <div className="mt-1 text-xs text-muted-foreground">
              Current override: <span className="font-mono">{currentOverrideId}</span>
            </div>
          )}
        </div>
      </div>

      <div className="pt-3 border-t border-border/70">
        <div className="text-sm font-semibold mb-2">Quick add category</div>
        <div className="grid grid-cols-[1fr,140px,auto] gap-2 items-center">
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.currentTarget.value)}
            placeholder="Label (also used as prefix criteria)"
            className="h-9 rounded-md border border-border bg-card px-2 text-sm text-foreground placeholder:text-muted-foreground/70"
          />
          <input
            value={newColor}
            onChange={(e) => setNewColor(e.currentTarget.value)}
            placeholder="Color (optional, e.g. #00c4ff)"
            className="h-9 rounded-md border border-border bg-card px-2 text-sm text-foreground placeholder:text-muted-foreground/70"
          />
          <button
            disabled={busy || !newLabel.trim()}
            className="h-9 px-3 rounded-md border border-border hover:bg-muted/20"
            onClick={async () => {
              const label = newLabel.trim();
              if (!label) return;
              setBusy(true);
              try {
                const newId = await onNewRule(label, newColor.trim() || undefined);
                // preselect the newly added category so "Save" applies it
                setSelected(newId);
                setNewLabel("");
                setNewColor("");
              } catch (e: any) {
                alert(e?.message || String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Add
          </button>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          Adds a user rule with a single <code>prefix</code> criterion matching the label.
        </div>
      </div>
    </div>
  );
}

function findRuleIdByLabel(list: { id: string; text: string }[], label: string): string | null {
  const found = list.find((x) => x.text.toLowerCase() === label.toLowerCase());
  return found ? found.id : null;
}
{/* =================== /Category Modal =================== */}

/* ---------- orders filtering helpers ---------- */
function filteredOrders(list: OrderSummary[], ov: {
  q: string;
  employee: string;
  payment: "any" | "Cash" | "Card" | "Gift Card";
  tax: "any" | "taxed" | "exempt";
  minTotal: string;
  maxTotal: string;
  sort: "new" | "old" | "high" | "low";
  size: number;
  from: string;
  to: string;
}): OrderSummary[] {
  const q = (ov.q || "").toLowerCase().trim();
  const min = ov.minTotal ? Number(ov.minTotal) : null;
  const max = ov.maxTotal ? Number(ov.maxTotal) : null;
  const from = ov.from ? new Date(ov.from + "T00:00:00").getTime() : null;
  const to = ov.to ? new Date(ov.to + "T23:59:59").getTime() : null;

  let arr = list.slice(0, ov.size || 50);

  if (q) {
    arr = arr.filter((o) =>
      (o.order_id || "").toLowerCase().includes(q) ||
      (o.employee || "").toLowerCase().includes(q) ||
      (o.payment_type || "").toLowerCase().includes(q)
    );
  }
  if (ov.employee.trim()) {
    const e = ov.employee.toLowerCase().trim();
    arr = arr.filter((o) => (o.employee || "").toLowerCase().includes(e));
  }
  if (ov.payment !== "any") {
    arr = arr.filter((o) => (o.payment_type || "") === ov.payment);
  }
  if (ov.tax !== "any") {
    arr = arr.filter((o) => (ov.tax === "exempt" ? o.tax_exempt : !o.tax_exempt));
  }
  if (min != null) {
    arr = arr.filter((o) => o.final_total_cents >= Math.round(min * 100));
  }
  if (max != null) {
    arr = arr.filter((o) => o.final_total_cents <= Math.round(max * 100));
  }
  if (from != null) {
    arr = arr.filter((o) => new Date(o.created_at).getTime() >= from);
  }
  if (to != null) {
    arr = arr.filter((o) => new Date(o.created_at).getTime() <= to);
  }

  arr.sort((a, b) => {
    switch (ov.sort) {
      case "new":
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      case "old":
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      case "high":
        return b.final_total_cents - a.final_total_cents;
      case "low":
        return a.final_total_cents - b.final_total_cents;
      default:
        return 0;
    }
  });

  return arr;
}
}