// src/lib/galleryClient.ts — Directus-free, uses FastAPI (:3000)

import { api, API_BASE } from "./dataClient";

/* ---------------------------- Types ---------------------------- */

export type Grade = "A" | "B" | "C" | "D";

export type GalleryItem = {
  id: string;
  synergyId?: string | null;
  partNumber?: string | null;          // optional, for parts galleries
  file: { id: string; title?: string | null };
  grade?: Grade | null;                // product grade
  partGrade?: Grade | null;            // for-parts grade
  angle?: string | null;
  is_primary?: boolean | null;
  order?: number | null;
  alt?: string | null;
  notes?: string | null;
  problems?: string[] | null;
  folder?: string | null;              // optional field
  categories?: string[] | null;        // optional field
};

export function getDisplayGrade(item: GalleryItem): Grade | null | undefined {
  return item.partGrade ?? item.grade ?? null;
}

/* ---------------------------- Helpers ---------------------------- */

function sortGallery(items: GalleryItem[]): GalleryItem[] {
  // Same UX as before: order ASC, primary first
  return [...items].sort((a, b) => {
    const oa = a.order ?? 0;
    const ob = b.order ?? 0;
    if (oa !== ob) return oa - ob;
    const pa = a.is_primary ? 1 : 0;
    const pb = b.is_primary ? 1 : 0;
    return pb - pa; // primary first
  });
}

/** Build public asset URL (backend must expose GET /assets/{fileId}) */
export function assetUrl(fileId: string) {
  const base = (API_BASE || "").replace(/\/+$/, "");
  return `${base}/assets/${encodeURIComponent(fileId)}`;
}

/* ---------------------------- Queries ---------------------------- */

/** Fetch gallery for a product by Synergy ID */
export async function fetchProductGalleryBySID(synergyId: string): Promise<GalleryItem[]> {
  const items = await api<GalleryItem[]>(`/gallery/product?synergyId=${encodeURIComponent(synergyId)}`);
  return sortGallery(items || []);
}

/** Fetch gallery for a part by key; default field is 'partNumber' */
export async function fetchPartGallery(partKey: string, opts?: { field?: string }) {
  const field = opts?.field ?? "partNumber";
  const qs = `field=${encodeURIComponent(field)}&value=${encodeURIComponent(partKey)}`;
  const items = await api<GalleryItem[]>(`/gallery/part?${qs}`);
  return sortGallery(items || []);
}

/** Unified fetch */
export async function fetchGallery(params: {
  synergyId?: string;
  partKey?: string;
  partField?: string;
}) {
  if (params.synergyId) return fetchProductGalleryBySID(params.synergyId);
  if (params.partKey) return fetchPartGallery(params.partKey, { field: params.partField ?? "partNumber" });
  throw new Error("fetchGallery: provide synergyId or partKey");
}

/** Client-side filters */
export function filterGallery(
  rows: GalleryItem[],
  opts: { grade?: Grade | null; problems?: string[] | null } = {}
) {
  const { grade = null, problems = null } = opts;
  let list = rows;

  if (grade) list = list.filter((r) => getDisplayGrade(r) === grade);
  if (problems?.length) {
    list = list.filter((r) => {
      const names = new Set(r.problems ?? []);
      return problems.every((t) => names.has(t));
    });
  }
  return list;
}
