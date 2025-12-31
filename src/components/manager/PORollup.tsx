import { useState, useEffect } from "react";
import {
  Package,
  DollarSign,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  RefreshCcw,
  Loader2,
  Receipt,
  Tag,
  ShoppingBag,
  BarChart4,
  Clock,
  Scale,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_BASE, cls } from "@/lib/api";
import type { ProfitRow } from "@/types/manager";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Props = {
  profit: ProfitRow | null;
  hasActive: boolean;
  poId?: string;
  lastSync?: string | null;
  onRefresh?: () => void;
};

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

const money = (v: unknown) => {
  const num = n(v);
  return num.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
};

function timeAgo(dateStr?: string | null) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;

  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return d.toLocaleDateString();
}

function StatCard(props: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const { title, icon, children, action } = props;
  return (
    <div className="bg-card border rounded-xl shadow-sm overflow-hidden flex flex-col h-full transition-all hover:shadow-md">
      <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between min-h-[48px]">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {icon}
          {title}
        </div>
        {action}
      </div>
      <div className="p-4 flex-1 flex flex-col justify-between gap-4">
        {children}
      </div>
    </div>
  );
}

function StatRow(props: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ReactNode;
  tooltip?: React.ReactNode;
  highlight?: boolean;
  valueColor?: string;
}) {
  const { label, value, sub, icon, tooltip, highlight, valueColor } = props;

  const content = (
    <div
      className={cls(
        "flex items-center justify-between text-sm",
        highlight ? "py-1" : ""
      )}
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon && <span className="opacity-70">{icon}</span>}
        <span className={cls(highlight ? "font-semibold text-foreground" : "")}>
          {label}
        </span>
      </div>
      <div className="text-right">
        <div
          className={cls(
            "font-mono font-medium tracking-tight",
            valueColor || "text-foreground"
          )}
        >
          {value}
        </div>
        {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
      </div>
    </div>
  );

  if (tooltip) {
    return (
      <TooltipProvider>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild className="cursor-help">
            {content}
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-xs text-xs">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return content;
}

function ProgressBar(props: {
  value: number;
  max: number;
  colorClass?: string;
}) {
  const { value, max, colorClass = "bg-primary" } = props;
  const pct = Math.min(100, Math.max(0, max > 0 ? (value / max) * 100 : 0));
  return (
    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden mt-1">
      <div
        className={cls("h-full transition-all duration-500", colorClass)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function PORollup({
  profit,
  hasActive,
  poId,
  lastSync,
  onRefresh,
}: Props) {
  const [syncing, setSyncing] = useState(false);
  const [localLastSync, setLocalLastSync] = useState<string | null>(
    lastSync || null
  );

  useEffect(() => {
    if (lastSync !== undefined) setLocalLastSync(lastSync);
  }, [lastSync]);

  const handleSmartSync = async () => {
    if (!poId) return;
    setSyncing(true);
    try {
      const res = await fetch(`${API_BASE}/pos/${poId}/reconcile-sales`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        if (data.reconciled_at) setLocalLastSync(data.reconciled_at);
        else setLocalLastSync(new Date().toISOString());
        if (data.updated > 0) {
          alert(`Reconciled! Detected ${data.updated} items sold on eBay.`);
        }
      }
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setSyncing(false);
    }
  };

  if (!hasActive) {
    return (
      <div className="mb-6 flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 bg-muted/10 text-muted-foreground">
        <Package className="h-10 w-10 mb-2 opacity-20" />
        <p className="text-sm font-medium">
          Select a Purchase Order to view analytics
        </p>
      </div>
    );
  }

  if (!profit) {
    return (
      <div className="mb-6 h-32 flex items-center justify-center border rounded-xl bg-muted/10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground opacity-50" />
      </div>
    );
  }

  const totalUnits = n(profit.total_units);
  const soldUnits = n(profit.units_sold);
  const postedUnits = n(profit.units_posted);

  const totalCost = n(profit.total_inventory_cost);
  const revenue = n(profit.sales_net_revenue);

  // sum of green profits from SOLD lines (backend computed)
  const lineProfitSold = n((profit as any).line_profit_sold ?? profit.gross_profit);

  // "Your" definition:
  // Net Cash Flow = (sum of green profits on SOLD items) - (what we paid for the PO)
  const netCashFlow = lineProfitSold - totalCost;

  const breakEvenPct =
    totalCost > 0 ? (revenue / totalCost) * 100 : 0;

  const roi =
    n((profit as any).cost_of_goods_sold) > 0
      ? (lineProfitSold / n((profit as any).cost_of_goods_sold)) * 100
      : 0;

  const activeListValue = n(profit.posted_value);
  const projectedRevenue = revenue + activeListValue;
  const projectedProfit = projectedRevenue - totalCost;
  const projectedRoi =
    totalCost > 0 ? (projectedProfit / totalCost) * 100 : 0;

  const unsoldCost = n(profit.cost_in_unsold_inventory);
  const pendingPost = Math.max(0, totalUnits - postedUnits);

  return (
    <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Financial Performance */}
      <StatCard
        title="Financial Performance"
        icon={
          <DollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between items-baseline">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Net Cash Flow
              </span>
              <span
                className={cls(
                  "text-2xl font-bold tabular-nums tracking-tight",
                  netCashFlow >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                )}
              >
                {money(netCashFlow)}
              </span>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Break Even Progress</span>
                <span>{breakEvenPct.toFixed(0)}%</span>
              </div>
              <ProgressBar
                value={breakEvenPct}
                max={100}
                colorClass={
                  breakEvenPct >= 100 ? "bg-emerald-500" : "bg-blue-500"
                }
              />
              <div className="flex justify-between text-[10px] text-muted-foreground pt-0.5">
                <span>Rev: {money(revenue)}</span>
                <span>Paid: {money(totalCost)}</span>
              </div>
            </div>
          </div>

          <div className="pt-3 mt-1 border-t border-dashed space-y-2">
            <StatRow
              label="Gross Profit (Sold)"
              icon={<TrendingUp className="h-3.5 w-3.5" />}
              value={money(lineProfitSold)}
              valueColor={
                lineProfitSold >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              }
              sub={`ROI: ${roi.toFixed(0)}%`}
              tooltip={
                <div className="space-y-1">
                  <div className="font-semibold border-b pb-1 mb-1">
                    Profit on Sold Items Only
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>Sold Profit Sum:</span>
                    <span>{money(lineProfitSold)}</span>
                  </div>
                  <div className="flex justify-between gap-4 pt-1 border-t border-white/20">
                    <span>Minus PO Cost:</span>
                    <span>{money(totalCost)}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>= Net Cash Flow:</span>
                    <span>{money(netCashFlow)}</span>
                  </div>
                </div>
              }
            />

            <StatRow
              label="Projected Profit"
              icon={<BarChart4 className="h-3.5 w-3.5" />}
              value={money(projectedProfit)}
              valueColor={
                projectedProfit >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              }
              sub={`${projectedRoi.toFixed(0)}% ROI if all sell`}
            />
          </div>
        </div>
      </StatCard>

      {/* Stock Valuation */}
      <StatCard
        title="Stock Valuation"
        icon={<Scale className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
        action={
          poId && (
            <div className="flex items-center gap-2">
              {localLastSync && (
                <div
                  className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/50 px-2 py-1 rounded-md"
                  title={new Date(localLastSync).toLocaleString()}
                >
                  <Clock className="h-3 w-3" />
                  <span>{timeAgo(localLastSync)}</span>
                </div>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                onClick={handleSmartSync}
                disabled={syncing}
                title="Reconcile Sales with eBay"
              >
                <RefreshCcw
                  className={cls("h-3.5 w-3.5", syncing && "animate-spin")}
                />
              </Button>
            </div>
          )
        }
      >
        <div className="space-y-5">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="font-medium text-muted-foreground">Sold</span>
              <span className="font-mono font-bold text-foreground">
                {soldUnits}
                <span className="text-muted-foreground font-normal">
                  {" "}
                  / {totalUnits}
                </span>
              </span>
            </div>
            <ProgressBar
              value={soldUnits}
              max={totalUnits}
              colorClass="bg-blue-500 dark:bg-blue-600"
            />
          </div>

          <div className="pt-2 space-y-2">
            <StatRow
              label="Unsold Value (Cost)"
              icon={<Receipt className="h-3.5 w-3.5" />}
              value={money(unsoldCost)}
              sub="Sunk cost of items on shelf"
            />
            <StatRow
              label="Active List Price"
              icon={
                <Tag className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
              }
              value={money(activeListValue)}
              valueColor="text-purple-700 dark:text-purple-400 font-bold"
            />
          </div>
        </div>
      </StatCard>

      {/* Listing Operations */}
      <StatCard
        title="Listing Operations"
        icon={
          <ShoppingBag className="h-4 w-4 text-purple-600 dark:text-purple-400" />
        }
      >
        <div className="space-y-5">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="font-medium text-muted-foreground">
                Posted to eBay
              </span>
              <span className="font-mono font-bold text-foreground">
                {postedUnits}
                <span className="text-muted-foreground font-normal">
                  {" "}
                  / {totalUnits}
                </span>
              </span>
            </div>
            <ProgressBar
              value={postedUnits}
              max={totalUnits}
              colorClass="bg-purple-500 dark:bg-purple-600"
            />
          </div>

          <div className="pt-2 space-y-3">
            {pendingPost > 0 ? (
              <div className="bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 p-3 rounded-lg border border-amber-100 dark:border-amber-900/50 flex flex-col gap-1">
                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wide">
                  <span>Action Needed</span>
                  <AlertCircle className="h-4 w-4" />
                </div>
                <div className="text-sm">
                  You have <strong>{pendingPost}</strong> items waiting to be
                  posted.
                </div>
              </div>
            ) : (
              <div className="bg-green-50 dark:bg-green-950/30 text-green-800 dark:text-green-200 p-3 rounded-lg border border-green-100 dark:border-green-900/50 flex flex-col gap-1">
                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wide">
                  <span>Complete</span>
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <div className="text-sm">
                  All inventory items have been posted to eBay.
                </div>
              </div>
            )}
          </div>
        </div>
      </StatCard>
    </div>
  );
}
