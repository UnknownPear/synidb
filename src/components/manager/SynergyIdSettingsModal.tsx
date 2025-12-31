// src/components/manager/SynergyIdSettingsModal.tsx

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { 
  X, 
  List, 
  History, 
  Hash, 
  RotateCcw, 
  CheckCircle2, 
  Clock, 
  User, 
  FileText, 
  AlertCircle 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

// --- API Helpers ---
const RAW_API = (import.meta as any).env?.VITE_API_URL as string | undefined;
const API_BASE = (() => {
  if (RAW_API && /^https?:\/\//i.test(RAW_API)) return RAW_API.replace(/\/+$/, "");
  const p = RAW_API && RAW_API.trim() ? RAW_API : "/backend";
  return (p.startsWith("/") ? p : `/${p}`).replace(/\/+$/, "");
})();
const join = (b: string, p: string) => `${b}${p.startsWith("/") ? p : `/${p}`}`;

async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(join(API_BASE, path), { headers: { "Content-Type": "application/json" } });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function apiPost<T>(path: string, body: any): Promise<T> {
  const r = await fetch(join(API_BASE, path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// --- Types ---
type SynergyIdOverviewRow = {
  prefix: string;
  next_seq: number;
  next_code: string | null;
  minted_count: number;
  max_minted_seq: number | null;
  last_minted_at: string | null;
};

type SynergyIdEventRow = {
  id: string;
  created_at: string;
  actor_name: string | null;
  po_id: string | null;
  po_line_id: string | null;
  inventory_id: string | null;
  prefix: string;
  code: string;
  seq: number;
  event_type: string;
  meta: Record<string, any>;
  po_number?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  currentUserName?: string | null;
};

export default function SynergyIdSettingsModal({
  open,
  onClose,
  currentUserName,
}: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [tab, setTab] = useState<"overview" | "audit">("overview");
  const [overview, setOverview] = useState<SynergyIdOverviewRow[]>([]);
  const [events, setEvents] = useState<SynergyIdEventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedPrefix, setSelectedPrefix] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [ovRes, evRes] = await Promise.all([
        apiGet<{ items: SynergyIdOverviewRow[] }>("/synergy-id/overview"),
        apiGet<{ items: SynergyIdEventRow[] }>("/synergy-id/events?limit=50")
      ]);
      
      const items = ovRes.items || [];
      setOverview(items);
      if (!selectedPrefix && items.length) {
        setSelectedPrefix(items[0].prefix);
      }
      setEvents(evRes.items || []);
    } catch (err: any) {
      setError("Failed to load Synergy ID data.");
    } finally {
      setLoading(false);
    }
  };

  const selected = overview.find(o => o.prefix === selectedPrefix) || null;

  const handleSetNext = async (prefix: string, nextSeq: number) => {
    if (!Number.isFinite(nextSeq) || nextSeq < 1) return;
    setSaving(true);
    try {
      await apiPost(`/prefix/${encodeURIComponent(prefix)}/set`, {
        next: nextSeq,
        actor: currentUserName || "Manager",
        reason: "Updated from Synergy ID Settings",
      });
      // Refresh list
      const ov = await apiGet<{ items: SynergyIdOverviewRow[] }>("/synergy-id/overview");
      setOverview(ov.items || []);
    } catch (err: any) {
      const detail = err?.response?.data?.detail ?? err?.detail ?? null;
      const safeNext = detail?.safe_next;
      if (safeNext) {
        alert(detail?.message || `Sequence conflict. Resetting to safe value ${safeNext}.`);
        fetchData(); // Refresh to sync
      } else {
        alert("Failed to update sequence.");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefault = async () => {
    if (!selected) return;
    if (!window.confirm(`Reset sequence for prefix ${selected.prefix}? This will auto-detect the next safe ID.`)) return;
    
    setSaving(true);
    try {
      await apiPost(`/synergy-id/prefix/${encodeURIComponent(selected.prefix)}/reset`, { 
        actor: currentUserName || "Manager" 
      });
      const ov = await apiGet<{ items: SynergyIdOverviewRow[] }>("/synergy-id/overview");
      setOverview(ov.items || []);
    } catch (e) {
      alert("Reset failed.");
    } finally {
      setSaving(false);
    }
  };

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-5xl h-[650px] flex bg-card dark:bg-slate-900 rounded-2xl shadow-2xl border dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* --- LEFT: SIDEBAR (Tabs & List) --- */}
        <div className="w-72 md:w-80 border-r dark:border-slate-800 bg-muted/10 dark:bg-slate-950/50 flex flex-col flex-shrink-0">
          <div className="p-4 border-b dark:border-slate-800 bg-background dark:bg-slate-900/50">
            <div className="flex items-center gap-2 text-primary font-semibold mb-4">
              <Hash className="h-5 w-5" />
              <span>ID Management</span>
            </div>
            
            {/* Tabs */}
            <div className="grid grid-cols-2 bg-muted/50 p-1 rounded-lg">
                <button 
                  onClick={() => setTab("overview")}
                  className={`flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md transition-all ${tab === "overview" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <List className="h-3.5 w-3.5" /> Prefixes
                </button>
                <button 
                  onClick={() => setTab("audit")}
                  className={`flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md transition-all ${tab === "audit" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <History className="h-3.5 w-3.5" /> Audit Log
                </button>
            </div>
          </div>

          {/* List Content */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
             {loading && <div className="p-4 text-center text-xs text-muted-foreground">Loading data...</div>}
             
             {!loading && tab === "overview" && (
                overview.length === 0 ? (
                   <div className="p-6 text-center text-xs text-muted-foreground">No prefixes found.</div>
                ) : (
                   overview.map(row => (
                     <button 
                        key={row.prefix}
                        onClick={() => setSelectedPrefix(row.prefix)}
                        className={`
                          w-full text-left px-3 py-2.5 rounded-lg mb-1 text-sm border transition-all
                          ${row.prefix === selectedPrefix 
                            ? "bg-primary/10 border-primary/30 text-primary dark:bg-primary/20" 
                            : "bg-transparent border-transparent hover:bg-muted/80 dark:hover:bg-slate-800"}
                        `}
                     >
                        <div className="flex justify-between items-center mb-1">
                           <span className="font-mono font-bold tracking-wide">{row.prefix}</span>
                           <Badge variant="outline" className="text-[10px] h-5 font-normal text-muted-foreground">
                              Seq: {row.next_seq}
                           </Badge>
                        </div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                           <CheckCircle2 className="h-3 w-3" /> {row.minted_count} IDs Minted
                        </div>
                     </button>
                   ))
                )
             )}

             {!loading && tab === "audit" && (
                <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                   Select a prefix to view settings. <br/> Switch to the right panel to see full logs.
                </div>
             )}
          </div>
        </div>

        {/* --- RIGHT: CONTENT PANEL --- */}
        <div className="flex-1 bg-background dark:bg-slate-900 relative flex flex-col overflow-hidden">
           <div className="absolute top-3 right-3 z-10">
              <Button variant="ghost" size="icon" onClick={onClose} className="hover:bg-muted rounded-full">
                <X className="h-5 w-5 text-muted-foreground" />
              </Button>
           </div>

           {/* HEADER */}
           <div className="p-6 border-b dark:border-slate-800">
              <h2 className="text-xl font-bold">
                 {tab === "overview" ? "Prefix Configuration" : "System Audit Log"}
              </h2>
              <p className="text-sm text-muted-foreground">
                 {tab === "overview" 
                    ? "Manage ID sequences and view minting stats." 
                    : "Review recent ID generation events and manual changes."}
              </p>
           </div>

           {/* MAIN CONTENT AREA */}
           <div className="flex-1 overflow-y-auto p-6">
              {tab === "overview" ? (
                 selected ? (
                    <div className="space-y-6 max-w-2xl">
                        {/* Status Card */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 rounded-xl border dark:border-slate-800 bg-muted/10">
                               <div className="text-xs text-muted-foreground font-medium uppercase mb-1">Next ID to Mint</div>
                               <div className="text-2xl font-mono font-bold text-primary tracking-wide">
                                  {selected.next_code || "—"}
                                </div>
                            </div>
                            <div className="p-4 rounded-xl border dark:border-slate-800 bg-muted/10">
                               <div className="text-xs text-muted-foreground font-medium uppercase mb-1">Total Minted</div>
                               <div className="text-2xl font-bold text-foreground">
                                  {selected.minted_count.toLocaleString()}
                               </div>
                            </div>
                        </div>

                        {/* Details Table */}
                        <div className="rounded-xl border dark:border-slate-800 overflow-hidden">
                            <div className="grid grid-cols-2 border-b dark:border-slate-800 bg-muted/30">
                                <div className="p-3 text-xs font-medium text-muted-foreground">Metric</div>
                                <div className="p-3 text-xs font-medium text-muted-foreground">Value</div>
                            </div>
                            <div className="divide-y dark:divide-slate-800">
                                <div className="grid grid-cols-2 p-3 text-sm">
                                   <span className="text-muted-foreground">Prefix Code</span>
                                   <span className="font-mono">{selected.prefix}</span>
                                </div>
                                <div className="grid grid-cols-2 p-3 text-sm">
                                   <span className="text-muted-foreground">Current Sequence</span>
                                   <span className="font-mono">{selected.next_seq}</span>
                                </div>
                                <div className="grid grid-cols-2 p-3 text-sm">
                                   <span className="text-muted-foreground">Highest Minted</span>
                                   <span className="font-mono">{selected.max_minted_seq ?? "None"}</span>
                                </div>
                                <div className="grid grid-cols-2 p-3 text-sm">
                                   <span className="text-muted-foreground">Last Activity</span>
                                   <span>{selected.last_minted_at ? new Date(selected.last_minted_at).toLocaleString() : "Never"}</span>
                                </div>
                            </div>
                        </div>

                        {/* Actions Card */}
                        <div className="rounded-xl border dark:border-slate-800 bg-card p-5 space-y-4 shadow-sm">
                            <div className="flex items-center gap-2 text-sm font-semibold">
                               <RotateCcw className="h-4 w-4 text-primary" /> Sequence Control
                            </div>
                            <div className="flex items-end gap-4">
                                <div className="flex-1 space-y-1.5">
                                   <label className="text-xs text-muted-foreground">Override Next Sequence</label>
                                   <Input 
                                      type="number" 
                                      defaultValue={selected.next_seq} 
                                      min={1}
                                      className="font-mono bg-muted/20 dark:bg-slate-950"
                                      onBlur={e => handleSetNext(selected.prefix, Number(e.target.value))}
                                   />
                                </div>
                                <Button variant="outline" onClick={handleResetDefault} disabled={saving} className="mb-[2px]">
                                   Reset to Auto-Safe
                                </Button>
                            </div>
                            <p className="text-[11px] text-muted-foreground bg-amber-50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-400 p-2 rounded border border-amber-200 dark:border-amber-800">
                               <AlertCircle className="h-3 w-3 inline mr-1 -mt-0.5" />
                               <strong>Caution:</strong> Manually changing the sequence may cause ID collisions if set lower than existing records.
                            </p>
                        </div>
                    </div>
                 ) : (
                    <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                       <Hash className="h-12 w-12 mb-2 opacity-20" />
                       <p>Select a prefix to view details.</p>
                    </div>
                 )
              ) : (
                 // AUDIT LOG VIEW
                 <div className="rounded-xl border dark:border-slate-800 overflow-hidden">
                    <table className="w-full text-left text-sm">
                       <thead className="bg-muted/50 dark:bg-slate-950 text-xs uppercase text-muted-foreground font-medium">
                          <tr>
                             <th className="p-3">Time</th>
                             <th className="p-3">Event</th>
                             <th className="p-3">ID</th>
                             <th className="p-3">Context</th>
                             <th className="p-3">User</th>
                          </tr>
                       </thead>
                       <tbody className="divide-y dark:divide-slate-800">
                          {events.map(ev => (
                             <tr key={ev.id} className="hover:bg-muted/30 dark:hover:bg-slate-800/50 transition-colors">
                                <td className="p-3 whitespace-nowrap text-xs text-muted-foreground">
                                   <div className="flex items-center gap-1.5">
                                      <Clock className="h-3 w-3" />
                                      {new Date(ev.created_at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                                   </div>
                                </td>
                                <td className="p-3">
                                   <Badge variant="secondary" className="text-[10px] font-normal">{ev.event_type}</Badge>
                                </td>
                                <td className="p-3 font-mono text-xs font-medium text-primary">
                                   {ev.code}
                                </td>
                                <td className="p-3 text-xs">
                                   {ev.po_number ? (
                                      <span className="flex items-center gap-1 text-muted-foreground">
                                         <FileText className="h-3 w-3" /> PO {ev.po_number}
                                      </span>
                                   ) : <span className="opacity-30">—</span>}
                                </td>
                                <td className="p-3 text-xs">
                                   {ev.actor_name ? (
                                      <span className="flex items-center gap-1">
                                         <User className="h-3 w-3 text-muted-foreground" /> {ev.actor_name}
                                      </span>
                                   ) : <span className="opacity-30">—</span>}
                                </td>
                             </tr>
                          ))}
                          {events.length === 0 && (
                             <tr><td colSpan={5} className="p-8 text-center text-muted-foreground text-xs">No audit events found.</td></tr>
                          )}
                       </tbody>
                    </table>
                 </div>
              )}
           </div>
        </div>

      </div>
    </div>,
    document.body
  );
}