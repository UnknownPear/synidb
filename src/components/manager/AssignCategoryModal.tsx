import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tags, X, Check, Loader2 } from "lucide-react";
import CategorySelector from "./CategorySelector";
import type { Category } from "@/types/manager";

type Props = {
  open: boolean;
  onClose: () => void;
  onAssign: (categoryId: string) => Promise<void>;
  categories: Category[];
  selectedCount: number;
};

export default function AssignCategoryModal({
  open,
  onClose,
  onAssign,
  categories,
  selectedCount,
}: Props) {
  const [targetCatId, setTargetCatId] = useState("");
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (open) {
      setTargetCatId(""); // Reset on open
      setBusy(false);
    }
  }, [open]);

  if (!open || !mounted) return null;

  const handleConfirm = async () => {
    if (!targetCatId) return;
    setBusy(true);
    try {
      await onAssign(targetCatId);
      onClose();
    } catch (error) {
      console.error(error);
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 animate-in fade-in duration-200">
      {/* Card */}
      <div className="w-full max-w-md bg-card rounded-2xl shadow-2xl border overflow-hidden flex flex-col relative animate-in zoom-in-95 duration-200">
        
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="absolute top-4 right-4 z-20 hover:bg-muted rounded-full"
        >
          <X className="h-5 w-5 text-muted-foreground" />
        </Button>

        <div className="p-8 flex flex-col items-center text-center">
          {/* Header Icon */}
          <Avatar className="h-20 w-20 border-4 border-muted/20 shadow-xl mb-6">
            <AvatarFallback className="bg-primary/5 text-primary">
              <Tags className="h-9 w-9" />
            </AvatarFallback>
          </Avatar>

          <h2 className="text-2xl font-bold mb-1">Bulk Assignment</h2>
          <p className="text-muted-foreground text-sm mb-8">
            Assigning a category to <span className="font-bold text-foreground">{selectedCount}</span> selected lines.
          </p>

          {/* Selector */}
          <div className="w-full text-left space-y-2 mb-6">
            <label className="text-xs font-semibold uppercase text-muted-foreground tracking-wider ml-1">
              Category
            </label>
            <div className="h-12">
              <CategorySelector
                value={targetCatId}
                categories={categories}
                onChange={setTargetCatId}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 w-full">
            <Button
              variant="ghost"
              onClick={onClose}
              className="flex-1"
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={!targetCatId || busy}
              className="flex-1 h-11 shadow-lg shadow-primary/20"
            >
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              Assign
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}