import * as React from "react";
import { MessageSquare, X, Loader2, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function BulkStatusModal({
  open,
  onClose,
  onSave,
  count
}: {
  open: boolean;
  onClose: () => void;
  onSave: (status: string | null, comment: string | null, price: string | null, url: string | null) => Promise<void>;
  count: number;
}) {
  const [status, setStatus] = React.useState<string>("NO_CHANGE");
  const [comment, setComment] = React.useState<string>("");
  const [price, setPrice] = React.useState<string>("");
  const [ebayLink, setEbayLink] = React.useState<string>("");
  const [loading, setLoading] = React.useState(false);

  const showExtraFields = status === "POSTED" || status === "SOLD";

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md bg-card border rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95">
        <div className="px-6 py-4 border-b bg-muted/30 flex justify-between items-center">
          <h3 className="font-semibold text-lg">Update {count} Selected Item{count !== 1 ? 's' : ''}</h3>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        
        <div className="p-6 space-y-4">
          <div className="p-3 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 rounded-lg text-sm flex gap-2 items-start">
            <MessageSquare className="h-4 w-4 mt-0.5 shrink-0" />
            <span>These changes will apply to the inventory records linked to these lines.</span>
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <select 
              className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="NO_CHANGE">-- Do not change --</option>
              <option value="INTAKE">INTAKE (Reset)</option>
              <option value="TESTED">TESTED</option>
              <option value="POSTED">POSTED</option>
              <option value="SOLD">SOLD</option>
              <option value="SCRAP">SCRAP</option>
            </select>
          </div>

          {showExtraFields && (
            <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-2">
              <div className="space-y-2">
                <Label>eBay Price ($)</Label>
                <Input 
                  type="number" 
                  step="0.01" 
                  placeholder="0.00"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>eBay Link / Item ID</Label>
                <Input 
                  placeholder="URL or Item ID"
                  value={ebayLink}
                  onChange={(e) => setEbayLink(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Tester Comment</Label>
            <Textarea 
              placeholder="Enter comment (e.g., 'Pre-verified batch'). Leave empty to keep existing."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="resize-none h-24"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t bg-muted/30 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button 
            onClick={async () => {
              setLoading(true);
              await onSave(
                status === "NO_CHANGE" ? null : status, 
                comment.trim() || null,
                showExtraFields && price.trim() ? price : null,
                showExtraFields && ebayLink.trim() ? ebayLink : null
              );
              setLoading(false);
              onClose();
            }}
            disabled={loading}
            variant={status === "SCRAP" ? "destructive" : "default"}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : (status === "SCRAP" ? <Trash2 className="h-4 w-4 mr-2" /> : <Check className="h-4 w-4 mr-2" />)}
            {status === "SCRAP" ? "Scrap Items" : "Apply Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}