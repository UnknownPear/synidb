
import React from "react";
import type { ListRow } from "./types";
import { API_BASE } from "./dataClient"; // Change the import to explicitly target .tsx

const similarRowsCache = new Map<string, any[]>();

async function fetchSimilarRowsDirect(criteria: {
  productName?: string;
  specs?: any;
  grade?: string;
  categoryId?: string;
  excludeSynergyId?: string;
  limit?: number;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${API_BASE}/rows/search_similar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(criteria),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`${res.status} ${res.statusText} — ${text.slice(0, 160)}`);
    }
    return (await res.json()) as { items: any[] };
  } finally {
    clearTimeout(timeout);
  }
}

export function useSimilarRowsDirect(row: ListRow) {
  const [state, setState] = React.useState<{
    items: any[] | null;
    loading: boolean;
    error?: string | null;
  }>({
    items: similarRowsCache.get(row.synergyId) ?? null,
    loading: false,
    error: null,
  });

  const find = React.useCallback(async () => {
    if (similarRowsCache.has(row.synergyId)) {
      setState({ items: similarRowsCache.get(row.synergyId) ?? [], loading: false, error: null });
      return;
    }
    setState({ items: null, loading: true, error: null });
    try {
      const res = await fetchSimilarRowsDirect({
        productName: row.productName,
        specs: row.specs,
        grade: row.grade as any,
        categoryId: (row as any).categoryId,
        excludeSynergyId: row.synergyId,
        limit: 5,
      });
      const items = res?.items ?? [];
      similarRowsCache.set(row.synergyId, items);
      setState({ items, loading: false, error: null });
    } catch (e: any) {
      setState({ items: [], loading: false, error: e?.message || "Failed to search" });
    }
  }, [row.synergyId, row.productName, row.specs, row.grade, (row as any).categoryId]);

  return { ...state, find };
}
