import * as React from "react";
import { useVirtualizer } from '@tanstack/react-virtual';
import { API_BASE, cls } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import TesterIntakeModal from "@/components/TesterIntakeModal";

import { Badge } from "@/components/ui/badge"; 
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

import {
  ArrowUpDown, LayoutGrid, ChevronUp, ChevronDown, 
  BadgeCheck, Loader2, Pencil, Plus, Search, Tags, Trash2, X, BarChart3, 
  CheckCircle2, Download, Maximize2, List, ExternalLink, Filter, Layers, BoxSelect,
  FolderOpen, ChevronRight, MessageSquare, Wrench, PackageCheck,
  Cpu, StickyNote, MemoryStick, Database, Images, Minimize2, Split
} from "lucide-react";

import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

// Internal Components & Helpers
import { fetchJson, cleanCpuString, money, normalizeBrief } from "./utils";
import { POLine, Category, BriefRow, GroupNode } from "./types";
import { RoundCheck, CategorySelector } from "./SharedComponents";
import { StatusBadge, StatusMeta } from "./StatusBadge"; 
import LineCard from "./LineCard";
import BulkStatusModal from "./BulkStatusModal";

import GlobalLoader from "@/components/ui/GlobalLoader";
import AddLineItemModal from "@/components/manager/AddLineItemModal"; 
import ConfirmDeleteModal from "@/components/manager/ConfirmDeleteModal";
import AssignCategoryModal from "./AssignCategoryModal"; 
import BulkEditLinesModal from "./BulkEditLinesModal";
import EditLineModal from "./EditLineModal"; 

type Props = {
  poId: string;
  apiBase?: string;
  refreshKey?: number;
  categories?: Category[];
  onLinesLoaded?: (lines: POLine[]) => void;
  scrollToLineId?: string | null;
};

export default function LinesPanel({
  poId,
  apiBase = API_BASE,
  refreshKey = 0,
  categories: categoriesProp,
  onLinesLoaded,
  scrollToLineId,
}: Props) {
  const [viewMode, setViewMode] = React.useState<'list' | 'grid'>('list');
  const [isGrouped, setIsGrouped] = React.useState(false);
  const [expandedGroups, setExpandedGroups] = React.useState<Record<string, boolean>>({});

  // Filters
  const [q, setQ] = React.useState("");
  const [filterCat, setFilterCat] = React.useState("");
  const [onlyUnassigned, setOnlyUnassigned] = React.useState(false);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [filterStatus, setFilterStatus] = React.useState<string>(""); 

  const [testerModalOpen, setTesterModalOpen] = React.useState(false);
  const [testerRow, setTesterRow] = React.useState<any>(null);
  const [user, setUser] = React.useState<{id: number, name: string} | null>(null);

  const [internalScrollToLineId, setInternalScrollToLineId] = React.useState<string | null>(null);
  const [lines, setLines] = React.useState<POLine[]>([]);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [loading, setLoading] = React.useState(false);

  const [rowBrief, setRowBrief] = React.useState<Record<string, BriefRow>>({});

  const autoRefreshed = React.useRef(new Set<string>());

  // Selection
  const [selected, setSelected] = React.useState<Record<string, boolean>>({});
  const selIds = React.useMemo(() => Object.keys(selected).filter((k) => selected[k]), [selected]);

  // Bulk category
  const [assignOpen, setAssignOpen] = React.useState(false);

  // Status modal
  const [statusModalOpen, setStatusModalOpen] = React.useState(false);

  // Inline editing
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingVal, setEditingVal] = React.useState<Partial<POLine>>({});

  const [bulkEditOpen, setBulkEditOpen] = React.useState(false);
  const [bulkInitialValues, setBulkInitialValues] = React.useState<Partial<POLine>>({});

  const [addOpen, setAddOpen] = React.useState(false);

  const tableRef = React.useRef<HTMLTableElement | null>(null);
  const bodyScrollRef = React.useRef<HTMLDivElement | null>(null);
  const [flashId, setFlashId] = React.useState<string | null>(null);

  const [categoryDirty, setCategoryDirty] = React.useState(false);
  const [density, setDensity] = React.useState<'compact' | 'normal'>('normal');

  // Stable ref for parent callback
  const onLinesLoadedRef = React.useRef(onLinesLoaded);
  React.useEffect(() => {
    onLinesLoadedRef.current = onLinesLoaded;
  }, [onLinesLoaded]);

  React.useEffect(() => {
    if (scrollToLineId) {
      setInternalScrollToLineId(scrollToLineId);
    }
  }, [scrollToLineId]);

  const [busyState, setBusyState] = React.useState<{ active: boolean; text: string; progress?: number | null }>({ 
    active: false, 
    text: "", 
    progress: null 
  });

  const handleTesterSave = () => {
    setTesterModalOpen(false);
    refreshBrief(); 
  };

  const handleOpenTesterUI = async (synergyId: string) => {
    setBusyState({ active: true, text: "Loading Item Details..." });
    try {
      const res = await fetchJson<any>(`${apiBase}/rows?q=${encodeURIComponent(synergyId)}&limit=1`);
      const rowData = Array.isArray(res) ? res[0] : (res?.items?.[0] || null);
      
      if (rowData) {
        setTesterRow(rowData);
        setTesterModalOpen(true);
      } else {
        alert("Could not find inventory record.");
      }
    } catch (e) {
      alert("Error fetching item details: " + String(e));
    } finally {
      setBusyState({ active: false, text: "" });
    }
  };

  type SortKey = "product" | "category" | "synergy" | "qty" | "unit" | "msrp";
  type SortDir = "asc" | "desc";

  const [sort, setSort] = React.useState<{ key: SortKey | null; dir: SortDir }>({
    key: null,
    dir: "asc",
  });

  const toggleSort = (key: SortKey) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  };

  const sortIconFor = (key: SortKey) => {
    if (sort.key !== key) return <ArrowUpDown className="h-3.5 w-3.5 opacity-60" />;
    return sort.dir === "asc" ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />;
  };

  const getString = (v: unknown) => (v == null ? "" : String(v).trim());
  const getNumber = (v: unknown) => {
    if (typeof v === "number") return v;
    const n = Number(String(v ?? "").replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };

  const synergySuffixNum = (sid?: string | null): number => {
    if (!sid) return Number.NaN;
    const s = String(sid).trim();
    let m = s.match(/^[A-Za-z0-9]+[-\s]?(\d+)$/);
    if (m) return parseInt(m[1], 10);
    m = s.match(/(\d+)\s*$/);
    return m ? parseInt(m[1], 10) : Number.NaN;
  };

  const getValue = (line: any, key: SortKey) => {
    switch (key) {
      case "product": return getString(line.product_name_raw);
      case "category": return getString(line.category_label ?? line.category_name ?? line.category ?? line.category_id ?? "");
      case "synergy": return synergySuffixNum(line.synergy_id ?? line.synergyId ?? null);
      case "qty": return getNumber(line.qty);
      case "unit": return getNumber(line.unit_cost ?? line.cost ?? line.price_paid);
      case "msrp": return getNumber(line.msrp ?? line.msrp_price ?? line.msrp_usd);
      default: return "";
    }
  };

  async function markPartsArrived(lineId: string) {
    setBusyState({ active: true, text: "Updating..." });
    try {
        await fetchJson(`${apiBase}/rows/${encodeURIComponent(lineId)}`, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ partStatus: 'ARRIVED' }), 
        });
        
        await refreshBrief();
    } catch (e) {
        alert("Failed: " + String(e));
    } finally {
        setBusyState({ active: false, text: "" });
    }
  }

  const status = React.useMemo(() => {
    const arr = lines || [];
    const total = arr.length;
    const uncategorized = arr.filter((l) => !l.category_id).length;
    const unminted = arr.filter((l) => !!l.category_id && !l.synergy_id).length;
    const allAssigned = total > 0 && uncategorized === 0 && unminted === 0;

    let labelNodes: React.ReactNode;

    if (allAssigned) {
      labelNodes = <span className="text-emerald-600 font-semibold">All {total} lines ready</span>;
    } else if (uncategorized > 0) {
      labelNodes = (
        <>
          <span className="text-rose-600 font-semibold">{uncategorized} / {total} lines unassigned</span>
          {unminted > 0 && <span className="text-amber-600"> • {unminted} need IDs</span>}
        </>
      );
    } else {
      labelNodes = <span className="text-amber-600 font-semibold">{unminted} / {total} lines need IDs</span>;
    }

    return { total, uncategorized, unminted, allAssigned, labelNodes };
  }, [lines]);

  // Load lines
  const loadLines = React.useCallback(async () => {
    setLoading(true);
    let alive = true;

    try {
      const data = await fetchJson<any>(
        `${apiBase}/pos/${encodeURIComponent(poId)}/lines`,
        { credentials: "include", headers: { Accept: "application/json" } }
      );

      if (!alive) return;

      const raw = Array.isArray(data) ? data : (data as any)?.rows || [];

      const normalized: POLine[] = raw.map((d: any) => ({
        ...d,
        product_name_raw: d.product_name_raw ?? "",
        synergy_id: d.synergy_id ?? d.synergyId ?? null,
        qty: Number(d.qty ?? 1),
        isAwaitingParts: !!d.isAwaitingParts,
      }));

      setLines(normalized);
      onLinesLoadedRef.current?.(normalized);
    } catch (e) {
      console.error("loadLines failed", e);
      if (alive) {
        setLines([]);
        onLinesLoadedRef.current?.([]);
      }
    } finally {
      if (alive) setLoading(false);
    }

    return () => { alive = false; };
  }, [poId, apiBase]);

  // Load categories
  const loadCategories = React.useCallback(async () => {
    if (categoriesProp) return;
    try {
      const data = await fetchJson<Category[]>(`${apiBase}/categories`, { credentials: "include" });
      setCategories(data || []);
    } catch (e) {
      console.error("loadCategories failed", e);
    }
  }, [apiBase, categoriesProp]);

  // SINGLE DATA LOADING EFFECT — NO INFINITE LOOP
  React.useEffect(() => {
    const cleanup = loadLines();
    loadCategories();

    return () => {
      cleanup.then(fn => fn && fn());
    };
  }, [poId, refreshKey, loadLines, loadCategories]);

  const effectiveCategories = categoriesProp || categories;

  // Compute synergy IDs for brief fetching
  const synergyIds = React.useMemo(() => 
    lines
      .map(l => l.synergy_id)
      .filter(Boolean) as string[],
    [lines]
  );

  const synergySig = React.useMemo(() => synergyIds.join(","), [synergyIds]);

  // Refresh inventory briefs (status, thumbnail, eBay data, etc.)
  const refreshBrief = React.useCallback(async () => {
    if (synergyIds.length === 0) {
      setRowBrief({});
      return;
    }

    const base = apiBase.replace(/\/+$/, "");
    try {
      const arr = await fetchJson<any[]>(`${base}/rows/brief`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: synergyIds }),
      });

      const map: Record<string, BriefRow> = {};
      (arr || []).forEach((raw) => {
        const b = normalizeBrief(raw);
        if (b) map[b.synergyId] = b;
      });
      setRowBrief(map);
    } catch (err) {
      console.error("Failed to refresh briefs", err);
      setRowBrief({});
    }
  }, [apiBase, synergyIds]);

  // Trigger brief refresh whenever synergy IDs change (after lines load)
  React.useEffect(() => {
    refreshBrief();
  }, [refreshBrief]);

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    const isDigits = /^\d+$/.test(needle);
    let arr = [...lines];

    if (needle) {
      arr = arr.filter((d) => {
        const baseMatch = [d.product_name_raw, d.upc, d.asin, d.synergy_id]
          .map((x) => String(x || "").toLowerCase())
          .some((s) => s.includes(needle));

        if (!isDigits) return baseMatch;

        const suf = synergySuffixNum(d.synergy_id);
        return baseMatch || (Number.isFinite(suf) && String(suf).includes(needle));
      });
    }

    if (filterCat) arr = arr.filter((d) => String(d.category_id || "") === filterCat);
    if (onlyUnassigned) arr = arr.filter((d) => !d.category_id);

    if (filterStatus) {
      arr = arr.filter((line) => {
        if (!line.synergy_id) return filterStatus === "INTAKE";
        const brief = rowBrief[line.synergy_id];
        const currentStatus = brief?.status || "INTAKE";
        return currentStatus === filterStatus;
      });
    }

    return arr;
  }, [lines, q, filterCat, onlyUnassigned, rowBrief, filterStatus]);

  const totals = React.useMemo(() => {
    const units = (lines || []).reduce((a, l) => a + (l.qty ?? 1), 0);
    const cost = (lines || []).reduce((a, l) => a + (Number(l.unit_cost ?? 0) * (l.qty ?? 1)), 0);
    const msrpGross = (lines || []).reduce((a, l) => a + (Number(l.msrp ?? 0) * (l.qty ?? 1)), 0);
    return { units, cost, msrpGross };
  }, [lines]);

  const [deleteState, setDeleteState] = React.useState<{ type: 'single', id: string } | { type: 'bulk' } | null>(null);

  function fmtMoney(n: number) {
    return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
  }

  const toggleRow = React.useCallback((id: string, v?: boolean) => {
    setSelected((prev) => ({ 
        ...prev, 
        [id]: typeof v === "boolean" ? v : !prev[id] 
    }));
  }, []);

  async function bulkAssign(targetId: string) {
    if (!targetId || !selIds.length) return;
    setBusyState({ active: true, text: "Assigning Categories..." });
    try {
      await fetchJson(`${apiBase}/pos/lines/bulk_category`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ line_ids: selIds, category_id: targetId }),
      });
      setSelected({});
      setCategoryDirty(true);
      await loadLines();
    } finally {
      setAssignOpen(false);
      setBusyState({ active: false, text: "" });
    }
  }

  const updateLineCategory = React.useCallback(async (lineId: string, categoryId: string | null) => {
    await fetchJson(`${apiBase}/pos/lines/bulk_category`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ line_ids: [lineId], category_id: categoryId }),
    });
    setCategoryDirty(true);
    await loadLines();
  }, [apiBase, loadLines]);

  async function saveLine(lineId: string, values: Partial<POLine>) {
    const payload: any = {
      product_name_raw: (values.product_name_raw || "").trim() || null,
      upc: (values.upc || "").trim() || null,
      qty: Number(values.qty ?? 1) || 1,
      unit_cost: values.unit_cost != null ? Number(values.unit_cost) : null,
      msrp: values.msrp != null ? Number(values.msrp) : null,
    };
    if (!payload.product_name_raw) return setEditingId(null);
    try {
      await fetchJson(`${apiBase}/pos/lines/${encodeURIComponent(lineId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      // ignore
    }
    setEditingId(null);
    setEditingVal({});
    await loadLines();
  }

  async function saveBulkEdit(updates: Partial<POLine>) {
    if (!selIds.length) return;
    setBusyState({ active: true, text: "Updating Lines..." }); 
    try {
      await fetchJson(`${apiBase}/pos/lines/bulk_update`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ line_ids: selIds, updates }),
      });
      setSelected({});
      await loadLines();
    } catch (e) {
      alert("Failed to update lines: " + String(e));
    } finally {
      setBusyState({ active: false, text: "" }); 
      setBulkEditOpen(false);
    }
  }

  async function saveBulkStatus(status: string | null, comment: string | null, price: string | null, url: string | null) {
    if (!selIds.length) return;
    const updates: any = {};
    if (status) updates.status = status;
    if (comment) updates.tester_comment = comment;
    if (price) updates.ebay_price = parseFloat(price);
    if (url) updates.ebay_item_url = url;

    if (Object.keys(updates).length === 0) return;

    setBusyState({ active: true, text: "Updating Status & Details..." });
    try {
      await fetchJson(`${apiBase}/pos/lines/bulk_update`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ line_ids: selIds, updates }),
      });
      setSelected({});
      await loadLines();
      await refreshBrief();
      window.dispatchEvent(new CustomEvent("rows:bulk_upserted"));
    } catch (e) {
      alert("Failed to update: " + String(e));
    } finally {
      setBusyState({ active: false, text: "" });
    }
  }

  async function executeDelete() {
    if (!deleteState) return;

    if (deleteState.type === 'single') {
      await fetchJson(`${apiBase}/pos/lines/${encodeURIComponent(deleteState.id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      await loadLines();
    } 
    else if (deleteState.type === 'bulk') {
      const total = selIds.length;
      setBusyState({ active: true, text: "Deleting lines...", progress: 0 }); 
      try {
        for (let i = 0; i < total; i++) {
          const lineId = selIds[i];
          await fetchJson(`${apiBase}/pos/lines/${encodeURIComponent(lineId)}`, {
            method: "DELETE",
            credentials: "include",
          });
          setBusyState(prev => ({ ...prev, progress: ((i + 1) / total) * 100 }));
        }
        setSelected({});
        await loadLines();
      } catch (e) {
        alert("Failed to delete lines: " + String(e));
      } finally {
        setBusyState({ active: false, text: "", progress: null });
      }
    }
  }

  const canMintSelected = React.useMemo(() => {
    if (selIds.length === 0) return false;
    const selectedLines = lines.filter(l => selIds.includes(l.id));
    return selectedLines.every(l => !l.synergy_id);
  }, [selIds, lines]);

  const splitLine = React.useCallback(async (lineId: string) => {
    const line = lines.find((l) => l.id === lineId);
    if (!line || (line.qty ?? 1) <= 1) return;

    const totalQty = line.qty ?? 1;
    if (!confirm(`Split line "${line.product_name_raw || "unnamed"}" with qty ${totalQty} into ${totalQty} individual lines?`)) return;

    let completed = 0;
    const totalOps = totalQty; 

    setBusyState({ active: true, text: "Splitting line...", progress: 0 });

    try {
        const newLinesCount = totalQty - 1;
        const newLinesPayloads = Array.from({ length: newLinesCount }, () => ({
        product_name_raw: line.product_name_raw,
        upc: line.upc ?? null,
        asin: line.asin ?? null,
        qty: 1,
        unit_cost: line.unit_cost ?? null,
        msrp: line.msrp ?? null,
        category_id: line.category_id ?? null,
        synergy_id: line.synergy_id ?? null,
        }));

        await fetchJson(`${apiBase}/pos/lines/${encodeURIComponent(lineId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qty: 1 }),
        });
        completed++;
        setBusyState(prev => ({ ...prev, progress: (completed / totalOps) * 100 }));

        for (const payload of newLinesPayloads) {
        await fetchJson(`${apiBase}/pos/${encodeURIComponent(poId)}/lines`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        completed++;
        setBusyState(prev => ({ ...prev, progress: (completed / totalOps) * 100 }));
        }

        await loadLines();
    } catch (e) {
        alert("Failed to split line: " + String(e));
    } finally {
        setBusyState({ active: false, text: "", progress: null });
    }
  }, [lines, apiBase, poId, loadLines]);

  async function mintSelected() {
    if (!selIds.length) return alert("Select at least one line.");
    setBusyState({ active: true, text: "Minting Synergy IDs..." }); 
    try {
      await fetchJson(`${apiBase}/pos/${encodeURIComponent(poId)}/mint_synergy`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ line_ids: selIds, use_line_categories: true }),
      });
      setSelected({});
      await loadLines();
    } catch (e: any) {
      alert("Minting failed: " + e.message);
    } finally {
      setBusyState({ active: false, text: "" });
    }
  }

  // Virtualizer
  const parentRef = bodyScrollRef;

  const groupedData = React.useMemo(() => {
    if (!isGrouped) return filtered;
    // Your original grouping logic (if any) goes here
    return filtered;
  }, [filtered, isGrouped]);

  const rowVirtualizer = useVirtualizer({
    count: groupedData.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => (density === 'compact' ? 64 : 96),
    overscan: 5,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  const allChecked = filtered.length > 0 && filtered.every(l => selected[l.id]);
  const someChecked = filtered.some(l => selected[l.id]) && !allChecked;

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleGroupSelection = (items: POLine[]) => {
    setSelected(prev => {
      const next = { ...prev };
      const allSelected = items.every(i => prev[i.id]);
      items.forEach(i => next[i.id] = !allSelected);
      return next;
    });
  };

  // Handlers for card actions
  const handleCardEdit = (id: string) => setEditingId(id);
  const handleCardCategoryChange = (id: string, catId: string | null) => updateLineCategory(id, catId);
  const handleCardMint = (id: string) => mintSelected();
  const handleCardSplit = (id: string) => splitLine(id);
  const handleCardDelete = (id: string) => setDeleteState({ type: 'single', id });
  const handleCardToggle = (id: string) => toggleRow(id);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Button variant={viewMode === 'list' ? "default" : "outline"} size="sm" onClick={() => setViewMode('list')}>
            <List className="h-4 w-4 mr-1" /> List
          </Button>
          <Button variant={viewMode === 'grid' ? "default" : "outline"} size="sm" onClick={() => setViewMode('grid')}>
            <LayoutGrid className="h-4 w-4 mr-1" /> Grid
          </Button>
          <Button variant="outline" size="sm" onClick={() => setFiltersOpen(true)}>
            <Filter className="h-4 w-4 mr-1" /> Filters
          </Button>
        </div>
        <div className="text-sm text-muted-foreground">
          {status.labelNodes}
        </div>
      </div>

      {/* Filters Modal - FULLY RESTORED */}
      {filtersOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center" onClick={() => setFiltersOpen(false)}>
          <div className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-primary/10 text-primary"><Filter className="h-4 w-4" /></div>
                <h3 className="font-semibold">Filter Lines</h3>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setFiltersOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground ml-1">Search</label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-9 h-10 bg-muted/20 border-muted-foreground/20" placeholder="Product, UPC, ID..." value={q} onChange={e => setQ(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground ml-1">Category</label>
                  <select className="w-full h-10 rounded-md border border-muted-foreground/20 bg-muted/20 px-3 text-sm" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
                    <option value="">All Categories</option>
                    {effectiveCategories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground ml-1">Item Status</label>
                  <select className="w-full h-10 rounded-md border border-muted-foreground/20 bg-muted/20 px-3 text-sm" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                    <option value="">All Statuses</option>
                    <option value="INTAKE">Intake</option>
                    <option value="TESTED">Tested</option>
                    <option value="POSTED">Posted</option>
                    <option value="SOLD">Sold</option>
                    <option value="SCRAP">Scrap</option>
                  </select>
                </div>
              </div>
              <div className="pt-2 border-t">
                <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted cursor-pointer transition-colors">
                  <RoundCheck checked={onlyUnassigned} onChange={setOnlyUnassigned} />
                  <span className="text-sm font-medium">Show unassigned lines only</span>
                </label>
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <Button variant="ghost" onClick={() => { setQ(""); setFilterCat(""); setFilterStatus(""); setOnlyUnassigned(false); }}>Clear All</Button>
                <Button onClick={() => setFiltersOpen(false)}>Done</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading && <div className="absolute right-1/2 top-1/2 -translate-y-1/2"><Loader2 className="animate-spin h-5 w-5 text-primary" /></div>}

      <div className="min-h-[500px]">
        {viewMode === 'list' ? (
          <div className="rounded-xl border bg-card overflow-hidden">
            <table ref={tableRef} className="w-full text-sm table-fixed [&>thead>tr>th]:align-middle">
              <colgroup>
                <col style={{ width: 48 }} />
                <col style={{ width: '40%' }} />
                <col style={{ width: 176 }} />
                <col style={{ width: 140 }} />
                <col style={{ width: 80 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 80 }} />
              </colgroup>
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="w-12 p-3">
                    <RoundCheck checked={allChecked} indeterminate={someChecked} label="Select all" onChange={(v) => { const next: Record<string, boolean> = { ...selected }; filtered.forEach((l) => (next[l.id] = v)); setSelected(next); }} />
                  </th>
                  <th className="px-3 py-2 text-left">
                    <div className="flex items-center gap-1">
                      <span className="font-semibold text-foreground">Product & Specs</span>
                      <button onClick={() => toggleSort("product")}>{sortIconFor("product")}</button>
                    </div>
                  </th>
                  <th className="px-3 py-2 text-left">
                    <div className="flex items-center gap-1">
                      <span className="font-semibold text-foreground">Category</span>
                      <button onClick={() => toggleSort("category")}>{sortIconFor("category")}</button>
                    </div>
                  </th>
                  <th className="px-3 py-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <span className="font-semibold text-foreground">Synergy ID</span>
                      <button onClick={() => toggleSort("synergy")}>{sortIconFor("synergy")}</button>
                    </div>
                  </th>
                  <th className="px-3 py-2 text-right">
                    <div className="flex items-center gap-1 justify-end">
                      <span className="font-semibold text-foreground">Qty</span>
                      <button onClick={() => toggleSort("qty")}>{sortIconFor("qty")}</button>
                    </div>
                  </th>
                  <th className="px-3 py-2 text-right">
                    <div className="flex items-center gap-1 justify-end">
                      <span className="font-semibold text-foreground">Unit $</span>
                      <button onClick={() => toggleSort("unit")}>{sortIconFor("unit")}</button>
                    </div>
                  </th>
                  <th className="px-3 py-2 text-right">
                    <div className="flex items-center gap-1 justify-end">
                      <span className="font-semibold text-foreground">MSRP</span>
                      <button onClick={() => toggleSort("msrp")}>{sortIconFor("msrp")}</button>
                    </div>
                  </th>
                  <th className="w-20 p-3" />
                </tr>
              </thead>
            </table>

            <div ref={bodyScrollRef} className="max-h-[70vh] overflow-auto relative">
              <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: "100%", position: "relative" }}>
                {virtualItems.map((virtualRow) => {
                  const item = groupedData[virtualRow.index];
                  if (!item) return null;

                  if ('type' in item && item.type === 'group') {
                    const group = item as GroupNode;
                    const allSelected = group.items.every(child => selected[child.id]);
                    const someSelected = group.items.some(child => selected[child.id]) && !allSelected;
                    return (
                      <div key={`group-${group.key}`} ref={rowVirtualizer.measureElement} data-index={virtualRow.index} className="absolute top-0 left-0 w-full z-20" style={{ transform: `translateY(${virtualRow.start}px)` }}>
                        <div className="bg-secondary/90 border-y border-border shadow-sm hover:bg-secondary transition-colors">
                          <table className="w-full text-sm table-fixed">
                            <colgroup>
                              <col style={{ width: 48 }} />
                              <col style={{ width: '40%' }} />
                              <col style={{ width: 176 }} />
                              <col style={{ width: 140 }} />
                              <col style={{ width: 80 }} />
                              <col style={{ width: 100 }} />
                              <col style={{ width: 100 }} />
                              <col style={{ width: 80 }} />
                            </colgroup>
                            <tbody>
                              <tr>
                                <td className="p-2 text-center align-middle">
                                  <div className="flex items-center justify-center gap-2">
                                    <button onClick={() => toggleGroup(group.key)} className="p-1 rounded-md hover:bg-background/50 text-foreground/70 transition-transform active:scale-95">
                                      <ChevronRight className={cls("h-4 w-4 transition-transform duration-200", expandedGroups[group.key] && "rotate-90")} />
                                    </button>
                                    <RoundCheck checked={allSelected} indeterminate={someSelected} onChange={() => toggleGroupSelection(group.items)} />
                                  </div>
                                </td>
                                <td className="p-2 pl-2 align-middle" colSpan={3}>
                                  <div className="flex items-center gap-3 cursor-pointer select-none" onClick={() => toggleGroup(group.key)}>
                                    <div className={cls("p-1.5 rounded-md transition-colors", expandedGroups[group.key] ? "bg-primary text-primary-foreground shadow-sm" : "bg-background text-muted-foreground border")}>
                                      {expandedGroups[group.key] ? <FolderOpen className="h-4 w-4" /> : <Layers className="h-4 w-4" />}
                                    </div>
                                    <span className="font-bold text-sm text-foreground/90 truncate max-w-[500px]">{group.key || "(No Product Name)"}</span>
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-background/50 border text-muted-foreground shadow-sm">{group.count}</span>
                                  </div>
                                </td>
                                <td className="p-2 text-right font-semibold tabular-nums text-foreground/80 align-middle">{group.totalQty}</td>
                                <td className="p-2 text-right text-muted-foreground tabular-nums align-middle"><span className="text-[10px] opacity-50 mr-1">AVG</span>{money(group.avgCost)}</td>
                                <td className="p-2 text-right text-muted-foreground tabular-nums align-middle"><span className="text-[10px] opacity-50 mr-1">TOT</span>{money(group.totalMsrp)}</td>
                                <td className="p-2" />
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  }

                  const l = item as POLine;
                  const statusInfo = l.synergy_id ? rowBrief[l.synergy_id] : undefined;
                  
                  const isSold = statusInfo?.status === "SOLD";
                  const isScrap = statusInfo?.status === "SCRAP";
                  const isPartsNeeded = l.isAwaitingParts || statusInfo?.partStatus === 'NEEDED';
                  
                  const raw = l.raw_json || {};
                  const specs = raw.specs || {};
                  const cpu = cleanCpuString(specs.processor || specs.cpu);
                  const ram = specs.ram || specs.memory;
                  const storage = specs.storage || specs.hdd || specs.ssd;
                  const otherSpecs = [specs.screen, specs.color, specs.batteryHealth].filter(Boolean).join(" • ");
                  const hasAnySpecs = cpu || ram || storage || otherSpecs;
                  const itemNotes = raw.item_notes || raw.notes || raw.tester_comment;
                  
                  const isCompact = density === 'compact';
                  const pad = isCompact ? "p-1.5" : "p-3";
                  const imgSize = isCompact ? "h-8 w-8" : "h-11 w-11";
                  const fontSize = isCompact ? "text-xs" : "text-sm";

                  return (
                    <div key={l.id} ref={rowVirtualizer.measureElement} data-index={virtualRow.index} className="hover:z-20 relative" style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${virtualRow.start}px)` }}>
                      <table className="w-full text-sm table-fixed bg-card">
                        <colgroup>
                          <col style={{ width: 48 }} />
                          <col style={{ width: '40%' }} />
                          <col style={{ width: 176 }} />
                          <col style={{ width: 140 }} />
                          <col style={{ width: 80 }} />
                          <col style={{ width: 100 }} />
                          <col style={{ width: 100 }} />
                          <col style={{ width: 80 }} />
                        </colgroup>
                        <tbody>
                          <tr className={cls("group border-t transition-all hover:bg-muted/60 relative", isSold ? "border-l-4 border-l-purple-500 bg-purple-50/10" : isScrap ? "border-l-4 border-l-red-500 bg-red-50/10" : isPartsNeeded ? "border-l-4 border-l-amber-500 bg-amber-50/10" : "border-l-4 border-l-transparent", flashId === l.id && "bg-amber-100/40")}>
                            <td className={`${pad} align-top relative w-12`}>
                              <div className={cls("flex justify-center", isCompact ? "pt-1" : "pt-2")}>
                                <RoundCheck checked={!!selected[l.id]} label="Select row" onChange={() => toggleRow(l.id)} />
                              </div>
                            </td>
                            
                            <td className={`${pad} align-top`}>
                              <div className="flex items-start gap-3">
                                  <div className={cls("shrink-0", isCompact ? "pt-0" : "pt-0.5")}>
                                    {statusInfo?.ebayThumbnail ? (
                                      <div className={`${imgSize} overflow-hidden rounded-md border bg-white shadow-sm hover:scale-105 transition-transform cursor-pointer`}>
                                        {statusInfo.ebayItemUrl ? 
                                          <a href={statusInfo.ebayItemUrl} target="_blank" rel="noreferrer">
                                            <img src={statusInfo.ebayThumbnail} alt="" className="h-full w-full object-contain" loading="lazy" />
                                          </a> : 
                                          <img src={statusInfo.ebayThumbnail} alt="" className="h-full w-full object-contain" loading="lazy" />
                                        }
                                      </div>
                                    ) : <div className={`${imgSize} flex items-center justify-center rounded-md border bg-muted/40 text-muted-foreground/20`}>
                                      <Images className="h-4 w-4" />
                                    </div>}
                                  </div>
                                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                                      <div className="flex items-start gap-2">
                                        <span className={cls("font-medium leading-snug break-words line-clamp-2", fontSize, isSold && "text-foreground font-semibold")}>
                                          {l.product_name_raw || "(no name)"}
                                        </span>
                                        <Button size="icon" variant="ghost" className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 -mt-0.5 text-muted-foreground" onClick={() => handleCardEdit(l.id)}>
                                          <Pencil className="h-3 w-3" />
                                        </Button>
                                      </div>
                                      {hasAnySpecs && (
                                        <div className="flex flex-wrap items-center gap-2">
                                          {cpu && <Badge variant="secondary" className="h-4 px-1.5 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700 font-medium text-[10px] gap-1"><Cpu className="h-2.5 w-2.5 opacity-70" /> {cpu}</Badge>}
                                          {ram && <Badge variant="secondary" className="h-4 px-1.5 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700 font-medium text-[10px] gap-1"><MemoryStick className="h-2.5 w-2.5 opacity-70" /> {ram}</Badge>}
                                          {storage && <Badge variant="secondary" className="h-4 px-1.5 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700 font-medium text-[10px] gap-1"><Database className="h-2.5 w-2.5 opacity-70" /> {storage}</Badge>}
                                          {otherSpecs && <span className="text-[10px] text-muted-foreground">{otherSpecs}</span>}
                                        </div>
                                      )}
                                      {itemNotes && (
                                        <div className="flex items-start gap-2 p-1.5 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/50 mt-0.5">
                                          <StickyNote className="h-3 w-3 text-amber-600 dark:text-amber-500 mt-0.5 shrink-0" />
                                          <p className="text-[10px] text-amber-800 dark:text-amber-300 leading-snug line-clamp-2">{itemNotes}</p>
                                        </div>
                                      )}
                                      
                                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs mt-0.5">
                                        <StatusBadge info={statusInfo} unitCost={l.unit_cost} compact={isCompact} />
                                        <StatusMeta info={statusInfo} />
                                      </div>

                                      <div className="flex flex-wrap items-center gap-2 mt-0.5">
                                        {isPartsNeeded ? (
                                          <button onClick={(e) => { e.stopPropagation(); markPartsArrived(l.synergy_id || l.id); }} className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 hover:bg-amber-100 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-900/30 dark:text-amber-400 transition-colors">
                                            <Wrench className="h-3 w-3" /> Parts Needed
                                          </button>
                                        ) : statusInfo?.partStatus === 'ARRIVED' ? (
                                          <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-900/30 dark:text-emerald-400">
                                            <PackageCheck className="h-3 w-3" /> Parts Arrived
                                          </span>
                                        ) : null}
                                        {(l.upc || l.asin) && <div className="text-[10px] text-muted-foreground/50 font-mono tracking-tight flex gap-2">{l.upc && <span>UPC: {l.upc}</span>}{l.asin && <span>ASIN: {l.asin}</span>}</div>}
                                      </div>
                                  </div>
                              </div>
                            </td>
                            <td className={`${pad} align-top`}>
                              <div className="pt-1">
                                <CategorySelector value={l.category_id || null} categories={effectiveCategories} onChange={(id) => handleCardCategoryChange(l.id, id)} />
                              </div>
                            </td>
                            <td className={`${pad} align-top text-center`}>
                              <div className="pt-2">
                                {l.synergy_id ? (
                                  <span className="inline-flex items-center gap-1.5 rounded-md border border-border/50 px-2 py-1 text-xs font-medium bg-muted/30 text-foreground/80 font-mono">
                                    {l.synergy_id}
                                  </span>
                                ) : (
                                  <button className="inline-flex items-center gap-1 rounded-md bg-primary/5 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/15 transition-colors" onClick={() => handleCardMint(l.id)}>
                                    <Plus className="h-3 w-3" /> Mint ID
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className={`${pad} text-right align-top tabular-nums`}>
                              <span className={cls("inline-block pt-2.5 font-medium text-foreground/80", fontSize)}>{l.qty ?? 1}</span>
                            </td>
                            <td className={`${pad} text-right align-top tabular-nums`}>
                              <div className="flex flex-col items-end gap-0.5 pt-2.5">
                                <div className={cls("text-foreground/80", fontSize)}>
                                  {typeof l.unit_cost === "number" ? fmtMoney(l.unit_cost) : "—"}
                                </div>
                                {(() => {
                                  const baseCost = typeof l.unit_cost === "number" ? l.unit_cost : null;
                                  if (baseCost === null) return null;
                                  const hasActual = !!(statusInfo && (statusInfo.posted || isSold) && typeof statusInfo.ebayPrice === "number");
                                  if (hasActual) {
                                    const profit = (Number(statusInfo!.ebayPrice) || 0) - baseCost;
                                    return <div className={cls("text-[10px] font-medium", profit > 0 ? "text-emerald-600" : "text-rose-600")}>{profit > 0 ? "+" : ""}{fmtMoney(profit)}</div>;
                                  }
                                  return null;
                                })()}
                              </div>
                            </td>
                            <td className={`${pad} text-right align-top tabular-nums`}>
                              <span className={cls("inline-block pt-2.5 text-muted-foreground", fontSize)}>
                                {typeof l.msrp === "number" ? fmtMoney(l.msrp) : "—"}
                              </span>
                            </td>
                            <td className={`${pad} text-right align-top`}>
                              <div className="flex items-center justify-end gap-1 pt-1.5">
                                {statusInfo?.ebayItemUrl && (
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50" asChild>
                                    <a href={statusInfo.ebayItemUrl} target="_blank" rel="noreferrer">
                                      <ExternalLink className="h-3.5 w-3.5" />
                                    </a>
                                  </Button>
                                )}
                                {l.synergy_id && (
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-amber-600" onClick={() => handleOpenTesterUI(l.synergy_id!)}>
                                    <Wrench className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                {(l.qty ?? 1) > 1 && (
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => handleCardSplit(l.id)}>
                                    <Split className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-red-600" onClick={() => handleCardDelete(l.id)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div ref={bodyScrollRef} className="max-h-[70vh] overflow-y-auto overflow-x-hidden p-2">
            <div className="space-y-8 pb-10">
              {isGrouped ? (
                groupedData.map((item: any) => {
                  if (item.type === 'group') {
                    const group = item as GroupNode;
                    return (
                      <div key={group.key} className="space-y-3">
                        <div className="sticky top-0 z-20 flex items-center gap-2 bg-background/95 backdrop-blur py-2 px-1 border-b cursor-pointer group" onClick={() => toggleGroup(group.key)}>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                            <ChevronRight className={cls("h-4 w-4 transition-transform", expandedGroups[group.key] && "rotate-90")} />
                          </Button>
                          <h3 className="font-bold text-sm flex items-center gap-2">{group.key} <Badge variant="secondary" className="text-[10px] h-5">{group.count}</Badge></h3>
                          <div className="h-px flex-1 bg-border/50 group-hover:bg-border transition-colors" />
                          <div className="text-xs text-muted-foreground font-mono">{money(group.totalMsrp)} <span className="opacity-50">Est. MSRP</span></div>
                        </div>
                        {expandedGroups[group.key] && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4 px-1">
                            {group.items.map(l => (
                              <LineCard key={l.id} l={l} onOverride={handleOpenTesterUI} selected={!!selected[l.id]} onToggle={handleCardToggle} categories={effectiveCategories} onUpdateCategory={handleCardCategoryChange} onMint={handleCardMint} onEdit={handleCardEdit} onSplit={handleCardSplit} onDelete={handleCardDelete} rowBrief={rowBrief} markParts={markPartsArrived} poId={poId} apiBase={apiBase} />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  }
                  return null;
                })
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
                  {filtered.map(l => (
                    <LineCard key={l.id} l={l} onOverride={handleOpenTesterUI} selected={!!selected[l.id]} onToggle={handleCardToggle} categories={effectiveCategories} onUpdateCategory={handleCardCategoryChange} onMint={handleCardMint} onEdit={handleCardEdit} onSplit={handleCardSplit} onDelete={handleCardDelete} rowBrief={rowBrief} markParts={markPartsArrived} poId={poId} apiBase={apiBase} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <AssignCategoryModal open={assignOpen} onClose={() => setAssignOpen(false)} onAssign={bulkAssign} categories={effectiveCategories} selectedCount={selIds.length} />
      {editingId && <EditLineModal open={!!editingId} onClose={() => setEditingId(null)} onSave={saveLine} line={editingVal} lineId={editingId} />}
      <ConfirmDeleteModal open={!!deleteState} onClose={() => setDeleteState(null)} onConfirm={executeDelete} title={(deleteState?.type === 'bulk' && selIds.length > 1) ? `Delete ${selIds.length} Lines?` : "Delete Line?"} description={(deleteState?.type === 'bulk' && selIds.length > 1) ? <span>You are about to delete <span className="font-bold text-foreground">{selIds.length}</span> selected lines. This action cannot be undone.</span> : <span>Are you sure you want to delete this line? This action cannot be undone.</span>} confirmText="Delete" />
      <BulkEditLinesModal open={bulkEditOpen} onClose={() => setBulkEditOpen(false)} onSave={saveBulkEdit} lineCount={selIds.length} initialValues={bulkInitialValues} />
      <BulkStatusModal open={statusModalOpen} onClose={() => setStatusModalOpen(false)} onSave={saveBulkStatus} count={selIds.length} />
      {testerModalOpen && testerRow && <TesterIntakeModal open={testerModalOpen} row={testerRow} user={user} onClose={() => setTesterModalOpen(false)} onSave={handleTesterSave} />}
      {addOpen && <AddLineItemModal poId={poId} apiBase={apiBase} onClose={() => setAddOpen(false)} onLineAdded={() => { setAddOpen(false); loadLines(); }} />}
    </div>
  );
}