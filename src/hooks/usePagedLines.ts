// src/hooks/usePagedLines.ts
import * as React from "react";

export type POLine = {
  id: string;
  synergy_id?: string | null;
  product_name_raw?: string | null;
  upc?: string | null;
  asin?: string | null;
  qty?: number | null;
  unit_cost?: number | null;
  msrp?: number | null;
};

const PAGE = 250;

export function usePagedLines(apiBase: string, poId: string) {
  const [rowCount, setRowCount] = React.useState(0);
  const [summary, setSummary] = React.useState<{ qty_total: number; cost_total: number; version: string } | null>(null);

  // Sparse cache: pageOffset -> rows[]
  const pagesRef = React.useRef(new Map<number, POLine[]>());
  const [bump, setBump] = React.useState(0); // force re-render when pages fill

  const pageKey = (index: number) => Math.floor(index / PAGE) * PAGE;

  const fetchPage = React.useCallback(async (offset: number) => {
    if (pagesRef.current.has(offset)) return;
    const res = await fetch(`${apiBase}/pos/${encodeURIComponent(poId)}/lines?limit=${PAGE}&offset=${offset}`, { credentials: "include" });
    const data = (await res.json()) as { rows: POLine[] };
    pagesRef.current.set(offset, data.rows ?? []);
    setBump(x => x + 1);
  }, [apiBase, poId]);

  const prefetchRange = React.useCallback((startIdx: number, stopIdx: number) => {
    const first = pageKey(Math.max(0, startIdx - PAGE)); // one page above
    const last  = pageKey(stopIdx + PAGE);               // one page below
    for (let off = first; off <= last; off += PAGE) fetchPage(off);
  }, [fetchPage]);

  const getRow = React.useCallback((index: number): POLine | null => {
    const key = pageKey(index);
    const page = pagesRef.current.get(key);
    if (!page) return null;
    return page[index - key] ?? null;
  }, []);

  const isLoaded = React.useCallback((index: number) => pagesRef.current.has(pageKey(index)), []);

  const hydrate = React.useCallback(async () => {
    const res = await fetch(`${apiBase}/pos/${encodeURIComponent(poId)}/snapshot?limit=${PAGE}&offset=0`, { credentials: "include" });
    const data = await res.json() as {
      summary: { rowCount: number; qty_total: number; cost_total: number; version: string };
      page: { rows: POLine[]; offset: number; limit: number };
    };
    setRowCount(data.summary.rowCount);
    setSummary({ qty_total: data.summary.qty_total, cost_total: data.summary.cost_total, version: data.summary.version });
    pagesRef.current.clear();
    pagesRef.current.set(data.page.offset, data.page.rows ?? []);
    setBump(x => x + 1);

    // Idle prefetch top area (0..3 pages)
    if ("requestIdleCallback" in window) {
      (window as any).requestIdleCallback?.(() => {
        [0, PAGE, 2 * PAGE, 3 * PAGE].forEach(async off => {
          if (off < data.summary.rowCount && !pagesRef.current.has(off)) {
            try {
              const r = await fetch(`${apiBase}/pos/${encodeURIComponent(poId)}/lines?limit=${PAGE}&offset=${off}`, { credentials: "include" });
              const d = await r.json();
              pagesRef.current.set(off, d.rows ?? []);
              setBump(x => x + 1);
            } catch {}
          }
        });
      }, { timeout: 1200 });
    }
  }, [apiBase, poId]);

  React.useEffect(() => { hydrate(); }, [hydrate]);

  return { PAGE, rowCount, summary, getRow, isLoaded, prefetchRange, refresh: hydrate, bump };
}
