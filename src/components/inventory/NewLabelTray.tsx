import * as React from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Printer, Settings2 } from "lucide-react";
import { TinySpinner } from "./TopBar";
import { openPrintWindow } from "@/helpers/printLabel";

export default function NewLabelTray(props: { onPrinted: () => void }) {
  const { onPrinted } = props;
  const [nlProduct, setNlProduct] = React.useState("");
  const [nlMsrp, setNlMsrp] = React.useState("");
  const [nlPrice, setNlPrice] = React.useState("");
  const [nlPrefix, setNlPrefix] = React.useState("");
  const [nlQty, setNlQty] = React.useState("1");
  const [nlBusy, setNlBusy] = React.useState(false);

  const submitNewLabel = async () => {
    if (!nlProduct.trim()) return alert("Product name required.");
    const qty = Math.max(1, Number(nlQty) || 1);
    try {
      setNlBusy(true);
      for (let i = 0; i < qty; i++) {
        await openPrintWindow({
          productName: nlProduct.trim(),
          unitPrice: nlMsrp || "",
          ourPrice: nlPrice || "",
          date: new Date().toLocaleDateString("en-US"),
          prefix: nlPrefix || undefined,
          qty: 1,
        });
      }
      setNlProduct(""); setNlMsrp(""); setNlPrice(""); setNlPrefix(""); setNlQty("1");
      onPrinted();
    } catch (e: any) {
      alert(e?.message || e);
    } finally {
      setNlBusy(false);
    }
  };

  return (
    <Card className="p-3 space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
        <Input placeholder="Product name" value={nlProduct} onChange={(e) => setNlProduct(e.target.value)} className="md:col-span-2" />
        <Input placeholder="MSRP (e.g. 39.99)" value={nlMsrp} onChange={(e) => setNlMsrp(e.target.value)} />
        <Input placeholder="Our price (e.g. 29.99)" value={nlPrice} onChange={(e) => setNlPrice(e.target.value)} />
        <Input placeholder="Prefix (optional)" value={nlPrefix} onChange={(e) => setNlPrefix(e.target.value)} />
        <Input placeholder="Copies" value={nlQty} onChange={(e) => setNlQty(e.target.value)} />
      </div>
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Settings2 className="h-3.5 w-3.5" />
          Ensures SID, prints, and syncs counts.
        </div>
        <Button onClick={submitNewLabel} disabled={nlBusy} className="gap-1.5">
          {nlBusy ? (
            <>
              <TinySpinner size={14} /> Printing…
            </>
          ) : (
            <>
              <Printer className="h-4 w-4" />
              Create & Print
            </>
          )}
        </Button>
      </div>
    </Card>
  );
}
