import { useEffect, useState } from "react";
import { Section } from "@/components/ui/Section";
import { Tags, Settings, Loader2 } from "lucide-react";
import { apiGet } from "@/lib/api";
import { Button } from "../ui/button";

// Data type to match the new API endpoint
type CategorySummary = {
  id: string;
  label: string;
  prefix: string | null;
  total_lines: number;
  total_units: number;
  total_cost: number;
};

// Formatting helpers
function formatCompact(n: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", compactDisplay: "short" }).format(n);
}
function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export default function CategoryRollup({ onManageClick }: { onManageClick: () => void }) {
  const [summary, setSummary] = useState<CategorySummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiGet<CategorySummary[]>("/categories/summary")
      .then(setSummary)
      .catch(() => setSummary([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    // We pass empty strings for title/icon to render the Section wrapper without its default header.
    <Section title="" icon={<></>}>
      {/* --- START OF CHANGE: Custom Header --- */}
      {/* We create our own header here to place the button on the same line. */}
      <div className="flex items-center justify-between -mt-1 mb-3">
        {/* Left side: Icon and Title */}
        <div className="flex items-center gap-2">
          <Tags className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-base">Category Rollup</h3>
        </div>

        {/* Right side: Actions Button */}
        <div>
          <Button variant="outline" size="sm" onClick={onManageClick}>
            <Settings className="h-4 w-4 mr-2" />
            Manage
          </Button>
        </div>
      </div>
      {/* --- END OF CHANGE --- */}

      <div className="border rounded-md max-h-96 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center p-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading summary...
          </div>
        )}

        {!loading && summary.map((cat) => (
          <div key={cat.id} className="p-3 border-b last:border-b-0">
            <div className="flex justify-between items-center font-semibold">
              <span className="truncate" title={cat.label}>{cat.label}</span>
              <span className="text-primary font-bold">{formatCurrency(cat.total_cost)}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1 grid grid-cols-3 gap-2">
              <span>Prefix: <span className="font-medium text-foreground">{cat.prefix || "N/A"}</span></span>
              <span>Units: <span className="font-medium text-foreground">{formatCompact(cat.total_units)}</span></span>
              <span>Lines: <span className="font-medium text-foreground">{formatCompact(cat.total_lines)}</span></span>
            </div>
          </div>
        ))}
        {!loading && summary.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No categories found or in use.
          </div>
        )}
      </div>
    </Section>
  );
}