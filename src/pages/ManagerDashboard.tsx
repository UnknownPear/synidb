import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Layers3, Settings, RefreshCw, Building, Play, Trash2, ArrowLeftRight, List, Pencil, Loader2, Search as SearchIcon, X, KeyRound,
  PanelLeftClose, PanelLeftOpen, FileText, BarChart3, Tags, Store
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/Section";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import WorkbenchList from "@/components/manager/WorkbenchList";
import CategoryRollup from "@/components/manager/CategoryRollup";
import DashboardStats from "@/components/manager/DashboardStats";
import LinesPanel from "@/components/manager/LinesPanel";
import AiPill from "@/components/manager/AiPill";
import Bb8Toggle from "@/components/ui/Bb8Toggle"; 
import GlobalLoader from "@/components/ui/GlobalLoader";
import CategoryManagerModal from "@/components/manager/CategoryManagerModal";
import VendorManager from "@/components/manager/VendorManager";
import UploadPOModal from "@/components/manager/UploadPOModal";
import AddLineItemModal from "@/components/manager/AddLineItemModal";
import EditPOModal from "@/components/manager/EditPOModal";
import GlobalSearch from "@/components/manager/GlobalSearch";
import PORollup from "@/components/manager/PORollup";
import UserManagerModal from "@/components/manager/UserManagerModal";
import SynergyIdSettingsModal from "@/components/manager/SynergyIdSettingsModal"; 
import MovePOModal from "@/components/manager/MovePOModal";
import ConfirmDeleteModal from "@/components/manager/ConfirmDeleteModal";
import { UserProfile } from "@/components/UserProfile"; 
import { ChatWidget } from "../components/ChatWidget";
import EbayLinkerModal from "@/components/EbayLinkerModal";
import TappingHand from "@/components/ui/TappingHand";
import SyniRecommendations from "@/components/manager/SyniRecommendations";
import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  cls,
  uniqById,
} from "@/lib/api";
import type {
  AiHealth,
  Category,
  Vendor,
  PurchaseOrderSummary,
  POLine,
  ProfitRow,
} from "@/types/manager";
import WeeklyPulse from "@/components/manager/WeeklyPulse";
// IMPORT THE NEW WIDGET
import SyniWidget, { Insight } from "@/components/SyniWidget";


type LayoutMode = "wide" | "split";
type SidebarView = "workbench" | "stats" | "categories" | null;

const USER_KEY = "synergy_user";

export default function ManagerDashboard() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const [allPOs, setAllPOs] = useState<PurchaseOrderSummary[]>([]);
  const [activePO, setActivePO] = useState<PurchaseOrderSummary | null>(null);
  const [poLines, setPoLines] = useState<POLine[]>([]);
  const [profit, setProfit] = useState<ProfitRow | null>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [scrollToLineId, setScrollToLineId] = useState<string | null>(null);

  const safeLines = Array.isArray(poLines) ? poLines : [];

  const totals = React.useMemo(() => {
    const getCost = (l: any) => {
      const val = l.purchaseCost ?? l.unit_cost;
      return Number(val) || 0;
    };
    
    const getQty = (l: any) => Number(l.qty) || 1;

    const items = safeLines.reduce((a, l: any) => a + getQty(l), 0);
    const cost = safeLines.reduce((a, l: any) => a + (getCost(l) * getQty(l)), 0);
    
    const soldCost = safeLines
      .filter((l: any) => l.status && String(l.status).toUpperCase() === 'SOLD')
      .reduce((a, l: any) => a + (getCost(l) * getQty(l)), 0);

    return { items, cost, soldCost };
  }, [safeLines]);

  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [catMgrOpen, setCatMgrOpen] = useState(false);
  const [vendorMgrOpen, setVendorMgrOpen] = useState(false);
  const [addLineOpen, setAddLineOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [isResetPasswordModalOpen, setResetPasswordModalOpen] = useState(false);
  const [idSettingsOpen, setIdSettingsOpen] = useState(false);  
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ebayLinkerOpen, setEbayLinkerOpen] = useState(false);
  const [poToDelete, setPoToDelete] = useState<PurchaseOrderSummary | null>(null);

  const [linesLoading, setLinesLoading] = useState(false);
  const [exploding, setExploding] = useState(false);
  const [poSwitching, setPoSwitching] = useState(false);

  const [refreshKey, setRefreshKey] = useState(0);

  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("mgr_sidebar_collapsed") === "true");
  const [activeFlyout, setActiveFlyout] = useState<SidebarView>(null);

  const [user, setUser] = useState<{ id: string; name: string } | null>(() => {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); }
    catch { return null; }
  });

  // --- Syni State ---
  const [syniInsights, setSyniInsights] = useState<Insight[]>([]);

  useEffect(() => {
    apiGet<Insight[]>("/assistant/insights")
      .then(setSyniInsights)
      .catch(err => {
         console.error("Syni slept in:", err);
      });
  }, []);

   const handleSyniJump = async (synergyId: string) => {
    try {
      // Reuse the search endpoint to find where this item lives
      const res = await apiGet<any>(`/search?q=${encodeURIComponent(synergyId)}`);
      
      // Check lines first
      const line = res.lines?.find((l: any) => l.synergy_id === synergyId);
      
      if (line) {
        // It's in a PO. Find the PO object from our local list or fetch it.
        const targetPO = allPOs.find(p => p.id === line.po_id);
        if (targetPO) {
          setActivePO(targetPO);
          setScrollToLineId(line.line_id); // This triggers auto-scroll in LinesPanel
        } else {
          // If PO isn't in the global list (rare), fetch it specifically
          // For now, alerting user if not found in cache, or we could fetch activePO directly here
          alert("Opening PO...");
          const fresh = await apiGet<PurchaseOrderSummary>(`/pos/${line.po_id}/summary`);
          setActivePO(fresh);
          setScrollToLineId(line.line_id);
        }
      } else {
        alert("Item found in database but not attached to an active PO view.");
      }
    } catch (e) {
      console.error("Jump failed", e);
    }
  };

  const handleRecommendationClick = (insight: Insight) => {
    // If it's a link, go there
    if (insight.action?.link) {
      window.location.href = insight.action.link;
    } 

    else if (insight.id === "critical_unlinked") {
     
      window.dispatchEvent(new CustomEvent('open-syni-chat', { detail: "Show me unlinked items" }));
    }
  };

  const handleUserUpdate = (updatedUser: {id: string; name: string; avatar_url?: string | null}) => {
    const newUser = { ...user, ...updatedUser };
    setUser(newUser as any);
    localStorage.setItem(USER_KEY, JSON.stringify(newUser));
  };

  useEffect(() => {
    localStorage.setItem("mgr_sidebar_collapsed", String(collapsed));
    if (!collapsed) setActiveFlyout(null);
  }, [collapsed]);

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem("darkMode");
    if (saved !== null) return saved === "true";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("darkMode", String(darkMode));
  }, [darkMode]);

  const isMac = useMemo(
    () => typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform),
    []
  );

  const [aiHealth, setAiHealth] = useState<AiHealth | null>(null);
  useEffect(() => {
    apiGet<AiHealth>("/ai/health").then(setAiHealth).catch(() => setAiHealth(null));
  }, []);

  const [layoutMode, setLayoutMode] = useState<LayoutMode>(
    () => (localStorage.getItem("mgr_layout_mode") as LayoutMode) || "wide"
  );
  useEffect(() => localStorage.setItem("mgr_layout_mode", layoutMode), [layoutMode]);

  const hasUncategorizedItems = useMemo(() => safeLines.some((line) => (line.qty ?? 1) > 0 && !line.category_id), [safeLines]);
  const hasMissingSynergyIds = useMemo(() => safeLines.some((line: any) => {
      const qty = Number(line?.qty ?? 1);
      if (!Number.isFinite(qty) || qty <= 0) return false;
      return !!line.category_id && !line.synergy_id;
    }), [safeLines]);
  const localTotalUnits = useMemo(() => safeLines.reduce((sum, line: any) => {
      const qty = Number(line?.qty);
      return sum + (Number.isFinite(qty) && qty > 0 ? qty : 1);
    }, 0), [safeLines]);

  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [mintedCount, setMintedCount] = useState<number | null>(null);

 const fetchGlobals = useCallback(async () => {
  try {
    const [cats, vends, pos] = await Promise.all([
      apiGet<Category[]>("/categories"),
      apiGet<Vendor[]>("/vendors"),
      apiGet<PurchaseOrderSummary[]>("/pos/summaries"),
    ]);
    
    const sortedCats = uniqById(cats).sort((a, b) => a.label.localeCompare(b.label));
    
    setCategories(sortedCats);
    
    setVendors(vends);
    setAllPOs(pos);
  } catch (e) {
    console.error("Global load failed", e);
  }
}, []);

  // Inside src/pages/ManagerDashboard.tsx

  const refreshActiveContext = useCallback(async (poId: string) => {
    try {
      // ADDED: Fetch lines alongside summary and stats
      const [freshSummary, freshProfit, freshStats, freshLinesRes] = await Promise.all([
        apiGet<PurchaseOrderSummary>(`/pos/${poId}/summary`),
        apiGet<ProfitRow | null>(`/pos/${poId}/profit`).catch(() => null),
        apiGet<any>(`/pos/${poId}/mint-stats`).catch(() => null),
        apiGet<{ rows: POLine[] }>(`/pos/${poId}/lines`).catch(() => ({ rows: [] })), 
      ]);

      setActivePO(freshSummary);
      setProfit(freshProfit);
      setPoLines(freshLinesRes.rows || []); // Update the state so validators work

      if (freshStats) {
        setPendingCount(typeof freshStats.pending === "number" ? Math.max(0, freshStats.pending) : null);
        setMintedCount(typeof freshStats.minted === "number" ? Math.max(0, freshStats.minted) : null);
      }
    } catch (e) {
      console.error("Active context refresh failed", e);
    }
  }, []);

  const refreshEverything = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchGlobals();
      if (activePO?.id) {
        await refreshActiveContext(activePO.id);
        setRefreshKey(prev => prev + 1);
      }
    } finally {
      setRefreshing(false);
    }
  }, [fetchGlobals, refreshActiveContext, activePO?.id]);

  useEffect(() => {
    fetchGlobals();
  }, [fetchGlobals]);

  useEffect(() => {
    if (!activePO?.id) {
      setProfit(null);
      setPendingCount(null);
      setMintedCount(null);
      setPoLines([]);
      return;
    }
    setPoSwitching(true);
    refreshActiveContext(activePO.id).finally(() => setPoSwitching(false));
  }, [activePO?.id, refreshActiveContext]);

  useEffect(() => {
    if (activePO?.id && totals.cost > 0) {
      setAllPOs(prev => {
        const idx = prev.findIndex(p => p.id === activePO.id);
        if (idx !== -1 && Math.abs((prev[idx].est_cost || 0) - totals.cost) > 1) {
          const next = [...prev];
          next[idx] = { ...next[idx], est_cost: totals.cost };
          return next;
        }
        return prev;
      });
    }
  }, [totals.cost, activePO?.id]);

  async function reassignPO(poId: string, newVendorId: string) {
    try {
      await apiPatch(`/purchase_orders/${poId}`, { vendor_id: newVendorId });
      await refreshEverything();
    } catch (e: any) {
      console.error("Failed to move PO:", e);
      alert("Failed to move purchase order");
    }
  }

  async function executeDeletePO() {
    if (!poToDelete) return;
    try {
      await apiDelete(`/purchase_orders/${poToDelete.id}`);
      if (activePO?.id === poToDelete.id) setActivePO(null);
      setPoToDelete(null);
      await fetchGlobals();
    } catch (e: any) {
      alert("Failed to delete PO: " + e.message);
    }
  }

 async function sendToTesters() {
    if (!activePO?.id || exploding) return;
    try {
      setExploding(true);
      const json = await apiPost<any>(
        `/imports/${encodeURIComponent(activePO.id)}/explode-by-line`,
        {}
      );
      
      const created = Number(json?.created || 0);
      alert(created > 0 ? `Successfully created ${created} new inventory item(s).` : `All eligible items have already been sent.`);
      await refreshEverything();
    } catch (e: any) {
        alert(e.message || "An unexpected error occurred.");
    } finally {
      setExploding(false);
    }
  }

  const sendButtonState = useMemo(() => {
    const itemsLeftToMint = pendingCount != null ? pendingCount : localTotalUnits;
    const hasMintedAny = (mintedCount ?? 0) > 0;

    if (exploding) return { state: "sending", canSend: false, label: "Sending…", subText: "Sending…" };
    if (hasUncategorizedItems) return { state: "needs", canSend: false, label: "Send to testers", subText: "Needs categories" };
    if (hasMissingSynergyIds) return { state: "needs-ids", canSend: false, label: "Send to testers", subText: "Needs Synergy IDs" };
    if (itemsLeftToMint > 0) return { state: "ready", canSend: true, label: "Send to testers", subText: `Ready to send (${itemsLeftToMint})` };
    if (itemsLeftToMint === 0 && safeLines.length > 0 && hasMintedAny) return { state: "done", canSend: false, label: "Sent to testers", subText: "All items sent to testers" };

    return { state: "idle", canSend: false, label: "Send to testers", subText: "No items to send" };
  }, [exploding, pendingCount, mintedCount, hasUncategorizedItems, hasMissingSynergyIds, localTotalUnits, safeLines.length]);

  const toggleFlyout = (view: SidebarView) => setActiveFlyout(current => current === view ? null : view);

  const renderFlyout = (type: SidebarView) => {
    if (!type) return null;
    const content = {
      workbench: <WorkbenchList allPOs={allPOs} activePOId={activePO?.id || null} onSelect={(po) => { setActivePO(po); setActiveFlyout(null); }} onUploadClick={() => { setUploadModalOpen(true); setActiveFlyout(null); }} />,
      stats: <DashboardStats allPOs={allPOs} vendors={vendors} />,
      categories: <CategoryRollup onManageClick={() => { setCatMgrOpen(true); setActiveFlyout(null); }} />
    }[type];

    return (
       <>
         <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setActiveFlyout(null)} />
         <div className="absolute left-[72px] top-0 z-50 h-full flex items-start pt-4">
            <div className="w-[480px] max-h-[calc(100vh-32px)] bg-card border rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-left-4 duration-200 flex flex-col ml-2">
              <div className="p-3 border-b flex items-center justify-between bg-muted/30">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-background border shadow-sm">
                        {type === 'workbench' && <FileText className="h-4 w-4 text-primary" />}
                        {type === 'stats' && <BarChart3 className="h-4 w-4 text-primary" />}
                        {type === 'categories' && <Tags className="h-4 w-4 text-primary" />}
                    </div>
                    <span className="text-sm font-semibold">{type === 'workbench' ? 'PO Workbench' : type === 'stats' ? 'Dashboard Stats' : 'Categories'}</span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setActiveFlyout(null)}><X className="h-4 w-4" /></Button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 bg-muted/5">{content}</div>
            </div>
         </div>
       </>
    );
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="sticky top-0 z-[40] flex h-16 items-center gap-4 border-b bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center gap-2 min-w-fit">
           <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground mr-1 -ml-2" onClick={() => setCollapsed(prev => !prev)}>
              {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
           </Button>
          <img src="/images/managertrans.png" alt="Company Logo" className="h-9 w-9" />
          <h1 className="text-lg font-semibold hidden md:block">Manager Workbench</h1>
        </div>

        <div className="flex-1 flex justify-center max-w-lg mx-auto">
           <button onClick={() => setSearchOpen(true)} className="relative inline-flex h-9 w-full items-center justify-start rounded-md border border-input bg-muted/50 px-4 py-2 text-sm font-medium text-muted-foreground shadow-sm hover:bg-muted/80 transition-all sm:pr-12 md:w-96 lg:w-[500px]">
            <SearchIcon className="mr-2 h-4 w-4" /> <span>Search...</span>
            <kbd className="pointer-events-none absolute right-1.5 top-1.5 hidden h-6 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex"><span className="text-xs">{isMac ? "⌘" : "Ctrl"}</span>K</kbd>
          </button>
        </div>

        <div className="flex items-center gap-3 min-w-fit">
          <Bb8Toggle checked={darkMode} onChange={setDarkMode} size="5px" />
          <div className="h-6 w-px bg-border/60" />
          <AiPill ai={aiHealth} />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={refreshEverything} disabled={refreshing}><RefreshCw className={cls("h-5 w-5 text-muted-foreground", refreshing && "animate-spin")} /></Button></TooltipTrigger>
              <TooltipContent>Refresh Data</TooltipContent>
            </Tooltip>
            <div className="relative">
              <Tooltip>
                 <TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={() => setSettingsOpen((p) => !p)}><Settings className="h-5 w-5 text-muted-foreground" /></Button></TooltipTrigger>
                 <TooltipContent>Settings</TooltipContent>
              </Tooltip>
              {settingsOpen && (
                <div className="absolute right-0 top-10 z-50 w-64 rounded-md border bg-card p-2 shadow-lg space-y-1 animate-in fade-in zoom-in-95 duration-100">
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground px-2 pt-1">Management</h3>
                  <Button variant="ghost" className="w-full justify-start" onClick={() => { setSettingsOpen(false); setVendorMgrOpen(true); }}><Building className="h-4 w-4 mr-2" /> Manage Vendors</Button>
                  <Button variant="ghost" className="w-full justify-start" onClick={() => { setSettingsOpen(false); setCatMgrOpen(true); }}><Settings className="h-4 w-4 mr-2" /> Manage Categories</Button>
                  <Button variant="ghost" className="w-full justify-start" onClick={() => { setSettingsOpen(false); setIdSettingsOpen(true); }} ><List className="h-4 w-4 mr-2" /> Synergy ID Settings</Button>
                  <Button variant="ghost" className="w-full justify-start" onClick={() => { setSettingsOpen(false); setResetPasswordModalOpen(true); }}><KeyRound className="h-4 w-4 mr-2" /> User Management</Button>
                  <Button variant="ghost" className="w-full justify-start" onClick={() => { setEbayLinkerOpen(false); setEbayLinkerOpen(true); }}><Store className="h-4 w-4 mr-2" /> EBAY Management</Button>
                </div>
              )}
            </div>
          </TooltipProvider>
          {user && <UserProfile user={user} onUpdate={handleUserUpdate} logoutPath="/login/manager" />}
        </div>
      </header>

      <div className="w-full px-6 py-8 flex gap-6 flex-1 overflow-hidden relative">
        <div className={cls("relative flex flex-col z-30 transition-all duration-300 ease-in-out", collapsed ? "w-[72px] items-center py-4 bg-background border-r" : cls("flex-shrink-0", layoutMode === "split" ? "w-full xl:w-4/12" : "w-full lg:w-3/12"))}>
           {collapsed ? (
             <div className="flex flex-col gap-4 items-center w-full sticky top-0 pt-2">
                <button onClick={() => toggleFlyout("workbench")} className={cls("group flex flex-col items-center justify-center gap-1 w-14 h-14 rounded-2xl transition-all duration-200", activeFlyout === "workbench" ? "bg-primary text-primary-foreground shadow-md scale-110" : "text-muted-foreground hover:bg-muted/80 hover:text-foreground")}>
                   <FileText className="h-6 w-6" /> <span className="text-[9px] font-semibold tracking-tight">Work</span>
                </button>
                {activeFlyout === "workbench" && renderFlyout("workbench")}
                
                <button onClick={() => toggleFlyout("stats")} className={cls("group flex flex-col items-center justify-center gap-1 w-14 h-14 rounded-2xl transition-all duration-200", activeFlyout === "stats" ? "bg-primary text-primary-foreground shadow-md scale-110" : "text-muted-foreground hover:bg-muted/80 hover:text-foreground")}>
                   <BarChart3 className="h-6 w-6" /> <span className="text-[9px] font-semibold tracking-tight">Stats</span>
                </button>
                {activeFlyout === "stats" && renderFlyout("stats")}

                <button onClick={() => toggleFlyout("categories")} className={cls("group flex flex-col items-center justify-center gap-1 w-14 h-14 rounded-2xl transition-all duration-200", activeFlyout === "categories" ? "bg-primary text-primary-foreground shadow-md scale-110" : "text-muted-foreground hover:bg-muted/80 hover:text-foreground")}>
                   <Tags className="h-6 w-6" /> <span className="text-[9px] font-semibold tracking-tight">Cats</span>
                </button>
                {activeFlyout === "categories" && renderFlyout("categories")}

                <div className="w-10 h-px bg-border/60 my-2" />
                <button onClick={() => setUploadModalOpen(true)} className="group flex flex-col items-center justify-center gap-1 w-14 h-14 rounded-2xl transition-all duration-200 text-muted-foreground hover:bg-primary/10 hover:text-primary border border-transparent hover:border-primary/20">
                   <Play className="h-5 w-5 fill-current" /> <span className="text-[9px] font-semibold tracking-tight">Upload</span>
                </button>
             </div>
           ) : (
             <div className="h-full flex flex-col space-y-6">
                <WorkbenchList allPOs={allPOs} activePOId={activePO?.id || null} onSelect={setActivePO} onUploadClick={() => setUploadModalOpen(true)} />
                <DashboardStats allPOs={allPOs} vendors={vendors} />
                <CategoryRollup onManageClick={() => setCatMgrOpen(true)} />
             </div>
           )}
        </div>

        <div className="flex-1 flex flex-col overflow-hidden bg-background relative min-w-0">
           {activePO ? (
             <div className="flex-1 overflow-y-auto">
               <div className="space-y-6 pb-12">
                 <Section title={`Lines for Purchase Order ${activePO.po_number}`} icon={<Layers3 className="h-5 w-5 text-primary" />}>
                    <div className="flex justify-start gap-6 text-sm sm:text-base border-t pt-3 mt-2">
                      <div className="font-medium">Total Cost Paid: <span className="font-semibold text-primary ml-2 inline-flex items-center">{linesLoading ? "..." : totals.cost.toLocaleString(undefined, { style: "currency", currency: "USD" })}</span></div>
                      <div className="font-medium">Total Items: <span className="font-semibold text-primary ml-2 inline-flex items-center">{linesLoading ? "..." : totals.items.toLocaleString()}</span></div>
                    </div>

                    <PORollup 
                        profit={profit} 
                        hasActive={!!activePO} 
                        poId={activePO.id} 
                        onRefresh={refreshEverything} 
                        totalCostOverride={totals.cost} 
                        soldCostOverride={totals.soldCost}
                    />

                    <div className="flex justify-between items-center mb-4 border-b pb-4 mt-4">
                      <div className="flex flex-col items-start gap-1">
                        {(() => {
                          const { state, canSend, label, subText } = sendButtonState;
                          const btnClass = state === "ready" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : state === "sending" ? "bg-amber-50 text-amber-700 border-amber-200" : "text-muted-foreground";
                          return (
                             <div className="flex items-center gap-3">
                                <Button onClick={sendToTesters} size="sm" variant={canSend ? "outline" : "ghost"} disabled={!canSend} className={`h-8 text-xs rounded-full border ${btnClass}`}>
                                   {state === "sending" ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin"/> : <Play className="h-3.5 w-3.5 mr-2"/>}
                                   {label}
                                </Button>
                                <span className="text-xs text-muted-foreground">{subText}</span>
                             </div>
                          )
                        })()}
                      </div>

                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}><Pencil className="h-3.5 w-3.5 mr-2"/> Edit PO</Button>
                        <Button size="sm" variant="ghost" onClick={() => setMoveOpen(true)}><ArrowLeftRight className="h-3.5 w-3.5 mr-2"/> Move</Button>
                        <Button size="sm" variant="destructive" onClick={() => setPoToDelete(activePO)}><Trash2 className="h-3.5 w-3.5 mr-2"/> Delete</Button>
                      </div>
                    </div>

                    {activePO && (
                      <React.Suspense fallback={<div className="flex items-center justify-center h-96"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
                        <LinesPanel
                          poId={activePO.id}
                          scrollToLineId={scrollToLineId}
                          refreshKey={refreshKey}
                        />
                      </React.Suspense>
                    )}
                 </Section>
               </div>
             </div>
           ) : (
            <div className="h-full overflow-y-auto bg-background/50 p-6 md:p-10">
              <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                
                {/* 1. Welcome Header */}
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <h2 className="text-3xl font-bold tracking-tight">
                      Welcome back{user?.name ? `, ${user.name.split(' ')[0]}` : ''} 👋
                    </h2>
                    <p className="text-muted-foreground text-lg">
                      Here is what's happening with your inventory today.
                    </p>
                  </div>
                  <div className="hidden md:block">
                     <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-1 rounded">
                       {new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                     </span>
                  </div>
                </div>

                {/* 2. The Stats Widget */}
                <div className="min-h-[200px]">
                  <WeeklyPulse />
                </div>

                {/* 3. Quick Actions */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Quick Actions</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
                  
                    
                    <button 
                      onClick={() => setUploadModalOpen(true)}
                      className="group relative flex flex-col items-start p-6 gap-3 rounded-xl border bg-card hover:bg-muted/50 transition-all hover:shadow-md text-left"
                    >
                      <div className="p-2.5 bg-primary/10 text-primary rounded-lg group-hover:scale-110 transition-transform">
                        <Play className="h-6 w-6" />
                      </div>
                      <div>
                        <div className="font-semibold">Upload New PO</div>
                        <div className="text-sm text-muted-foreground mt-1">Import a spreadsheet to start tracking.</div>
                      </div>
                    </button>

                    <button 
                      onClick={() => setCatMgrOpen(true)}
                      className="group relative flex flex-col items-start p-6 gap-3 rounded-xl border bg-card hover:bg-muted/50 transition-all hover:shadow-md text-left"
                    >
                      <div className="p-2.5 bg-blue-500/10 text-blue-600 rounded-lg group-hover:scale-110 transition-transform">
                        <Tags className="h-6 w-6" />
                      </div>
                      <div>
                        <div className="font-semibold">Manage Categories</div>
                        <div className="text-sm text-muted-foreground mt-1">Organize your inventory structure.</div>
                      </div>
                    </button>

                    <button 
                      onClick={() => setVendorMgrOpen(true)}
                      className="group relative flex flex-col items-start p-6 gap-3 rounded-xl border bg-card hover:bg-muted/50 transition-all hover:shadow-md text-left"
                    >
                      <div className="p-2.5 bg-purple-500/10 text-purple-600 rounded-lg group-hover:scale-110 transition-transform">
                        <Building className="h-6 w-6" />
                      </div>
                      <div>
                        <div className="font-semibold">Manage Vendors</div>
                        <div className="text-sm text-muted-foreground mt-1">Add or update supplier details.</div>
                      </div>
                    </button>

                    <SyniRecommendations 
    insights={syniInsights} 
    onActionClick={handleRecommendationClick}
  />

                  </div>
                </div>

              

              </div>
            </div>
          )}
        </div>
      </div>

      {uploadModalOpen && <UploadPOModal onClose={() => setUploadModalOpen(false)} onSuccess={async (newPOId: string) => { await fetchGlobals(); const newSummary = await apiGet<PurchaseOrderSummary>(`/pos/${newPOId}/summary`); setActivePO(newSummary); }} vendors={vendors} />}
      {catMgrOpen && (
        <CategoryManagerModal 
          open={catMgrOpen} 
          onClose={() => setCatMgrOpen(false)} 
          categories={categories} 
          onCreate={async (l, p, i, c) => { await apiPost("/categories", { label: l, prefix: p, icon: i, color: c }); fetchGlobals(); }} 
          onUpdate={async (id, l, p, i, c) => { await apiPatch(`/categories/${id}`, { label: l, prefix: p, icon: i, color: c }); fetchGlobals(); }} 
          onDelete={async (id) => { await apiDelete(`/categories/${id}`); fetchGlobals(); }} 
        />
      )}
      {vendorMgrOpen && <VendorManager vendors={vendors} onClose={() => setVendorMgrOpen(false)} onUpdate={fetchGlobals} />}
      
      {moveOpen && activePO && (
        <MovePOModal 
          open={moveOpen}
          onClose={() => setMoveOpen(false)}
          poNumber={activePO.po_number}
          currentVendorId={activePO.vendor_id}
          vendors={vendors}
          onMove={async (newId) => {
             await reassignPO(activePO.id, newId);
          }}
        />
      )}

      {editOpen && activePO && (
        <EditPOModal 
          open={editOpen} 
          onClose={() => setEditOpen(false)} 
          po={activePO} 
          vendors={vendors} 
          allowVendorEdit={false} 
          onSaved={async (updates) => {
            setEditOpen(false);
            setActivePO(prev => prev ? { ...prev, ...updates } : prev);
            await refreshEverything();
          }} 
        />
      )}

      <ConfirmDeleteModal 
        open={!!poToDelete}
        onClose={() => setPoToDelete(null)}
        onConfirm={executeDeletePO}
        title="Delete Purchase Order?"
        requireVerification={true}
        description={
          <span>
            Are you sure you want to permanently delete PO <span className="font-mono font-medium text-foreground bg-muted px-1 rounded">{poToDelete?.po_number}</span>?
            <br /><span className="text-red-500 font-medium mt-1 block">All associated lines and inventory items will be removed.</span>
          </span>
        }
        confirmText="Delete PO"
      />

      <SynergyIdSettingsModal open={idSettingsOpen} onClose={() => setIdSettingsOpen(false)} currentUserName={user?.name} />
      <UserManagerModal open={isResetPasswordModalOpen} onClose={() => setResetPasswordModalOpen(false)} managerId={user?.id ?? null} />
      
      {user && <ChatWidget user={user} />}
      {addLineOpen && activePO && <AddLineItemModal poId={activePO.id} onClose={() => setAddLineOpen(false)} onLineAdded={() => { setAddLineOpen(false); setRefreshKey((k) => k + 1); }} />}
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} onPickPO={(po) => { const targetPO = allPOs.find(p => p.id === po.id); if (targetPO) setActivePO(targetPO); setScrollToLineId(null); }} onPickLine={(poId, lineId) => { if (!activePO || activePO.id !== poId) { const targetPO = allPOs.find(p => p.id === poId); if (targetPO) setActivePO(targetPO); } setScrollToLineId(lineId); }} />
      
      <EbayLinkerModal open={ebayLinkerOpen} onClose={() => setEbayLinkerOpen(false)} userId={user?.id || 0} />

      <GlobalLoader loading={poSwitching} label="Loading Purchase Order..." />
      <GlobalLoader loading={exploding} label="Sending items to testers..." />
      <GlobalLoader loading={refreshing} label="Refreshing Data..." />
        {/* 4. Syni Widget (Placed at the bottom) */}
                <SyniWidget 
          insights={syniInsights} 
          onReferenceClick={handleSyniJump}
          userName={user?.name}  // <--- Pass the name here
      />
    </div>
  );
}