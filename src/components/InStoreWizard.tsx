import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  X, 
  Store,
  Printer,
  Tag,
  AlertTriangle,
  ArrowRight,
  Package,
  Loader2
} from "lucide-react";
import type { InventoryRow } from "@/lib/dataClient";
import { openPrintWindow } from "@/helpers/printLabel";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: InventoryRow;
  onConfirm: (price: number, msrp: number, productName: string) => void;
};

export function InStoreWizard({ open, onOpenChange, row, onConfirm }: Props) {
  const [productName, setProductName] = useState(row.productName || "");
  const [price, setPrice] = useState<string>(row.price?.toString() || "");
  const [msrp, setMsrp] = useState<string>(row.msrp?.toString() || "");
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Formatting helpers
  const formatCurrency = (val: string) => {
    const num = parseFloat(val);
    return isNaN(num) ? "0.00" : num.toFixed(2);
  };

  const calculateSavings = () => {
    const m = parseFloat(msrp);
    const p = parseFloat(price);
    if (!isNaN(m) && !isNaN(p) && m > p) {
      return (m - p).toFixed(0);
    }
    return null;
  };

  const defectText = row.grade !== "A" && row.grade !== "B" 
    ? (row.testerComment || `Grade ${row.grade}`) 
    : null;

  const currentDate = new Date().toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
  });

  useEffect(() => {
    setMounted(true);
    if (open) {
      setProductName(row.productName || "");
      setPrice(row.price?.toString() || "");
      setMsrp(row.msrp?.toString() || "");
      setBusy(false);
    }
  }, [open, row]);

  if (!open || !mounted) return null;

  const handlePrintAndConfirm = async () => {
    const finalPrice = parseFloat(price) || 0;
    const finalMsrp = parseFloat(msrp) || 0;
    const finalName = productName.trim() || row.productName || "Item";

    setBusy(true);

    try {
        // 1. Trigger Print (Popup)
        await openPrintWindow({
            productName: finalName,
            unitPrice: finalMsrp.toString(),
            ourPrice: finalPrice.toString(),
            date: currentDate,
            qty: 1,
            synergyId: row.synergyId,
            prefix: undefined // Uses synergyId
        });

        // 2. Wait a moment for print dialog to initiate, then update backend
        setTimeout(() => {
            onConfirm(finalPrice, finalMsrp, finalName);
            setBusy(false);
            onOpenChange(false);
        }, 1000);
    } catch (e) {
        console.error("Print failed", e);
        setBusy(false);
        alert("Failed to generate label.");
    }
  };

  const savings = calculateSavings();

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
            
            {/* HEADER */}
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="h-10 w-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 dark:text-orange-500 shadow-sm">
                    <Store className="h-5 w-5" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Prepare for In-Store</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Edit details and print label. This will unlink the item from eBay.
                    </p>
                </div>
              </div>
            </div>

            <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              {/* LEFT: INPUTS */}
              <div className="lg:col-span-5 flex flex-col gap-5">
                 
                 {/* Product Name Input */}
                 <div className="bg-gray-50 dark:bg-zinc-800/50 p-4 rounded-xl border border-gray-200 dark:border-zinc-700 space-y-2 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-all">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                        <Package className="h-3 w-3" /> Product Name
                    </label>
                    <Input 
                        value={productName}
                        onChange={(e) => setProductName(e.target.value)}
                        className="bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700 font-medium"
                        placeholder="Enter product title..."
                    />
                 </div>

                 <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
                    {/* MSRP Input */}
                    <div className="bg-gray-50 dark:bg-zinc-800/50 p-4 rounded-xl border border-gray-200 dark:border-zinc-700 space-y-2 focus-within:ring-2 focus-within:ring-gray-500/20 focus-within:border-gray-500 transition-all">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                            <Tag className="h-3 w-3" /> MSRP
                        </label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">$</span>
                            <input 
                                type="number"
                                value={msrp}
                                onChange={(e) => setMsrp(e.target.value)}
                                className="w-full bg-white dark:bg-zinc-900 pl-7 pr-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 text-lg font-semibold focus:outline-none"
                                placeholder="0.00"
                            />
                        </div>
                    </div>

                    <div className="text-gray-300 dark:text-zinc-600">
                        <ArrowRight className="h-5 w-5" />
                    </div>

                    {/* Our Price Input */}
                    <div className="bg-orange-50 dark:bg-orange-900/10 p-4 rounded-xl border border-orange-200 dark:border-orange-800/50 space-y-2 focus-within:ring-2 focus-within:ring-orange-500/40 focus-within:border-orange-500 transition-all shadow-sm">
                        <label className="text-xs font-bold text-orange-700 dark:text-orange-400 uppercase tracking-wider flex items-center gap-2">
                            <Tag className="h-3 w-3" /> Our Price
                        </label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-orange-400 font-bold text-xl">$</span>
                            <input 
                                type="number"
                                value={price}
                                onChange={(e) => setPrice(e.target.value)}
                                className="w-full bg-white dark:bg-zinc-900 pl-8 pr-3 py-2 rounded-lg border border-orange-200 dark:border-orange-800 text-2xl font-bold text-orange-600 dark:text-orange-400 focus:outline-none"
                                placeholder="0.00"
                            />
                        </div>
                    </div>
                 </div>

              </div>

              {/* RIGHT: LIVE PREVIEW */}
              <div className="lg:col-span-7 flex flex-col items-center justify-center bg-gray-100 dark:bg-black/20 rounded-xl border border-dashed border-gray-300 dark:border-zinc-700 p-8 relative">
                 <div className="absolute top-3 left-4 text-xs font-bold text-gray-400 uppercase tracking-widest">
                    Live Print Preview
                 </div>

                 {/* 
                    THE LABEL VISUALIZATION 
                    Using aspect ratio of 4 : 2.3125 (~1.73) matching the print script 
                 */}
                 <div 
                    className="bg-white text-black relative shadow-2xl overflow-hidden select-none"
                    style={{ 
                        width: '400px', 
                        height: '231.25px', // Exact aspect ratio height
                        boxSizing: 'border-box',
                        // CSS Scaling to fit the design into 400px width
                        // Original print is 4in (approx 384px at 96dpi), so this is roughly 1:1 scale on screen
                    }}
                 >
                    {/* --- Content Elements positioned by % to match inches in print script --- */}
                    
                    {/* Product Name (Top Left: 0,0) */}
                    <div 
                        className="absolute leading-tight font-bold"
                        style={{ 
                            top: '4%', 
                            left: '4%', // padding
                            width: '55%', 
                            fontSize: '16px',
                            display: '-webkit-box',
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden'
                        }}
                    >
                        {productName || "Product Name"}
                    </div>

                    {/* MSRP Line (Below Product: ~24% top) */}
                    <div 
                        className="absolute text-gray-700"
                        style={{ top: '26%', left: '4%', fontSize: '13px' }}
                    >
                        MSRP: ${formatCurrency(msrp)}
                        {savings && (
                            <span className="ml-1 font-bold">| YOU SAVED ${savings}!</span>
                        )}
                    </div>

                    {/* Price Stack (Top Right: ~45% left, but aligned right side) */}
                    <div 
                        className="absolute text-right"
                        style={{ top: '2%', right: '28%', width: '25%' }}
                    >
                        <div className="text-[11px] font-bold tracking-wide">OUR PRICE</div>
                        <div className="font-extrabold leading-none" style={{ fontSize: '42px' }}>
                            ${formatCurrency(price).split('.')[0]}
                            <span style={{ fontSize: '24px', verticalAlign: 'top' }}>
                                .{formatCurrency(price).split('.')[1]}
                            </span>
                        </div>
                    </div>

                    {/* Logo (Far Right) */}
                    <img 
                       src="https://images.squarespace-cdn.com/content/v1/65b9315703a0c658ffb46c19/8d1b66b8-e3b1-41f0-9ebb-a116c5a9712e/Synergy-logo-icon.png" 
                       alt="Logo"
                       className="absolute opacity-90"
                       style={{ top: '4%', right: '4%', width: '60px', height: 'auto' }}
                    />

                    {/* Barcode (Bottom area: ~30% top onwards) */}
                    <div 
                        className="absolute flex items-end justify-center"
                        style={{ 
                            top: '35%', 
                            left: '0', 
                            width: '80%', // Barcode stops before date
                            height: '55%',
                            paddingLeft: '15px'
                        }}
                    >
                        {/* Fake CSS Barcode */}
                        <div className="w-full h-full flex items-end justify-between overflow-hidden opacity-80">
                            {Array.from({ length: 40 }).map((_, i) => (
                                <div 
                                    key={i} 
                                    style={{ 
                                        width: `${Math.random() * 6 + 2}px`, 
                                        height: '100%', 
                                        backgroundColor: 'black' 
                                    }} 
                                />
                            ))}
                        </div>
                        <div className="absolute bottom-[-15px] text-[10px] font-mono bg-white px-2">
                            {row.synergyId}
                        </div>
                    </div>

                    {/* Date (Bottom Right) */}
                    <div 
                        className="absolute text-right text-gray-500"
                        style={{ bottom: '8%', right: '5%', fontSize: '10px' }}
                    >
                        {currentDate}
                    </div>

                 </div>
                 
                 <div className="mt-6 text-[11px] text-gray-400 flex items-center gap-2">
                    <Printer className="h-3 w-3" />
                    Preview matches 4" x 2.31" label output
                 </div>
              </div>

            </div>

            {/* Footer */}
            <div className="mt-auto pt-6 border-t border-gray-100 dark:border-zinc-800 flex justify-between items-center">
               <div className="text-xs text-gray-400">
                  <AlertTriangle className="h-3 w-3 inline mr-1" />
                  Status will change to <strong>IN STORE</strong> immediately after printing.
               </div>
               <div className="flex gap-3">
                  <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handlePrintAndConfirm} 
                    disabled={busy || !price || parseFloat(price) <= 0}
                    className="bg-orange-600 hover:bg-orange-700 text-white min-w-[180px] shadow-lg shadow-orange-900/20"
                  >
                    {busy ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Printing...</>
                    ) : (
                        <><Printer className="h-4 w-4 mr-2" /> Print & Confirm</>
                    )}
                  </Button>
               </div>
            </div>

        </div>
      </div>
    </div>,
    document.body
  );
}