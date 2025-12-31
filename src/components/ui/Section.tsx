// src/components/ui/Section.tsx
import React from "react";
import { cls } from "@/lib/api";

export function Section({
  title,
  icon,
  children,
  className,
}: React.PropsWithChildren<{ title: string; icon?: React.ReactNode; className?: string }>) {
  return (
    <div className={cls("rounded-xl border bg-background p-6 space-y-4", className)}>
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="font-semibold">{title}</h2>
      </div>
      {children}
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs opacity-70">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
