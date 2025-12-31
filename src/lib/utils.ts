// src/lib/utils.ts  (keep as .ts)

import React from "react";
import type { LucideIcon } from "lucide-react";
import { Laptop, Smartphone, Monitor, HardDrive } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { clsx, type ClassValue } from "clsx";

import type { Grade } from "@/lib/grades";
import type { InventoryRow } from "@/lib/dataClient";

/* ────────────────────────────────────────────────────────────────────────────
   Class name merge
──────────────────────────────────────────────────────────────────────────── */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ────────────────────────────────────────────────────────────────────────────
   API base + join
──────────────────────────────────────────────────────────────────────────── */
export const RAW_API = ((import.meta as any).env?.VITE_API_URL ?? "/backend").trim();
export const API_BASE = new URL(RAW_API, window.location.origin).toString().replace(/\/+$/, "");
export const apiJoin = (path: string) => `${API_BASE}/${String(path).replace(/^\/+/, "")}`;
// --- Posted status helper (no JSX, safe in .ts) ---
export type Postable = {
  postedAt?: string | null;
  postedBy?: string | null;
  ebayItemUrl?: string | null;
};
/* ────────────────────────────────────────────────────────────────────────────
   Icons (no JSX so this is safe in .ts)
──────────────────────────────────────────────────────────────────────────── */
export function getCategoryIcon(
  category?: string,
  props: React.ComponentProps<"svg"> = { className: "h-4 w-4" }
) {
  const c = (category ?? "").toString().trim().toLowerCase();

  const pickIcon = (text: string): LucideIcon => {
    if (!text) return HardDrive;
    if (/\b(macbook|surface|laptop)\b/.test(text)) return Laptop;
    if (/\b(phone|iphone|android)\b/.test(text)) return Smartphone;
    if (/\b(chromebox|monitor|display)\b/.test(text)) return Monitor;
    return HardDrive;
  };

  const Icon = pickIcon(c);
  return React.createElement(Icon, props);
}

/* ────────────────────────────────────────────────────────────────────────────
   Dates / number helpers
──────────────────────────────────────────────────────────────────────────── */
export function toYMD(d: any): string | null {
  if (!d) return null;
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return null;
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

export function numOrNull(v: any): number | null {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function uuidOrNull(v: any): string | null {
  if (typeof v !== "string") return null;
  // loose UUID v4-ish
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(v)
    ? v
    : null;
}

/* ────────────────────────────────────────────────────────────────────────────
   API mapping + patch shaping
──────────────────────────────────────────────────────────────────────────── */
export function forApiPatch(patch: Partial<InventoryRow>) {
  const out: any = {};
  if ("grade" in patch) out.grade = (patch as any).grade ?? null;
  if ("testedBy" in patch) out.testedBy = (patch as any).testedBy ?? null;
  if ("testedDate" in patch) out.testedDate = toYMD((patch as any).testedDate);
  if ("testerComment" in patch) out.testerComment = (patch as any).testerComment ?? null;
  if ("specs" in patch) out.specs = (patch as any).specs && Object.keys((patch as any).specs || {}).length ? (patch as any).specs : {};
  if ("price" in patch) out.price = numOrNull((patch as any).price);
  if ("ebayPrice" in patch) out.ebayPrice = numOrNull((patch as any).ebayPrice);
  if ("categoryId" in patch) out.categoryId = uuidOrNull((patch as any).categoryId);
  if ("postedAt" in patch) out.postedAt = (patch as any).postedAt ?? null;
  if ("postedBy" in patch) out.postedBy = (patch as any).postedBy ?? null;
  if ("ebayItemUrl" in patch) out.ebayItemUrl = (patch as any).ebayItemUrl ?? null;
  return out;
}

export function mapApiRow(r: any): InventoryRow {
  return {
    synergyId: r.synergyId ?? r.synergy_id ?? r.id ?? "",
    productName: r.productName ?? r.product_name ?? r.title ?? "",
    // keep both label + id if present so filters work
    category: r.category ?? r.category_label ?? r.categoryLbl ?? "",
    categoryId: r.categoryId ?? r.category_id ?? null,
    categoryLbl: r.categoryLbl ?? r.category_label ?? (r.category ?? ""),
    // testing fields
    grade: r.grade,
    condition: r.condition,
    testedBy: r.testedBy ?? r.tested_by ?? null,
    testedDate: r.testedDate ?? r.tested_date ?? null,
    testerComment: r.testerComment ?? r.tester_comment ?? null,
    // misc
    specs: r.specs ?? {},
    price: r.price ?? null,
    ebayPrice: r.ebayPrice ?? r.ebay_price ?? null,
    postedAt: r.postedAt ?? r.posted_at ?? null,
    postedBy: r.postedBy ?? r.posted_by ?? null,
    ebayItemUrl: r.ebayItemUrl ?? r.ebay_item_url ?? null,
  } as any;
}

const legacyToGrade: Record<string, Grade> = {
  Excellent: "A",
  Good: "B",
  Fair: "C",
  Rough: "D",
  Parts: "P",
};

export function withGrade(r: InventoryRow) {
  return {
    ...r,
    grade: (r as any).grade ?? legacyToGrade[(r as any).condition as string] ?? "B",
  } as InventoryRow & { grade?: Grade };
}



export function getPostStatus(r: Postable) {
  const isPosted = Boolean(r?.ebayItemUrl || r?.postedAt || r?.postedBy);
  return {
    isPosted,
    postedAt: r?.postedAt ?? null,
    postedBy: r?.postedBy ?? null,
    link: r?.ebayItemUrl ?? null,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   Completeness (used by CardRow and filters)
──────────────────────────────────────────────────────────────────────────── */
export function getCompletenessStatus(r: {
  grade?: Grade;
  testedBy?: string | null;
  testedDate?: string | null;
  testedAt?: string | null;
}) {
  const tested = r.testedDate ?? r.testedAt ?? null;
  const isReady = Boolean(r.grade && r.testedBy && tested);

  const missingFields: string[] = [];
  if (!r.grade) missingFields.push("Grade");
  if (!r.testedBy) missingFields.push("Tester");
  if (!tested) missingFields.push("Date");

  return {
    isReady,
    missingFields,
    grade: (r.grade ?? "N/A") as Grade | "N/A",
    testedBy: r.testedBy ?? "N/A",
  };
}
