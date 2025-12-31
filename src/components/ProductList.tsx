import * as React from "react";
import { API_BASE } from "@/lib/api";
import { patchRow } from "@/lib/dataClient";
import type { InventoryRow } from "@/lib/dataClient";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sparkles,
  RefreshCcw,
  Send,
  X,
  Lock,
  Printer,
  Store,
  Calendar,
  Tag,
  Image as ImageIcon,
  FlaskConical,
  Cpu,
  Check,
  Link2,
  PartyPopper,
  MoreHorizontal,
  ExternalLink,
  Trash2,
  FeatherIcon,
  AlertTriangle,
  Barcode,
  Loader2,
  Pencil
} from "lucide-react";
import { AiHelper } from "@/components/AiHelper";
import ListingWizardModal from "@/components/ListingWizardModal";
import { InStoreWizard } from "@/components/InStoreWizard";
import { PrintWizardModal } from "@/components/PrintWizardModal"; 
import { cn } from "@/lib/utils";
import { getBrowseAvg } from "@/lib/dataClient";

/* ───────────────────────────── Types ───────────────────────────── */

type Props = {
  rows: InventoryRow[];
  visibleCount: number;
  onLoadMore: () => void;
  onRowUpdate?: (
    id: string,
    patch: Partial<InventoryRow & { ebayItemUrl: string | null; ebayThumbnail?: string | null; ebaySku?: string | null; productName?: string; upc?: string }>
  ) => void;
  isDarkMode?: boolean;
  user: { id: string; name: string };
};

/* ───────────────────────────── Visual Helpers ───────────────────────────── */

const GRADE_COLORS: Record<string, string> = {
  A: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800",
  B: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800",
  C: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800",
  D: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-800",
  DEFAULT: "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700",
};

function getGradeColor(grade?: string | number | null) {
  const g = String(grade || "").toUpperCase();
  return GRADE_COLORS[g] || GRADE_COLORS.DEFAULT;
}

function TinySpinner({ size = 12 }: { size?: number }) {
  return <div className="animate-spin rounded-full border-2 border-current border-t-transparent opacity-70" style={{ width: size, height: size }} />;
}

const Label = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">
    {children}
  </div>
);

const Value = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("text-sm font-bold text-gray-900 dark:text-gray-100", className)}>
    {children}
  </div>
);

/* ───────────────────────────── Logic Helpers ───────────────────────────── */

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

async function jsonFetch(input: RequestInfo, init?: RequestInit, tries = 0) {
  const r = await fetch(input, init);
  if ((r.status === 429 || r.status >= 500) && tries < 2) {
    await delay(800 * (tries + 1));
    return jsonFetch(input, init, tries + 1);
  }
  const text = await r.text();
  if (!r.ok) throw new Error(text || `${r.status} ${r.statusText}`);
  try { return JSON.parse(text); } catch { return text as any; }
}

function parseLocationFromSku(sku: string | null | undefined, fallback: string = "Unassigned"): string {
  if (!sku) return fallback;
  if (sku.includes("-")) {
    const parts = sku.split("-");
    const loc = parts[parts.length - 1].trim();
    return loc || fallback;
  }
  return fallback;
}

function formatTimeAgo(dateStr?: string | null) {
  if (!dateStr) return null;
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return "just now";
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 30) return `${diffInDays}d ago`;
    const diffInMonths = Math.floor(diffInDays / 30);
    if (diffInMonths < 12) return `${diffInMonths}mo ago`;
    return `${Math.floor(diffInMonths / 12)}y ago`;
  } catch {
    return null;
  }
}

/* ───────────────────────────── Sub-Components ───────────────────────────── */

function ToastNotification({ 
  open, 
  onClose, 
  synergyId, 
  message = "Listing Posted!", 
  type = "success" 
}: { 
  open: boolean; 
  onClose: () => void; 
  synergyId: string;
  message?: string;
  type?: "success" | "loading" | "error";
}) {
  useEffect(() => {
    if (open && type !== "loading") {
      const t = setTimeout(onClose, 3000);
      return () => clearTimeout(t);
    }
  }, [open, onClose, type]);

  if (!open) return null;

  return createPortal(
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] animate-in slide-in-from-bottom-5 fade-in duration-300 pointer-events-none">
      <div className={cn(
        "flex items-center gap-3 pl-3 pr-4 py-2.5 rounded-full shadow-2xl border pointer-events-auto",
        type === "loading" ? "bg-blue-600 text-white border-blue-700" : 
        type === "error" ? "bg-red-600 text-white border-red-700" :
        "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 border-zinc-700 dark:border-zinc-200"
      )}>
        <div className={cn(
          "flex items-center justify-center h-8 w-8 rounded-full shadow-sm",
          type === "loading" ? "bg-blue-500 text-white" : 
          type === "error" ? "bg-red-500 text-white" :
          "bg-emerald-500 text-white"
        )}>
          {type === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : 
           type === "error" ? <AlertTriangle className="h-4 w-4" /> :
           <Check className="h-4 w-4" />}
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-bold leading-none">{message}</span>
          <span className={cn("text-[10px] font-mono tracking-wide leading-none", type === "loading" ? "text-blue-100" : "text-zinc-400 dark:text-zinc-500")}>
            {synergyId}
          </span>
        </div>
        {type !== "loading" && (
          <button onClick={onClose} className="ml-2 hover:text-white dark:hover:text-black text-zinc-400 dark:text-zinc-500 transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>,
    document.body
  );
}

function ConfirmStatusChangeModal({ target, onCancel, onConfirm, type }: { target: InventoryRow | null; onCancel: () => void; onConfirm: () => void; type: "unpost" | "remove_store" }) {
  if (!target) return null;
  const isRemoveStore = type === "remove_store";
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-[400px] bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-gray-200 dark:border-zinc-800 p-6 scale-100 animate-in zoom-in-95 duration-200">
        <div className="flex items-start gap-4 mb-4">
           <div className="flex-shrink-0 h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
               <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-500" />
           </div>
           <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {isRemoveStore ? "Remove from In-Store?" : "Confirm Unpost"}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                 {isRemoveStore 
                   ? `Are you sure you want to pull ${target.productName} from the store? This will set status back to TESTED.`
                   : `Are you sure you want to mark ${target.productName} as not posted? This will revert its status.`
                 }
              </p>
           </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
           <Button variant="ghost" onClick={onCancel}>Cancel</Button>
           <Button variant="default" className="bg-amber-600 hover:bg-amber-700 text-white" onClick={onConfirm}>
              {isRemoveStore ? "Yes, Remove" : "Yes, Unpost"}
           </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function EbayUrlButton({
  row,
  onRowUpdate,
  activeEditorId,
  setActiveEditorId,
  disabled,
  onToast
}: {
  row: InventoryRow;
  onRowUpdate?: (id: string, patch: Partial<InventoryRow & { ebayItemUrl: string | null; ebayThumbnail?: string | null; ebaySku?: string | null }>) => void;
  activeEditorId?: string | null;
  setActiveEditorId?: (v: string | null) => void;
  disabled?: boolean;
  onToast?: (msg: string, type: "success" | "error") => void;
}) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState(row.ebayItemUrl ?? "");
  const [busy, setBusy] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (activeEditorId === row.synergyId) {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) {
        setPos({ top: rect.bottom + 6, left: rect.left });
      }
      setOpen(true);
    } else {
      setOpen(false);
    }
  }, [activeEditorId, row.synergyId]);

  useEffect(() => {
    setVal(row.ebayItemUrl ?? "");
  }, [row.ebayItemUrl]);

  const sync = async (opts?: { url?: string; closeAfter?: boolean }) => {
    if (busy) return;
    setBusy(true);

    try {
      const url = (opts?.url ?? val ?? row.ebayItemUrl ?? "").trim();
      if (!url) throw new Error("URL required");

      // Save to Backend if changed
      if (url !== (row.ebayItemUrl ?? "")) {
        onRowUpdate?.(row.synergyId, { ebayItemUrl: url } as any);
        await patchRow(row.synergyId, { ebayItemUrl: url } as any);
      }

      await jsonFetch(`${API_BASE}/integrations/ebay/associate-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ synergyId: row.synergyId, ebayUrl: url }),
      });

      const j = await jsonFetch(`${API_BASE}/integrations/ebay/refresh-sold-when/${row.synergyId}?days=720`, { method: "POST" });

      onRowUpdate?.(row.synergyId, {
        ebayItemUrl: j?.link?.ebay_url || j?.ebay_url || url,
        ebaySoldCount: typeof j?.soldCount === "number" ? j.soldCount : undefined,
        ebayLastSoldAt: j?.lastSoldAt || j?.last_sold_at,
        ebayListingStatus: j?.listingStatus,
        ebayPrice: typeof j?.price === "number" ? j.price : undefined,
        ebayThumbnail: j?.thumbnail, 
        ebaySku: j?.sku,             
      } as any);

      onToast?.("eBay Link Synced!", "success");
      
      if (opts?.closeAfter) {
        setActiveEditorId?.(null);
      }
    } catch (e: any) {
      onToast?.(e?.message || "Sync Failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const handleTrigger = () => {
    if (disabled) return;
    // ALWAYS open the popover, never just sync immediately
    if (activeEditorId === row.synergyId) setActiveEditorId?.(null);
    else setActiveEditorId?.(row.synergyId);
  };

  const isLinked = !!row.ebayItemUrl;

  return (
    <>
      <Button
        ref={triggerRef}
        variant="outline"
        size="sm"
        onClick={handleTrigger}
        disabled={disabled || busy}
        className={cn(
          "h-8 rounded-md border-blue-200 text-blue-600 bg-white hover:bg-blue-50 px-3 gap-2 font-medium text-xs shadow-sm transition-all",
          "dark:bg-zinc-800 dark:border-blue-900 dark:text-blue-400 dark:hover:bg-blue-900/30",
          busy && "opacity-70",
          disabled && "opacity-50 grayscale cursor-not-allowed"
        )}
      >
        {busy ? <TinySpinner /> : isLinked ? <Pencil className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
        {isLinked ? "Edit Link" : "Link eBay"}
      </Button>

      {open && !disabled && pos && createPortal(
        <div
          className="fixed z-[9999] w-[320px] rounded-lg border bg-white dark:bg-zinc-800 dark:border-zinc-700 p-3 shadow-xl animate-in fade-in zoom-in-95 duration-100"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="flex gap-2">
            <Input
              value={val}
              onChange={(e) => setVal(e.target.value)}
              placeholder="https://ebay.com/itm/..."
              className="h-9 text-xs dark:bg-zinc-900 dark:border-zinc-700"
              onKeyDown={(e) => e.key === "Enter" && sync({ url: val, closeAfter: true })}
              autoFocus
            />
            <Button size="icon" className="h-9 w-9 shrink-0 bg-blue-600 hover:bg-blue-700 text-white" onClick={() => sync({ url: val, closeAfter: true })} disabled={busy}>
              {busy ? <TinySpinner /> : <Check className="h-4 w-4" />}
            </Button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

function PriceBlock({
  productName,
  listedPrice,
  disabled,
  onChange,
  lockedByEbay,
  estPrice,
}: {
  productName: string;
  listedPrice?: number | null;
  estPrice?: number | null;
  disabled: boolean;
  onChange: (v: number | null) => void;
  lockedByEbay?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [avg, setAvg] = useState<number | null>(null);
  
  const [localVal, setLocalVal] = useState(listedPrice?.toString() ?? "");

  const isPlainReadOnly = disabled && !lockedByEbay;

  useEffect(() => {
    if (listedPrice !== undefined && listedPrice !== null) {
      setLocalVal(listedPrice.toString());
    } else {
      setLocalVal("");
    }
  }, [listedPrice]);

  const fetchAvg = async () => {
    setLoading(true);
    try {
      const res = await getBrowseAvg(productName, { fixed: true, condition: "USED", currency: "USD", limit: 100 });
      if (typeof res.avg === "number") setAvg(res.avg);
    } catch { }
    setLoading(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalVal(e.target.value);
  };

  const commitChange = () => {
    if (disabled) return;
    const sanitized = localVal.replace(/,/g, '.');
    if (sanitized === "") {
        onChange(null);
    } else if (!isNaN(parseFloat(sanitized))) {
        onChange(parseFloat(sanitized));
    } else {
        setLocalVal(listedPrice?.toString() ?? "");
    }
  };

  return (
    <div className="flex items-start gap-5">
      {/* Unit Cost */}
      <div>
        <Label>Unit Cost</Label>
        <Value>{estPrice ? `$${Number(estPrice).toFixed(2)}` : "—"}</Value>
      </div>

      {/* Listed Price Input */}
      <div>
        <Label>Listed Price</Label>
        <div className="relative w-[120px]">
          <div className={cn(
            "absolute top-0 bottom-0 flex items-center justify-center pointer-events-none z-10",
            isPlainReadOnly ? "left-0" : "left-3"
          )}>
             <span className={cn(
               "text-sm font-bold transition-colors",
               lockedByEbay ? "text-blue-600 dark:text-blue-300" : "text-gray-400 dark:text-gray-500"
             )}>$</span>
          </div>
          <Input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            className={cn(
              "h-9 pl-8 pr-3 text-sm font-bold tabular-nums transition-all rounded-md",
              "border-blue-100 bg-blue-50/20 focus:bg-white focus:ring-1 focus:ring-indigo-500",
              "dark:border-blue-900/40 dark:bg-blue-900/10 dark:text-gray-100 dark:focus:bg-zinc-900",
              
              isPlainReadOnly && "bg-transparent border-transparent px-0 text-gray-900 dark:text-gray-100 font-bold h-auto shadow-none cursor-default pl-4",
              
              lockedByEbay && "bg-blue-50 text-blue-700 border-blue-200 pl-8 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-800"
            )}
            value={localVal}
            onChange={handleInputChange}
            onBlur={commitChange}
            onKeyDown={(e) => {
                if (e.key === "Enter") {
                    e.currentTarget.blur(); 
                }
            }}
            onFocus={(e) => e.target.select()}
            disabled={disabled}
          />
          {lockedByEbay && (
            <Lock className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-blue-400 dark:text-blue-500 opacity-50" />
          )}
        </div>
      </div>

      {/* Market Avg */}
      <div>
        <Label>Market Avg</Label>
        <div className="flex items-center gap-1.5 h-9">
          <Value>{avg ? `$${avg.toFixed(2)}` : "—"}</Value>
          <button 
            onClick={fetchAvg} 
            disabled={loading}
            className="text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors p-1"
          >
            <RefreshCcw className={cn("h-3 w-3", loading && "animate-spin")} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────── Main Component ───────────────────────────── */

export function ProductList({
  rows,
  visibleCount,
  onLoadMore,
  onRowUpdate,
  isDarkMode = false,
  user,
}: Props) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [aiOpenFor, setAiOpenFor] = useState<string | null>(null);
  const [wizardFor, setWizardFor] = useState<InventoryRow | null>(null);
  
  const [inStoreWizardFor, setInStoreWizardFor] = useState<InventoryRow | null>(null);
  const [printWizardRow, setPrintWizardRow] = useState<InventoryRow | null>(null);

  const [activeEditorId, setActiveEditorId] = useState<string | null>(null);
  const [toastRowId, setToastRowId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string>("Listing Posted!");
  const [toastType, setToastType] = useState<"success" | "loading" | "error">("success");
  
  const [unpostTarget, setUnpostTarget] = useState<InventoryRow | null>(null);
  const [confirmStatusRevert, setConfirmStatusRevert] = useState<InventoryRow | null>(null);

  const visible = useMemo(() => rows.slice(0, visibleCount), [rows, visibleCount]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const obs = new IntersectionObserver((e) => e[0].isIntersecting && onLoadMore(), { rootMargin: "400px" });
    obs.observe(node);
    return () => obs.disconnect();
  }, [onLoadMore]);

  // Handle Price Changes and Toasts
  const handlePriceSave = async (row: InventoryRow, newPrice: number | null) => {
    onRowUpdate?.(row.synergyId, { ebayPrice: newPrice });
    try {
        await patchRow(row.synergyId, { ebayPrice: newPrice });
        setToastMessage(`Price updated: ${newPrice ? `$${newPrice}` : 'Removed'}`);
        setToastType("success");
        setToastRowId(row.synergyId);
    } catch (e) {
        setToastMessage("Failed to save price!");
        setToastType("error");
        setToastRowId(row.synergyId);
    }
  };

  const handleFetchUPC = async (row: InventoryRow) => {
    if (!row.productName) {
      alert("Product name is missing. Cannot fetch UPC.");
      return;
    }

    setToastMessage("Searching for UPC...");
    setToastType("loading");
    setToastRowId(row.synergyId);

    try {
      const res = await fetch(`${API_BASE}/ai/find-upc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_name: row.productName })
      });
      
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();

      if (data.upc) {
        if ((row as any).lineId) {
             await fetch(`${API_BASE}/pos/lines/${(row as any).lineId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ upc: data.upc })
            });
        }
        
        onRowUpdate?.(row.synergyId, { upc: data.upc } as any);
        
        setToastMessage(`Found UPC: ${data.upc}`);
        setToastType("success");
      } else {
        setToastRowId(null); 
        alert("AI could not find a confident UPC in search results.");
      }
    } catch (e) {
      console.error(e);
      setToastRowId(null);
      alert("Error fetching UPC. Please check backend connection.");
    }
  };

  const getStatusLabel = (status: string) => {
    if (status === "Completed") return "Ended";
    return status;
  };

  return (
    <div className="pb-24 space-y-3 px-1 min-h-screen bg-gray-50/30 dark:bg-black/20">
      <ToastNotification 
        open={!!toastRowId} 
        synergyId={toastRowId || ""} 
        message={toastMessage}
        type={toastType}
        onClose={() => setToastRowId(null)} 
      />
      
      <ConfirmStatusChangeModal 
        target={unpostTarget} 
        type="unpost"
        onCancel={() => setUnpostTarget(null)} 
        onConfirm={() => {
            if (unpostTarget) {
                onRowUpdate?.(unpostTarget.synergyId, {
                    posted: false,
                    postedAt: null,
                    status: "TESTED"
                } as any);
                setUnpostTarget(null);
            }
        }}
      />

      <ConfirmStatusChangeModal 
        target={confirmStatusRevert} 
        type="remove_store"
        onCancel={() => setConfirmStatusRevert(null)} 
        onConfirm={() => {
            if (confirmStatusRevert) {
                onRowUpdate?.(confirmStatusRevert.synergyId, {
                    status: "TESTED"
                } as any);
                setConfirmStatusRevert(null);
            }
        }}
      />

      {printWizardRow && (
        <PrintWizardModal
          open={!!printWizardRow}
          onOpenChange={(v) => !v && setPrintWizardRow(null)}
          row={printWizardRow}
        />
      )}

      {visible.map((r) => {
        const isPosted = r.status === "POSTED";
        const isSold = r.status === "SOLD";
        const isInStore = r.status === "IN_STORE";
        const isLinked = !!r.ebayItemUrl;
        
        const specs = r.specs || {};
        const ebaySku = (r as any).ebaySku || (r as any).ebay_sku; 
        const parsedLoc = parseLocationFromSku(ebaySku, "Unassigned");
        const location = isInStore ? "IN STORE" : (parsedLoc !== "Unassigned" ? parsedLoc : (specs.location || specs.Location || "Unassigned"));
        const thumbnail = (r as any).ebayThumbnail || (r as any).ebay_thumbnail || (r as any).photoUrl;
        const timeAgo = formatTimeAgo(r.ebayLastSoldAt);

        const upc = (r as any).upc;

        return (
          <div
            key={r.synergyId}
            className={cn(
              "group relative bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 overflow-visible",
              (isPosted || isSold || isInStore) && "opacity-95 dark:opacity-80"
            )}
          >
            <div className="flex flex-row p-3 gap-5 items-start">
              
              <div className="w-[80px] h-[80px] shrink-0 bg-gray-50 dark:bg-zinc-800 rounded-lg border border-gray-100 dark:border-zinc-700 flex items-center justify-center mt-1 overflow-hidden">
                {thumbnail ? (
                    <img src={thumbnail} alt="" className="w-full h-full object-contain p-1" />
                ) : (
                    <ImageIcon className="h-8 w-8 text-gray-300 dark:text-zinc-600" />
                )}
              </div>

              <div className="flex-1 flex flex-col gap-3 min-w-0">
                
                <div>
                    <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 leading-tight truncate max-w-[600px]">{r.productName || "Untitled Product"}</h3>
                        {r.grade && (
                            <span className={cn("px-1.5 py-px rounded text-[10px] font-bold uppercase tracking-wide border", getGradeColor(r.grade))}>
                                Grade {r.grade}
                            </span>
                        )}
                        {isInStore && (
                           <span className="px-1.5 py-px rounded text-[10px] font-bold uppercase tracking-wide border bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-800 animate-in fade-in">
                               IN STORE
                           </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400 font-medium">
                        <span>SKU: <span className="text-gray-700 dark:text-gray-300">{r.synergyId}</span></span>
                        
                        {upc && (
                            <>
                                <span className="text-gray-300 dark:text-zinc-600">•</span>
                                <span>UPC: <span className="text-gray-700 dark:text-gray-300 font-mono">{upc}</span></span>
                            </>
                        )}
                        
                        <span className="text-gray-300 dark:text-zinc-600">•</span>
                        <span>Category: <span className="text-gray-700 dark:text-gray-300">{r.categoryLbl || r.category?.label || "Uncategorized"}</span></span>
                    </div>
                </div>

                <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
                    
                    <PriceBlock
                        productName={r.productName}
                        estPrice={r.price}
                        listedPrice={r.ebayPrice}
                        disabled={isSold} 
                        lockedByEbay={isLinked}
                        onChange={(v) => handlePriceSave(r, v)}
                    />

                    <div>
                        <Label>Location</Label>
                        <Value className={cn(isInStore && "text-orange-600 dark:text-orange-400 font-extrabold")}>{location}</Value>
                    </div>

                    {(r.testerComment || Object.keys(specs).length > 0) && (
                        <div className="flex flex-wrap items-start gap-3 w-fit">
                            
                            {Object.keys(specs).length > 0 && (
                                <div className="rounded-lg bg-purple-50/40 dark:bg-purple-900/20 border border-purple-100/60 dark:border-purple-800/40 p-2 w-fit">
                                     <div className="flex items-center gap-1.5 mb-1.5">
                                        <Cpu className="h-3 w-3 text-purple-500 dark:text-purple-400" />
                                        <span className="text-[9px] font-bold text-purple-700 dark:text-purple-300 uppercase tracking-wide">Specs</span>
                                     </div>
                                     <div className="flex flex-wrap gap-1.5">
                                         {Object.entries(specs).map(([k, v]) => (
                                             <div key={k} className="flex items-center px-1.5 py-0.5 rounded bg-white dark:bg-zinc-800 border border-purple-100 dark:border-zinc-700 text-[10px] shadow-sm">
                                                 <span className="text-purple-400 dark:text-purple-400 font-medium mr-1 capitalize">{k}:</span>
                                                 <span className="text-purple-900 dark:text-purple-100 font-semibold max-w-[150px] truncate">{String(v)}</span>
                                             </div>
                                         ))}
                                     </div>
                                </div>
                            )}

                            {r.testerComment && (
                                <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 p-2 max-w-lg w-fit">
                                     <div className="flex items-center gap-1.5 mb-1">
                                        <FlaskConical className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                                        <span className="text-[9px] font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wide">Tester Notes</span>
                                     </div>
                                     <p className="text-[11px] text-amber-900/80 dark:text-amber-100/80 leading-snug font-medium break-words">
                                        {r.testerComment}
                                     </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

              </div>
            </div>

            <div className="flex items-center justify-between px-3 pb-2 pt-2 border-t border-gray-100 dark:border-zinc-800">
                
                <div className="flex items-center gap-2">
                    {/* NEW: Passed onToast handler */}
                    <EbayUrlButton 
                        row={r} 
                        onRowUpdate={onRowUpdate} 
                        activeEditorId={activeEditorId} 
                        setActiveEditorId={setActiveEditorId}
                        disabled={isInStore}
                        onToast={(msg, type) => {
                            setToastMessage(msg);
                            setToastType(type);
                            setToastRowId(r.synergyId);
                        }}
                    />
                    
                    <Button 
                        variant="outline" size="sm" 
                        className="h-8 rounded-md border-purple-200 text-purple-600 bg-white hover:bg-purple-50 px-3 gap-2 text-xs font-medium shadow-sm dark:bg-zinc-800 dark:border-purple-900 dark:text-purple-400 dark:hover:bg-purple-900/20"
                        onClick={() => setAiOpenFor(r.synergyId)}
                    >
                        <Sparkles className="h-3.5 w-3.5" />
                        AI Assist
                    </Button>

                    <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-8 rounded-md text-gray-600 border-gray-200 bg-white px-3 gap-2 text-xs font-medium hover:bg-gray-50 shadow-sm dark:bg-zinc-800 dark:border-zinc-700 dark:text-gray-300 dark:hover:bg-zinc-700"
                        onClick={() => {
                            if (isInStore) {
                                setInStoreWizardFor(r); 
                            } else {
                                setPrintWizardRow(r); 
                            }
                        }}
                    >
                        <Printer className="h-3.5 w-3.5" />
                        Print
                    </Button>

                    <Button 
                        variant={isInStore ? "default" : "outline"}
                        size="sm" 
                        className={cn(
                            "h-8 rounded-md px-3 gap-2 text-xs font-medium shadow-sm transition-all",
                            isInStore 
                                ? "bg-orange-100 border-orange-200 text-orange-800 hover:bg-orange-200 dark:bg-orange-900/40 dark:border-orange-800 dark:text-orange-200" 
                                : "text-gray-600 border-gray-200 bg-white hover:bg-gray-50 dark:bg-zinc-800 dark:border-zinc-700 dark:text-gray-300 dark:hover:bg-zinc-700"
                        )}
                        onClick={() => {
                            if (isInStore) {
                                setConfirmStatusRevert(r);
                            } else {
                                setInStoreWizardFor(r);
                            }
                        }}
                    >
                        <Store className={cn("h-3.5 w-3.5", isInStore ? "text-orange-700 dark:text-orange-200" : "text-orange-500")} />
                        {isInStore ? "In-Store" : "For In-Store"}
                    </Button>
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                           <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuLabel>More Options</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setWizardFor(r)}>
                           <Send className="mr-2 h-4 w-4 text-blue-500" /> Post To Ebay
                        </DropdownMenuItem>
                        
                        {!(r as any).upc && (
                            <DropdownMenuItem 
                              onSelect={(e) => {
                                e.preventDefault();
                                handleFetchUPC(r);
                              }}
                              className="text-blue-600 dark:text-blue-400"
                            >
                               <Barcode className="mr-2 h-4 w-4" /> Fetch UPC (AI)
                            </DropdownMenuItem>
                        )}
                        
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <div className="h-4 w-px bg-gray-200 dark:bg-zinc-700 mx-2" /> 

                     <div className="flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400 font-medium">
                        {timeAgo && (
                            <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3 text-gray-400 dark:text-gray-500" /> Last sold: {timeAgo}
                            </span>
                        )}
                        {(r.ebaySoldCount || 0) > 0 && (
                            <span className="flex items-center gap-1">
                                <Tag className="h-3 w-3 text-gray-400 dark:text-gray-500" /> Sold: {r.ebaySoldCount}
                            </span>
                        )}
                        
                        {(r as any).ebayListingStatus && (
                            <span className={cn(
                                "px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wide",
                                (r as any).ebayListingStatus === 'Active' 
                                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" 
                                    : "bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-gray-400"
                            )}>
                                {getStatusLabel((r as any).ebayListingStatus)}
                            </span>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {!isSold && !isInStore && (
                        <div className="flex items-center gap-2">
                            <span className={cn("text-xs font-medium transition-colors", isPosted ? "text-gray-700 dark:text-gray-300" : "text-gray-400 dark:text-gray-600")}>
                                Posted
                            </span>
                            <Switch 
                                className="data-[state=checked]:bg-blue-600 scale-90"
                                checked={isPosted}
                                onCheckedChange={(v) => {
                                    if (v) {
                                        onRowUpdate?.(r.synergyId, {
                                            posted: true,
                                            postedAt: new Date().toISOString(),
                                            status: "POSTED",
                                        } as any);
                                    } else {
                                        setUnpostTarget(r);
                                    }
                                }}
                            />
                        </div>
                    )}
                    
                    {(isLinked) && (
                       <a href={r.ebayItemUrl || "#"} target="_blank" rel="noreferrer">
                            <Button size="sm" className="h-8 bg-blue-600 hover:bg-blue-700 text-white gap-2 font-bold px-4 rounded-md shadow-sm">
                                <ExternalLink className="h-3.5 w-3.5" />
                                {isSold ? "View Sold Listing" : "View Listing"}
                            </Button>
                        </a>
                    )}
                </div>

            </div>

            {(aiOpenFor === r.synergyId) && (
                <div className="mt-1 border-t dark:border-zinc-800 pt-3 animate-in slide-in-from-top-2 px-3 pb-3">
                     <AiHelper open={true} onOpenChange={(v) => setAiOpenFor(v ? r.synergyId : null)} synergyId={r.synergyId} />
                </div>
            )}
          </div>
        );
      })}

      {wizardFor && (
        <ListingWizardModal
          open={!!wizardFor}
          onOpenChange={(v) => !v && setWizardFor(null)}
          row={wizardFor}
          onPosted={(ebayUrl) => {
            onRowUpdate?.(wizardFor.synergyId, {
              posted: true,
              postedAt: new Date().toISOString(),
              postedBy: user.name,
              ebayItemUrl: ebayUrl || null,
              status: "POSTED"
            } as any);
            setToastMessage("Listing Posted!");
            setToastType("success");
            setToastRowId(wizardFor.synergyId);
            setWizardFor(null);
          }}
        />
      )}

      {inStoreWizardFor && (
        <InStoreWizard 
            open={!!inStoreWizardFor} 
            onOpenChange={(open) => !open && setInStoreWizardFor(null)}
            row={inStoreWizardFor}
            onConfirm={(price, msrp, name) => {
                onRowUpdate?.(inStoreWizardFor.synergyId, {
                    status: "IN_STORE",
                    ebayPrice: price, 
                    msrp: msrp,
                    // REMOVED productName from backend payload
                    posted: false,
                    ebayItemUrl: null 
                } as any);
                setInStoreWizardFor(null);
            }}
        />
      )}

      <div ref={sentinelRef} className="h-12" />
    </div>
  );
}