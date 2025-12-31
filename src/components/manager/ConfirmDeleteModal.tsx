import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Trash2, X, Loader2 } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  title: string;
  description: React.ReactNode;
  confirmText?: string;
  requireVerification?: boolean; // New Prop
};

export default function ConfirmDeleteModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "Delete",
  requireVerification = false,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [verificationText, setVerificationText] = useState("");

  useEffect(() => {
    setMounted(true);
    if (open) {
      setVerificationText(""); // Reset input on open
      setBusy(false);
    }
  }, [open]);

  if (!open || !mounted) return null;

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  // Check if the delete button should be enabled
  const isEnabled = !busy && (!requireVerification || verificationText === "CONFIRM");

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-card rounded-2xl shadow-2xl border overflow-hidden flex flex-col relative animate-in zoom-in-95 duration-200">
        
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={onClose} 
          className="absolute top-3 right-3 z-20 hover:bg-muted rounded-full"
        >
          <X className="h-5 w-5 text-muted-foreground" />
        </Button>

        <div className="p-8 flex flex-col items-center text-center">
          <div className="h-16 w-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center mb-5 shadow-sm">
            <AlertTriangle className="h-8 w-8" />
          </div>

          <h2 className="text-xl font-bold text-foreground mb-2">{title}</h2>
          <div className="text-muted-foreground text-sm mb-6 px-2 leading-relaxed">
            {description}
          </div>

          {/* Verification Input Field */}
          {requireVerification && (
            <div className="w-full mb-6 space-y-2 text-left">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Type <span className="font-mono font-bold text-foreground">CONFIRM</span> to continue
              </label>
              <Input 
                value={verificationText}
                onChange={(e) => setVerificationText(e.target.value)}
                placeholder="CONFIRM"
                className="text-center font-medium placeholder:font-normal"
                autoFocus
              />
            </div>
          )}

          <div className="flex items-center gap-3 w-full">
            <Button 
              variant="outline" 
              onClick={onClose} 
              disabled={busy}
              className="flex-1 h-11"
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleConfirm} 
              disabled={!isEnabled}
              className="flex-1 h-11 shadow-sm transition-all"
            >
              {busy ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Deleting...</>
              ) : (
                <><Trash2 className="h-4 w-4 mr-2" /> {confirmText}</>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}