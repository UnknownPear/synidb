import * as React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SlidersHorizontal } from "lucide-react";

export default function InventoryFilters({
  query,
  onQuery,
  inStockOnly,
  onInStockOnly,
  pageSize,
  onPageSize,
  density,
  onDensity,
  onApply,
  loading,
}: {
  query: string;
  onQuery: (v: string) => void;
  inStockOnly: boolean;
  onInStockOnly: (v: boolean) => void;
  pageSize: number;
  onPageSize: (n: number) => void;
  density: "comfortable" | "compact";
  onDensity: (d: "comfortable" | "compact") => void;
  onApply: () => void;
  loading: boolean;
}) {
  return (
    <div>
      <div className="text-xs font-semibold mb-2 opacity-80">Filters</div>
      <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur p-4 shadow-xl space-y-3">
        <Input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search product or Synergy ID…"
          className="h-9 bg-white/10 border-white/15 placeholder-white/60 text-white"
        />

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={inStockOnly}
            onChange={(e) => onInStockOnly(e.target.checked)}
          />
          In stock only
        </label>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-[11px] mb-1 opacity-70">Page size</div>
            <select
              className="w-full h-9 rounded-md bg-white/10 border border-white/15 text-white"
              value={pageSize}
              onChange={(e) => onPageSize(Number(e.target.value))}
            >
              {[25, 50, 100, 200].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="text-[11px] mb-1 opacity-70">Row density</div>
            <select
              className="w-full h-9 rounded-md bg-white/10 border border-white/15 text-white"
              value={density}
              onChange={(e) => onDensity(e.target.value as any)}
            >
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact</option>
            </select>
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          className="mt-2 w-full h-9"
          onClick={onApply}
          disabled={loading}
        >
          <SlidersHorizontal className="mr-2 h-4 w-4" />
          {loading ? "Refreshing…" : "Apply / Refresh"}
        </Button>
      </div>
    </div>
  );
}
