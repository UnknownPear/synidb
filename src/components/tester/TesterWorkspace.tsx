import React, { useMemo, useState, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Grade } from "@/lib/grades";
import { ListRow, mapApiRow, withGrade, fetchSimilarRowsDirect } from "@/lib/testerTypes";
import { InventoryRow } from "@/lib/dataClient";

export type WorkspaceFlags = { grade: boolean; testedBy: boolean; testedDate: boolean; testerComment: boolean; specs: boolean; price: boolean; ebayPrice: boolean; categoryId: boolean; };
export type Workspace = {
  id: string; title: string; productName: string; criteria: { productName: string; categoryId?: string | null };
  seedRow: InventoryRow & { grade?: Grade }; patch: Partial<InventoryRow & { grade?: Grade }>;
  flags: WorkspaceFlags; selection: string[];
  progress?: { total: number; ok: number; fail: number; running: boolean; lastError?: string };
};

export const WorkspaceDialogStable = React.memo(({ open, onClose, ws, rows, updateWorkspace, applyWorkspace }: any) => {
  if (!ws) return null;
  const firstOpenRef = useRef(true);
  const [remoteCandidates, setRemoteCandidates] = useState<ListRow[]>([]);
  const [loadingRemote, setLoadingRemote] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: "productName" | "synergyId"; direction: "asc" | "desc" }>({ key: "productName", direction: "asc" });

  useEffect(() => {
    if (open && firstOpenRef.current) { firstOpenRef.current = false; updateWorkspace(ws.id, { selection: [], progress: { total: 0, ok: 0, fail: 0, running: false } }); }
    if (!open) firstOpenRef.current = true;
  }, [open, ws.id, updateWorkspace]);

  useEffect(() => {
    if (!open || !ws?.productName) return;
    let alive = true; setLoadingRemote(true); setRemoteError(null);
    fetchSimilarRowsDirect({ productName: ws.productName, excludeSynergyId: ws.seedRow?.synergyId, limit: 500 })
      .then((res) => alive && setRemoteCandidates((res?.items ?? []).map(mapApiRow).map(withGrade)))
      .catch((e: any) => alive && setRemoteError(e?.message || "Search failed"))
      .finally(() => alive && setLoadingRemote(false));
    return () => { alive = false; };
  }, [open, ws?.productName]);

  const candidates = useMemo(() => {
    const seen = new Set<string>();
    const merged: ListRow[] = [];
    [...remoteCandidates, ...rows.filter((r: any) => (r.productName || "").trim().toLowerCase() === (ws.productName || "").trim().toLowerCase())].forEach(r => {
      if (!seen.has(r.synergyId)) { merged.push(r); seen.add(r.synergyId); }
    });
    return merged.sort((a, b) => {
      const vA = (a[sortConfig.key] ?? "").toString().toLowerCase();
      const vB = (b[sortConfig.key] ?? "").toString().toLowerCase();
      return (vA < vB ? -1 : 1) * (sortConfig.direction === "asc" ? 1 : -1);
    });
  }, [remoteCandidates, rows, ws.productName, sortConfig]);

  const setFlag = (k: keyof WorkspaceFlags, v: boolean) => updateWorkspace(ws.id, { flags: { ...ws.flags, [k]: v } });
  const setPatch = (p: any) => updateWorkspace(ws.id, { patch: { ...ws.patch, ...p, specs: { ...(ws.patch.specs || {}), ...(p.specs || {}) } } });
  const toggleAll = (c: boolean) => updateWorkspace(ws.id, { selection: c ? candidates.map(x => x.synergyId) : [] });
  const toggleOne = (id: string, c: boolean) => updateWorkspace(ws.id, { selection: c ? [...ws.selection, id] : ws.selection.filter(x => x !== id) });

  const prog = ws.progress || { total: ws.selection.length, ok: 0, fail: 0, running: false };
  const pctDone = prog.running ? Math.round(((prog.ok + prog.fail) / Math.max(1, prog.total)) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-full sm:max-w-[950px] p-6 sm:p-8 bg-background rounded-xl shadow-2xl">
        <DialogHeader><DialogTitle>Workspace — {ws.title}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-6">
          <div className="space-y-6">
            <div className="rounded-lg border bg-card p-4 space-y-4 shadow-sm">
              <h3 className="font-semibold text-base">Fields to Apply</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[{ k: "grade", l: "Grade" }, { k: "testedBy", l: "Tester" }, { k: "testerComment", l: "Comment" }, { k: "specs", l: "Specs" }, { k: "price", l: "Price" }, { k: "ebayPrice", l: "eBay $" }].map(x => (
                  <label key={x.k} className="flex items-center gap-2 text-sm"><Checkbox checked={ws.flags[x.k]} onCheckedChange={(c) => setFlag(x.k as any, !!c)} />{x.l}</label>
                ))}
              </div>
            </div>
            <div className="rounded-lg border bg-card p-4 space-y-4 shadow-sm">
              <h3 className="font-semibold text-base">Values</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><Label>Grade</Label><Select value={(ws.patch as any)?.grade || ""} onValueChange={(v) => setPatch({ grade: v })}><SelectTrigger><SelectValue placeholder="Grade" /></SelectTrigger><SelectContent>{["A", "B", "C", "D", "P"].map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent></Select></div>
                <div><Label>Tester</Label><Input value={(ws.patch as any)?.testedBy || ""} readOnly className="bg-muted cursor-not-allowed" /></div>
                <div className="sm:col-span-2"><Label>Comment</Label><textarea value={(ws.patch as any)?.testerComment || ""} onChange={(e) => setPatch({ testerComment: e.target.value })} className="w-full h-24 rounded-md border bg-background px-3 py-2 text-sm" /></div>
                <div className="sm:col-span-2 grid grid-cols-3 gap-4">
                  {["processor", "ram", "storage"].map(k => <div key={k}><Label className="capitalize">{k}</Label><Input value={(ws.patch.specs as any)?.[k] || ""} onChange={(e) => setPatch({ specs: { [k]: e.target.value } })} /></div>)}
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-lg border bg-card p-4 space-y-4 shadow-sm flex flex-col h-[500px]">
            <div className="flex items-center justify-between"><h3 className="font-semibold text-base">Matching Items</h3><span className="text-sm text-muted-foreground">{loadingRemote ? "Searching..." : `${candidates.length} found`}</span></div>
            <div className="flex items-center gap-3"><Checkbox checked={ws.selection.length > 0 && ws.selection.length === candidates.length} onCheckedChange={(c) => toggleAll(!!c)} /><span className="text-sm font-medium">Select All</span></div>
            <div className="flex-1 overflow-auto border rounded-md bg-background">
              {candidates.length === 0 ? <div className="p-4 text-sm text-center text-muted-foreground">No matches.</div> : <ul className="divide-y">{candidates.map((c: any) => <li key={c.synergyId} className="flex gap-3 p-4 hover:bg-muted"><Checkbox checked={ws.selection.includes(c.synergyId)} onCheckedChange={(x) => toggleOne(c.synergyId, !!x)} /><div className="flex-1 min-w-0"><div className="text-sm font-medium">{c.productName}</div><div className="text-xs text-muted-foreground font-mono">{c.synergyId}</div></div></li>)}</ul>}
            </div>
            {prog.running && <div className="space-y-2"><div className="h-2 w-full bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${pctDone}%` }} /></div><div className="text-xs text-muted-foreground">{prog.ok} ok / {prog.fail} failed</div></div>}
            <div className="flex justify-between pt-4 border-t"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => applyWorkspace(ws)} disabled={prog.running || ws.selection.length === 0}>Apply ({ws.selection.length})</Button></div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
});