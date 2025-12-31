import * as React from "react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Filter, Search } from "lucide-react";

type ShowColumns = {
  msrp: boolean;
  price: boolean;
  onhand: boolean;
  sold: boolean;
  updated: boolean;
};

export default function FiltersBar(props: {
  q: string; setQ: (v: string) => void;
  prefix: string; setPrefix: (v: string) => void;
  minPrice: string; setMinPrice: (v: string) => void;
  maxPrice: string; setMaxPrice: (v: string) => void;
  dateFrom: string; setDateFrom: (v: string) => void;
  dateTo: string; setDateTo: (v: string) => void;
  inStockOnly: boolean; setInStockOnly: (v: boolean) => void;
  hasMsrpOnly: boolean; setHasMsrpOnly: (v: boolean) => void;
  pageSize: number; setPageSize: (n: number) => void;
  autoRefresh: boolean; setAutoRefresh: (v: boolean) => void;
  autoRefreshSec: number; setAutoRefreshSec: (n: number) => void;
  showColumns: ShowColumns; setShowColumns: (updater: (s: ShowColumns) => ShowColumns) => void;
}) {
  const {
    q, setQ, prefix, setPrefix, minPrice, setMinPrice, maxPrice, setMaxPrice,
    dateFrom, setDateFrom, dateTo, setDateTo, inStockOnly, setInStockOnly,
    hasMsrpOnly, setHasMsrpOnly, pageSize, setPageSize, autoRefresh, setAutoRefresh,
    autoRefreshSec, setAutoRefreshSec, showColumns, setShowColumns,
  } = props;

  return (
    <Card className="p-3 space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 opacity-50" />
          <Input
            placeholder="Search product or Synergy ID…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8"
          />
        </div>
        <Input placeholder="Prefix (e.g. ABCDE)" value={prefix} onChange={(e) => setPrefix(e.target.value)} />
        <Input placeholder="Min $" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} />
        <Input placeholder="Max $" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={inStockOnly} onChange={(e) => setInStockOnly(e.target.checked)} />
          In stock only
        </label>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={hasMsrpOnly} onChange={(e) => setHasMsrpOnly(e.target.checked)} />
          Has MSRP
        </label>
        <div className="text-sm flex items-center gap-2">
          Page size:
          <select
            className="border rounded px-2 py-1 bg-white text-black"
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
          >
            {[25, 50, 100, 150, 200].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        <div className="text-sm flex items-center gap-2">
          Auto refresh:
          <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
          <span>every</span>
          <input
            className="w-16 border rounded px-2 py-1 bg-white text-black"
            value={autoRefreshSec}
            onChange={(e) => setAutoRefreshSec(Number(e.target.value || 0))}
          />
          <span>s</span>
        </div>

        <div className="ml-auto flex items-center gap-3 text-sm text-muted-foreground">
          <Filter className="h-4 w-4" />
          {(["msrp","price","onhand","sold","updated"] as const).map((k) => (
            <label key={k} className="inline-flex items-center gap-1">
              <input
                type="checkbox"
                checked={(showColumns as any)[k]}
                onChange={(e) => setShowColumns((s) => ({ ...s, [k]: e.target.checked }))}
              />
              {k.toUpperCase()}
            </label>
          ))}
        </div>
      </div>
    </Card>
  );
}
