import React, { useEffect, useMemo, useRef, useState, useDeferredValue } from "react";
import { Virtuoso } from "react-virtuoso";
import { useSearchParams } from "react-router-dom"; 
import { 
  Search, Settings, Sun, Moon, CheckCircle, AlertTriangle, Archive, 
  Maximize2, Minimize2, User, Hammer, AlertCircle, LayoutGrid, ChevronRight,
  Filter, SlidersHorizontal, LogOut, Loader2, XCircle, FileText, Tags, Box,
  ChevronDown, ChevronUp, Layers, Building, Clock, RefreshCw,
  Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { UserProfile } from "@/components/UserProfile";
import { ChatWidget } from "@/components/ChatWidget";
import TesterIntakeModal from "@/components/TesterIntakeModal";
import AuthPage from "@/components/AuthPage";
import { connectLive } from "@/lib/live";
import { dataClient } from "@/lib/dataClient";
import type { Grade } from "@/lib/grades";
import { apiGet, apiPost, apiPatch } from "@/lib/api";
import { SortControl, type SortConfig } from "@/components/ui/SortControl";

import { 
  ListRow, SessionSettings, DEFAULT_SETTINGS, API_BASE, apiJoin, 
  withGrade, mapApiRow, extractRows, getCompletenessStatus, forApiPatch, getGradeColor
} from "@/lib/testerTypes";
import { InventoryLoadingSkeleton, SessionSettingsModal } from "@/components/tester/TesterUI";
import { CardRow } from "@/components/tester/TesterCardRow";
import { Workspace, WorkspaceDialogStable } from "@/components/tester/TesterWorkspace";

import AppTesterDashboard from "./app/AppTesterDashboard";

// --- Types ---
type PurchaseOrderSummary = { id: string; po_number: string; vendor_name?: string; status: string; created_at: string; inventory_count?: number; };
type PoGroup = { category_id: string; label: string; units: number; };
type CategoryWithCount = { id: string | number; label: string; prefix: string; total_units?: number; };

function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}

const STORAGE_KEY = "synergy_user";
const SETTINGS_KEY = "synergy_session_settings_v3";

function DbActivityBar({ connecting, syncing, saving, disconnected }: any) {
  if (disconnected) return <div className="fixed top-0 left-0 right-0 z-[1000]"><div className="mx-auto max-w-7xl px-4"><div className="mt-2 rounded-md border border-red-300/60 bg-red-50 px-3 py-2 text-xs text-red-700 shadow-sm">Database disconnected.</div></div></div>;
  const show = connecting || syncing || saving;
  if (!show) return null;
  const label = connecting ? "Connecting..." : saving ? "Saving..." : "Syncing...";
  return <div className="fixed top-0 left-0 right-0 z-[1000] pointer-events-none"><div className="h-0.5 w-full bg-indigo-500/50 animate-pulse" /><div className="mx-auto max-w-7xl px-4 flex justify-end"><div className="mt-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/60 backdrop-blur-md px-3 py-1 text-[10px] text-white shadow-lg"><Loader2 className="h-3 w-3 animate-spin text-indigo-400" /><span className="opacity-90">{label}</span></div></div></div>;
}

function TesterDashboardInner({ user, onLogout }: { user: any; onLogout: () => void; }) {
  const [searchParams] = useSearchParams();
  
  const [isAppMode, setIsAppMode] = useState(false);
  useEffect(() => {
    const check = () => {
      if (navigator.userAgent.includes("SynergyClient")) return true;
      if (window.location.hash.includes("app_mode")) return true;
      if (searchParams.get("mode") === "app") return true;
      return sessionStorage.getItem("synergy_app_detected") === "true";
    };
    if (check()) {
      setIsAppMode(true);
      sessionStorage.setItem("synergy_app_detected", "true");
    }
  }, [searchParams]);

  const [currentUser, setCurrentUser] = useState(user);
  const handleUserUpdate = (u: any) => { setCurrentUser({ ...currentUser, ...u }); localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...currentUser, ...u })); };

  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (isAppMode) return true; 
    const saved = localStorage.getItem("theme");
    return saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    localStorage.setItem("theme", isDarkMode ? "dark" : "light");
    document.documentElement.classList.toggle("dark", isDarkMode);
  }, [isDarkMode]);

  const [settings, setSettings] = useState<SessionSettings>(() => {
    try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") }; } catch { return DEFAULT_SETTINGS; }
  });
  useEffect(() => { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }, [settings]);

  const [rows, setRows] = useState<ListRow[]>([]);
  const [categories, setCategories] = useState<CategoryWithCount[]>([]);
  const [pos, setPos] = useState<PurchaseOrderSummary[]>([]);
  const [poGroups, setPoGroups] = useState<Record<string, PoGroup[]>>({});
  const [expandedVendors, setExpandedVendors] = useState<Record<string, boolean>>({});

  const [totalDbCount, setTotalDbCount] = useState<number | null>(null);
  const [statusCounts, setStatusCounts] = useState<{ total: number; ready: number; incomplete: number } | null>(null);
  
  const [dbConnected, setDbConnected] = useState<boolean | null>(null);
  const [loadingRows, setLoadingRows] = useState(true);
  const [savingRows, setSavingRows] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [viewMode, setViewMode] = useState<"category" | "po">("po"); 
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedPoId, setSelectedPoId] = useState<string>(""); 
  const [selectedPoSubId, setSelectedPoSubId] = useState<string>(""); 
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [selectedGrade, setSelectedGrade] = useState<Grade | "">("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "READY" | "INCOMPLETE" | "SCRAP">("ALL");

  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [intakeOpen, setIntakeOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState<ListRow | null>(null);
  const draftRef = useRef<ListRow | null>(null);

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWsId, setActiveWsId] = useState<string | null>(null);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const activeWs = useMemo(() => workspaces.find(w => w.id === activeWsId) || null, [workspaces, activeWsId]);

  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'success' | 'error'>('idle');
  const [scannedIdDisplay, setScannedIdDisplay] = useState("");
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "synergyId", dir: "asc" });

  const rowsRef = useRef<ListRow[]>(rows);
  useEffect(() => { rowsRef.current = rows; }, [rows]);

  useEffect(() => {
    let buffer = "";
    let lastKeyTime = 0;
    const SCANNER_TIMEOUT = 100; 
    const handleGlobalKeyDown = async (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return; 
      const now = Date.now();
      if (now - lastKeyTime > SCANNER_TIMEOUT) buffer = "";
      lastKeyTime = now;
      if (e.key === "Enter") {
        if (buffer.length > 3) { 
          e.preventDefault();
          const scannedId = buffer.trim();
          setScanStatus('scanning');
          setScannedIdDisplay(scannedId);
          const existingRow = rowsRef.current.find(r => r.synergyId === scannedId);
          if (existingRow) {
            setDraft(existingRow);
            draftRef.current = existingRow;
            setIntakeOpen(true);
            setScanStatus('success');
          } else {
            try {
              const res = await apiGet<any>(`/rows?q=${encodeURIComponent(scannedId)}&limit=5`);
              const foundItems = extractRows(res); 
              const match = foundItems.find((r: any) => (r.synergyId === scannedId) || (r.synergy_id === scannedId));
              if (match) {
                const fetchedRow = withGrade(mapApiRow(match));
                setDraft(fetchedRow);
                draftRef.current = fetchedRow;
                setIntakeOpen(true);
                setScanStatus('success');
              } else {
                setScanStatus('error');
              }
            } catch (err) {
              setScanStatus('error');
            }
          }
          setTimeout(() => setScanStatus('idle'), 2000);
        }
        buffer = ""; 
      } else if (e.key.length === 1) { buffer += e.key; }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  const fetchPage = async (offset: number) => {
    setLoadingRows(true);
    try {
      const params = new URLSearchParams({ limit: String(settings.itemsPerPage), offset: String(offset) });
      if (deferredQuery) params.set("q", deferredQuery);
      if (selectedGrade) params.set("grade", selectedGrade);
      if (viewMode === "category" && selectedCategory && selectedCategory !== "all") params.set("category", selectedCategory);
      if (viewMode === "po" && selectedPoId) {
        params.set("po_id", selectedPoId);
        if (selectedPoSubId) params.set("categoryId", selectedPoSubId);
      }
      if (statusFilter === "INCOMPLETE") params.set("status", "incomplete");
      else if (statusFilter === "READY") params.set("status", "ready");
      else if (statusFilter === "SCRAP") params.set("status", "SCRAP"); 
      else if (statusFilter === "ALL") params.set("status", "ALL");

      const res = await apiGet<any>(`/rows?${params.toString()}`);
      const arr = extractRows(res);
      const mapped = arr.map(mapApiRow).map(withGrade);
      setRows(prev => {
        const seen = new Set(prev.map(r => r.synergyId));
        const merged = [...prev];
        mapped.forEach(r => { if (!seen.has(r.synergyId)) merged.push(r); else merged[merged.findIndex(m => m.synergyId === r.synergyId)] = r; });
        return merged;
      });
      setHasMore(arr.length >= settings.itemsPerPage);
      setNextOffset(offset + arr.length);
      setDbConnected(true);
    } catch (e: any) { setDbConnected(false); } finally { setLoadingRows(false); }
  };

  const fetchCategories = async () => { try { const data = await apiGet<CategoryWithCount[]>("/categories/summary"); setCategories(data); } catch (e) { console.error(e); } };
  const fetchPoGroups = async (poId: string) => { try { const groups = await apiGet<PoGroup[]>(`/pos/${poId}/groups`); setPoGroups(prev => ({ ...prev, [poId]: groups })); } catch(e) { } };
  const fetchPOs = async () => { try { const data = await apiGet<PurchaseOrderSummary[]>("/pos/active"); setPos(data); } catch (e) { console.error("Failed to fetch POs", e); setPos([]); } };
  
  const fetchTotalCount = async () => {
    try {
      const params = new URLSearchParams();
      if (deferredQuery) params.set("q", deferredQuery);
      if (selectedGrade) params.set("grade", selectedGrade);
      if (viewMode === "category" && selectedCategory && selectedCategory !== "all") params.set("category", selectedCategory);
      if (viewMode === "po" && selectedPoId) { params.set("po_id", selectedPoId); if (selectedPoSubId) params.set("categoryId", selectedPoSubId); }
      if (statusFilter === "INCOMPLETE") params.set("status", "incomplete");
      else if (statusFilter === "READY") params.set("status", "ready");
      else if (statusFilter === "SCRAP") params.set("status", "SCRAP");
      else if (statusFilter === "ALL") params.set("status", "ALL");
      const data = await apiGet<{total: string | number}>(`/rows/count?${params.toString()}`);
      setTotalDbCount(Number(data.total) || 0);
    } catch { setTotalDbCount(rows.length); }
  };
  const fetchStatusCounts = async () => { try { const j = await apiGet<{total: number; ready: number; incomplete: number}>("/rows/counts"); setStatusCounts({ total: j.total, ready: j.ready, incomplete: j.incomplete }); } catch { } };

  const handleManualRefresh = async () => {
    setRefreshing(true); setRows([]); setNextOffset(0);
    try { await Promise.all([ fetchPage(0), fetchTotalCount(), fetchStatusCounts(), fetchCategories(), fetchPOs(), selectedPoId ? fetchPoGroups(selectedPoId) : Promise.resolve() ]); } finally { setRefreshing(false); }
  };

  const recordPrintForRow = async (synergyId: string) => { await apiPost(`/rows/${synergyId}/record-print`, {}); setRows(prev => prev.map(r => r.synergyId === synergyId ? { ...r, lastPrintedAt: new Date().toISOString() } : r)); };
  const saveDraft = async (fromIntakePayload?: any) => { const current = draftRef.current ?? draft; if (!current) return; setSavingRows(true); try { if (!fromIntakePayload) { const patch = forApiPatch(current as any); await apiPatch(`/rows/${current.synergyId}`, patch); } if (settings.soundOnSave) { const ctx = new AudioContext(); const osc = ctx.createOscillator(); osc.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.1); } setRows([]); setNextOffset(0); fetchPage(0); setIntakeOpen(false); } catch (e: any) { } finally { setSavingRows(false); } };

  useEffect(() => { fetch(`${API_BASE}/health`).then(r => setDbConnected(r.ok)).catch(() => setDbConnected(false)); fetchCategories(); fetchPOs(); fetchTotalCount(); fetchStatusCounts(); fetchPage(0); }, []);
  useEffect(() => { setRows([]); setNextOffset(0); fetchPage(0); fetchTotalCount(); }, [deferredQuery, selectedCategory, selectedPoId, selectedPoSubId, selectedGrade, statusFilter, viewMode]);
  useEffect(() => { return connectLive(API_BASE, { onRowUpserted: (r) => { const g = withGrade(r as any); setRows(p => { const i = p.findIndex(x => x.synergyId === g.synergyId); if (i < 0) return [...p, g]; const n = [...p]; n[i] = { ...n[i], ...g }; return n; }); fetchTotalCount(); fetchStatusCounts(); }, onRowBulkUpserted: () => { fetchPage(0); fetchTotalCount(); fetchStatusCounts(); } }); }, []);

  const createWorkspaceFromRow = (row: ListRow) => { const id = `ws-${Date.now()}`; const ws: Workspace = { id, title: row.productName, productName: row.productName, criteria: { productName: row.productName, categoryId: null }, seedRow: row, patch: { grade: row.grade, testedBy: user.name, specs: { ...row.specs } }, flags: { grade: true, testedBy: true, testedDate: true, testerComment: false, specs: true, price: false, ebayPrice: false, categoryId: false }, selection: rows.filter(r => r.synergyId !== row.synergyId && r.productName === row.productName).map(r => r.synergyId) }; setWorkspaces(p => [ws, ...p]); setActiveWsId(id); setWorkspaceOpen(true); };

  const handleVendorToggle = (vendorName: string) => { setExpandedVendors(prev => ({ ...prev, [vendorName]: !prev[vendorName] })); };
  const handlePoClick = (e: React.MouseEvent, poId: string) => { e.stopPropagation(); if (selectedPoId === poId) { if (selectedPoSubId) { setSelectedPoSubId(""); } else { setSelectedPoId(""); } } else { setSelectedPoId(poId); setSelectedPoSubId(""); const po = pos.find(p => p.id === poId); if (po && (po.inventory_count || 0) > 0) { fetchPoGroups(poId); } } };
  const handlePoSubClick = (e: React.MouseEvent, poId: string, subId: string) => { e.stopPropagation(); setSelectedPoId(poId); setSelectedPoSubId(subId); };

  // --- UPDATED FILTER LOGIC ---
  const filtered = useMemo(() => {
    const result = rows.filter(r => {
      // 1. Partial Search Match (Global Search Style)
      if (deferredQuery) {
        const q = deferredQuery.toLowerCase();
        // SAFE MATCHING: Fallback to empty string to prevent crashes on null fields
        const matches = 
          (r.synergyId || "").toLowerCase().includes(q) ||
          (r.productName || "").toLowerCase().includes(q) ||
          (r.upc || "").toLowerCase().includes(q) ||
          (r.asin || "").toLowerCase().includes(q) ||
          (r.testerComment || "").toLowerCase().includes(q);
        
        if (!matches) return false;
      }

      // 2. Status Filters
      const completeness = getCompletenessStatus(r);
      const statusUpper = (r.status || "").toUpperCase();
      const isScrap = statusUpper.includes("SCRAP") || statusUpper.includes("SCRAPPED");
      if (statusFilter === "READY") return completeness.isReady && !isScrap;
      if (statusFilter === "INCOMPLETE") return !completeness.isReady && !isScrap;
      if (statusFilter === "SCRAP") return isScrap;
      return true;
    });
    // ... sort logic remains the same ...
    return result.sort((a, b) => {
      const dir = sortConfig.dir === "asc" ? 1 : -1;
      let valA: any = ""; let valB: any = "";
      switch (sortConfig.key) { case "productName": valA = a.productName || ""; valB = b.productName || ""; break; case "date": valA = a.testedDate || a.synergyId; valB = b.testedDate || b.synergyId; break; case "synergyId": default: valA = a.synergyId; valB = b.synergyId; break; }
      return String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' }) * dir;
    });
  }, [rows, deferredQuery, statusFilter, sortConfig]);

  const filteredCategories = useMemo(() => categories.filter((c) => sidebarSearch.trim() ? c.label.toLowerCase().includes(sidebarSearch.toLowerCase()) : true), [categories, sidebarSearch]);
  const filteredPOs = useMemo(() => pos.filter((p) => sidebarSearch.trim() ? (p.po_number + (p.vendor_name || "")).toLowerCase().includes(sidebarSearch.toLowerCase()) : true), [pos, sidebarSearch]);
  const groupedPOs = useMemo(() => { const groups: Record<string, PurchaseOrderSummary[]> = {}; filteredPOs.forEach(po => { const v = po.vendor_name || "Unknown Vendor"; if (!groups[v]) groups[v] = []; groups[v].push(po); }); return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0])); }, [filteredPOs]);
  const clearAllFilters = () => { setSelectedCategory(""); setSelectedPoId(""); setSelectedPoSubId(""); setSelectedGrade(""); setStatusFilter("ALL"); setQuery(""); };

  if (isAppMode) {
    return (
      <>
        <AppTesterDashboard 
          currentUser={currentUser} stats={statusCounts} rows={rows} filteredRows={filtered}
          categories={categories} pos={pos} poGroups={poGroups} groupedPOs={groupedPOs}
          filteredCategories={filteredCategories} draft={draft} intakeOpen={intakeOpen}
          viewMode={viewMode} selectedCategory={selectedCategory} selectedPoId={selectedPoId} 
          selectedPoSubId={selectedPoSubId} statusFilter={statusFilter} searchQuery={query}
          sidebarSearch={sidebarSearch} loadingRows={loadingRows} refreshing={refreshing}
          dbConnected={dbConnected} savingRows={savingRows} scanStatus={scanStatus} 
          scannedIdDisplay={scannedIdDisplay} expandedVendors={expandedVendors} sortConfig={sortConfig}
          setters={{ setViewMode, setSelectedCategory, setStatusFilter, setQuery, setSidebarSearch, setSettingsOpen, setSelectedPoId, setSelectedPoSubId, setSortConfig, setIntakeOpen }}
          actions={{ handleVendorToggle, handlePoClick, handlePoSubClick, handleManualRefresh, recordPrintForRow, loadMore: () => hasMore && !loadingMore && fetchPage(nextOffset), openIntake: (row: any) => { setDraft(row); draftRef.current=row; setIntakeOpen(true); }, createWorkspaceFromRow, saveDraft }}
        />
        <SessionSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} settings={settings} onSave={setSettings} currentPrefix="" />
        <WorkspaceDialogStable open={workspaceOpen} onClose={() => setWorkspaceOpen(false)} ws={activeWs} rows={rows} updateWorkspace={(id, p) => setWorkspaces(w => w.map(x => x.id === id ? { ...x, ...p } : x))} applyWorkspace={(ws) => {}} />
      </>
    );
  }

  return (
    <div className={cn("flex h-screen w-screen overflow-hidden font-sans transition-colors duration-300", isDarkMode ? "bg-[#020617]" : "bg-slate-50 text-slate-900")}>
      <DbActivityBar connecting={!dbConnected && dbConnected !== null} syncing={loadingRows || refreshing} saving={savingRows} disconnected={dbConnected === false} />
      
      <aside className={cn("flex w-72 flex-shrink-0 flex-col border-r h-full", isDarkMode ? "border-gray-800 bg-[#020617]" : "border-gray-200 bg-white")}>
        <div className={cn("flex shrink-0 flex-col items-center justify-center py-6 border-b px-4", isDarkMode ? "border-gray-800" : "border-gray-200")}>
          <img src="/images/tester.png" alt="Tester Logo" className="h-10 w-10 mb-2" />
          <span className="font-bold text-lg tracking-tight">Synergy</span>
          <span className={cn("text-[10px] uppercase font-semibold tracking-wide", isDarkMode ? "text-gray-500" : "text-gray-400")}>Tester Dashboard</span>
        </div>

        <div className={cn("grid grid-cols-2 gap-px border-b", isDarkMode ? "border-gray-800 bg-gray-800" : "border-gray-200 bg-gray-200")}>
          <div className={cn("flex flex-col items-center justify-center p-3 text-center", isDarkMode ? "bg-[#020617]" : "bg-white")}>
            <span className="text-emerald-500 font-bold text-lg">{statusCounts?.ready || 0}</span>
            <span className="text-[10px] uppercase text-muted-foreground font-medium">Ready</span>
          </div>
          <div className={cn("flex flex-col items-center justify-center p-3 text-center", isDarkMode ? "bg-[#020617]" : "bg-white")}>
            <span className="text-amber-500 font-bold text-lg">{statusCounts?.incomplete || 0}</span>
            <span className="text-[10px] uppercase text-muted-foreground font-medium">Queue</span>
          </div>
        </div>

        <div className="px-3 pt-3 pb-2">
           <div className={cn("grid grid-cols-2 gap-1 p-1 rounded-lg", isDarkMode ? "bg-gray-800/50" : "bg-slate-100")}>
              <button onClick={() => { setViewMode("po"); setSelectedCategory(""); }} className={cn("flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md transition-all", viewMode === "po" ? (isDarkMode ? "bg-gray-700 text-white shadow-sm" : "bg-white text-slate-900 shadow-sm") : "text-muted-foreground hover:text-foreground")}> <FileText className="h-3.5 w-3.5" /> POs </button>
              <button onClick={() => { setViewMode("category"); setSelectedPoId(""); setSelectedPoSubId(""); }} className={cn("flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md transition-all", viewMode === "category" ? (isDarkMode ? "bg-gray-700 text-white shadow-sm" : "bg-white text-slate-900 shadow-sm") : "text-muted-foreground hover:text-foreground")}> <Tags className="h-3.5 w-3.5" /> Cats </button>
           </div>
        </div>

        <div className={cn("shrink-0 border-b px-3 pb-3", isDarkMode ? "border-gray-800" : "border-gray-200")}>
           <div className="relative">
             <Input placeholder={viewMode === 'category' ? "Search categories..." : "Search PO number..."} value={sidebarSearch} onChange={(e) => setSidebarSearch(e.target.value)} className={cn("h-8 w-full rounded-lg pl-7 text-xs shadow-sm focus-visible:ring-1", isDarkMode ? "border-gray-700 bg-[#020617] text-gray-100 placeholder:text-gray-500" : "border-gray-300 bg-gray-50 text-gray-800 placeholder:text-gray-500")} />
             <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
           </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-800">
           <div className="px-2 py-3">
            {viewMode === "category" && (
              <div className="space-y-0.5">
                 <button onClick={() => setSelectedCategory("")} className={cn("flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-xs transition-colors mb-2", !selectedCategory ? (isDarkMode ? "bg-indigo-600/20 text-indigo-100" : "bg-indigo-50 text-indigo-700 font-medium") : (isDarkMode ? "text-gray-300 hover:bg-gray-800" : "text-gray-700 hover:bg-gray-100"))}> <span>All Categories</span> <span className="text-[10px] opacity-60">ALL</span> </button>
                 {filteredCategories.map(c => ( <button key={c.id} onClick={() => setSelectedCategory(c.label)} className={cn("flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition-colors group", selectedCategory === c.label ? (isDarkMode ? "bg-indigo-600/20 text-indigo-100" : "bg-indigo-50 text-indigo-700 font-medium") : (isDarkMode ? "text-gray-300 hover:bg-gray-800" : "text-gray-700 hover:bg-gray-100"))}> <span className="truncate">{c.label}</span> {c.total_units ? ( <Badge variant="secondary" className={cn("ml-2 h-5 px-1.5 text-[9px] font-normal tabular-nums min-w-[24px] justify-center", isDarkMode ? "bg-gray-800 text-gray-300" : "bg-white text-gray-500 shadow-sm border border-gray-200")}> {c.total_units} </Badge> ) : null} </button> ))}
              </div>
            )}
            {viewMode === "po" && (
              <div className="space-y-1">
                 <button onClick={() => { setSelectedPoId(""); setSelectedPoSubId(""); }} className={cn("flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-xs transition-colors mb-2", !selectedPoId ? (isDarkMode ? "bg-indigo-600/20 text-indigo-100" : "bg-indigo-50 text-indigo-700 font-medium") : (isDarkMode ? "text-gray-300 hover:bg-gray-800" : "text-gray-700 hover:bg-gray-100"))}> <span className="flex items-center gap-2"><Box className="h-3.5 w-3.5" /> All Shipments</span> </button>
                 {groupedPOs.map(([vendorName, vendorPos]) => {
                    const isExpanded = expandedVendors[vendorName] || sidebarSearch.trim().length > 0;
                    return (
                        <div key={vendorName} className="mb-2">
                             <button onClick={() => handleVendorToggle(vendorName)} className={cn("flex w-full items-center justify-between px-2 py-1.5 text-xs font-semibold rounded-md transition-colors", isDarkMode ? "text-gray-200 hover:bg-gray-800" : "text-gray-700 hover:bg-gray-100")}> <div className="flex items-center gap-2"> <Building className="h-3.5 w-3.5 opacity-70" /> <span>{vendorName}</span> <span className="text-[9px] font-normal opacity-50 ml-1">({vendorPos.length})</span> </div> {isExpanded ? <ChevronDown className="h-3 w-3 opacity-50"/> : <ChevronRight className="h-3 w-3 opacity-50"/>} </button>
                              {isExpanded && (
                                <div className={cn("pl-2 mt-1 space-y-1 border-l ml-2", isDarkMode ? "border-gray-800" : "border-gray-200")}>
                                     {vendorPos.map(po => {
                                        const isActive = selectedPoId === po.id;
                                        const groups = poGroups[po.id] || [];
                                        const hasInventory = (po.inventory_count || 0) > 0;
                                        return (
                                            <div key={po.id} className="mb-1">
                                                <button onClick={(e) => handlePoClick(e, po.id)} className={cn("flex flex-col w-full items-start rounded-md px-2 py-2 text-left text-xs transition-colors border border-transparent", isActive ? (isDarkMode ? "bg-indigo-600/10 border-indigo-500/30" : "bg-indigo-50 border-indigo-200") : (isDarkMode ? "text-gray-400 hover:bg-gray-800 hover:text-gray-200" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"))}> <div className="flex items-center justify-between w-full"> <span className={cn("font-mono font-medium", isActive ? "text-indigo-600 dark:text-indigo-400" : "")}>{po.po_number}</span> {isActive ? <ChevronUp className="h-3 w-3 opacity-50"/> : <ChevronDown className="h-3 w-3 opacity-50"/>} </div> <div className="flex justify-between w-full mt-1"> <span className={cn("text-[9px]", isActive ? "text-indigo-500/70 dark:text-indigo-300/70" : "text-muted-foreground opacity-70")}>{new Date(po.created_at).toLocaleDateString()}</span> {!hasInventory && ( <span className="text-[9px] text-amber-500 flex items-center gap-1"><Clock className="h-2.5 w-2.5"/> Pending</span> )} </div> </button>
                                                {isActive && ( <div className={cn("ml-2 pl-2 border-l mt-1 space-y-0.5", isDarkMode ? "border-indigo-500/20" : "border-indigo-200")}> {!hasInventory ? ( <div className={cn("px-2 py-2 my-1 text-[10px] rounded border border-dashed flex items-start gap-2", isDarkMode ? "bg-amber-900/20 border-amber-800 text-amber-400" : "bg-amber-50 border-amber-200 text-amber-700")}> <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" /> <span className="leading-tight">Items have not been sent to testing yet.</span> </div> ) : ( <> <button onClick={(e) => handlePoSubClick(e, po.id, "")} className={cn("flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[11px] transition-colors", !selectedPoSubId ? (isDarkMode ? "text-indigo-300 bg-white/5" : "text-indigo-700 bg-white/60 font-medium") : "text-muted-foreground hover:text-foreground")}> <span>View All</span> <Layers className="h-3 w-3 opacity-50" /> </button> {groups.length === 0 ? ( <div className="px-2 py-1 text-[10px] text-muted-foreground italic opacity-70">Loading contents...</div> ) : ( groups.map(g => { const isSubActive = selectedPoSubId === g.category_id; return ( <button key={g.category_id || g.label} onClick={(e) => handlePoSubClick(e, po.id, g.category_id)} className={cn("flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[11px] transition-colors", isSubActive ? (isDarkMode ? "text-indigo-300 bg-white/5" : "text-indigo-700 bg-white/60 font-medium") : (isDarkMode ? "text-gray-400 hover:text-gray-200" : "text-gray-600 hover:text-gray-900"))}> <span className="truncate">{g.label || "Unassigned"}</span> <span className="text-[9px] opacity-60 ml-2">{g.units}</span> </button> ) }) )} </> )} </div> )}
                                            </div>
                                        )
                                     })}
                                </div>
                              )}
                        </div>
                    );
                 })}
              </div>
            )}
           </div>
        </div>
      </aside>

      <main className={cn("flex flex-1 flex-col h-full overflow-hidden min-w-0", isDarkMode ? "bg-[#020617]" : "bg-slate-50")}>
        
        {/* HEADER */}
        <div className={cn("flex shrink-0 items-center justify-between border-b px-6 py-3.5 shadow-sm backdrop-blur-sm z-10", isDarkMode ? "border-gray-800 bg-[#020617]/80" : "border-gray-200 bg-white/80")}>
           <div className="flex items-center gap-2">
              <div className={cn("p-2 rounded-lg", isDarkMode ? "bg-gray-800 text-gray-300" : "bg-gray-100 text-gray-500")}>
                <LayoutGrid className="h-4 w-4" />
              </div>
              <div className="flex flex-col">
                 <div className="flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider text-gray-400">
                    <span>Testing</span>
                    <ChevronRight className="h-3 w-3" />
                    <span>{statusFilter === "ALL" ? "All Inventory" : statusFilter === "READY" ? "Ready" : "Queue"}</span>
                 </div>
                 <div className="flex items-center gap-2">
                    <span className={cn("text-sm font-bold", isDarkMode ? "text-white" : "text-gray-900")}>
                      {viewMode === "po" 
                        ? (selectedPoId 
                             ? (pos.find(p => p.id === selectedPoId)?.po_number + 
                                (selectedPoSubId && poGroups[selectedPoId]?.find(g => g.category_id === selectedPoSubId)?.label 
                                   ? ` / ${poGroups[selectedPoId].find(g => g.category_id === selectedPoSubId)?.label}` 
                                   : "")) 
                             : "All Shipments")
                        : (selectedCategory || "All Categories")
                      }
                    </span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", isDarkMode ? "bg-gray-800 text-gray-300" : "bg-gray-100 text-gray-600")}>
                      {totalDbCount || rows.length}
                    </span>
                 </div>
              </div>
           </div>

           {scanStatus !== 'idle' && (
                <div className={cn("ml-4 flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold animate-in fade-in slide-in-from-top-2",
                  scanStatus === 'scanning' ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" :
                  scanStatus === 'success' ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" :
                  "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                )}>
                  {scanStatus === 'scanning' && <Loader2 className="h-3 w-3 animate-spin" />}
                  {scanStatus === 'success' && <CheckCircle className="h-3 w-3" />}
                  {scanStatus === 'error' && <XCircle className="h-3 w-3" />}
                  <span>
                    {scanStatus === 'scanning' ? `Scanning...` :
                     scanStatus === 'success' ? `Found ${scannedIdDisplay}` :
                     `ID ${scannedIdDisplay} Not Found`}
                  </span>
                </div>
           )}

           <div className="flex items-center gap-3">
              <div className="relative hidden md:block group">
                <Input placeholder="Search ID, Product, Comment..." value={query} onChange={e => setQuery(e.target.value)} className={cn("h-9 w-72 rounded-full pl-9 text-sm transition-all shadow-sm", isDarkMode ? "border-gray-800 bg-gray-900/50 text-gray-100 placeholder:text-gray-500 focus:bg-gray-900 focus:w-80" : "border-gray-200 bg-white text-gray-800 placeholder:text-gray-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 focus:w-80")} />
                <Search className={cn("pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors", isDarkMode ? "text-gray-500 group-focus-within:text-indigo-400" : "text-gray-400 group-focus-within:text-indigo-500")} />
              </div>
              <Button variant="ghost" size="icon" onClick={handleManualRefresh} className={cn("h-9 w-9 rounded-full", refreshing && "animate-spin", isDarkMode ? "text-gray-400 hover:bg-gray-800" : "text-gray-500 hover:bg-gray-100")}> <RefreshCw className="h-5 w-5" /> </Button>
              <Button variant="ghost" size="icon" onClick={() => setIsDarkMode(d => !d)} className={cn("h-9 w-9 rounded-full", isDarkMode ? "text-gray-400 hover:bg-gray-800" : "text-gray-500 hover:bg-gray-100")}> {isDarkMode ? <Sun className="h-5 w-5"/> : <Moon className="h-5 w-5"/>} </Button>
              <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)} className={cn("h-9 w-9 rounded-full", isDarkMode ? "text-gray-400 hover:bg-gray-800 hover:text-gray-100" : "text-gray-500 hover:bg-gray-100 hover:text-gray-900")}> <Settings className="h-5 w-5" /> </Button>
              <div className="pl-2 border-l border-gray-200 dark:border-gray-800">
                <UserProfile user={currentUser} onUpdate={handleUserUpdate} logoutPath="/login/testers" />
              </div>
           </div>
        </div>

        {/* FILTER BAR */}
        <div className={cn("flex flex-wrap items-center gap-4 border-b px-6 py-3 shrink-0", isDarkMode ? "border-gray-800 bg-[#020617]" : "border-gray-200 bg-slate-50")}>
           <div className={cn("flex p-1 rounded-lg border", isDarkMode ? "bg-gray-800/50 border-gray-700" : "bg-gray-100 border-gray-200")}>
              <button onClick={() => setStatusFilter("INCOMPLETE")} className={cn("px-3 py-1 text-[11px] font-medium rounded-md transition-all flex items-center gap-1.5", statusFilter === "INCOMPLETE" ? (isDarkMode ? "bg-amber-500/20 text-amber-300 shadow-sm ring-1 ring-amber-500/50" : "bg-white text-amber-700 shadow-sm ring-1 ring-black/5") : "text-muted-foreground hover:text-foreground")}> <AlertCircle className="h-3 w-3" /> Queue </button>
              <button onClick={() => setStatusFilter("READY")} className={cn("px-3 py-1 text-[11px] font-medium rounded-md transition-all flex items-center gap-1.5", statusFilter === "READY" ? (isDarkMode ? "bg-emerald-500/20 text-emerald-300 shadow-sm ring-1 ring-emerald-500/50" : "bg-white text-emerald-700 shadow-sm ring-1 ring-black/5") : "text-muted-foreground hover:text-foreground")}> <Hammer className="h-3 w-3" /> Ready </button>
               <button onClick={() => setStatusFilter("SCRAP")} className={cn("px-3 py-1 text-[11px] font-medium rounded-md transition-all flex items-center gap-1.5", statusFilter === "SCRAP" ? (isDarkMode ? "bg-red-500/20 text-red-300 shadow-sm ring-1 ring-red-500/50" : "bg-white text-red-700 shadow-sm ring-1 ring-black/5") : "text-muted-foreground hover:text-foreground")}> <Trash2 className="h-3 w-3" /> Scrap </button>
              <button onClick={() => setStatusFilter("ALL")} className={cn("px-3 py-1 text-[11px] font-medium rounded-md transition-all flex items-center gap-1.5", statusFilter === "ALL" ? (isDarkMode ? "bg-indigo-500/20 text-indigo-300 shadow-sm ring-1 ring-indigo-500/50" : "bg-white text-indigo-700 shadow-sm ring-1 ring-black/5") : "text-muted-foreground hover:text-foreground")}> <Filter className="h-3 w-3" /> All </button>
           </div>
           
           <div className="h-6 w-px bg-gray-200 dark:bg-gray-800" />

           <div className="flex items-center gap-1">
              <span className="text-[10px] font-semibold uppercase text-muted-foreground mr-1">Grade</span>
              {(['A', 'B', 'C', 'D', 'P'] as const).map(g => { const isActive = selectedGrade === g; return ( <button key={g} onClick={() => setSelectedGrade(isActive ? "" : g)} className={cn("h-6 w-6 rounded-full text-[10px] font-bold transition-all border", isActive ? (isDarkMode ? "bg-indigo-600 text-white border-indigo-500" : "bg-indigo-600 text-white border-indigo-600") : (isDarkMode ? "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200" : "bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700"))}> {g} </button> ) })}
           </div>

           <div className="flex-1 flex justify-end items-center gap-3">
              <SortControl config={sortConfig} onChange={setSortConfig} />
              <Button variant="ghost" size="sm" onClick={clearAllFilters} className={cn("h-8 rounded-full px-3 text-[11px]", isDarkMode ? "text-gray-400 hover:bg-gray-800" : "text-gray-500 hover:bg-gray-100")}> <SlidersHorizontal className="h-3.5 w-3.5 mr-1" /> Clear </Button>
           </div>
        </div>

        {/* LIST */}
        <div className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-800">
           <div className={cn("min-h-full h-full rounded-2xl border shadow-sm overflow-hidden", isDarkMode ? "border-gray-800 bg-gray-900/40" : "border-gray-200 bg-white")}>
             {loadingRows && rows.length === 0 ? <div className="p-4"><InventoryLoadingSkeleton /></div> :
               filtered.length === 0 ? (
                 <div className="flex flex-col items-center justify-center h-full text-muted-foreground opacity-50">
                    <Archive className="h-12 w-12 mb-3 opacity-30"/>
                    <p className="font-medium">No items match your filters</p>
                    {viewMode === "po" && !selectedPoId && <p className="text-xs mt-1">Select a Purchase Order from the sidebar</p>}
                    {(query || selectedGrade || statusFilter !== 'ALL') && (
                        <Button variant="link" size="sm" onClick={clearAllFilters} className="mt-2 text-indigo-500">Clear all filters</Button>
                    )}
                 </div>
               ) : (
                <Virtuoso
                  style={{ height: "100%" }}
                  data={filtered}
                  itemContent={(_, row) => {
                    const statusUpper = (row.status || "").toUpperCase();
                    const isScrap = statusUpper.includes("SCRAP") || statusUpper.includes("SCRAPPED");
                    return (
                      <div className={cn("px-2 pt-2 relative transition-all duration-300", isScrap ? "opacity-90 scale-[0.99]" : "")}>
                        <div className={cn("relative rounded-lg overflow-hidden transition-all", isScrap && "ring-1 ring-red-300 dark:ring-red-900 bg-red-50/50 dark:bg-red-950/10")}>
                          <CardRow
                            row={row}
                            onRecordPrint={recordPrintForRow}
                            onEdit={(id) => { setDraft(row); draftRef.current = row; setIntakeOpen(true); }}
                            onWorkspace={createWorkspaceFromRow}
                            denseMode={settings.denseMode}
                            showSpecsInline={settings.showSpecsInline}
                            style={isScrap ? { borderColor: "transparent", background: "transparent" } : undefined}
                          />
                        </div>
                        {isScrap && (
                          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none select-none">
                            <div className="border-[3px] border-red-600/20 text-red-600/20 text-3xl font-black uppercase tracking-[0.2em] -rotate-12 px-4 py-1 rounded-lg backdrop-blur-[0.5px]">SCRAPPED</div>
                          </div>
                        )}
                      </div>
                    );
                  }}
                  endReached={() => hasMore && !loadingMore && fetchPage(nextOffset)}
                  components={{ Footer: () => (<div className="p-6 text-center text-xs text-muted-foreground">{loadingMore ? <span className="flex items-center justify-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Loading more...</span> : "End of list"}</div>) }}
                />
               )
             }
           </div>
        </div>
      </main>

      {/* MODALS */}
      {draft && <TesterIntakeModal open={intakeOpen} row={draft} user={user} onClose={() => setIntakeOpen(false)} onSave={saveDraft} />}
      <SessionSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} settings={settings} onSave={setSettings} currentPrefix="" />
      <WorkspaceDialogStable open={workspaceOpen} onClose={() => setWorkspaceOpen(false)} ws={activeWs} rows={rows} updateWorkspace={(id, p) => setWorkspaces(w => w.map(x => x.id === id ? { ...x, ...p } : x))} applyWorkspace={(ws) => {}} />
      <ChatWidget user={user} />
    </div>
  );
}

export default function TesterDashboard() {
  const [user, setUser] = useState<{id:number,name:string} | null>(null);
  useEffect(() => { try { setUser(JSON.parse(localStorage.getItem(STORAGE_KEY)!)); } catch {} }, []);
  if (!user) return <AuthPage onAuth={setUser} variant="tester" filterByRole />;
  return <TesterDashboardInner user={user as any} onLogout={() => { localStorage.removeItem(STORAGE_KEY); setUser(null); }} />;
}