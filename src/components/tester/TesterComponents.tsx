import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { SessionSettings } from "@/lib/testerUtils";

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted/50 ${className}`} />;
}

export function TinySpinner({ size = 16 }: { size?: number }) {
  return (
    <span aria-hidden className="inline-block animate-spin rounded-full border-2 border-black/20 border-t-transparent" style={{ width: size, height: size, animationDuration: "800ms" }} />
  );
}

export function DbActivityBar({ connecting, syncing, saving }: { connecting: boolean; syncing: boolean; saving: boolean; disconnected?: boolean }) {
  const show = connecting || syncing || saving;
  if (!show) return null;
  const label = connecting ? "Connecting..." : saving ? "Saving..." : "Syncing...";
  return (
    <div className="absolute top-0 left-0 right-0 z-10 pointer-events-none">
      <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-primary/30 to-transparent animate-pulse" />
      <div className="mx-auto max-w-full px-4"><div className="mt-2 inline-flex items-center gap-2 rounded-full border bg-background/80 backdrop-blur-sm shadow-sm px-3 py-1 text-[11px] pointer-events-auto"><TinySpinner size={12} /><span className="opacity-80">{label}</span></div></div>
    </div>
  );
}

export function DevLogPanel({ dbConnected, dbLogs }: { dbConnected: boolean | null; dbLogs: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const statusConfig = useMemo(() => {
    if (dbConnected === false) return { label: "NOT CONNECTED", baseClasses: "border-destructive bg-destructive/10 text-destructive" };
    if (dbConnected === true) return { label: "CONNECTED", baseClasses: "border-green-500 bg-green-500/10 text-green-500" };
    return { label: "CHECKING…", baseClasses: "border-amber-500 bg-amber-500/10 text-amber-500" };
  }, [dbConnected]);

  return (
    <div className={`rounded-xl border p-4 text-xs shadow-lg ${statusConfig.baseClasses}`}>
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between font-semibold">
        <span>Database: {statusConfig.label}</span>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {expanded && (
        <ul className="list-disc pl-4 mt-2 space-y-0.5 max-h-48 overflow-y-auto pt-2 border-t border-current/50">
          {dbLogs.map((l, i) => <li key={i} className="opacity-80 text-foreground/80">{l}</li>)}
        </ul>
      )}
    </div>
  );
}

export function InventoryLoadingSkeleton() {
  return (
    <div className="p-6 divide-y divide-border/50">
      <h2 className="font-semibold text-lg mb-4">Loading Inventory...</h2>
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="py-6"><div className="flex items-start gap-4"><Skeleton className="h-6 w-6 rounded-md" /><div className="min-w-0 flex-1 space-y-2"><Skeleton className="h-4 w-2/3" /><div className="flex gap-2"><Skeleton className="h-3 w-24" /><Skeleton className="h-3 w-20" /><Skeleton className="h-3 w-16" /></div></div><div className="space-y-2"><Skeleton className="h-5 w-20" /><Skeleton className="h-3 w-16" /></div></div></div>
      ))}
    </div>
  );
}

export function SessionSettingsModal({ open, onClose, settings, onSave }: { open: boolean; onClose: () => void; settings: SessionSettings; onSave: (s: SessionSettings) => void; currentPrefix?: string; }) {
  const [draft, setDraft] = useState(settings);
  React.useEffect(() => setDraft(settings), [settings]);
  const update = (key: keyof SessionSettings, value: any) => setDraft((d) => ({ ...d, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader><DialogTitle>Session Settings</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="flex items-center space-x-2"><Checkbox id="soundOnSave" checked={draft.soundOnSave} onCheckedChange={(c) => update("soundOnSave", !!c)} /><Label htmlFor="soundOnSave">Play sound on save</Label></div>
          <div className="space-y-4 pt-2 border-t"><h3 className="font-semibold text-sm">Display</h3>
            <div className="flex items-center space-x-2"><Checkbox id="denseMode" checked={draft.denseMode} onCheckedChange={(c) => update("denseMode", !!c)} /><Label htmlFor="denseMode">Dense row spacing</Label></div>
            <div className="flex items-center space-x-2"><Checkbox id="showSpecsInline" checked={draft.showSpecsInline} onCheckedChange={(c) => update("showSpecsInline", !!c)} /><Label htmlFor="showSpecsInline">Show specs in list items</Label></div>
            <div className="flex items-center space-x-2"><Checkbox id="wideMode" checked={draft.wideMode} onCheckedChange={(c) => update("wideMode", !!c)} /><Label htmlFor="wideMode">Wide mode</Label></div>
          </div>
          <div className="space-y-4 pt-2 border-t"><h3 className="font-semibold text-sm">Performance</h3>
            <div className="flex flex-col space-y-2"><Label htmlFor="itemsPerPage">Items per page</Label><Select value={String(draft.itemsPerPage)} onValueChange={(v) => update("itemsPerPage", Number(v))}><SelectTrigger id="itemsPerPage"><SelectValue /></SelectTrigger><SelectContent>{[20, 50, 100, 200].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent></Select></div>
            <div className="flex flex-col space-y-2"><Label htmlFor="autoRefresh">Auto-refresh (sec)</Label><Input id="autoRefresh" type="number" min={0} max={300} value={draft.autoRefreshInterval} onChange={(e) => update("autoRefreshInterval", Number(e.target.value))} /></div>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => onSave(draft)}>Save Changes</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}