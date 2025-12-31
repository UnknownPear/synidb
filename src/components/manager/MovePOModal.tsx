import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { 
  ArrowRight, 
  X, 
  CheckCircle2,
  Loader2,
  Store,
  Check,
  ChevronsUpDown,
  Building
} from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Vendor } from "@/types/manager";

type Props = {
  open: boolean;
  onClose: () => void;
  poNumber: string;
  currentVendorId: string;
  vendors: Vendor[];
  onMove: (newVendorId: string) => Promise<void>;
};

export default function MovePOModal({
  open,
  onClose,
  poNumber,
  currentVendorId,
  vendors,
  onMove,
}: Props) {
  const [targetVendorId, setTargetVendorId] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false); // NEW: Success state
  const [mounted, setMounted] = useState(false);
  const [comboboxOpen, setComboboxOpen] = useState(false);

  const currentVendorName = vendors.find(v => v.id === currentVendorId)?.name || "Unknown Vendor";
  const selectedTargetVendor = vendors.find(v => v.id === targetVendorId);

  useEffect(() => {
    setMounted(true);
    if (open) {
      setTargetVendorId(""); 
      setSuccess(false);
      setBusy(false);
    }
  }, [open]);

  if (!open || !mounted) return null;

  const handleSave = async () => {
    if (!targetVendorId) return;
    setBusy(true);
    try {
      await onMove(targetVendorId);
      setSuccess(true); // Show success view
      
      // Close automatically after 1.5 seconds
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (error) {
      console.error(error);
      setBusy(false);
      alert("Failed to move PO. Please try again."); // Fallback error if API fails
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 animate-in fade-in duration-200">
      
      <div className="w-full max-w-2xl bg-card rounded-2xl shadow-2xl border overflow-hidden flex flex-col relative animate-in zoom-in-95 duration-200 min-h-[400px]">
        
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={onClose} 
          className="absolute top-4 right-4 z-20 hover:bg-muted rounded-full"
        >
          <X className="h-5 w-5 text-muted-foreground" />
        </Button>

        {/* SUCCESS VIEW */}
        {success ? (
          <div className="flex-1 flex flex-col items-center justify-center p-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="h-24 w-24 rounded-full bg-green-100 text-green-600 flex items-center justify-center mb-6 shadow-sm">
              <CheckCircle2 className="h-12 w-12" />
            </div>
            <h2 className="text-2xl font-bold text-foreground">Transfer Complete!</h2>
            <p className="text-muted-foreground mt-2 text-center max-w-sm">
              Purchase Order <span className="font-mono font-medium text-foreground">{poNumber}</span> has been successfully moved to <span className="font-medium text-foreground">{selectedTargetVendor?.name}</span>.
            </p>
          </div>
        ) : (
          /* FORM VIEW */
          <div className="p-8 flex flex-col h-full justify-center">
            
            <div className="text-center mb-10">
              <h2 className="text-2xl font-bold">Transfer Purchase Order</h2>
              <p className="text-muted-foreground mt-1">
                Moving PO <span className="font-mono font-medium text-foreground bg-muted px-1.5 py-0.5 rounded">{poNumber}</span> to a new vendor.
              </p>
            </div>

            {/* The Transfer UI */}
            <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center mb-10 relative">
              
              {/* LEFT: Current Vendor */}
              <div className="flex flex-col space-y-2">
                <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wider ml-1">
                  From (Current)
                </span>
                <div className="h-24 rounded-xl border bg-muted/30 flex flex-col items-center justify-center p-4 text-center relative overflow-hidden group cursor-not-allowed">
                  <Store className="absolute -bottom-4 -left-4 h-20 w-20 text-muted-foreground/10" />
                  <div className="z-10 font-semibold text-lg text-muted-foreground truncate w-full px-2">
                    {currentVendorName}
                  </div>
                  <div className="z-10 text-xs text-muted-foreground/70 mt-1">
                    Source Vendor
                  </div>
                </div>
              </div>

              {/* CENTER: Arrow */}
              <div className="flex flex-col items-center justify-center pt-6">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shadow-sm">
                  <ArrowRight className="h-5 w-5" />
                </div>
              </div>

              {/* RIGHT: New Vendor */}
              <div className="flex flex-col space-y-2">
                <label className="text-xs font-semibold uppercase text-primary tracking-wider ml-1">
                  To (New)
                </label>
                
                <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
                  <PopoverTrigger asChild>
                    <button
                      className={cn(
                        "relative h-24 w-full rounded-xl border-2 bg-card flex flex-col justify-center text-left overflow-hidden transition-all outline-none",
                        comboboxOpen 
                          ? "border-primary ring-4 ring-primary/10" 
                          : "border-primary/20 hover:border-primary/40 focus:border-primary focus:ring-4 focus:ring-primary/10"
                      )}
                    >
                      <Building className={cn(
                        "absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 transition-colors",
                        selectedTargetVendor ? "text-primary" : "text-muted-foreground"
                      )} />

                      <div className="pl-12 pr-10 w-full">
                        {selectedTargetVendor ? (
                          <div className="font-semibold text-lg truncate">
                            {selectedTargetVendor.name}
                          </div>
                        ) : (
                          <div className="text-lg text-muted-foreground font-medium">
                            Select Vendor...
                          </div>
                        )}
                      </div>

                      <ChevronsUpDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 opacity-50" />

                      <div className="absolute bottom-2.5 left-0 w-full text-center text-[10px] font-medium text-muted-foreground pointer-events-none uppercase tracking-wide">
                        Destination Vendor
                      </div>
                    </button>
                  </PopoverTrigger>
                  
                  <PopoverContent className="w-[280px] p-0 z-[110]" align="center">
                    <Command>
                      <CommandInput placeholder="Search vendor..." className="h-9" />
                      <CommandList>
                        <CommandEmpty>No vendor found.</CommandEmpty>
                        <CommandGroup>
                          {vendors.map((v) => (
                            <CommandItem
                              key={v.id}
                              value={v.name}
                              onSelect={() => {
                                setTargetVendorId(v.id === currentVendorId ? "" : v.id);
                                setComboboxOpen(false);
                              }}
                              disabled={v.id === currentVendorId}
                              className="cursor-pointer"
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  targetVendorId === v.id ? "opacity-100" : "opacity-0"
                                )}
                              />
                              <span className={cn("flex-1", v.id === currentVendorId && "text-muted-foreground line-through")}>
                                {v.name}
                              </span>
                              {v.id === currentVendorId && (
                                <span className="text-[10px] text-muted-foreground ml-2">(Current)</span>
                              )}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-center gap-3">
              {!busy && (
                <Button 
                  variant="ghost" 
                  onClick={onClose}
                  className="w-32"
                >
                  Cancel
                </Button>
              )}
              <Button 
                onClick={handleSave} 
                disabled={!targetVendorId || busy} 
                className="w-48 h-11 text-base font-medium shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all"
              >
                {busy ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Moving...</>
                ) : (
                  <><CheckCircle2 className="mr-2 h-4 w-4" /> Confirm Move</>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}