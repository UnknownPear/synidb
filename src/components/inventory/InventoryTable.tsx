import * as React from "react";
import { Button } from "@/components/ui/button";
import { Printer, MoreHorizontal, ArrowUpDown, Minus, Plus, Copy } from "lucide-react";

export type StockRow = {
  synergy_id: string;
  product_name: string;
  msrpDisplay?: string;
  ourPriceDisplay?: string;
  qty_on_hand: number;
  sold_count: number;
  updated_at: string;
};

export type SortKey =
  | "synergy_id"
  | "product_name"
  | "msrp"
  | "price"
  | "qty_on_hand"
  | "sold_count"
  | "updated_at";

export type SortDir = "asc" | "desc";
export type ViewDensity = "comfortable" | "compact";

export type ColumnsVisible = {
  msrp: boolean;
  price: boolean;
  onhand: boolean;
  sold: boolean;
  updated: boolean;
  actions: boolean;
};

export default function InventoryTable({
  rows,
  loading,
  sortKey,
  sortDir,
  onSortChange,
  onReprint,
  onAdjustQty,
  money,
  density,
  columns,
}: {
  rows: StockRow[];
  loading: boolean;
  sortKey: SortKey;
  sortDir: SortDir;
  onSortChange: (k: SortKey, d: SortDir) => void;
  onReprint: (row: StockRow) => void;
  onAdjustQty: (sid: string, qtyOnHand: number) => void;
  money: (v?: string | number) => string;
  density: ViewDensity;
  columns: ColumnsVisible;
}) {
  const cellPad = density === "compact" ? "py-1.5" : "py-2.5";
  const rowHov = "hover:bg-white/5 transition-colors";

  const headerCol = (label: string, key: SortKey, alignRight = false) => {
    const active = sortKey === key;
    const nextDir: SortDir = active && sortDir === "asc" ? "desc" : "asc";
    const cls =
      "inline-flex items-center gap-1.5 text-xs font-semibold " +
      (alignRight ? "justify-end" : "");
    return (
      <button
        onClick={() => onSortChange(key, nextDir)}
        className={cls}
        title="Sort"
      >
        {label}
        <ArrowUpDown
          className={`h-3.5 w-3.5 ${active ? "opacity-100" : "opacity-60"}`}
        />
      </button>
    );
  };

  const copy = (text: string) => {
    try {
      navigator.clipboard?.writeText(text);
    } catch {}
  };

  return (
    <div className="w-full">
      {/* Header */}
      <div
        className={`grid grid-cols-[160px,1fr,${columns.msrp ? "120px" : "0px"},${columns.price ? "120px" : "0px"},${columns.onhand ? "140px" : "0px"},${columns.sold ? "100px" : "0px"},${columns.updated ? "160px" : "0px"},${columns.actions ? "140px" : "0px"}] items-center px-3 ${cellPad} border-b border-white/10 text-white/80 bg-white/5`}
      >
        <div className="text-left">{headerCol("ID", "synergy_id")}</div>
        <div className="text-left">{headerCol("Product", "product_name")}</div>
        {columns.msrp && <div className="text-right">{headerCol("MSRP", "msrp", true)}</div>}
        {columns.price && <div className="text-right">{headerCol("Price", "price", true)}</div>}
        {columns.onhand && <div className="text-center">{headerCol("On Hand", "qty_on_hand")}</div>}
        {columns.sold && <div className="text-right">{headerCol("Sold", "sold_count", true)}</div>}
        {columns.updated && <div className="text-right">{headerCol("Updated", "updated_at", true)}</div>}
        {columns.actions && <div className="text-right text-xs font-semibold">Actions</div>}
      </div>

      {/* Rows */}
      {loading ? (
        <div className="p-4 text-sm opacity-75">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="p-4 text-sm opacity-75">No items found.</div>
      ) : (
        rows.map((r) => (
          <div
            key={r.synergy_id}
            className={`grid grid-cols-[160px,1fr,${columns.msrp ? "120px" : "0px"},${columns.price ? "120px" : "0px"},${columns.onhand ? "140px" : "0px"},${columns.sold ? "100px" : "0px"},${columns.updated ? "160px" : "0px"},${columns.actions ? "140px" : "0px"}] items-center px-3 ${cellPad} border-b border-white/8 ${rowHov}`}
          >
            {/* ID + quick copy */}
            <div className="font-mono text-xs text-white/90 flex items-center gap-2">
              <span className="truncate">{r.synergy_id}</span>
              <button
                title="Copy ID"
                className="p-1 rounded hover:bg-white/10"
                onClick={() => copy(r.synergy_id)}
              >
                <Copy className="h-3.5 w-3.5 opacity-70" />
              </button>
            </div>

            {/* Product */}
            <div className="truncate pr-2">{r.product_name}</div>

            {/* Money columns (aligned, mono) */}
            {columns.msrp && (
              <div className="text-right font-mono tabular-nums">
                {money(r.msrpDisplay)}
              </div>
            )}
            {columns.price && (
              <div className="text-right font-mono tabular-nums font-semibold">
                {money(r.ourPriceDisplay)}
              </div>
            )}

            {/* On-hand with +/- inline adjust */}
            {columns.onhand && (
              <div className="flex items-center justify-center gap-1.5">
                <button
                  className="h-6 w-6 rounded border border-white/15 hover:bg-white/10 flex items-center justify-center"
                  onClick={() => onAdjustQty(r.synergy_id, Math.max(0, (r.qty_on_hand || 0) - 1))}
                  title="Decrement"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <input
                  className="h-6 w-14 text-center rounded border border-white/15 bg-transparent text-sm"
                  value={r.qty_on_hand}
                  onChange={(e) => {
                    const v = Math.max(0, parseInt(e.target.value || "0", 10));
                    onAdjustQty(r.synergy_id, isFinite(v) ? v : 0);
                  }}
                />
                <button
                  className="h-6 w-6 rounded border border-white/15 hover:bg-white/10 flex items-center justify-center"
                  onClick={() => onAdjustQty(r.synergy_id, (r.qty_on_hand || 0) + 1)}
                  title="Increment"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Sold */}
            {columns.sold && (
              <div className="text-right tabular-nums text-white/80">
                {r.sold_count}
              </div>
            )}

            {/* Updated */}
            {columns.updated && (
              <div className="text-right text-xs text-white/60">
                {new Date(r.updated_at).toLocaleString()}
              </div>
            )}

            {/* Actions */}
            {columns.actions && (
              <div className="flex items-center justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-2"
                  onClick={() => onReprint(r)}
                  title="Re-print label"
                >
                  <Printer className="h-4 w-4" />
                  Re-print
                </Button>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" disabled title="More (soon)">
                  <MoreHorizontal className="h-4 w-4 opacity-70" />
                </Button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
