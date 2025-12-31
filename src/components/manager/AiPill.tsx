// src/components/manager/AiPill.tsx
import { Brain } from "lucide-react";
import { cls } from "@/lib/api";
import type { AiHealth } from "@/types/manager";

export default function AiPill({ ai }: { ai: AiHealth | null }) {
  const on = !!ai?.configured && !!ai?.has_key && !!ai?.genai_imported;
  return (
    <span
      className={cls(
        "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs",
        on ? "border-green-600 text-green-700 dark:text-green-400" : "border-amber-600 text-amber-700 dark:text-amber-400"
      )}
      title={on ? "Gemini is configured" : "AI is disabled or missing key"}
    >
      <Brain className="h-3.5 w-3.5" />
      {on ? "AI Ready" : "AI Off"}
    </span>
  );
}
