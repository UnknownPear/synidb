import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  Edit3, 
  X, 
  Check, 
  Loader2, 
  Package, 
  Hash, 
  DollarSign, 
  Layers 
} from "lucide-react";

type POLineUpdate = {
  product_name_raw?: string | null;
  upc?: string | null;
  qty?: number;
  unit_cost?: number | null;
  msrp?: number | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSave: (updates: POLineUpdate) => Promise<void>;
  lineCount: number;
  initialValues?: POLineUpdate; // <--- NEW PROP
};

export default function BulkEditLinesModal({
  open,
  onClose,
  onSave,
  lineCount,
  initialValues = {}, // Default to empty
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState(false);
  
  // Form State
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [upc, setUpc] = useState("");
  const [cost, setCost] = useState("");
  const [msrp, setMsrp] = useState("");

  useEffect(() => {
    setMounted(true);
    if (open) {
      // Initialize with passed values or empty strings
      setName(initialValues.product_name_raw || "");
      setQty(initialValues.qty ? String(initialValues.qty) : "");
      setUpc(initialValues.upc || "");
      setCost(initialValues.unit_cost ? String(initialValues.unit_cost) : "");
      setMsrp(initialValues.msrp ? String(initialValues.msrp) : "");
      setBusy(false);
    }
  }, [open, initialValues]);

  if (!open || !mounted) return null;

  const handleSave = async () => {
    // Construct payload only with values that were actually typed/changed
    const payload: POLineUpdate = {};
    
    // Only include if valid and different/set
    if (name.trim()) payload.product_name_raw = name.trim();
    if (qty.trim()) payload.qty = Number(qty);
    if (upc.trim()) payload.upc = upc.trim();
    if (cost.trim()) payload.unit_cost = Number(cost);
    if (msrp.trim()) payload.msrp = Number(msrp);

    if (Object.keys(payload).length === 0) {
      onClose(); 
      return;
    }

    setBusy(true);
    try {
      await onSave(payload);
      onClose();
    } catch (error) {
      console.error(error);
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 animate-in fade-in duration-200">
      
      {/* Main Card */}
      <div className="w-full max-w-lg bg-card rounded-2xl shadow-2xl border overflow-hidden flex flex-col relative animate-in zoom-in-95 duration-200">
        
        {/* Close Button */}
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={onClose} 
          className="absolute top-4 right-4 z-20 hover:bg-muted rounded-full"
        >
          <X className="h-5 w-5 text-muted-foreground" />
        </Button>

        <div className="p-8">
          
          {/* Header */}
          <div className="flex flex-col items-center text-center mb-8">
            <Avatar className="h-20 w-20 border-4 border-muted/20 shadow-xl mb-6">
              <AvatarFallback className="bg-primary/5 text-primary">
                <Edit3 className="h-9 w-9" />
              </AvatarFallback>
            </Avatar>
            <h2 className="text-2xl font-bold mb-1">Bulk Edit Lines</h2>
            <p className="text-muted-foreground text-sm">
              Updating <span className="font-bold text-foreground">{lineCount}</span> selected lines. 
              <br/>Only filled fields will be updated.
            </p>
          </div>

          {/* Form Inputs */}
          <div className="space-y-5">
            
            {/* Product Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase text-muted-foreground tracking-wider ml-1">Product Name</label>
              <div className="relative">
                <Package className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Keep unchanged"
                  className="pl-9 bg-muted/20 border-muted-foreground/20 focus:bg-background transition-all"
                />
              </div>
            </div>

            {/* Row 2: Qty & UPC */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-muted-foreground tracking-wider ml-1">Qty</label>
                <div className="relative">
                  <Layers className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    type="number"
                    min={1}
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    placeholder="--"
                    className="pl-9 bg-muted/20 border-muted-foreground/20 focus:bg-background transition-all"
                  />
                </div>
              </div>
              <div className="col-span-2 space-y-1.5">
                <label className="text-xs font-semibold uppercase text-muted-foreground tracking-wider ml-1">UPC</label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    value={upc}
                    onChange={(e) => setUpc(e.target.value)}
                    placeholder="Keep unchanged"
                    className="pl-9 bg-muted/20 border-muted-foreground/20 focus:bg-background transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Row 3: Cost & MSRP */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-muted-foreground tracking-wider ml-1">Unit Cost</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    type="number"
                    step="0.01"
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                    placeholder="Keep unchanged"
                    className="pl-9 bg-muted/20 border-muted-foreground/20 focus:bg-background transition-all"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-muted-foreground tracking-wider ml-1">MSRP</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    type="number"
                    step="0.01"
                    value={msrp}
                    onChange={(e) => setMsrp(e.target.value)}
                    placeholder="Keep unchanged"
                    className="pl-9 bg-muted/20 border-muted-foreground/20 focus:bg-background transition-all"
                  />
                </div>
              </div>
            </div>

          </div>

          {/* Actions */}
          <div className="flex gap-3 mt-8">
            <Button 
              variant="ghost" 
              onClick={onClose} 
              className="flex-1 h-11 text-muted-foreground"
              disabled={busy}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={busy} 
              className="flex-1 h-11 shadow-lg shadow-primary/20 text-base"
            >
              {busy ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
              ) : (
                <><Check className="mr-2 h-4 w-4" /> Update Lines</>
              )}
            </Button>
          </div>

        </div>
      </div>
    </div>,
    document.body
  );
}