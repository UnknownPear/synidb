import { useEffect, useState } from "react";
import { 
  TrendingUp, 
  DollarSign, 
  Package, 
  Loader2, 
  ArrowRight,
  ShoppingBag
} from "lucide-react";
import { apiGet, cls } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type DailyStat = {
  total_revenue: number;
  total_items: number;
  top_pos: Array<{
    po_id: string;
    po_number: string;
    items_sold: number;
    revenue: number;
  }>;
  recent_sales: Array<{
    title: string;
    amount: number;
    time: string; // e.g., "10:42 AM"
    po_number: string;
  }>;
};

const n = (v: number) => 
  v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 });

export default function DailyPulse({ onRefresh }: { onRefresh?: () => void }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DailyStat | null>(null);

  const fetchDaily = async () => {
    setLoading(true);
    try {
      // You will need to create this endpoint (see Step 3 below)
      const res = await apiGet<DailyStat>("/analytics/daily-sales");
      setData(res);
    } catch (e) {
      console.error("Failed to load daily stats", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDaily();
  }, []);

  if (loading) {
    return (
      <div className="h-48 rounded-xl border bg-card flex items-center justify-center text-muted-foreground animate-pulse">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading Today's Stats...
      </div>
    );
  }

  if (!data || data.total_items === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/30 p-6 flex flex-col items-center justify-center text-muted-foreground">
        <ShoppingBag className="h-8 w-8 mb-2 opacity-20" />
        <span className="text-sm font-medium">No sales detected today (yet)</span>
        <Button variant="link" size="sm" onClick={fetchDaily} className="mt-1">Refresh</Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {/* KPI Card */}
      <div className="lg:col-span-1 flex flex-col gap-4">
        <Card className="p-4 flex flex-col justify-between h-full bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/20 dark:to-card border-emerald-100 dark:border-emerald-900/50">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Today's Revenue
            </div>
            <div className="text-3xl font-bold mt-2 text-foreground">
              {n(data.total_revenue)}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {data.total_items} items sold
            </div>
          </div>
          <Button size="sm" variant="ghost" className="w-full mt-4 justify-between group hover:bg-emerald-100 dark:hover:bg-emerald-900/30">
            View Report <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </Button>
        </Card>
      </div>

      {/* PO Breakdown */}
      <Card className="p-4 lg:col-span-1 overflow-hidden">
        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
          <Package className="h-4 w-4" /> Top POs Today
        </div>
        <div className="space-y-3">
          {data.top_pos.map((po) => (
            <div key={po.po_number} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="font-mono font-medium bg-muted px-1.5 rounded text-xs">
                  {po.po_number}
                </span>
              </div>
              <div className="text-right">
                <div className="font-medium">{n(po.revenue)}</div>
                <div className="text-[10px] text-muted-foreground">{po.items_sold} items</div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Recent Feed */}
      <Card className="p-4 lg:col-span-2 relative overflow-hidden">
        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
          <ShoppingBag className="h-4 w-4" /> Live Feed
        </div>
        <div className="space-y-3 max-h-[120px] overflow-y-auto pr-2">
          {data.recent_sales.map((sale, i) => (
            <div key={i} className="flex items-start justify-between text-sm border-b border-dashed border-muted/50 last:border-0 pb-2 last:pb-0">
              <div className="flex flex-col truncate pr-4">
                <span className="truncate font-medium">{sale.title}</span>
                <span className="text-[10px] text-muted-foreground flex gap-2">
                   <span>{sale.time}</span>
                   <span>•</span>
                   <span className="font-mono">{sale.po_number}</span>
                </span>
              </div>
              <div className="font-medium text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                {n(sale.amount)}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}