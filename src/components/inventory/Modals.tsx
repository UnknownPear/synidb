import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Boxes, DollarSign } from "lucide-react";

export function AdjustQtyModal(props: {
  openRow: { synergy_id: string } | null;
  value: string;
  setValue: (v: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const { openRow, value, setValue, onCancel, onSave } = props;
  if (!openRow) return null;
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white text-black rounded-lg p-4 w-[360px] shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="font-semibold mb-2 flex items-center gap-2">
          <Boxes className="h-4 w-4" />
          Adjust quantity — <span className="font-mono">{openRow.synergy_id}</span>
        </div>
        <Input value={value} onChange={(e) => setValue(e.target.value)} className="mb-3" />
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={onSave}>Save</Button>
        </div>
      </div>
    </div>
  );
}

export function EditPriceModal(props: {
  openRow: { synergy_id: string } | null;
  value: string;
  setValue: (v: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const { openRow, value, setValue, onCancel, onSave } = props;
  if (!openRow) return null;
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white text-black rounded-lg p-4 w-[360px] shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="font-semibold mb-2 flex items-center gap-2">
          <DollarSign className="h-4 w-4" />
          Edit price — <span className="font-mono">{openRow.synergy_id}</span>
        </div>
        <Input
          placeholder="New price (e.g. 29.99)"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="mb-3"
        />
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={onSave}>Save</Button>
        </div>
        <div className="text-xs text-muted-foreground mt-2">
          Updates inventory via <code>/labels/ensure</code> (counts unchanged).
        </div>
      </div>
    </div>
  );
}
