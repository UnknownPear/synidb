import * as React from "react";
import { cls } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DollarSign, Store, CheckCircle2, Check, Trash2, Wrench, Pencil, Cpu, MemoryStick, Database, StickyNote, Plus, ExternalLink, Split, Images
} from "lucide-react";
import { CategorySelector, RoundCheck } from "./SharedComponents";
import { StatusBadge } from "./StatusBadge"; // <--- Use the new component here too
import { cleanCpuString, money } from "./utils";
import { POLine, Category, BriefRow } from "./types";

interface LineCardProps {
  l: POLine;
  selected: boolean;
  onToggle: (id: string) => void;
  categories: Category[];
  onUpdateCategory: (id: string, catId: string) => void;
  onMint: (id: string) => void;
  onEdit: (id: string) => void;
  onOverride: (synergyId: string) => void;
  onSplit: (id: string) => void;
  onDelete: (id: string) => void;
  rowBrief: Record<string, BriefRow>;
  markParts: (id: string) => void;
  poId: string;
  apiBase: string;
}

const LineCard = React.memo(({ 
  l, 
  selected, 
  onToggle, 
  categories, 
  onUpdateCategory, 
  onMint, 
  onEdit, 
  onOverride, 
  onSplit, 
  onDelete,
  rowBrief,
  markParts,
}: LineCardProps) => {
  const statusInfo = l.synergy_id ? rowBrief[l.synergy_id] : undefined;
  const statusUpper = (statusInfo?.status || "").toUpperCase();
  const isSold = statusUpper === "SOLD";
  const isInStore = statusUpper === "IN_STORE";
  const isScrap = statusUpper === "SCRAP";
  const isPartsNeeded = l.isAwaitingParts || statusInfo?.partStatus === 'NEEDED';
  
  const unitCost = typeof l.unit_cost === "number" ? l.unit_cost : 0;
  const ebayPrice = statusInfo?.ebayPrice ? Number(statusInfo.ebayPrice) : 0;
  const profit = ebayPrice > 0 ? ebayPrice - unitCost : 0;

  const raw = l.raw_json || {};
  const specs = raw.specs || {};
  const cpu = cleanCpuString(specs.processor || specs.cpu);
  const ram = specs.ram || specs.memory;
  const storage = specs.storage || specs.hdd || specs.ssd;
  const otherSpecs = [specs.screen, specs.color, specs.batteryHealth].filter(Boolean).join(" • ");
  const hasAnySpecs = cpu || ram || storage || otherSpecs;
  const itemNotes = raw.item_notes || raw.notes || raw.tester_comment;

  // MEMOIZED CALLBACKS to prevent re-renders
  const handleToggle = React.useCallback(() => onToggle(l.id), [onToggle, l.id]);
  const handleEdit = React.useCallback(() => onEdit(l.id), [onEdit, l.id]);
  const handleMint = React.useCallback(() => onMint(l.id), [onMint, l.id]);
  const handleOverride = React.useCallback(() => l.synergy_id && onOverride(l.synergy_id), [onOverride, l.synergy_id]);
  const handleSplit = React.useCallback(() => onSplit(l.id), [onSplit, l.id]);
  const handleDelete = React.useCallback(() => onDelete(l.id), [onDelete, l.id]);
  const handleCategoryChange = React.useCallback((id: string) => onUpdateCategory(l.id, id), [onUpdateCategory, l.id]);
  const handleMarkParts = React.useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    markParts(l.synergy_id || l.id);
  }, [markParts, l.synergy_id, l.id]);

  return (
    <div className={cls("group relative flex flex-col bg-card border rounded-xl shadow-sm transition-all duration-200 overflow-hidden hover:shadow-md", selected ? "ring-2 ring-primary border-primary" : "hover:border-primary/50", isSold && "bg-purple-50/30 dark:bg-purple-900/10")}>
      <div className="relative h-32 w-full bg-muted/20 border-b overflow-hidden">
        <div className="absolute top-2 left-2 z-10"><RoundCheck checked={selected} onChange={handleToggle} /></div>
        <div className="absolute top-2 right-2 z-10 flex flex-col gap-1 items-end">
          {/* Use standard rendering for Top-Right Badges or leverage StatusBadge with custom CSS? 
              The Card design uses specific positioning, so we'll stick to the original direct Badge usage here for layout reasons,
              but ensure the classes match the richness. */}
          {isSold ? <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/80 dark:text-purple-200 border-purple-200/50 shadow-sm"><DollarSign className="h-3 w-3 mr-1"/> Sold</Badge> : isInStore ? <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/80 dark:text-orange-200 border-orange-200/50 shadow-sm"><Store className="h-3 w-3 mr-1"/> In Store</Badge> : statusInfo?.status === "POSTED" || statusInfo?.posted ? <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/80 dark:text-blue-200 border-blue-200/50 shadow-sm"><CheckCircle2 className="h-3 w-3 mr-1"/> Active</Badge> : statusInfo?.status === "TESTED" ? <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:border-emerald-800"><Check className="h-3 w-3 mr-1"/> Tested</Badge> : isScrap ? <Badge variant="destructive"><Trash2 className="h-3 w-3 mr-1"/> Scrap</Badge> : null}
          {isPartsNeeded && <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 cursor-pointer" onClick={handleMarkParts}><Wrench className="h-3 w-3 mr-1" /> Parts</Badge>}
        </div>
        <div className="w-full h-full flex items-center justify-center">
          {statusInfo?.ebayThumbnail ? <><div className="absolute inset-0 bg-cover bg-center blur-xl opacity-20" style={{ backgroundImage: `url(${statusInfo.ebayThumbnail})` }} /><img src={statusInfo.ebayThumbnail} alt="" className="relative h-full w-full object-contain p-2 z-0 transition-transform group-hover:scale-105" loading="lazy" /></> : <Images className="h-10 w-10 text-muted-foreground/20" />}
        </div>
      </div>

      <div className="p-3 flex-1 flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-start gap-2">
            <div className="font-semibold text-sm leading-snug line-clamp-2" title={l.product_name_raw || ""}>{l.product_name_raw || <span className="italic text-muted-foreground">No Product Name</span>}</div>
            <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0 text-muted-foreground" onClick={handleEdit}><Pencil className="h-3.5 w-3.5" /></Button>
          </div>
          {hasAnySpecs && (
            <div className="flex flex-wrap items-center gap-2">
                {cpu && <Badge variant="secondary" className="h-5 px-1.5 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700 font-medium text-[10px] gap-1"><Cpu className="h-3 w-3 opacity-70" /> {cpu}</Badge>}
                {ram && <Badge variant="secondary" className="h-5 px-1.5 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700 font-medium text-[10px] gap-1"><MemoryStick className="h-3 w-3 opacity-70" /> {ram}</Badge>}
                {storage && <Badge variant="secondary" className="h-5 px-1.5 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700 font-medium text-[10px] gap-1"><Database className="h-3 w-3 opacity-70" /> {storage}</Badge>}
                {otherSpecs && <span className="text-[10px] text-muted-foreground">{otherSpecs}</span>}
            </div>
          )}
          {itemNotes && (
            <div className="flex items-start gap-2 p-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/50">
                <StickyNote className="h-3.5 w-3.5 text-amber-600 dark:text-amber-500 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-800 dark:text-amber-300 leading-snug line-clamp-3">{itemNotes}</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 mt-auto pt-2">
           <div className="col-span-2">
             {l.synergy_id ? (
                <div className="flex items-center justify-between bg-muted/40 rounded-md border px-2 py-1">
                   <span className="text-[10px] font-bold text-muted-foreground uppercase">ID</span>
                   <span className="font-mono text-xs font-medium">{l.synergy_id}</span>
                </div>
             ) : !l.category_id ? (
                <div className="text-[10px] text-amber-600 bg-amber-50 px-2 py-1 rounded-md border border-amber-100 text-center font-medium">Categorize to Mint</div>
             ) : (
                <Button variant="outline" size="sm" className="w-full h-7 text-xs border-dashed text-primary hover:bg-primary/5" onClick={handleMint}><Plus className="h-3 w-3 mr-1" /> Mint ID</Button>
             )}
           </div>
           <div className="col-span-2">
              <CategorySelector value={l.category_id || null} categories={categories} onChange={handleCategoryChange} />
           </div>
        </div>

        <div className="mt-2 pt-3 border-t grid grid-cols-3 gap-1 text-center">
           <div className="flex flex-col"><span className="text-[10px] text-muted-foreground uppercase">Qty</span><span className="text-xs font-semibold">{l.qty || 1}</span></div>
           <div className="flex flex-col border-l border-border/50"><span className="text-[10px] text-muted-foreground uppercase">Cost</span><span className="text-xs font-medium">{money(unitCost)}</span></div>
           <div className="flex flex-col border-l border-border/50"><span className="text-[10px] text-muted-foreground uppercase">Profit</span>{profit !== 0 ? <span className={cls("text-xs font-bold", profit > 0 ? "text-emerald-600" : "text-red-600")}>{money(profit)}</span> : <span className="text-xs text-muted-foreground">—</span>}</div>
        </div>
      </div>

      <div className="bg-muted/30 px-3 py-2 border-t flex justify-between items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
         {statusInfo?.ebayItemUrl && <Button size="icon" variant="ghost" className="h-7 w-7 text-blue-600 bg-blue-50 hover:bg-blue-100 hover:text-blue-700" asChild title="View on eBay"><a href={statusInfo.ebayItemUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a></Button>}
         
         <div className="flex ml-auto gap-1">
            {l.synergy_id && (
                <Button size="icon" variant="ghost" className="h-7 w-7 text-amber-600 hover:bg-amber-100" onClick={handleOverride} title="Override / Tester View">
                    <Wrench className="h-3.5 w-3.5" />
                </Button>
            )}
            
            {(l.qty ?? 1) > 1 && <Button size="icon" variant="ghost" className="h-7 w-7 hover:bg-background" onClick={handleSplit} title="Split"><Split className="h-3.5 w-3.5" /></Button>}
            <Button size="icon" variant="ghost" className="h-7 w-7 hover:bg-red-100 hover:text-red-600" onClick={handleDelete} title="Delete"><Trash2 className="h-3.5 w-3.5" /></Button>
         </div>
      </div>
    </div>
  );
});

LineCard.displayName = 'LineCard';
export default LineCard;