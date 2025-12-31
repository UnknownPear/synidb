import * as React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Barcode, Boxes, Box, DollarSign, Download, RefreshCw, Search, Tag,
} from "lucide-react";

export function TinySpinner({ size = 16 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block animate-spin rounded-full border-2 border-black/20 border-t-transparent"
      style={{ width: size, height: size, animationDuration: "800ms" }}
    />
  );
}

const moneyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

export default function TopBar(props: {
  totals: { skus: number; units: number; value: number };
  scan: string;
  setScan: (v: string) => void;
  scanBusy: boolean;
  onScanSubmit: (e: React.FormEvent) => void;
  returnMode: boolean;
  setReturnMode: (v: boolean) => void;
  showNewLabel: boolean;
  setShowNewLabel: (v: boolean) => void;
  onExport: () => void;
  onRefresh: () => void;
  loading: boolean;
}) {
  const {
    totals, scan, setScan, scanBusy, onScanSubmit,
    returnMode, setReturnMode, showNewLabel, setShowNewLabel,
    onExport, onRefresh, loading,
  } = props;

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3">
        <div className="text-xl font-semibold tracking-tight flex items-center gap-2">
          <Tag className="h-5 w-5 opacity-70" />
          Printed Label Inventory
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <Boxes className="h-3.5 w-3.5" /> {totals.skus} SKUs
          </span>
          <span className="inline-flex items-center gap-1">
            <Box className="h-3.5 w-3.5" /> {totals.units} units
          </span>
          <span className="inline-flex items-center gap-1">
            <DollarSign className="h-3.5 w-3.5" /> ~{moneyFmt.format(totals.value)}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form onSubmit={onScanSubmit} className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 opacity-50" />
            <Input
              placeholder={`Scan ${returnMode ? "(RETURN)" : "(SALE)"} — Synergy ID…`}
              value={scan}
              onChange={(e) => setScan(e.target.value)}
              className="w-[260px] pl-8"
            />
          </div>
          <Button type="submit" disabled={scanBusy} className="gap-1.5">
            {scanBusy ? (
              <>
                <TinySpinner size={14} /> Saving…
              </>
            ) : (
              <>
                <Barcode className="h-4 w-4" />
                Record
              </>
            )}
          </Button>
        </form>

        <label className="text-xs flex items-center gap-2 ml-2">
          <input
            type="checkbox"
            checked={returnMode}
            onChange={(e) => setReturnMode(e.target.checked)}
          />
          Return mode
        </label>

        <Button variant="outline" onClick={() => setShowNewLabel(!showNewLabel)} className="gap-1.5">
          {showNewLabel ? "Hide New Label" : "New Label"}
        </Button>
        <Button variant="outline" onClick={onExport} className="gap-1.5">
          <Download className="h-4 w-4" /> Export CSV
        </Button>
        <Button variant="outline" onClick={onRefresh} className="gap-1.5">
          {loading ? (
            <>
              <TinySpinner size={14} /> Refreshing…
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4" /> Refresh
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
