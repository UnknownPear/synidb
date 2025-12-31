import React from "react";
import { 
  Sparkles, 
  ArrowRight, 
  AlertTriangle, 
  CheckCircle2, 
  Info, 
  TrendingUp,
  AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cls } from "@/lib/api";
import { Insight } from "./SyniWidget"; 

type Props = {
  insights: Insight[];
  onActionClick: (insight: Insight) => void;
};

export default function SyniRecommendations({ insights, onActionClick }: Props) {
  if (!insights.length) return null;

  const getTheme = (severity: string) => {
    switch (severity) {
      case "critical": 
        return {
          trigger: "bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400 border-rose-200 dark:border-rose-800 hover:bg-rose-200",
          pulse: "bg-rose-500",
          popupBorder: "border-rose-100 dark:border-rose-900/50",
          button: "bg-rose-600 hover:bg-rose-700 text-white shadow-rose-200 dark:shadow-none"
        };
      case "success": 
        return {
          trigger: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-200",
          pulse: "bg-emerald-500",
          popupBorder: "border-emerald-100 dark:border-emerald-900/50",
          button: "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200 dark:shadow-none"
        };
      case "warning": 
        return {
          trigger: "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400 border-amber-200 dark:border-amber-800 hover:bg-amber-200",
          pulse: "bg-amber-500",
          popupBorder: "border-amber-100 dark:border-amber-900/50",
          button: "bg-amber-600 hover:bg-amber-700 text-white shadow-amber-200 dark:shadow-none"
        };
      default: 
        return {
          trigger: "bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400 border-violet-200 dark:border-violet-800 hover:bg-violet-200",
          pulse: "bg-violet-500",
          popupBorder: "border-violet-100 dark:border-violet-900/50",
          button: "bg-violet-600 hover:bg-violet-700 text-white shadow-violet-200 dark:shadow-none"
        };
    }
  };

  const getIcon = (severity: string) => {
    switch (severity) {
      case "critical": return <AlertCircle className="h-5 w-5" />;
      case "success": return <TrendingUp className="h-5 w-5" />;
      case "warning": return <AlertTriangle className="h-5 w-5" />;
      default: return <Sparkles className="h-5 w-5" />;
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200 py-2">
      
      {/* Label */}
      <div className="flex items-center gap-2 mr-2">
        <div className="p-1.5 bg-gradient-to-br from-violet-500 to-fuchsia-600 rounded-md shadow-sm">
           <Sparkles className="h-3 w-3 text-white" />
        </div>
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
          Syni Insights
        </h3>
      </div>

      {/* Icon Row */}
      {insights.map((item) => {
        const theme = getTheme(item.severity);
        return (
          <div key={item.id} className="relative group">
            
            {/* The Icon Trigger */}
            <div className={cls(
              "relative h-10 w-10 flex items-center justify-center rounded-full border shadow-sm transition-all duration-300 cursor-pointer hover:scale-110 z-10",
              theme.trigger
            )}>
              {getIcon(item.severity)}
              
              {/* Pulse Dot if Critical */}
              {item.severity === 'critical' && (
                <span className="absolute -top-0.5 -right-0.5 h-3 w-3">
                  <span className={cls("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", theme.pulse)} />
                  <span className={cls("relative inline-flex rounded-full h-3 w-3 border-2 border-white dark:border-black", theme.pulse)} />
                </span>
              )}
            </div>

            {/* The Hover Popup (Data) */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-72 opacity-0 scale-95 translate-y-2 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:translate-y-0 group-hover:pointer-events-auto transition-all duration-200 z-50">
              
              {/* Invisible bridge to prevent closing when moving mouse */}
              <div className="absolute -bottom-3 left-0 w-full h-4 bg-transparent" />
              
              <div className={cls(
                "bg-white dark:bg-zinc-900 border rounded-xl shadow-xl p-4 overflow-hidden ring-1 ring-black/5",
                theme.popupBorder
              )}>
                <div className="flex justify-between items-start mb-2">
                   <h4 className="font-bold text-sm text-foreground">{item.title}</h4>
                   {item.count > 0 && (
                     <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                       {item.count}
                     </span>
                   )}
                </div>
                
                <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                  {item.message}
                </p>

                {item.action && (
                  <Button 
                    size="sm"
                    className={cls("w-full h-8 text-xs font-bold shadow-md", theme.button)}
                    onClick={() => onActionClick(item)}
                  >
                    {item.action.label || "View Details"} <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                )}
              </div>
              
              {/* Tiny Arrow pointing down */}
              <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white dark:bg-zinc-900 border-r border-b border-border rotate-45 transform" />
            </div>

          </div>
        );
      })}
    </div>
  );
}