import React from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import type { InventoryRow } from "@/lib/dataClient";

export type Grade = "A" | "B" | "C" | "D";

type DrawerRow = InventoryRow & { grade: Grade };

type Props = {
  open: boolean;
  row: DrawerRow | null;
  onClose: () => void;
  onSave: (row: DrawerRow) => void;
  onDelete?: (synergyId: string) => void;
};

export function PosterModeDrawer({
  open,
  row,
  onClose,
  onSave,
  onDelete,
}: Props) {
  if (!row) return null;

  const handleSave = () => {
    onSave(row);
    onClose();
  };

  return (
    <Drawer open={open} onOpenChange={onClose}>
      <DrawerContent className="p-6 space-y-4 max-w-xl mx-auto">
        <DrawerHeader>
          <DrawerTitle>Poster Mode</DrawerTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </DrawerHeader>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Synergy ID</Label>
            <Input className="font-mono" value={row.synergyId} readOnly />
          </div>
          <div>
            <Label>Grade</Label>
            <GradeBadge grade={row.grade as Grade} />
          </div>

          <div className="col-span-2">
            <Label>Product Name</Label>
            <Input value={row.productName} readOnly />
          </div>

          <div className="col-span-2">
            <Label>Tester Comment</Label>
            <Textarea value={row.testerComment ?? ""} readOnly />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          {onDelete && (
            <Button variant="destructive" onClick={() => onDelete(row.synergyId)}>
              Delete
            </Button>
          )}
          <Button onClick={handleSave}>Save</Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function GradeBadge({ grade }: { grade: Grade }) {
  const colorMap: Record<Grade, string> = {
    A: "bg-emerald-100 text-emerald-700 border-emerald-300",
    B: "bg-blue-100 text-blue-700 border-blue-300",
    C: "bg-amber-100 text-amber-700 border-amber-300",
    D: "bg-rose-100 text-rose-700 border-rose-300",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${colorMap[grade]}`}
    >
      Grade {grade}
    </span>
  );
}
