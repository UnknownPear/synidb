import * as React from "react";
import { Badge } from "@/components/ui/badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  DollarSign,
  Store,
  CheckCircle2,
  Check,
  Trash2,
  ShieldCheck,
  Tags
} from "lucide-react";
import { EbayDetailsHover } from "./SharedComponents";
import { BriefRow } from "./types";
import { cls } from "@/lib/api";
import { formatDate } from "./utils";

export function StatusBadge({
  info,
  unitCost,
  compact = false,
}: {
  info?: BriefRow;
  unitCost?: number | null;
  compact?: boolean;
}) {
  if (!info) return <span className="text-[10px] text-muted-foreground/60 italic">Intake</span>;

  const statusUpper = (info.status || "").toUpperCase();
  const isSold = statusUpper === "SOLD";
  const isInStore = statusUpper === "IN_STORE";
  const isScrap = statusUpper === "SCRAP";
  const isPosted = !isSold && !isInStore && (!!info.posted || statusUpper === "POSTED");
  const isTested = statusUpper === "TESTED";

  // Check if we have rich data to show in hover
  const hasEbayData = !!(
    (isPosted || isSold || isInStore) &&
    info.ebayPrice
  );

  const badgeClass = compact
    ? "h-4 px-1 text-[10px] gap-0.5"
    : "h-5 px-1.5 gap-1 font-semibold";

  let badgeUI = null;

  if (isSold) {
    badgeUI = (
      <Badge
        variant="secondary"
        className={cls(
          "bg-purple-100 text-purple-700 dark:bg-purple-900/60 dark:text-purple-200 border border-purple-200/50 shadow-sm cursor-help hover:bg-purple-200 decoration-dotted underline decoration-purple-400/50 underline-offset-2",
          badgeClass
        )}
      >
        <DollarSign className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} /> Sold
      </Badge>
    );
  } else if (isInStore) {
    badgeUI = (
      <Badge
        className={cls(
          "bg-orange-100 text-orange-700 dark:bg-orange-900/80 dark:text-orange-200 border-orange-200/50 shadow-sm",
          badgeClass
        )}
      >
        <Store className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} /> In Store
      </Badge>
    );
  } else if (isPosted) {
    badgeUI = (
      <Badge
        variant="secondary"
        className={cls(
          "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-0 cursor-help hover:bg-blue-200 decoration-dotted underline decoration-blue-400/50 underline-offset-2",
          badgeClass
        )}
      >
        <CheckCircle2 className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} /> Active
      </Badge>
    );
  } else if (isTested) {
    badgeUI = (
      <Badge
        variant="outline"
        className={cls(
          "text-emerald-600 border-emerald-200 dark:border-emerald-800 dark:text-emerald-400",
          badgeClass
        )}
      >
        <Check className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} /> Tested
      </Badge>
    );
  } else if (isScrap) {
    badgeUI = (
      <Badge variant="destructive" className={badgeClass}>
        <Trash2 className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} /> Scrap
      </Badge>
    );
  } else {
     // Fallback for just "Status: Something" (e.g. PENDING)
     badgeUI = <Badge variant="outline" className={badgeClass}>{info.status || "Unknown"}</Badge>;
  }

  // Wrap in HoverCard if we have financial/ebay details
  if (hasEbayData && badgeUI) {
    return (
      <HoverCard openDelay={150} closeDelay={100}>
        <HoverCardTrigger asChild>
          <div className="inline-flex cursor-default">{badgeUI}</div>
        </HoverCardTrigger>
        <HoverCardContent className="w-80 p-0 border-none shadow-xl" align="start" side="right">
          <EbayDetailsHover info={info} unitCost={unitCost} />
        </HoverCardContent>
      </HoverCard>
    );
  }

  return badgeUI;
}

export function StatusMeta({ info }: { info?: BriefRow }) {
  if (!info) return null;
  const { testedBy, testedByName, postedBy, postedByName, testedDate, postedAt } = info;
  
  // If no tester or poster info, don't render anything
  if (!testedBy && !postedAt) return null;

  return (
    <div className="flex items-center gap-2 text-[11px] text-muted-foreground leading-none mt-1 animate-in fade-in">
      <div className="h-3 w-px bg-border/60" />
      
      {testedBy && (
        <div className="flex items-center gap-1" title={`Tested by ${testedByName || testedBy} on ${formatDate(testedDate)}`}>
          <ShieldCheck className="h-3 w-3 text-emerald-600/70" />
          <span className="font-medium text-foreground/80">{testedByName || testedBy}</span>
        </div>
      )}

      {testedBy && postedBy && <span className="opacity-30">•</span>}

      {postedBy && (
        <div className="flex items-center gap-1" title={`Listed by ${postedByName || postedBy}`}>
          <Tags className="h-3 w-3 text-blue-600/70" />
          <span className="font-medium text-foreground/80">{postedByName || postedBy}</span>
        </div>
      )}
    </div>
  );
}