import * as React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, SlidersHorizontal } from "lucide-react";

export default function Filters({
  q, onQ,
  inStockOnly, onInStockOnly,
  density, onDensity,
  pageSize, onPageSize,
  onApply,
}: {
  q: string;
  onQ: (v: string) => void;
  inStockOnly: boolean;
  onInStockOnly: (v: boolean) => void;
  density: "compact" | "comfortable";
  onDensity: (v: "compact" | "comfortable") => void;
  pageSize: number;
  onPageSize: (v: number) => void;
  onApply: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold text-gray-200">Filters</div>

      <div className="relative">
        <Search className="absolute left-2 top-2.5 h-4 w-4 opacity-60" />
        <Input
          className="pl-8 bg-gray-900/60 border-gray-800 text-gray-100"
          placeholder="Search product or Synergy ID…"
          value={q}
          onChange={(e) => onQ(e.target.value)}
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-300 select-none">
        <input
          type="checkbox"
          checked={inStockOnly}
          onChange={(e) => onInStockOnly(e.target.checked)}
        />
        In stock only
      </label>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-[11px] text-gray-400 mb-1">Page size</div>
          <select
            className="h-9 w-full rounded-md border bg-gray-900/60 border-gray-800 px-3 text-sm"
            value={pageSize}
            onChange={(e) => onPageSize(parseInt(e.target.value || "50", 10))}
          >
            {[25, 50, 75, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div>
          <div className="text-[11px] text-gray-400 mb-1">Row density</div>
          <select
            className="h-9 w-full rounded-md border bg-gray-900/60 border-gray-800 px-3 text-sm"
            value={density}
            onChange={(e) => onDensity(e.target.value as any)}
          >
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
        </div>
      </div>

      <Button onClick={onApply} className="w-full gap-2">
        <SlidersHorizontal className="h-4 w-4" />
        Apply / Refresh
      </Button>
    </div>
  );
}
