import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  Pencil, 
  X, 
  FileText, 
  Building, 
  Check, 
  Loader2 
} from "lucide-react";
import { apiPatch } from "@/lib/api";
import type { PurchaseOrderSummary, Vendor } from "@/types/manager";

type Props = {
  open: boolean;
  onClose: () => void;
  po: PurchaseOrderSummary;
  vendors: Vendor[];
  allowVendorEdit?: boolean;
  onSaved?: (updated: {
    po_number?: string | null;
    vendor_id?: string | null;
    vendor_name?: string | null;
  }) => void;
};

export default function EditPOModal({
  open,
  onClose,
  po,
  vendors,
  allowVendorEdit = false,
  onSaved,
}: Props) {
  const [poNumber, setPoNumber] = useState(po.po_number);
  const [vendorId, setVendorId] = useState(po.vendor_id);
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      setPoNumber(po.po_number || "");
      setVendorId(po.vendor_id || "");
      setBusy(false);
    }
  }, [open, po]);

  if (!open || !mounted) return null;

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    const nextNumber = (poNumber || "").trim();
    if (!nextNumber) return;

    setBusy(true);
    try {
      const payload: Record<string, any> = {};

      // Only include changed fields
      if (nextNumber !== (po.po_number || "")) payload.po_number = nextNumber || null;

      if (allowVendorEdit && (vendorId || "") !== (po.vendor_id || "")) {
        payload.vendor_id = vendorId || null;
      }

      if (Object.keys(payload).length === 0) {
        onClose();
        return;
      }

      // 1. Perform API Update
      await apiPatch(`/purchase_orders/${po.id}`, payload);

      // 2. Notify Parent to refresh UI
      onSaved?.({
        po_number: payload.po_number ?? undefined,
        vendor_id: payload.vendor_id ?? undefined,
        vendor_name:
          allowVendorEdit && payload.vendor_id
            ? vendors.find((v) => v.id === payload.vendor_id)?.name
            : undefined,
      });

      onClose();
    } catch (err: any) {
      console.error(err);
      alert("Failed to update PO: " + (err?.message || String(err)));
    } finally {
      setBusy(false);
    }
  };

  // Calculate if there are actual changes to save
  const hasChanges = 
    (poNumber || "").trim() !== (po.po_number || "") || 
    (allowVendorEdit && (vendorId || "") !== (po.vendor_id || ""));

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 animate-in fade-in duration-200">
      
      {/* Card Container */}
      <div className="w-full max-w-md bg-card rounded-2xl shadow-2xl border overflow-hidden flex flex-col relative animate-in zoom-in-95 duration-200">
        
        {/* Close Button */}
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={onClose} 
          disabled={busy}
          className="absolute top-4 right-4 z-20 hover:bg-muted rounded-full"
        >
          <X className="h-5 w-5 text-muted-foreground" />
        </Button>

        <div className="p-8">
          
          {/* Header */}
          <div className="flex flex-col items-center text-center mb-8">
            <Avatar className="h-20 w-20 border-4 border-muted/20 shadow-xl mb-6">
              <AvatarFallback className="bg-primary/5 text-primary">
                <Pencil className="h-9 w-9" />
              </AvatarFallback>
            </Avatar>
            <h2 className="text-2xl font-bold mb-1">Edit Purchase Order</h2>
            <p className="text-muted-foreground text-sm">
              Update details for this PO.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSave} className="space-y-5">
            
            {/* PO Number Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase text-muted-foreground tracking-wider ml-1">
                PO Number
              </label>
              <div className="relative group">
                <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <Input
                  value={poNumber}
                  onChange={(e) => setPoNumber(e.target.value)}
                  className="pl-9 bg-muted/20 border-muted-foreground/20 focus:bg-background transition-all h-11"
                  placeholder="e.g. PO-12345"
                  autoFocus
                  disabled={busy}
                />
              </div>
            </div>

            {/* Vendor Select */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase text-muted-foreground tracking-wider ml-1">
                Vendor
              </label>
              <div className="relative group">
                <Building className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <select
                  disabled={!allowVendorEdit || busy}
                  value={vendorId}
                  onChange={(e) => setVendorId(e.target.value)}
                  className="w-full pl-9 h-11 rounded-md border border-muted-foreground/20 bg-muted/20 px-3 text-sm focus:bg-background focus:ring-2 focus:ring-primary focus:outline-none transition-all appearance-none disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                >
                  <option value="">— None —</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
                {/* Custom chevron for select */}
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-50">
                  <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>
              {!allowVendorEdit && (
                <p className="text-[10px] text-muted-foreground ml-1">
                  Vendor cannot be changed here. Use the "Move" action instead.
                </p>
              )}
            </div>

            {/* Footer Actions */}
            <div className="flex items-center gap-3 mt-8 pt-2">
              <Button 
                variant="ghost" 
                type="button"
                onClick={onClose} 
                disabled={busy}
                className="flex-1 h-11 text-muted-foreground hover:text-foreground"
              >
                Cancel
              </Button>
              <Button 
                type="submit"
                disabled={busy || !hasChanges || !poNumber.trim()}
                className="flex-1 h-11 shadow-lg shadow-primary/20 text-base"
              >
                {busy ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                ) : (
                  <><Check className="mr-2 h-4 w-4" /> Save Changes</>
                )}
              </Button>
            </div>

          </form>
        </div>
      </div>
    </div>,
    document.body
  );
}