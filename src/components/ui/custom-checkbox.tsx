import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  size?: number; // px
};

export function CustomCheckbox({
  checked = false,
  onCheckedChange,
  disabled,
  className,
  size = 18,
}: Props) {
  const toggle = () => !disabled && onCheckedChange?.(!checked);

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          toggle();
        }
      }}
      className={cn(
        "inline-flex items-center justify-center shrink-0 rounded-full",
        "border border-primary/60 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
        checked ? "bg-primary text-primary-foreground border-primary" : "bg-background",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
      style={{ width: size, height: size }}
    >
      {/* No native accent color; no square overlay */}
      {checked && <Check className="w-[70%] h-[70%] pointer-events-none" strokeWidth={3} />}
    </button>
  );
}
