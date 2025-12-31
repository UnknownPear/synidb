import React, { useState } from "react";
import { 
  PlusCircle, 
  Package, 
  Hash, 
  Barcode, 
  DollarSign,
  Layers,
  Split
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { API_BASE } from "@/lib/api";
import GlobalLoader from "@/components/ui/GlobalLoader"; // <--- IMPORT
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export default function AddLineItemModal({
  poId,
  apiBase = API_BASE,
  onClose,
  onLineAdded,
}: {
  poId: string;
  apiBase?: string;
  onClose: () => void;
  onLineAdded: () => void;
}) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState<number>(1);
  const [upc, setUpc] = useState("");
  const [msrp, setMsrp] = useState<string>("");
  const [unitCost, setUnitCost] = useState<string>("");
  const [splitLines, setSplitLines] = useState(false);
  
  // REPLACED simple isLoading with detailed state
  const [busyState, setBusyState] = useState<{ active: boolean; text: string; progress?: number | null }>({ 
    active: false, 
    text: "", 
    progress: null 
  });

  const createLine = async () => {
    if (!name.trim()) {
      alert("Please enter a product name.");
      return;
    }

    const baseBody = {
      product_name_raw: name.trim(),
      upc: upc.trim() || null,
      msrp: msrp ? Number(msrp) : null,
      unit_cost: unitCost ? Number(unitCost) : null,
    };

    const endpoint = `${apiBase}/pos/${encodeURIComponent(poId)}/lines`;
    const headers = { "Content-Type": "application/json", Accept: "application/json" };
    const credentials = "include" as const;

    // Initialize loader
    setBusyState({ active: true, text: "Creating line...", progress: 0 });

    try {
      if (splitLines && qty > 1) {
        // Create multiple lines sequentially with progress updates
        for (let i = 0; i < qty; i++) {
          setBusyState({ 
            active: true, 
            text: `Creating line ${i + 1} of ${qty}...`, 
            progress: ((i + 1) / qty) * 100 
          });

          await fetch(endpoint, {
            method: "POST",
            credentials,
            headers,
            body: JSON.stringify({ ...baseBody, qty: 1 }),
          });
        }
      } else {
        // Create single line
        const r = await fetch(endpoint, {
          method: "POST",
          credentials,
          headers,
          body: JSON.stringify({ ...baseBody, qty: Number.isFinite(qty) && qty > 0 ? qty : 1 }),
        });
        if (!r.ok) throw new Error(await r.text() || `HTTP ${r.status}`);
      }

      onLineAdded();
      onClose();
    } catch (e: any) {
      alert("Failed to add line item: " + e.message);
    } finally {
      setBusyState({ active: false, text: "", progress: null });
    }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !busyState.active && !open && onClose()}>
      <DialogContent className="sm:max-w-[550px]">
        
        {/* --- GLOBAL LOADER --- */}
        <GlobalLoader 
          loading={busyState.active} 
          label={busyState.text} 
          progress={busyState.progress} 
        />

        <DialogHeader>
          <DialogTitle>Add Line Item</DialogTitle>
          <DialogDescription>
            Enter details below. You can split quantities into individual lines automatically.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-5 py-3">
          {/* Product Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Product Name</Label>
            <div className="relative">
              <Package className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="name"
                className="pl-9"
                placeholder="e.g., Sony WH-1000XM5 Wireless Headphones"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                disabled={busyState.active}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {/* Quantity */}
            <div className="space-y-2">
              <Label htmlFor="qty">Qty</Label>
              <div className="relative">
                <Hash className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="qty"
                  type="number"
                  className="pl-9"
                  min={1}
                  value={qty}
                  onChange={(e) => setQty(parseInt(e.target.value || "1", 10))}
                  disabled={busyState.active}
                />
              </div>
            </div>
            
            {/* UPC */}
            <div className="space-y-2 col-span-2">
              <Label htmlFor="upc">UPC</Label>
              <div className="relative">
                <Barcode className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="upc"
                  className="pl-9"
                  placeholder="e.g., 027242919002"
                  value={upc}
                  onChange={(e) => setUpc(e.target.value)}
                  disabled={busyState.active}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* MSRP */}
            <div className="space-y-2">
              <Label htmlFor="msrp">MSRP</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="msrp"
                  className="pl-9"
                  inputMode="decimal"
                  placeholder="49.99"
                  value={msrp}
                  onChange={(e) => setMsrp(e.target.value)}
                  disabled={busyState.active}
                />
              </div>
            </div>

            {/* Paid Cost */}
            <div className="space-y-2">
              <Label htmlFor="cost">Paid Unit Cost</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="cost"
                  className="pl-9"
                  inputMode="decimal"
                  placeholder="25.00"
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                  disabled={busyState.active}
                />
              </div>
            </div>
          </div>

          {/* Auto-Split Toggle */}
          <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/20">
             <div className="flex items-center gap-3">
                <div className={`p-2 rounded-full ${splitLines ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                   {splitLines ? <Split className="h-4 w-4" /> : <Layers className="h-4 w-4" />}
                </div>
                <div className="space-y-0.5">
                   <Label htmlFor="split-mode" className="text-sm font-medium">Split into individual lines</Label>
                   <p className="text-[11px] text-muted-foreground">
                     {splitLines 
                        ? `Will create ${qty} separate lines (Qty 1 each)` 
                        : `Will create 1 line with Qty ${qty}`}
                   </p>
                </div>
             </div>
             <Switch 
               id="split-mode" 
               checked={splitLines} 
               onCheckedChange={setSplitLines} 
               disabled={qty <= 1 || busyState.active} 
             />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busyState.active}>
            Cancel
          </Button>
          <Button onClick={createLine} disabled={busyState.active}>
            <PlusCircle className="mr-2 h-4 w-4" />
            {splitLines && qty > 1 ? `Create ${qty} Lines` : "Create Line"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}