import * as React from "react";

export default function InventoryHeader({
  title,
  subtitle,
  rightContent,
}: {
  title: string;
  subtitle?: string;
  rightContent?: React.ReactNode;
}) {
  return (
    <div className="sticky top-0 z-20 border-b border-white/10 bg-gray-900/60 backdrop-blur supports-[backdrop-filter]:bg-opacity-60 shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
      <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src="/images/poster.png"
            alt="Synergy"
            className="h-10 w-10 rounded-md border border-white/10"
          />
          <div className="leading-tight">
            <div className="text-lg font-bold tracking-tight">{title}</div>
            {subtitle && <div className="text-xs text-white/70">{subtitle}</div>}
          </div>
        </div>
        <div className="flex items-center gap-3">{rightContent}</div>
      </div>
    </div>
  );
}
