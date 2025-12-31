import React, { useEffect, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { 
  X, Search, Link2, ExternalLink, Loader2, RefreshCw, CheckCircle2, Package
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { API_BASE } from "@/lib/api";

// --- Types ---
type EbayItem = {
  id: string;
  title: string;
  price: number;
  currency: string;
  qty: number;
  url: string;
  sku: string;
  image: string;
};

type SynergyItem = {
  id: string;
  product_name: string;
  synergy_id: string;
  status: string;
};

// Snyk Fix: Helper to sanitize URLs
function safeUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (["http:", "https:"].includes(parsed.protocol)) {
      return url;
    }
  } catch (e) {
    // If invalid URL, ignore or check relative paths if needed
  }
  return undefined;
}

export default function EbayLinkerModal({
  open,
  onClose,
  userId,
}: {
  open: boolean;
  onClose: () => void;
  userId: number | string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [ebayItems, setEbayItems] = useState<EbayItem[]>([]);
  const [loadingEbay, setLoadingEbay] = useState(false);
  const [selectedEbayId, setSelectedEbayId] = useState<string | null>(null);
  const [ebaySearch, setEbaySearch] = useState(""); // eBay Filter

  const [inventory, setInventory] = useState<SynergyItem[]>([]);
  const [inventorySearch, setInventorySearch] = useState(""); // Inventory Filter
  const [selectedSynergyIds, setSelectedSynergyIds] = useState<string[]>([]);
  const [linking, setLinking] = useState(false);

  // Fetch eBay Data
  const fetchEbay = async () => {
    setLoadingEbay(true);
    try {
      const res = await fetch(`${API_BASE}/admin/ebay/unlinked`);
      const data = await res.json();
      setEbayItems(data.items || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingEbay(false);
    }
  };

  // Fetch Local Inventory
  const fetchInventory = async () => {
    try {
      const res = await fetch(`${API_BASE}/rows?status=TESTED`); 
      const data = await res.json();
      const mapped = (data || []).map((r: any) => ({
        id: r.id,
        product_name: r.productName || r.product_name_raw || "(No Name)",
        synergy_id: r.synergyId || r.synergy_id,
        status: r.status
      }));
      setInventory(mapped);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (open) {
      fetchEbay();
      fetchInventory();
      setSelectedEbayId(null);
      setSelectedSynergyIds([]);
      setEbaySearch("");
      setInventorySearch("");
    }
  }, [open]);

  // Filter eBay Items
  const filteredEbayItems = useMemo(() => {
    if (!ebaySearch) return ebayItems;
    const lower = ebaySearch.toLowerCase();
    return ebayItems.filter(i => 
      i.title.toLowerCase().includes(lower) || 
      i.id.includes(lower)
    );
  }, [ebayItems, ebaySearch]);

  // Filter Inventory
  const filteredInventory = useMemo(() => {
    // Show all by default, or filter
    const lower = inventorySearch.toLowerCase();
    return inventory.filter(i => 
      !lower || 
      i.product_name.toLowerCase().includes(lower) || 
      i.synergy_id.toLowerCase().includes(lower)
    );
  }, [inventory, inventorySearch]);

  const handleLink = async () => {
    const ebayItem = ebayItems.find(i => i.id === selectedEbayId);
    if (!ebayItem || !selectedSynergyIds.length) return;

    setLinking(true);
    try {
      const payload = {
        ebay_item_id: ebayItem.id,
        ebay_item_url: ebayItem.url,
        ebay_price: ebayItem.price,
        synergy_ids: selectedSynergyIds,
        posted_by_user_id: Number(userId)
      };

      const res = await fetch(`${API_BASE}/admin/ebay/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error("Link failed");

      // Success! Remove linked items from lists locally
      setEbayItems(prev => prev.filter(i => i.id !== selectedEbayId));
      setInventory(prev => prev.filter(i => !selectedSynergyIds.includes(i.synergy_id)));
      
      setSelectedEbayId(null);
      setSelectedSynergyIds([]);
      
    } catch (e) {
      alert("Failed to link items.");
    } finally {
      setLinking(false);
    }
  };

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 p-6">
      <div className="w-full max-w-6xl h-[85vh] bg-background rounded-2xl shadow-2xl border flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b bg-muted/10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
               <Link2 className="h-6 w-6" />
            </div>
            <div>
               <h2 className="text-xl font-bold">eBay Linker</h2>
               <p className="text-sm text-muted-foreground">Match active eBay listings to Synergy inventory.</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-5 w-5"/></Button>
        </div>

        {/* Content Grid */}
        <div className="flex-1 grid grid-cols-2 overflow-hidden min-h-0">
          
          {/* LEFT: eBay Listings */}
          <div className="flex flex-col border-r bg-muted/5 min-h-0">
             <div className="p-3 border-b flex flex-col gap-3 bg-background">
                <div className="flex items-center justify-between">
                   <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">1. Select Active Listing</span>
                   <Button variant="ghost" size="sm" onClick={fetchEbay} disabled={loadingEbay} className="h-7 text-xs">
                      <RefreshCw className={`h-3 w-3 mr-1 ${loadingEbay ? 'animate-spin' : ''}`} /> Refresh
                   </Button>
                </div>
                <div className="relative">
                   <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                   <Input 
                     className="h-8 pl-8 bg-muted/30 text-sm" 
                     placeholder="Search eBay Title or ID..." 
                     value={ebaySearch}
                     onChange={e => setEbaySearch(e.target.value)}
                   />
                </div>
             </div>
             
             <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-0">
                {loadingEbay ? (
                   <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin mb-2" /> Loading eBay...
                   </div>
                ) : filteredEbayItems.length === 0 ? (
                   <div className="p-8 text-center text-muted-foreground text-sm">
                      {ebaySearch ? "No matches found." : "No unlinked listings found."}
                   </div>
                ) : (
                   filteredEbayItems.map(item => {
                     // Snyk Fix: Safe URLs
                     const imgSafe = safeUrl(item.image);
                     const linkSafe = safeUrl(item.url);
                     return (
                     <div 
                       key={item.id}
                       onClick={() => setSelectedEbayId(item.id)}
                       className={`
                         p-3 rounded-xl border cursor-pointer transition-all flex gap-3 group
                         ${selectedEbayId === item.id 
                           ? "bg-blue-50 border-blue-500/50 dark:bg-blue-900/20 shadow-md" 
                           : "bg-card hover:bg-accent hover:border-accent-foreground/20"}
                       `}
                     >
                        {imgSafe ? (
                           <img src={imgSafe} alt="" className="w-12 h-12 rounded-md object-cover bg-white border shrink-0" />
                        ) : (
                           <div className="w-12 h-12 rounded-md bg-muted flex items-center justify-center shrink-0">
                              <Package className="h-5 w-5 opacity-20" />
                           </div>
                        )}
                        <div className="flex-1 min-w-0">
                           <div className="font-medium text-sm truncate group-hover:whitespace-normal group-hover:overflow-visible group-hover:h-auto leading-tight">
                              {item.title}
                           </div>
                           <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                              <Badge variant="outline" className="bg-background h-5 px-1.5 font-normal">{item.currency} {item.price}</Badge>
                              <span>Qty: {item.qty}</span>
                              {linkSafe && (
                                <a href={linkSafe} target="_blank" rel="noreferrer" className="hover:text-primary p-1" onClick={e => e.stopPropagation()} title="View on eBay">
                                   <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                           </div>
                        </div>
                        {selectedEbayId === item.id && <CheckCircle2 className="h-5 w-5 text-blue-500 self-center shrink-0" />}
                     </div>
                   )})
                )}
             </div>
          </div>

          {/* RIGHT: Synergy Inventory */}
          <div className="flex flex-col bg-background min-h-0">
             <div className="p-3 border-b flex flex-col gap-3">
                <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">2. Match Inventory</span>
                <div className="relative">
                   <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                   <Input 
                     className="h-8 pl-8 bg-muted/30 text-sm" 
                     placeholder="Search Synergy ID or Product Name..." 
                     value={inventorySearch}
                     onChange={e => setInventorySearch(e.target.value)}
                   />
                </div>
             </div>
             
             <div className="flex-1 overflow-y-auto p-2 space-y-1 min-h-0">
                {filteredInventory.length === 0 ? (
                   <div className="p-8 text-center text-muted-foreground text-sm">No matching inventory found.</div>
                ) : (
                   filteredInventory.map(item => {
                     const isSelected = selectedSynergyIds.includes(item.synergy_id);
                     return (
                       <div 
                          key={item.synergy_id}
                          onClick={() => {
                             if(isSelected) setSelectedSynergyIds(prev => prev.filter(id => id !== item.synergy_id));
                             else setSelectedSynergyIds(prev => [...prev, item.synergy_id]);
                          }}
                          className={`
                             p-2 rounded-lg border cursor-pointer flex items-center justify-between transition-all select-none
                             ${isSelected ? "bg-emerald-50 border-emerald-500/50 dark:bg-emerald-900/20" : "hover:bg-muted border-transparent"}
                          `}
                       >
                          <div className="min-w-0">
                             <div className="font-medium text-sm truncate">{item.product_name}</div>
                             <div className="text-xs text-muted-foreground font-mono">{item.synergy_id}</div>
                          </div>
                          {isSelected ? (
                             <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                          ) : (
                             <div className="h-4 w-4 border-2 rounded-full border-muted-foreground/20 shrink-0" />
                          )}
                       </div>
                     )
                   })
                )}
             </div>
             
             {/* Footer Action */}
             <div className="p-4 border-t bg-muted/5 flex justify-between items-center shrink-0">
                <div className="text-sm text-muted-foreground">
                   {selectedEbayId ? "Listing selected." : "Select a listing."} 
                   {selectedSynergyIds.length > 0 && <span className="ml-2 font-medium text-foreground">• {selectedSynergyIds.length} items matched.</span>}
                </div>
                <Button 
                  onClick={handleLink} 
                  disabled={!selectedEbayId || selectedSynergyIds.length === 0 || linking}
                  className="bg-blue-600 hover:bg-blue-700 text-white shadow-md"
                >
                   {linking ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Link2 className="h-4 w-4 mr-2" />}
                   Link Items
                </Button>
             </div>
          </div>

        </div>
      </div>
    </div>,
    document.body
  );
}