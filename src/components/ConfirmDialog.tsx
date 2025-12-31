import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { X, AlertTriangle } from "lucide-react";

type Props = {
  open: boolean;
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "destructive" | "default";
  onCancel: () => void;
  onConfirm: () => void;
};

export default function ConfirmDialog({
  open,
  title = "Are you sure?",
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  onCancel,
  onConfirm,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);

  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  // Handle the confirmation with a slight delay to allow the animation to play
  const handleConfirmWithAnimation = () => {
    setIsAnimatingOut(true);
    setTimeout(() => {
      onConfirm();
      setIsAnimatingOut(false);
    }, 300); // This duration should match the CSS transition duration
  };

  if (!open && !isAnimatingOut) return null;

  const confirmBtn =
    variant === "destructive" ? (
      <Button variant="destructive" onClick={handleConfirmWithAnimation}>
        {confirmLabel}
      </Button>
    ) : (
      <Button onClick={handleConfirmWithAnimation}>{confirmLabel}</Button>
    );

  return (
    <div
      className={`fixed inset-0 z-50 transition-opacity duration-300 ${isAnimatingOut ? "opacity-0" : "opacity-100"}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />

      {/* Dialog */}
      <div
        className={`absolute inset-0 flex items-center justify-center p-4 transition-all duration-300 ease-in-out ${isAnimatingOut ? "scale-95 -translate-y-4" : ""}`}
      >
        <div className={`w-full max-w-md rounded-xl glass-card bg-card p-5 shadow-lg ${isAnimatingOut ? "opacity-0" : "opacity-100"}`}>
          <div className="flex items-start gap-3">
            <div className="mt-0.5">
              <AlertTriangle className="h-5 w-5 text-yellow-600" aria-hidden />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h2 id="confirm-title" className="text-base font-semibold">
                  {title}
                </h2>
                <button aria-label="Close" className="p-1 rounded-md hover:bg-muted" onClick={onCancel}>
                  <X className="h-4 w-4" />
                </button>
              </div>
              {description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}

              <div className="mt-4 flex items-center justify-end gap-2">
                <Button ref={cancelRef} variant="outline" onClick={onCancel}>
                  {cancelLabel}
                </Button>
                {confirmBtn}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ESC to close */}
      <div
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            onCancel();
          }
        }}
      />
    </div>
  );
}