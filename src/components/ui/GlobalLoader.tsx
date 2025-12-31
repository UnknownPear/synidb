import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import SynergyLoader from "@/components/ui/SynergyLoader";

type Props = {
  loading: boolean;
  label?: string;
  delay?: number;
  /** 0 to 100 */
  progress?: number | null;
};

export default function GlobalLoader({ loading, label, delay = 100, progress }: Props) {
  const [mounted, setMounted] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    if (loading) {
      timeoutId = setTimeout(() => setShouldRender(true), delay);
    } else {
      setShouldRender(false);
    }
    return () => clearTimeout(timeoutId);
  }, [loading, delay]);

  if (!mounted || !shouldRender) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center animate-in fade-in duration-300">
      {/* Blurred Backdrop */}
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm dark:bg-black/80" />

      {/* Card */}
      <div className="relative z-10 p-8 rounded-3xl bg-card border border-border/50 shadow-2xl flex flex-col items-center gap-6 min-w-[320px]">
        <SynergyLoader scale={0.9} loop={true} /> 
        
        {label && (
          <p className="text-base font-medium text-muted-foreground animate-pulse tracking-wide text-center">
            {label}
          </p>
        )}

        {/* Progress Bar */}
        {typeof progress === "number" && (
          <div className="w-full h-1.5 bg-muted/50 rounded-full overflow-hidden">
             <div 
               className="h-full bg-primary transition-all duration-200 ease-linear" 
               style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} 
             />
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}