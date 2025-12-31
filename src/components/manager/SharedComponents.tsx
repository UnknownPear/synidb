import * as React from "react";
import { Check, ChevronsUpDown, Minus, ExternalLink, Images, Clock, Tags, ShieldCheck, Trash2, DollarSign, Store, CheckCircle2 } from "lucide-react";
import { cls } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Badge } from "@/components/ui/badge";
import { Category, BriefRow } from "./types";
import { money, getDaysOnMarket } from "./utils";

export function RoundCheck({
  checked,
  onChange,
  indeterminate = false,
  label = "",
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  indeterminate?: boolean;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      aria-label={label || (indeterminate ? "Partially selected" : checked ? "Selected" : "Not selected")}
      disabled={disabled}
      onClick={(e) => {
        if (!disabled) {
          e.stopPropagation();
          onChange(!checked);
        }
      }}
      className={cls(
        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition",
        "focus:outline-none focus:ring-2 ring-primary/40 ring-offset-1",
        disabled && "opacity-50 cursor-not-allowed",
        indeterminate || checked
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background text-transparent border-border hover:bg-muted/60"
      )}
    >
      {indeterminate ? <Minus className="h-4 w-4" /> : checked ? <Check className="h-4 w-4" /> : null}
    </button>
  );
}

export function CategorySelector({
  value,
  categories,
  onChange,
}: {
  value: string | null;
  categories: Category[];
  onChange: (val: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const selectedCat = categories.find((c) => c.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cls(
            "h-8 w-full justify-between px-2 text-xs",
            !value ? "text-muted-foreground border-dashed" : "text-foreground"
          )}
        >
          {selectedCat ? (
            <span className="truncate flex items-center gap-2">
              {selectedCat.label}
              {selectedCat.prefix && (
                <span className="font-mono text-[10px] opacity-50 bg-muted px-1 rounded">
                  {selectedCat.prefix}
                </span>
              )}
            </span>
          ) : (
            "Unassigned"
          )}
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search category..." className="h-8 text-xs" />
          <CommandList>
            <CommandEmpty>No category found.</CommandEmpty>
            <CommandGroup>
              {categories.map((category) => (
                <CommandItem
                  key={category.id}
                  value={category.label} 
                  onSelect={() => {
                    onChange(category.id);
                    setOpen(false);
                  }}
                  className="text-xs"
                >
                  <Check
                    className={cls(
                      "mr-2 h-3.5 w-3.5",
                      value === category.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="flex-1 truncate">{category.label}</span>
                  {category.prefix && (
                    <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                      {category.prefix}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function EbayDetailsHover({ info, unitCost }: { info: BriefRow; unitCost?: number | null }) {
  const daysOnMarket = getDaysOnMarket(info.postedAt);
  const listPrice = info.ebayPrice || 0;
  const cost = unitCost || 0;
  const grossMargin = listPrice - cost;
  const roi = cost > 0 ? (grossMargin / cost) * 100 : 0;
  
  const isSold = info.status === "SOLD";
  const isInStore = info.status === "IN_STORE";
  const isOld = daysOnMarket > 60;
  
  return (
    <div className="w-80 overflow-hidden bg-card text-card-foreground">
      <div className="relative h-20 bg-muted/30 border-b flex items-center px-4 overflow-hidden">
        {info.ebayThumbnail && (
          <div 
            className="absolute inset-0 opacity-10 bg-center bg-cover blur-md"
            style={{ backgroundImage: `url(${info.ebayThumbnail})` }}
          />
        )}
        
        <div className="relative z-10 flex items-center gap-3 w-full">
          {info.ebayThumbnail ? (
            <div className="h-12 w-12 rounded border bg-background shadow-sm overflow-hidden shrink-0">
              <img src={info.ebayThumbnail} className="h-full w-full object-contain" alt="" />
            </div>
          ) : (
            <div className="h-12 w-12 rounded border bg-background/50 flex items-center justify-center shrink-0">
              <Images className="h-5 w-5 text-muted-foreground/30" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className={cls(
                "text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm border",
                isSold 
                  ? "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800"
                  : isInStore ? "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800"
                  : "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800"
              )}>
                {isSold ? "Sold" : isInStore ? "In Store" : "Active Listing"}
              </span>
              
              {info.ebayItemUrl && (
                <a 
                  href={info.ebayItemUrl} 
                  target="_blank" 
                  rel="noreferrer"
                  className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
                >
                  View <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            
            <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>
                {isSold ? "Sold after" : "Listed for"} 
                <span className={cls("font-medium ml-1", !isSold && isOld ? "text-amber-600" : "text-foreground")}>
                  {daysOnMarket} day{daysOnMarket !== 1 ? 's' : ''}
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        
        <div className="grid grid-cols-3 gap-2 text-center divide-x divide-border/60">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase text-muted-foreground font-medium">Revenue</span>
            <span className="text-sm font-bold text-foreground">{money(listPrice)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase text-muted-foreground font-medium">Cost</span>
            <span className="text-sm font-medium text-muted-foreground line-through decoration-red-300/50 decoration-2">
              {money(cost)}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase text-muted-foreground font-medium flex items-center justify-center gap-1">
              Profit
            </span>
            <span className={cls(
              "text-sm font-extrabold", 
              grossMargin >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600"
            )}>
              {money(grossMargin)}
            </span>
          </div>
        </div>

        {cost > 0 && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px] font-medium text-muted-foreground">
              <span>Return on Investment</span>
              <span className={grossMargin >= 0 ? "text-emerald-600" : "text-red-600"}>
                {roi.toFixed(0)}%
              </span>
            </div>
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <div 
                className={cls("h-full rounded-full", grossMargin >= 0 ? "bg-emerald-500" : "bg-red-500")} 
                style={{ width: `${Math.min(100, Math.max(0, roi))}%` }} 
              />
            </div>
          </div>
        )}

        <div className="pt-3 border-t flex justify-between items-center text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1.5" title="Lister">
            <div className="p-1 rounded-full bg-blue-50 text-blue-600 dark:bg-blue-900/20">
              <Tags className="h-3 w-3" />
            </div>
            <span className="truncate max-w-[80px]">{info.postedByName || info.postedBy || "Unknown"}</span>
          </div>
          <div className="flex items-center gap-1.5" title="Tester">
            <div className="p-1 rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20">
              <ShieldCheck className="h-3 w-3" />
            </div>
            <span className="truncate max-w-[80px]">{info.testedByName || info.testedBy || "Unknown"}</span>
          </div>
        </div>

      </div>
    </div>
  );
}