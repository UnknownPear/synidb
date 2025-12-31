import { useMemo } from "react";
import { Section } from "@/components/ui/Section";
import { BarChart3, Building, DollarSign, Layers3 } from "lucide-react";
import type { PurchaseOrderSummary, Vendor } from "@/types/manager";

// Helper to format large numbers
function formatCompact(n: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    compactDisplay: "short",
  }).format(n);
}

// Helper to format currency
function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function DashboardStats({
  allPOs,
  vendors,
}: {
  allPOs: PurchaseOrderSummary[];
  vendors: Vendor[];
}) {
  const stats = useMemo(() => {
    const totalPOs = allPOs.length;
    const totalVendors = vendors.length;
    const totalCost = allPOs.reduce((acc, po) => acc + Number(po.est_cost || 0), 0);
    const totalItems = allPOs.reduce((acc, po) => acc + Number(po.total_lines_qty || 0), 0);
    return { totalPOs, totalVendors, totalCost, totalItems };
  }, [allPOs, vendors]);

  return (
    <Section title="Dashboard Stats" icon={<BarChart3 className="h-5 w-5 text-primary" />}>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border bg-background/50 p-3">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <DollarSign className="h-3.5 w-3.5" />
            Total Inventory Cost
          </div>
          <div className="text-xl font-bold mt-1" title={stats.totalCost.toLocaleString(undefined, {style: 'currency', currency: 'USD'})}>
            {formatCurrency(stats.totalCost)}
          </div>
        </div>
        <div className="rounded-lg border bg-background/50 p-3">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Layers3 className="h-3.5 w-3.5" />
            Total Items
          </div>
          <div className="text-xl font-bold mt-1" title={stats.totalItems.toLocaleString()}>
            {formatCompact(stats.totalItems)}
          </div>
        </div>
        <div className="rounded-lg border bg-background/50 p-3">
          <div className="text-xs text-muted-foreground">Total POs</div>
          <div className="text-xl font-bold mt-1">{stats.totalPOs}</div>
        </div>
        <div className="rounded-lg border bg-background/50 p-3">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Building className="h-3.5 w-3.5" />
            Vendors
          </div>
          <div className="text-xl font-bold mt-1">{stats.totalVendors}</div>
        </div>
      </div>
    </Section>
  );
}