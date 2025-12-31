import { useEffect, useState, useMemo } from "react";
import { 
  TrendingUp, 
  Package, 
  CalendarRange,
  Loader2,
  Image as ImageIcon
} from "lucide-react";
import { apiGet, cls } from "@/lib/api";
import { Card } from "@/components/ui/card";

type WeeklyData = {
  revenue: number;
  units: number;
  chart: { day_label: string; daily_rev: number; date_sort: string }[];
  top_items: { name: string; qty: number; rev: number; thumbnail: string | null }[];
};

const n = (v: number) => 
  v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

// --- Smooth SVG Area Chart Component ---
function RevenueAreaChart({ data }: { data: WeeklyData['chart'] }) {
  if (!data || data.length === 0) {
    return <div className="h-full flex items-center justify-center text-xs text-muted-foreground">No recent data</div>;
  }

  // 1. Fill in missing days for the last 7 days
  const filledData = useMemo(() => {
    const end = new Date();
    const result = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(end.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const found = data.find(x => x.date_sort === dateStr);
      result.push({
        label: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
        val: found ? found.daily_rev : 0
      });
    }
    return result;
  }, [data]);

  const max = Math.max(...filledData.map(d => d.val), 10);
  const height = 100;
  const width = 300; // viewBox width
  
  // Create SVG path
  const points = filledData.map((d, i) => {
    const x = (i / (filledData.length - 1)) * width;
    const y = height - (d.val / max) * (height - 20) - 5; // Leave padding at top/bottom
    return `${x},${y}`;
  }).join(" ");

  const linePath = `M ${points}`;
  const areaPath = `${linePath} L ${width},${height} L 0,${height} Z`;

  return (
    <div className="w-full h-full relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
        <defs>
          <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(99 102 241)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="rgb(99 102 241)" stopOpacity="0" />
          </linearGradient>
        </defs>
        
        {/* Grid Lines */}
        <line x1="0" y1={height} x2={width} y2={height} stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
        
        {/* The Area Fill */}
        <path d={areaPath} fill="url(#chartGradient)" />
        
        {/* The Stroke Line */}
        <path d={linePath} fill="none" stroke="rgb(99 102 241)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        
        {/* Data Points & Tooltips */}
        {filledData.map((d, i) => {
            const x = (i / (filledData.length - 1)) * width;
            const y = height - (d.val / max) * (height - 20) - 5;
            const valStr = n(d.val);
            // Dynamic width based on text length (approx)
            const textWidth = valStr.length * 7 + 10; 
            
            return (
                <g key={i} className="group">
                    {/* Hit Area (Invisible) */}
                    <circle cx={x} cy={y} r="12" className="fill-transparent cursor-pointer" />
                    
                    {/* Visible Dot */}
                    <circle cx={x} cy={y} r="3" className="fill-indigo-500 stroke-white dark:stroke-zinc-900 stroke-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                    
                    {/* Tooltip Group (Native SVG) */}
                    <g className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" style={{ transformOrigin: `${x}px ${y}px` }}>
                       {/* Tooltip Background (Pill) */}
                       <rect 
                         x={x - textWidth / 2} 
                         y={y - 28} 
                         width={textWidth} 
                         height="20" 
                         rx="4" 
                         className="fill-zinc-900 dark:fill-white" 
                       />
                       {/* Little Triangle/Arrow at bottom */}
                       <path d={`M ${x} ${y - 8} L ${x - 4} ${y - 8} L ${x} ${y - 4} L ${x + 4} ${y - 8} Z`} className="fill-zinc-900 dark:fill-white" />
                       
                       {/* Text Value */}
                       <text 
                         x={x} 
                         y={y - 14} 
                         textAnchor="middle" 
                         className="fill-white dark:fill-zinc-900 text-[9px] font-bold" 
                         alignmentBaseline="middle"
                       >
                         {valStr}
                       </text>
                    </g>
                </g>
            )
        })}
      </svg>
      {/* X-Axis Labels */}
      <div className="flex justify-between mt-2 px-1">
         {filledData.map((d, i) => (
             <span key={i} className="text-[9px] text-muted-foreground font-medium">{d.label}</span>
         ))}
      </div>
    </div>
  );
}

export default function WeeklyPulse() {
  const [data, setData] = useState<WeeklyData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<WeeklyData>("/analytics/weekly-pulse")
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="h-48 rounded-xl border bg-card/50 flex items-center justify-center text-muted-foreground animate-pulse">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading Business Pulse...
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      
      {/* 1. Main KPI Card */}
      <Card className="lg:col-span-1 p-5 flex flex-col justify-between bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-950/30 dark:to-card border-indigo-100 dark:border-indigo-900/50 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            <CalendarRange className="h-4 w-4" /> 7-Day Revenue
          </div>
          <div className="mt-4">
            <div className="text-4xl font-extrabold text-foreground tracking-tight">{n(data.revenue)}</div>
            <div className="mt-1 text-sm font-medium text-indigo-600/80 dark:text-indigo-300/80 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              {data.units} items sold
            </div>
          </div>
        </div>
      </Card>

      {/* 2. Trend Chart (Wider) */}
      <Card className="lg:col-span-1 p-5 flex flex-col min-h-[200px]">
        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
          <TrendingUp className="h-4 w-4" /> Daily Trend
        </div>
        <div className="flex-1 pb-2">
            <RevenueAreaChart data={data.chart} />
        </div>
      </Card>

      {/* 3. Top Movers (List Cards) */}
      <Card className="lg:col-span-2 p-5 flex flex-col min-h-[200px]">
        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
          <Package className="h-4 w-4" /> Top Movers (30d)
        </div>
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {data.top_items.length === 0 ? (
            <div className="text-sm text-muted-foreground flex items-center justify-center h-full italic">No sales yet</div>
          ) : (
            data.top_items.map((item, i) => (
              <div key={i} className="group flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors border border-transparent hover:border-border/50">
                {/* Image */}
                <div className="h-10 w-10 shrink-0 bg-muted rounded-md overflow-hidden border border-border/50 flex items-center justify-center bg-white dark:bg-black/20">
                    {item.thumbnail ? (
                        <img src={item.thumbnail} alt="" className="h-full w-full object-contain p-0.5" />
                    ) : (
                        <ImageIcon className="h-4 w-4 text-muted-foreground/50" />
                    )}
                </div>
                
                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate text-foreground group-hover:text-primary transition-colors">
                      {item.name}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <span className="bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded text-[10px] font-bold">
                          {item.qty} sold
                      </span>
                  </div>
                </div>

                {/* Revenue */}
                <div className="text-right">
                  <div className="font-mono font-bold text-sm text-foreground">{n(item.rev)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

    </div>
  );
}