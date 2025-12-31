import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { 
  X, 
  Printer, 
  Loader2, 
  RefreshCw, 
  Zap, 
  Layers, 
  ArrowUp, 
  Link2,
  Unlink,
  Tag,
  Package
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { printLabel } from "@/lib/dymo"; 
import type { InventoryRow } from "@/lib/dataClient";
import { API_BASE } from "@/lib/api";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: InventoryRow;
};

export function PrintWizardModal({ open, onOpenChange, row }: Props) {
  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [mounted, setMounted] = useState(false);
  
  // Toggles
  const [increaseSku, setIncreaseSku] = useState(false);
  const [withCharger, setWithCharger] = useState(false);
  const [chargerType, setChargerType] = useState<"USBC" | "SURFACE">("USBC");
  const [addToStock, setAddToStock] = useState(false);

  // Form Data
  const [productName, setProductName] = useState("");
  const [sku, setSku] = useState("");
  const [notes, setNotes] = useState(""); 

  const currentDate = new Date().toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
  });

  // Helper to parse SKU string into ID and Location
  const parseSkuString = (rawStr: string) => {
    if (!rawStr) return { id: "", loc: "" };
    // Find the first hyphen to split ID from Location
    const idx = rawStr.indexOf("-");
    if (idx === -1) return { id: rawStr, loc: "" };
    
    const id = rawStr.substring(0, idx).trim();
    const loc = rawStr.substring(idx + 1).trim();
    return { id, loc };
  };

  useEffect(() => {
    setMounted(true);
    if (open) {
      setProductName(row.productName || "");
      
      // Parse initial row synergyId
      const { id, loc } = parseSkuString(row.synergyId || "");
      setSku(id);
      setNotes(loc); 
      
      setWithCharger(false);
      setChargerType("USBC");
      setIncreaseSku(false);
      setAddToStock(false);

      if (row.ebayItemUrl) {
        fetchEbayData();
      }
    }
  }, [open, row]);

  // Effect: Handle Charger Text insertion/removal
  useEffect(() => {
    const usbcText = "65W USB-C CHARGER";
    const surfaceText = "65W SURFACE CHARGER";
    const currentText = chargerType === "SURFACE" ? surfaceText : usbcText;
    const otherText = chargerType === "SURFACE" ? usbcText : surfaceText;

    setNotes(prev => {
      let clean = prev
        .replace(` | ${usbcText}`, "")
        .replace(usbcText, "")
        .replace(` | ${surfaceText}`, "")
        .replace(surfaceText, "")
        .trim();
      
      if (withCharger) {
        return clean ? `${clean} | ${currentText}` : currentText;
      }
      return clean;
    });
  }, [withCharger, chargerType]);

  useEffect(() => {
    const fetchNextSku = async () => {
      if (increaseSku && sku) {
        // We assume the prefix is the first part of the SKU (e.g. "SJG" from "SJG 1479")
        // If the SKU format is strictly "PREFIX NUMBER ...", we grab the first token
        const parts = sku.split(" ");
        if (parts.length > 0) {
          const prefix = parts[0];
          try {
            setLoading(true);
            const res = await fetch(`${API_BASE}/prefix/${prefix}/peek`);
            if (res.ok) {
              const nextId = await res.text();
              // When generating a new SKU, we usually just replace the ID part
              // We keep the location in 'notes' as is
              setSku(nextId); 
            }
          } catch (e) {
            console.error("Failed to peek next ID", e);
          } finally {
            setLoading(false);
          }
        }
      } else if (!increaseSku && open) {
        // Revert to original ID
        const { id } = parseSkuString(row.synergyId || "");
        setSku(id);
      }
    };
    fetchNextSku();
  }, [increaseSku]);

  const fetchEbayData = async () => {
    if (!row.synergyId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/integrations/ebay/refresh-sold-when/${row.synergyId}?days=720`, {
        method: "POST"
      });
      
      if (res.ok) {
        const data = await res.json();
        
        // 1. Set SKU & Location from eBay custom label if available
        if (data.sku && data.sku !== "null") {
            const { id, loc } = parseSkuString(data.sku);
            setSku(id);
            // If we found a location in eBay SKU, prepend/replace it in notes?
            // Usually we want the most recent location info.
            // Let's preserve existing manual edits to notes if they contain charger info,
            // but update the location part.
            setNotes(prev => {
                const hasCharger = prev.includes("CHARGER");
                const chargerPart = hasCharger ? (prev.includes("SURFACE") ? " | 65W SURFACE CHARGER" : " | 65W USB-C CHARGER") : "";
                return loc + chargerPart;
            });
        }

        // 2. Set Title if available
        if (data.title && data.title !== "null") {
            setProductName(data.title);
        }
      }
    } catch (e) {
      console.error("eBay sync failed", e);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = async () => {
    setPrinting(true);
    
    if (increaseSku) {
      const parts = sku.split(" ");
      if (parts.length > 0) {
        try {
          await fetch(`${API_BASE}/prefix/${parts[0]}/take`, { method: "POST" });
        } catch(e) { console.error("Failed to reserve ID", e); }
      }
    }

    const success = await printLabel({
      synergyId: sku,
      productName: productName,
      grade: "", 
      notes: notes
    });

    if (!success) {
      alert("Print failed. Check console.");
    } else {
      onOpenChange(false);
    }
    setPrinting(false);
  };

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 animate-in fade-in duration-200">
      
      <div className="w-full max-w-5xl bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-zinc-800 overflow-hidden flex flex-col relative animate-in zoom-in-95 duration-200 min-h-[600px]">
        
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => onOpenChange(false)} 
          className="absolute top-4 right-4 z-20 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full"
        >
          <X className="h-5 w-5 text-gray-500" />
        </Button>

        <div className="p-8 flex flex-col h-full">
            
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-500 shadow-sm">
                    <Printer className="h-5 w-5" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Print Label</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Standard inventory label configuration
                    </p>
                </div>
              </div>
            </div>

            <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              <div className="lg:col-span-5 flex flex-col gap-5">
                 
                 <div className={`p-3 rounded-lg border flex items-center gap-3 ${
                    row.ebayItemUrl 
                      ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300"
                      : "bg-gray-50 border-gray-200 text-gray-600 dark:bg-zinc-800/50 dark:border-zinc-700 dark:text-gray-400"
                 }`}>
                    {row.ebayItemUrl ? (
                        <>
                            <Link2 className="h-4 w-4 shrink-0" />
                            <div className="flex-1 text-xs font-medium">Linked to eBay Listing</div>
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-6 px-2 text-[10px] hover:bg-emerald-100 dark:hover:bg-emerald-800"
                                onClick={fetchEbayData}
                                disabled={loading}
                            >
                                {loading ? <Loader2 className="h-3 w-3 animate-spin"/> : <RefreshCw className="h-3 w-3 mr-1"/>}
                                Sync
                            </Button>
                        </>
                    ) : (
                        <>
                            <Unlink className="h-4 w-4 shrink-0" />
                            <div className="flex-1 text-xs font-medium">No eBay Link Detected</div>
                        </>
                    )}
                 </div>

                 <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                        <Package className="h-3 w-3" /> Product Name
                    </Label>
                    <Input 
                        value={productName}
                        onChange={(e) => setProductName(e.target.value)}
                        className="bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700 font-medium"
                        placeholder="Product Name"
                    />
                 </div>

                 <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                        <Tag className="h-3 w-3" /> SKU / ID
                    </Label>
                    <div className="relative">
                        <Input 
                            value={sku}
                            onChange={(e) => setSku(e.target.value)}
                            className={`bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700 font-mono ${increaseSku ? "text-blue-600 dark:text-blue-400 border-blue-200" : ""}`}
                            placeholder="SKU"
                        />
                        {increaseSku && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                <span className="flex h-2 w-2 rounded-full bg-blue-500 animate-pulse"></span>
                            </div>
                        )}
                    </div>
                 </div>

                 <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Label Specs / Subtitle (Location)</Label>
                    <Input 
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700 text-xs"
                        placeholder="Location or Specs..."
                    />
                 </div>

                 <div className="grid grid-cols-3 gap-3 pt-2">
                    <div 
                        className={`flex flex-col gap-2 p-2.5 rounded-lg border cursor-pointer transition-all hover:shadow-sm ${increaseSku ? "bg-blue-50 border-blue-200 dark:bg-blue-900/20" : "bg-white border-gray-200 dark:bg-zinc-900 dark:border-zinc-700"}`} 
                        onClick={() => setIncreaseSku(!increaseSku)}
                    >
                        <div className="flex justify-between items-center">
                            <ArrowUp className={`h-4 w-4 ${increaseSku ? "text-blue-500" : "text-gray-400"}`} />
                            <Switch checked={increaseSku} onCheckedChange={setIncreaseSku} className="scale-75 origin-right" />
                        </div>
                        <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300">Increase SKU</span>
                    </div>

                    <div 
                        className={`flex flex-col gap-2 p-2.5 rounded-lg border cursor-pointer transition-all hover:shadow-sm ${withCharger ? "bg-amber-50 border-amber-200 dark:bg-amber-900/20" : "bg-white border-gray-200 dark:bg-zinc-900 dark:border-zinc-700"}`} 
                    >
                        <div className="flex justify-between items-center" onClick={() => setWithCharger(!withCharger)}>
                            <Zap className={`h-4 w-4 ${withCharger ? "text-amber-500" : "text-gray-400"}`} />
                            <Switch checked={withCharger} onCheckedChange={setWithCharger} className="scale-75 origin-right" />
                        </div>
                        
                        {/* Compact Type Selector */}
                        {withCharger ? (
                           <select 
                             className="mt-1 h-5 text-[10px] bg-transparent border-none p-0 font-medium text-amber-700 focus:ring-0 cursor-pointer"
                             value={chargerType}
                             onChange={(e) => setChargerType(e.target.value as any)}
                             onClick={(e) => e.stopPropagation()}
                           >
                             <option value="USBC">USB-C (65W)</option>
                             <option value="SURFACE">Surface (65W)</option>
                           </select>
                        ) : (
                           <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300" onClick={() => setWithCharger(true)}>Add Charger</span>
                        )}
                    </div>

                    <div 
                        className={`flex flex-col gap-2 p-2.5 rounded-lg border cursor-pointer transition-all hover:shadow-sm ${addToStock ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20" : "bg-white border-gray-200 dark:bg-zinc-900 dark:border-zinc-700"}`} 
                        onClick={() => setAddToStock(!addToStock)}
                    >
                        <div className="flex justify-between items-center">
                            <Layers className={`h-4 w-4 ${addToStock ? "text-emerald-500" : "text-gray-400"}`} />
                            <Switch checked={addToStock} onCheckedChange={setAddToStock} className="scale-75 origin-right" />
                        </div>
                        <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300">Add Stock</span>
                    </div>
                 </div>

              </div>

              {/* RIGHT: LIVE PREVIEW (MATCHING DYMO.TS LAYOUT) */}
              <div className="lg:col-span-7 flex flex-col items-center justify-center bg-gray-100 dark:bg-black/20 rounded-xl border border-dashed border-gray-300 dark:border-zinc-700 p-8 relative">
                 <div className="absolute top-3 left-4 text-xs font-bold text-gray-400 uppercase tracking-widest">
                    Label Preview
                 </div>

                 <div 
                    className="bg-white text-black relative shadow-xl overflow-hidden select-none transition-transform hover:scale-[1.02] duration-300"
                    style={{ 
                        width: '420px', 
                        height: '232px', 
                        padding: '10px 40px', 
                        boxSizing: 'border-box',
                        display: 'flex',
                        flexDirection: 'column'
                    }}
                 >
                    <div className="w-full flex justify-end border-b border-black pb-1 mb-1">
                        <span className="font-mono text-[10px] font-bold">{currentDate}</span>
                    </div>

                    <div className="flex-1 flex flex-col pt-1">
                        <div 
                            className="font-black leading-[1.05] mb-1"
                            style={{ 
                                fontSize: '20px',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden'
                             }}
                        >
                            {productName || "Product Name"}
                        </div>
                        {notes && (
                            <div className="text-[10px] font-bold uppercase text-gray-800 tracking-wide">
                                {notes}
                            </div>
                        )}
                    </div>

                    <div className="border-t border-black pt-1 pb-1">
                        <div className="text-[44px] font-black tracking-tight leading-none overflow-hidden whitespace-nowrap text-ellipsis uppercase">
                            {sku || "SKU-00000"}
                        </div>
                    </div>
                 </div>
                 
                 <div className="mt-6 text-[11px] text-gray-400 flex items-center gap-2">
                    <Printer className="h-3 w-3" />
                    Matches DYMO 30252 Layout (3.5" x 1.9")
                 </div>
              </div>

            </div>

            <div className="mt-auto pt-6 border-t border-gray-100 dark:border-zinc-800 flex justify-end gap-3">
               <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={printing}>
                  Cancel
               </Button>
               <Button 
                  onClick={handlePrint} 
                  disabled={printing || loading} 
                  className="bg-blue-600 hover:bg-blue-700 text-white min-w-[150px] shadow-lg shadow-blue-900/20"
               >
                  {printing ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Printing...</>
                  ) : (
                      <><Printer className="h-4 w-4 mr-2" /> Print Label</>
                  )}
               </Button>
            </div>

        </div>
      </div>
    </div>,
    document.body
  );
}