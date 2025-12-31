import * as React from "react";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

export type StockRowType = {
  synergy_id: string;
  product_name: string;
  msrpDisplay?: string;
  ourPriceDisplay?: string;
  qty_on_hand: number;
  sold_count: number;
  updated_at: string;
};

export default function StockRow({
  row, onReprint, density,
}: {
  row: StockRowType;
  onReprint: () => void;
  density: "compact" | "comfortable";
}) {
  const pad = density === "compact" ? "py-1.5" : "py-2.5";
  return (
    <div
      className={`
        grid grid-cols-[160px,1fr,110px,110px,110px,170px,120px]
        items-center px-3 ${pad}
        hover:bg-gray-900/50 transition-colors
      `}
      style={{ fontVariantNumeric: "tabular-nums" }}
    >
      <div className="font-mono text-xs text-gray-300">{row.synergy_id}</div>

      <div className="min-w-0">
        <div className="truncate text-sm text-gray-100">{row.product_name}</div>
      </div>

      <div className="text-right text-sm text-gray-300 tabular-nums">
        {row.msrpDisplay ?? ""}
      </div>
      <div className="text-right text-sm font-semibold text-gray-100 tabular-nums">
        {row.ourPriceDisplay ?? ""}
      </div>

      <div className="text-center">
        <span
          className={`inline-flex h-6 min-w-9 items-center justify-center rounded px-2 text-xs
          ${row.qty_on_hand > 0 ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20" : "bg-gray-700/30 text-gray-300 border border-gray-700"}`}
        >
          {row.qty_on_hand}
        </span>
      </div>

      <div className="text-center text-xs text-gray-400">
        {new Date(row.updated_at).toLocaleString()}
      </div>

      <div className="flex items-center justify-center">
        <Button size="sm" variant="outline" onClick={onReprint} className="h-8 gap-2 border-gray-700">
          <Printer className="h-4 w-4" />
          Re-print
        </Button>
      </div>
    </div>
  );
}
