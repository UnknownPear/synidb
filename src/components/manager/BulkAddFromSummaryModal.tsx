// src/components/manager/BulkAddFromSummaryModal.tsx
import React, { useMemo, useState } from "react";
import { X, Loader2, ListPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { API_BASE } from "@/lib/api";

type LineItem = {
  product_name_raw: string;
  qty: number;
  unit_cost?: number | null;
};

type Props = {
  poId: string;
  apiBase?: string;
  onClose: () => void;
  onSuccess: () => void;
};

export default function BulkAddFromSummaryModal({ 
  poId, 
  apiBase = API_BASE, 
  onClose, 
  onSuccess 
}: Props) {
  const [count, setCount] = useState("");
  const [totalCost, setTotalCost] = useState("");
  const [baseName, setBaseName] = useState("");
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const parsedCount = Math.max(0, parseInt(count, 10) || 0);
  const parsedTotalCost = Math.max(0, parseFloat(String(totalCost).replace(/[^0-9.]/g, "")) || 0);

  const previewLines = useMemo<LineItem[]>(() => {
    if (!isPreviewing || parsedCount === 0) return [];
    
    const unitCost = parsedTotalCost > 0 && parsedCount > 0 ? parsedTotalCost / parsedCount : 0;
    const effectiveBaseName = baseName.trim() || "Product";

    return Array.from({ length: parsedCount }, (_, i) => ({
      product_name_raw: `${effectiveBaseName} #${i + 1}`,
      qty: 1,
      unit_cost: unitCost,
    }));
  }, [isPreviewing, parsedCount, parsedTotalCost, baseName]);

  const canPreview = parsedCount > 0 && parsedCount <= 500; // Safety limit

  const handleSave = async () => {
    if (!canPreview) return;
    
    setIsSaving(true);
    try {
      // This assumes a new backend endpoint exists to handle bulk creation
      const body = {
        count: parsedCount,
        total_cost: parsedTotalCost,
        base_name: baseName.trim() || "Product",
      };

      const r = await fetch(`${apiBase}/pos/${encodeURIComponent(poId)}/lines/bulk-create`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });

      if (!r.ok) {
        const text = await r.text();
        throw new Error(text || `HTTP ${r.status}`);
      }

      onSuccess();
      onClose();
    } catch (e: any) {
      alert(`Failed to create lines: ${e.message}`);
    } finally {
      setIsSaving(false);
    }
  };
  
  const formatMoney = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[640px] rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Bulk Add Lines from Summary</h2>
          <button className="p-1 text-gray-500 hover:text-gray-800" onClick={onClose} disabled={isSaving}>
            <X size={18} />
          </button>
        </div>

        {!isPreviewing ? (
          // Step 1: Input Form
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Generate placeholder lines by providing summary totals. This is useful for simple lots where costs are uniform.
            </p>
            <div>
              <label className="mb-1 block text-sm text-gray-600">Number of Products</label>
              <Input
                type="number"
                placeholder="e.g., 50"
                value={count}
                onChange={(e) => setCount(e.target.value)}
              />
              {parsedCount > 500 && <p className="text-xs text-red-500 mt-1">Maximum of 500 lines at a time.</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-600">Total Lot Cost ($)</label>
              <Input
                inputMode="decimal"
                placeholder="e.g., 1250.00"
                value={totalCost}
                onChange={(e) => setTotalCost(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-600">Base Product Name (Optional)</label>
              <Input
                placeholder="e.g., 'Mixed Lot Item'. Defaults to 'Product'."
                value={baseName}
                onChange={(e) => setBaseName(e.target.value)}
              />
            </div>
          </div>
        ) : (
          // Step 2: Preview
          <div>
            <p className="text-sm text-gray-600 mb-2">
              A total of <strong>{parsedCount}</strong> line items will be created with a unit cost of{" "}
              <strong>{formatMoney(previewLines[0]?.unit_cost ?? 0)}</strong> each.
            </p>
            <div className="border rounded-lg max-h-64 overflow-auto text-sm">
              <table className="w-full">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    <th className="p-2 text-left font-medium">Product Name</th>
                    <th className="p-2 text-center font-medium w-20">Qty</th>
                    <th className="p-2 text-right font-medium w-32">Unit Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {previewLines.map((line, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">{line.product_name_raw}</td>
                      <td className="p-2 text-center">{line.qty}</td>
                      <td className="p-2 text-right font-mono">{formatMoney(line.unit_cost ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          {!isPreviewing ? (
            <Button onClick={() => setIsPreviewing(true)} disabled={!canPreview}>
              Preview Lines
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setIsPreviewing(false)} disabled={isSaving}>
                Back to Edit
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 animate-spin" size={16} /> : <ListPlus className="mr-2" size={16} />}
                Create {parsedCount} Lines
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}