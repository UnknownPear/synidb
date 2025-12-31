import React from "react";
import { Virtuoso } from "react-virtuoso";
import { 
  Search, Settings, LayoutGrid, ChevronRight,
  Filter, RefreshCw, Layers, Building, FileText, Tags,
  CheckCircle, AlertCircle, XCircle, Clock, Trash2, ArrowRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Aurora from "@/utils/Aurora";
import { CardRow } from "@/components/tester/TesterCardRow";
import { InventoryLoadingSkeleton } from "@/components/tester/TesterUI";
import { SortControl } from "@/components/ui/SortControl";
import AppTesterIntakeModal from "./appComponents/AppTesterIntakeModal";

// Helper for classes
function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}

export default function AppTesterDashboard(props: any) {
  const {
    // Data
    currentUser, stats, rows, filteredRows, categories, pos, poGroups, groupedPOs,
    draft, intakeOpen, // Received from parent
    // State
    viewMode, selectedCategory, selectedPoId, selectedPoSubId, statusFilter, 
    searchQuery, sidebarSearch, loadingRows, refreshing, dbConnected, savingRows,
    scanStatus, scannedIdDisplay, expandedVendors, sortConfig,
    // Functions
    setters, actions, filteredCategories
  } = props;

  // Premium Dark Palette
  const pal = {
    bg: "bg-[#09090b]", 
    sidebar: "bg-[#0F1115]/95 border-white/5",
    header: "bg-[#0F1115]/80 border-white/5",
    textMain: "text-white",
    textMuted: "text-slate-400",
    border: "border-white/5"
  };

  return (
    <>
      {/* --- CUSTOM SCROLLBAR CSS --- */}
      <style>{`
        .custom-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scroll::-webkit-scrollbar-track { background: transparent; }
        .custom-scroll::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
        .custom-scroll::-webkit-scrollbar-thumb:hover { background: #475569; }
        .no-scroll::-webkit-scrollbar { display: none; }
        .no-scroll { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      <div className={`flex h-screen w-full overflow-hidden font-sans select-none text-white ${pal.bg}`}>
        
        {/* Activity Bar (Floating) */}
        <div className="fixed top-0 left-0 right-0 z-[1000] pointer-events-none">
          {(loadingRows || refreshing || savingRows) && (
             <div className="h-0.5 w-full bg-indigo-500/50 animate-pulse" />
          )}
        </div>

        {/* --- SIDEBAR --- */}
        <aside className={`flex w-64 flex-shrink-0 flex-col border-r backdrop-blur-xl transition-all ${pal.sidebar}`}>
          
          {/* App Header */}
          <div className="flex shrink-0 items-center gap-3 px-5 py-6 opacity-90">
            <div className="h-8 w-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
              <LayoutGrid className="h-4 w-4 text-indigo-400" />
            </div>
            <div className="min-w-0">
              <div className="font-bold tracking-tight text-sm text-white truncate">Tester View</div>
              <div className="text-[10px] text-slate-500 font-medium truncate">Synergy Systems</div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-2 px-3 mb-4 shrink-0">
            <div className="bg-white/5 border border-white/5 rounded-lg p-2 text-center hover:bg-white/10 transition-colors cursor-default">
              <div className="text-emerald-400 font-bold text-lg">{stats?.ready || 0}</div>
              <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Ready</div>
            </div>
            <div className="bg-white/5 border border-white/5 rounded-lg p-2 text-center hover:bg-white/10 transition-colors cursor-default">
              <div className="text-amber-400 font-bold text-lg">{stats?.incomplete || 0}</div>
              <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Queue</div>
            </div>
          </div>

          {/* Nav Tabs */}
          <div className="px-3 mb-2 shrink-0">
             <div className="grid grid-cols-2 bg-white/5 p-1 rounded-lg border border-white/5">
                <button onClick={() => { setters.setViewMode("po"); setters.setSelectedCategory(""); }} className={cn("py-1.5 text-[10px] font-bold uppercase tracking-wide rounded-md transition-all", viewMode === "po" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-white")}>Shipments</button>
                <button onClick={() => { setters.setViewMode("category"); setters.setSelectedPoId(""); }} className={cn("py-1.5 text-[10px] font-bold uppercase tracking-wide rounded-md transition-all", viewMode === "category" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-white")}>Categories</button>
             </div>
          </div>

          {/* Search */}
          <div className="px-3 pb-2 shrink-0">
             <div className="relative">
               <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
               <input placeholder="Filter..." value={sidebarSearch} onChange={(e) => setters.setSidebarSearch(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg pl-8 pr-2 py-1.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50" />
             </div>
          </div>

          {/* List Content */}
          <div className="flex-1 overflow-y-auto custom-scroll px-2 space-y-0.5 pb-4">
             {viewMode === "category" ? (
                filteredCategories.map((c: any) => (
                  <button key={c.id} onClick={() => setters.setSelectedCategory(c.label)} className={cn("w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors group", selectedCategory === c.label ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/20" : "text-slate-400 hover:bg-white/5 hover:text-slate-200")}>
                    <span className="truncate">{c.label}</span>
                    {c.total_units && <span className={cn("px-1.5 py-0.5 rounded text-[9px] min-w-[20px] text-center", selectedCategory === c.label ? "bg-indigo-500/30 text-white" : "bg-black/40 text-slate-500")}>{c.total_units}</span>}
                  </button>
                ))
             ) : (
                groupedPOs.map(([vendor, list]: any) => (
                  <div key={vendor} className="mb-1">
                    <button onClick={() => actions.handleVendorToggle(vendor)} className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold text-slate-500 hover:text-slate-300 uppercase tracking-wider mt-2">
                      <Building className="h-3 w-3" /> <span className="truncate">{vendor}</span>
                    </button>
                    {(expandedVendors[vendor] || sidebarSearch) && (
                      <div className="ml-2 pl-2 border-l border-white/5 space-y-0.5 mt-1">
                        {list.map((po: any) => {
                           const isActive = selectedPoId === po.id;
                           const groups = poGroups[po.id] || [];
                           const hasInventory = (po.inventory_count || 0) > 0;
                           return (
                            <div key={po.id}>
                              <button onClick={(e) => actions.handlePoClick(e, po.id)} className={cn("w-full text-left px-3 py-2.5 rounded-lg text-xs transition-all border border-transparent", isActive ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-300" : "text-slate-400 hover:bg-white/5")}>
                                <div className="font-mono font-medium tracking-tight flex justify-between">
                                  <span>{po.po_number}</span>
                                  {!hasInventory && <Clock className="h-3 w-3 text-amber-500/70" />}
                                </div>
                                <div className="flex justify-between mt-1 opacity-50 text-[10px]">
                                  <span>{new Date(po.created_at).toLocaleDateString()}</span>
                                </div>
                              </button>
                              {isActive && hasInventory && (
                                <div className="ml-2 pl-2 border-l border-white/10 mt-1 space-y-0.5">
                                   <button onClick={(e) => actions.handlePoSubClick(e, po.id, "")} className={cn("w-full text-left px-2 py-1.5 rounded text-[10px] flex justify-between", !selectedPoSubId ? "text-indigo-300 bg-white/5" : "text-slate-500 hover:text-slate-300")}>
                                     <span>View All</span> <Layers className="h-3 w-3 opacity-50"/>
                                   </button>
                                   {groups.map((g: any) => (
                                      <button key={g.category_id} onClick={(e) => actions.handlePoSubClick(e, po.id, g.category_id)} className={cn("w-full text-left px-2 py-1.5 rounded text-[10px] flex justify-between", selectedPoSubId === g.category_id ? "text-indigo-300 bg-white/5" : "text-slate-500 hover:text-slate-300")}>
                                         <span className="truncate max-w-[80px]">{g.label}</span> <span className="opacity-50">{g.units}</span>
                                      </button>
                                   ))}
                                </div>
                              )}
                            </div>
                           )
                        })}
                      </div>
                    )}
                  </div>
                ))
             )}
          </div>
        </aside>

        {/* --- MAIN CONTENT AREA --- */}
        <main className="flex flex-1 flex-col h-full overflow-hidden bg-slate-950 relative min-w-0">
          
          {/* Subtle Aurora Background */}
          <div className="absolute inset-0 z-0 pointer-events-none opacity-20">
             <Aurora colorStops={["#1E293B", "#312E81", "#0F172A"]} amplitude={0.3} speed={0.2} />
          </div>

          {/* HEADER (Responsive & Fixed Overflow) */}
          <header className={`relative z-10 flex flex-col md:flex-row md:items-center justify-between px-6 py-4 backdrop-blur-xl border-b gap-4 ${pal.header}`}>
             
             {/* Left: Title & Status Filters */}
             <div className="flex items-center gap-4 min-w-0 flex-1 overflow-hidden">
                <div className="flex flex-col min-w-0">
                   <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                      {statusFilter} <ChevronRight className="h-3 w-3" />
                   </div>
                   <div className="text-xl font-bold text-white flex items-center gap-3 truncate">
                      <span className="truncate">
                        {viewMode === "po" && selectedPoId 
                          ? pos.find((p: any) => p.id === selectedPoId)?.po_number 
                          : selectedCategory || "All Inventory"
                        }
                      </span>
                      <span className="bg-white/10 text-slate-300 px-2 py-0.5 rounded-full text-xs font-medium border border-white/5 shrink-0">{filteredRows.length}</span>
                   </div>
                </div>
                
                <div className="h-8 w-px bg-white/10 hidden md:block shrink-0" />
                
                {/* Status Filters - SCROLLABLE CONTAINER (Fixes Cutoff) */}
                <div className="flex-1 overflow-x-auto no-scroll flex items-center gap-1 mask-linear-fade">
                  <div className="flex gap-1 bg-black/20 p-1 rounded-lg border border-white/5 shrink-0">
                     {['ALL', 'INCOMPLETE', 'READY', 'SCRAP'].map((s) => (
                        <button key={s} onClick={() => setters.setStatusFilter(s)} className={cn("px-3 py-1 text-[10px] font-bold rounded-md transition-all uppercase whitespace-nowrap", statusFilter === s ? "bg-white/15 text-white shadow-sm border border-white/5" : "text-slate-500 hover:text-slate-300")}>
                          {s}
                        </button>
                     ))}
                  </div>
                </div>
             </div>

             {/* Right: Search & Controls */}
             <div className="flex items-center gap-3 shrink-0">
               <div className="relative group">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                 <input 
                   placeholder="Quick search..." 
                   value={searchQuery} 
                   onChange={e => setters.setQuery(e.target.value)} 
                   className="w-40 md:w-64 bg-black/40 border border-white/10 rounded-full pl-9 pr-4 py-2 text-xs text-white focus:border-indigo-500/50 focus:outline-none focus:bg-black/60 transition-all" 
                 />
               </div>
               
               <div className="flex items-center gap-1 bg-white/5 p-1 rounded-lg border border-white/5">
                  <SortControl config={sortConfig} onChange={setters.setSortConfig} variant="minimal" />
                  <div className="w-px h-4 bg-white/10 mx-1" />
                  <Button size="icon" variant="ghost" className="h-7 w-7 rounded-md text-slate-400 hover:bg-white/10 hover:text-white" onClick={actions.handleManualRefresh}>
                    <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 rounded-md text-slate-400 hover:bg-white/10 hover:text-white" onClick={() => setters.setSettingsOpen(true)}>
                    <Settings className="h-3.5 w-3.5" />
                  </Button>
               </div>
             </div>
          </header>

          {/* Scan Status Banner */}
          {scanStatus !== 'idle' && (
            <div className={`absolute top-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2 rounded-full border shadow-2xl backdrop-blur-md animate-in slide-in-from-top-2 ${
              scanStatus === 'success' ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-200" : 
              scanStatus === 'error' ? "bg-red-500/20 border-red-500/30 text-red-200" : 
              "bg-blue-500/20 border-blue-500/30 text-blue-200"
            }`}>
              {scanStatus === 'scanning' && <Loader2 className="h-4 w-4 animate-spin" />}
              {scanStatus === 'success' && <CheckCircle className="h-4 w-4" />}
              {scanStatus === 'error' && <XCircle className="h-4 w-4" />}
              <span className="text-xs font-bold tracking-wide">
                {scanStatus === 'scanning' ? "SCANNING..." : scanStatus === 'success' ? `FOUND: ${scannedIdDisplay}` : "NOT FOUND"}
              </span>
            </div>
           )}

          {/* Virtualized List */}
          <div className="flex-1 p-0 overflow-hidden relative z-0">
             {loadingRows && rows.length === 0 ? <div className="p-10 opacity-50"><InventoryLoadingSkeleton /></div> :
               <Virtuoso
                 className="custom-scroll"
                 style={{ height: "100%" }}
                 data={filteredRows}
                 itemContent={(_, row) => {
                   const statusUpper = (row.status || "").toUpperCase();
                   const isScrap = statusUpper.includes("SCRAP") || statusUpper.includes("SCRAPPED");
                   return (
                     <div className={cn("px-4 md:px-6 py-2 border-b border-white/5 hover:bg-white/[0.03] transition-colors relative group", isScrap && "opacity-60 grayscale")}>
                        <CardRow
                          row={row}
                          onRecordPrint={actions.recordPrintForRow}
                          onEdit={(id) => actions.openIntake(row)}
                          onWorkspace={actions.createWorkspaceFromRow}
                          denseMode={true} // Force dense in App Mode
                          showSpecsInline={true}
                          style={{ background: 'transparent', border: 'none', padding: 0 }}
                        />
                        {isScrap && <div className="absolute right-10 top-1/2 -translate-y-1/2 text-[10px] font-bold text-red-500 border border-red-900/50 bg-red-950/30 px-2 py-0.5 rounded tracking-widest">SCRAP</div>}
                     </div>
                   );
                 }}
                 endReached={() => actions.loadMore()}
               />
             }
          </div>
        </main>
        
        {/* --- PREMIUM APP MODAL INTEGRATION --- */}
        {draft && (
           <AppTesterIntakeModal 
              open={intakeOpen} 
              row={draft} 
              user={currentUser} 
              onClose={() => setters.setIntakeOpen(false)} 
              onSave={actions.saveDraft} // Ensure saveDraft action is passed
           />
        )}
      </div>
    </>
  );
}