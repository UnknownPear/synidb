// src/lib/testerTypes.ts

import { 
  HardDrive, Laptop, Monitor, Smartphone, Camera, Headphones, 
  Speaker, Watch, Gamepad2, Keyboard, Printer, Cpu, Box, 
  Disc, Tv, Zap,Shirt,        
  Utensils,     
  Dumbbell,       
  Home,           
  ShieldCheck,  
  Tablet,        
  PcCase,        
  Music,         
  CarFront,      
  Plane,         
  Projector,     
} from "lucide-react";
import type { Grade } from "@/lib/grades";
import { type InventoryRow } from "@/lib/dataClient";

// --- Types ---
export type ListRow = InventoryRow & { 
  grade?: Grade; 
  lastPrintedAt?: string | null;
  upc?: string | null;
  asin?: string | null;
  partStatus?: 'NEEDED' | 'ARRIVED' | null;
  status?: string | null;
};

export type SessionSettings = {
  defaultGrade: Grade;
  autoSetDateToToday: boolean;
  preventOverwriteExistingId: boolean;
  soundOnSave: boolean;
  denseMode: boolean;
  showSpecsInline: boolean;
  itemsPerPage: number;
  wideMode: boolean;
  autoRefreshInterval: number;
};

export const DEFAULT_SETTINGS: SessionSettings = {
  defaultGrade: "B",
  autoSetDateToToday: true,
  preventOverwriteExistingId: true,
  soundOnSave: false,
  denseMode: false,
  showSpecsInline: true,
  itemsPerPage: 50,
  wideMode: false,
  autoRefreshInterval: 30,
};

// --- Constants ---
export const RAW_API = ((import.meta as any).env?.VITE_API_URL || "/backend").trim();
export const API_BASE = new URL(RAW_API, window.location.origin).toString().replace(/\/+$/, "");
export const apiJoin = (path: string) => `${API_BASE}/${String(path).replace(/^\/+/, "")}`;

const legacyToGrade: Record<string, Grade> = {
  Excellent: "A", Good: "B", Fair: "C", Rough: "D", Parts: "P",
};

// --- 1. Available Options ---
export const PRESET_ICONS: Record<string, LucideIcon> = {
  // Generic / Tech
  box: Box,
  power: Zap,
  part: Cpu,
  acc: Keyboard,
  
  // Computing
  laptop: Laptop,
  desktop: PcCase,    // For "Desktop - ..."
  monitor: Monitor,
  tablet: Tablet,     // For "Tablets - ..."
  drive: HardDrive,   // For "SD Cards", "Storage"
  print: Printer,

  // Audio / Video
  phone: Smartphone,
  camera: Camera,
  tv: Tv,
  projector: Projector, // For "Projectors"
  audio: Headphones,
  speaker: Speaker,
  disc: Disc,         // DVD/Blu-Ray

  // Gaming
  game: Gamepad2,

  // Lifestyle / Home
  watch: Watch,
  home: Home,         // Home Goods
  kitchen: Utensils,  // Kitchen
  shirt: Shirt,       // Clothing
  sport: Dumbbell,    // Sporting Goods
  music: Music,       // Musical Instruments
  security: ShieldCheck, // Home Security
  car: CarFront,      // Car Audio
  drone: Plane,       // Drones (Plane is the closest generic flyer)
};

export const PRESET_COLORS = {
  slate:   "bg-slate-500/10 border-slate-500/20 text-slate-500",
  red:     "bg-red-500/10 border-red-500/20 text-red-600",
  orange:  "bg-orange-500/10 border-orange-500/20 text-orange-600",
  amber:   "bg-amber-500/10 border-amber-500/20 text-amber-600",
  green:   "bg-emerald-500/10 border-emerald-500/20 text-emerald-600",
  blue:    "bg-blue-500/10 border-blue-500/20 text-blue-600",
  sky:     "bg-sky-500/10 border-sky-500/20 text-sky-600",
  indigo:  "bg-indigo-500/10 border-indigo-500/20 text-indigo-600",
  violet:  "bg-violet-500/10 border-violet-500/20 text-violet-600",
  purple:  "bg-purple-500/10 border-purple-500/20 text-purple-600",
  fuchsia: "bg-fuchsia-500/10 border-fuchsia-500/20 text-fuchsia-600",
  pink:    "bg-pink-500/10 border-pink-500/20 text-pink-600",
};

// --- Logic Helpers ---

export function withGrade(r: InventoryRow): ListRow {
  return {
    ...r,
    grade: (r as any).grade ?? legacyToGrade[(r as any).condition as string] ?? "B",
  };
}

export function mapApiRow(r: any): InventoryRow {
  return {
    synergyId: r.synergyId ?? r.synergy_id ?? r.id ?? "",
    productName: r.productName ?? r.product_name ?? r.title ?? "",
    
    // Flatten the category object if present
    category: r.categoryLabel ?? r.category ?? r.category_label ?? r.categoryLbl ?? "",
    categoryId: r.categoryId ?? r.category_id ?? null,
    categoryLbl: r.categoryLabel ?? r.categoryLbl ?? r.category_label ?? (r.category ?? ""),
    
    // VISUAL FIELDS (Populated by backend join)
    categoryIcon: r.categoryIcon ?? "box",
    categoryColor: r.categoryColor ?? "slate",
    
    grade: r.grade,
    condition: r.condition,
    status: r.status ?? r.testStatus ?? r.test_status ?? null, 
    testedBy: r.testedBy ?? r.tested_by ?? null,
    testedDate: r.testedDate ?? r.tested_date ?? null,
    testerComment: r.testerComment ?? r.tester_comment ?? null,
    specs: r.specs ?? {},
    price: r.price ?? null,
    ebayPrice: r.ebayPrice ?? r.ebay_price ?? null,
    
    purchaseCost: r.purchaseCost ?? r.unit_cost ?? r.cost_unit ?? null,

    postedAt: r.postedAt ?? r.posted_at ?? null,
    postedBy: r.postedBy ?? r.posted_by ?? null,
    ebayItemUrl: r.ebayItemUrl ?? r.ebay_item_url ?? null,
    lastPrintedAt: r.lastPrintedAt ?? r.last_printed_at ?? null,
    upc: r.upc ?? null,
    asin: r.asin ?? null,
    
    partStatus: r.partStatus ?? r.part_status ?? null,
  } as any;
}

export function extractRows(json: any): any[] {
  if (Array.isArray(json)) return json;
  if (json && Array.isArray(json.items)) return json.items;
  if (json && Array.isArray(json.rows)) return json.rows;
  return [];
}

export const getCompletenessStatus = (r: ListRow) => {
  const tested = (r as any).testedDate || (r as any).testedAt;
  const isReady = !!(r.grade && r.testedBy && tested);
  const missingFields: string[] = [];
  if (!r.grade) missingFields.push("Grade");
  if (!r.testedBy) missingFields.push("Tester");
  if (!tested) missingFields.push("Date");
  return { isReady, missingFields, grade: r.grade ?? "N/A", testedBy: r.testedBy ?? "N/A" };
};

export const getGradeColor = (grade: Grade | undefined) => {
  switch (grade) {
    case "A": return "text-green-600";
    case "B": return "text-blue-600";
    case "C": return "text-yellow-600";
    case "D": return "text-red-600";
    case "P": return "text-gray-600";
    default: return "text-gray-600";
  }
};

// 2. Dynamic Tone Helper
export const categoryTone = (colorKey?: string) => {
  const k = (colorKey || "slate") as keyof typeof PRESET_COLORS;
  return PRESET_COLORS[k] || PRESET_COLORS.slate;
};

// 3. Dynamic Icon Helper (Returns the Component Class, NOT an Element)
export const getCategoryIcon = (iconKey?: string): LucideIcon => {
  const k = (iconKey || "box") as keyof typeof PRESET_ICONS;
  return PRESET_ICONS[k] || Box;
};

export const toYMD = (d: any): string | null => {
  if (!d) return null;
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
};

export const numOrNull = (v: any) => (v === "" || v == null || !Number.isFinite(Number(v))) ? null : Number(v);
export const uuidOrNull = (v: any) => (typeof v === "string" && /^[0-9a-f]{8}-/.test(v)) ? v : null;

export const forApiPatch = (patch: Partial<InventoryRow>) => {
  const out: any = {};
  if ("grade" in patch) out.grade = (patch as any).grade ?? null;
  if ("testedBy" in patch) out.testedBy = (patch as any).testedBy ?? null;
  if ("testedDate" in patch) out.testedDate = toYMD((patch as any).testedDate);
  if ("testerComment" in patch) out.testerComment = (patch as any).testerComment ?? null;
  if ("specs" in patch) out.specs = (patch as any).specs || {};
  if ("price" in patch) out.price = numOrNull((patch as any).price);
  if ("ebayPrice" in patch) out.ebayPrice = numOrNull((patch as any).ebayPrice);
  if ("categoryId" in patch) out.categoryId = uuidOrNull((patch as any).categoryId);
  if ("partStatus" in patch) out.partStatus = patch.partStatus;

  return out;
};

export async function fetchSimilarRowsDirect(criteria: { productName?: string; excludeSynergyId?: string; limit?: number }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${API_BASE}/rows/search_similar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      signal: controller.signal,
      body: JSON.stringify(criteria),
    });
    if (!res.ok) return { items: [] };
    return (await res.json()) as { items: any[] };
  } finally {
    clearTimeout(timeout);
  }
}