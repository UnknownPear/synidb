import React, { useMemo, useState, useEffect, useCallback } from "react";
import { apiGet, apiPost, apiPatch } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ProductList } from "@/components/ProductList";
import {
  Sun,
  Moon,
  CheckCircle,
  BadgeCheck,
  Images,
  DollarSign,
  StickyNote,
  Filter,
  PartyPopper,
  CheckCircle2,
  SlidersHorizontal,
  Search,
  LayoutGrid,
  ChevronRight,
  Settings,
  ShoppingCart,
  FileText,
  Box,
  Building,
  Clock,
  ChevronDown,
  ChevronUp,
  Layers,
  AlertTriangle,
  Tags,
  RefreshCw,
  Store,
} from "lucide-react";
import { cn } from "@/lib/utils";
import AuthPage from "@/components/AuthPage";
import { type InventoryRow } from "@/lib/dataClient";
import { connectLive } from "@/lib/live";
import { ChatWidget } from "@/components/ChatWidget";
import { UserProfile } from "@/components/UserProfile";
import { SortControl, type SortConfig } from "@/components/ui/SortControl";

const USER_KEY = "synergy_user";

const toConditionLabel = (grade?: string | null) =>
  grade ? `Grade ${String(grade).toUpperCase()}` : "";
const addConditionLabel = <T extends InventoryRow>(r: T): T & { condition: string } =>
  ({ ...(r as any), condition: toConditionLabel((r as any).grade) });

const isReadyForPosting = (r: any) => {
  if (r.status === "SOLD") return true;
  return r.status === "TESTED" || r.status === "POSTED" || r.status === "IN_STORE";
};

function DbActivityBar({
  connecting,
  syncing,
  saving,
  disconnected,
}: {
  connecting: boolean;
  syncing: boolean;
  saving: boolean;
  disconnected: boolean;
}) {
  if (disconnected) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[1000]">
        <div className="mx-auto max-w-7xl px-4">
          <div className="mt-2 rounded-md border border-red-300/60 bg-red-50 px-3 py-2 text-xs text-red-700 shadow-sm">
            Database disconnected.
          </div>
        </div>
      </div>
    );
  }

  const show = connecting || syncing || saving;
  if (!show) return null;

  const label = connecting ? "Connecting to database…" : saving ? "Saving changes…" : "Syncing data…";

  return (
    <div className="fixed top-0 left-0 right-0 z-[1000]">
      <div className="h-1 w-full bg-gradient-to-r from-transparent via-black/20 to-transparent animate-pulse" />
      <div className="mx-auto max-w-7xl px-4">
        <div className="mt-2 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] bg-background/80 backdrop-blur shadow-sm">
          <TinySpinner size={12} />
          <span className="opacity-80">{label}</span>
        </div>
      </div>
    </div>
  );
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted/50", className)} />;
}

function TinySpinner({ size = 16 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block animate-spin rounded-full border-2 border-black/20 border-t-transparent"
      style={{ width: size, height: size, animationDuration: "800ms" }}
    />
  );
}

function EmptyState({
  isDark,
  onShowPosted,
  onClear,
  testedView = false,
}: {
  isDark: boolean;
  onShowPosted: () => void;
  onClear: () => void;
  testedView?: boolean;
}) {
  return (
    <div className="mx-auto max-w-xl py-8 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full">
        <CheckCircle2 className={cn("h-8 w-8", isDark ? "text-emerald-400" : "text-emerald-600")} />
      </div>

      <h2 className={cn("text-lg font-semibold", isDark ? "text-gray-100" : "text-gray-900")}>
        {testedView ? "All devices were posted" : "No items match your filters"}
      </h2>

      <p className={cn("mt-1 text-sm", isDark ? "text-gray-400" : "text-gray-600")}>
        {testedView
          ? "Nice work — looks like everything in TESTED is cleared. You can switch to POSTED or adjust filters."
          : "Try broadening your filters or clearing them to see more results."}
      </p>

      <div className="mt-4 flex items-center justify-center gap-2">
        {testedView && (
          <Button onClick={onShowPosted} className="gap-2">
            <PartyPopper className="h-4 w-4" />
            View Posted
          </Button>
        )}
        <Button variant="outline" onClick={onClear} className="gap-2">
          <SlidersHorizontal className="h-4 w-4" />
          Clear Filters
        </Button>
      </div>
    </div>
  );
}

export default function InventoryDashboard() {
  const [user, setUser] = useState<{ id: string; name: string } | null>(() => {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || "null");
    } catch {
      return null;
    }
  });

  const API_URL = ((import.meta as any).env?.VITE_API_URL || "/backend").replace(/\/+$/, "");
  const [dbConnected, setDbConnected] = useState<boolean | null>(null);

  const [loadingHealth, setLoadingHealth] = useState(true);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingRows, setLoadingRows] = useState(true);
  const [savingRows, setSavingRows] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const isConnecting = loadingHealth || dbConnected === null;
  const isSyncing = loadingRows || loadingCategories || refreshing;

  const [selectedCategories, setSelectedCategories] = useState<string[] | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "synergyId", dir: "asc" });


  type PurchaseOrderSummary = {
    id: string;
    po_number: string;
    vendor_name?: string;
    status: string;
    created_at: string;
    inventory_count?: number; 
  };

  type PoGroup = {
    category_id: string;
    label: string;
    units: number;
  };

  const [viewMode, setViewMode] = useState<"category" | "po">("category");
  const [pos, setPos] = useState<PurchaseOrderSummary[]>([]);
  const [poGroups, setPoGroups] = useState<Record<string, PoGroup[]>>({});
  const [selectedPoId, setSelectedPoId] = useState<string>(""); 
  const [selectedPoSubId, setSelectedPoSubId] = useState<string>(""); 
  const [expandedVendors, setExpandedVendors] = useState<Record<string, boolean>>({});

   const [visibleCount, setVisibleCount] = useState(24);
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedCondition, setSelectedCondition] = useState<string | null>(null);
  const [categorySearch, setCategorySearch] = useState("");

  const fetchPOs = async () => {
    try {
      const data = await apiGet<PurchaseOrderSummary[]>("/pos/active");
      setPos(data);
    } catch (e) { 
      console.error("Failed to fetch POs", e); 
      setPos([]);
    }
  };

  const fetchPoGroups = async (poId: string) => {
    try {
      const groups = await apiGet<PoGroup[]>(`/pos/${poId}/groups`);
      setPoGroups(prev => ({ ...prev, [poId]: groups }));
    } catch(e) { }
  };

  useEffect(() => {
    fetchPOs();
  }, []);

  const handleVendorToggle = (vendorName: string) => {
    setExpandedVendors(prev => ({ ...prev, [vendorName]: !prev[vendorName] }));
  };

  const handlePoClick = (e: React.MouseEvent, poId: string) => {
    e.stopPropagation(); 
    if (selectedPoId === poId) {
        if (selectedPoSubId) {
            setSelectedPoSubId(""); 
        } else {
            setSelectedPoId(""); 
        }
    } else {
        setSelectedPoId(poId);
        setSelectedPoSubId("");
        const po = pos.find(p => p.id === poId);
        if (po && (po.inventory_count || 0) > 0) {
            fetchPoGroups(poId);
        }
    }
  };

  const handlePoSubClick = (e: React.MouseEvent, poId: string, subId: string) => {
      e.stopPropagation(); 
      setSelectedPoId(poId);
      setSelectedPoSubId(subId);
  };

  const groupedPOs = useMemo(() => {
    const groups: Record<string, PurchaseOrderSummary[]> = {};
    const searchLower = categorySearch.toLowerCase(); 
    
    const filteredPOs = pos.filter(p => 
        !searchLower || 
        (p.po_number.toLowerCase().includes(searchLower) || (p.vendor_name || "").toLowerCase().includes(searchLower))
    );

    filteredPOs.forEach(po => {
        const v = po.vendor_name || "Unknown Vendor";
        if (!groups[v]) groups[v] = [];
        groups[v].push(po);
    });
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
  }, [pos, categorySearch]);

  type EbayRefreshResponse = {
    ok?: boolean;
    synergyId?: string;
    soldCount?: number;
    lastSoldAt?: string | null;
    seller?: string | null;
    listingStatus?: string | null;
    thumbnail?: string | null;
    sku?: string | null;
  };

 async function refreshEbaySoldWhen(synergyId: string, days = 720): Promise<EbayRefreshResponse | null> {
    try {
      const r = await apiPost<EbayRefreshResponse>(
        `/integrations/ebay/refresh-sold-when/${encodeURIComponent(synergyId)}?days=${Math.min(days, 720)}`,
        {}
      );
      return r;
    } catch {
      return null;
    }
  }

  const handleUserUpdate = (updatedUser: { id: string; name: string; avatar_url?: string | null }) => {
    const newUser = { ...user, ...updatedUser };
    setUser(newUser as any);
    localStorage.setItem(USER_KEY, JSON.stringify(newUser));
  };

  function mergeEbayStatsIntoRow(row: any, stats: EbayRefreshResponse) {
  return {
    ...row,
    ebaySoldCount: typeof stats.soldCount === "number" ? stats.soldCount : row.ebaySoldCount,
    ebayLastSoldAt: stats.lastSoldAt ?? row.ebayLastSoldAt,
    ebaySeller: stats.seller ?? row.ebaySeller,
    ebayListingStatus: stats.listingStatus ?? row.ebayListingStatus,
    ebayThumbnail: stats.thumbnail ?? row.ebayThumbnail,
    ebaySku: stats.sku ?? row.ebaySku,
  };
}

  useEffect(() => {
    setLoadingHealth(true);
    const api = API_URL?.replace(/\/+$/, "");
    if (!api) {
      setDbConnected(false);
      setLoadingHealth(false);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    fetch(`${api}/health`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`status ${r.status}`);
        const j = await r.json();
        if (j?.ok) {
          setDbConnected(true);
        } else {
          setDbConnected(false);
        }
      })
      .catch(() => {
        setDbConnected(false);
      })
      .finally(() => {
        clearTimeout(timer);
        setLoadingHealth(false);
      });
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [API_URL]);

  const [rows, setRows] = useState<InventoryRow[]>([]);

 useEffect(() => {
    let alive = true;

    (async () => {
      setLoadingRows(true);
      try {
        const [tRows, pRows, sRows, iRows] = await Promise.all([
          apiGet<InventoryRow[]>("/rows?status=TESTED"),
          apiGet<InventoryRow[]>("/rows?status=POSTED"),
          apiGet<InventoryRow[]>("/rows?status=SOLD&limit=300"),
          apiGet<InventoryRow[]>("/rows?status=IN_STORE"),
        ]);

        if (!alive) return;

        const byId = new Map<string, any>();
        for (const r of [...tRows, ...pRows, ...sRows, ...iRows]) {
          const key = (r?.synergyId ?? r?.id)?.toString();
          if (key) byId.set(key, r);
        }

        setRows(Array.from(byId.values()).map(addConditionLabel) as any);
        setDbConnected(true);
      } catch {
        if (!alive) return;
        setDbConnected(false);
      } finally {
        if (alive) setLoadingRows(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  type Cat = { id: string | number; label: string };
  const [categories, setCategories] = useState<Cat[]>([]);

  useEffect(() => {
    setLoadingCategories(true);
    apiGet<Cat[]>("/categories")
      .then((cats) => {
        setCategories(cats);
      })
      .catch(() => {
        setDbConnected(false);
        setCategories([]);
      })
      .finally(() => setLoadingCategories(false));
  }, []);

  function resolveRowCategory(
    row: any,
    byId: Map<string, string>,
    idByLabel: Map<string, string>
  ): { id: string; label: string } {
    const norm = (v: any) => (v ?? "").toString().trim().toLowerCase();

    if (row?.category && typeof row.category === "object") {
      const id = row.category?.id != null ? String(row.category.id) : "";
      const label = (row.category?.label ?? byId.get(id) ?? "") as string;
      return { id, label };
    }
    if (typeof row?.category === "string" && row.category.trim()) {
      const label = row.category;
      const id =
        idByLabel.get(norm(label)) ?? (row?.categoryId != null ? String(row.categoryId) : "");
      return { id, label };
    }

    if (row?.categoryId != null) {
      const id = String(row.categoryId);
      const label = byId.get(id) ?? "";
      return { id, label };
    }

    return { id: "", label: "" };
  }

  const fetchRows = useCallback(async () => {
    setLoadingRows(true);
    try {
      const [tested, posted, sold, inStore] = await Promise.all([
        fetch(`${API_URL}/rows?status=TESTED&limit=500`).then((r) => r.json()),
        fetch(`${API_URL}/rows?status=POSTED&limit=500`).then((r) => r.json()),
        fetch(`${API_URL}/rows?status=SOLD&limit=300`).then((r) => r.json()),
        fetch(`${API_URL}/rows?status=IN_STORE&limit=500`).then((r) => r.json()),
      ]);

      const byId = new Map<string, InventoryRow>();
      for (const r of [...tested, ...posted, ...sold, ...inStore]) {
        const key = ((r as any)?.synergyId ?? (r as any)?.id)?.toString();
        if (key) byId.set(key, r);
      }

      setRows(Array.from(byId.values()).map(addConditionLabel) as any);
      setDbConnected(true);
    } catch {
      setDbConnected(false);
    } finally {
      setLoadingRows(false);
    }
  }, [API_URL]);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await fetchRows();
    setRefreshing(false);
  };

  type StatusFilter = "TESTED" | "POSTED" | "BOTH" | "SOLD" | "ALL" | "IN_STORE";
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("TESTED");

  const [hasPhotos, setHasPhotos] = useState<boolean | null>(null);
  const [hasPrice, setHasPrice] = useState<boolean | null>(null);
  const [hasNotes, setHasNotes] = useState<boolean | null>(null);

 const saveRowPatch = async (id: string, patch: Partial<InventoryRow>) => {
    setSavingRows(true);
    try {
      await apiPatch(`/rows/${id}`, patch);
    } catch {
      setDbConnected(false);
    } finally {
      setSavingRows(false);
    }
  };

  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem("theme");
    return saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    localStorage.setItem("theme", isDarkMode ? "dark" : "light");
    document.documentElement.classList.toggle("dark", isDarkMode);
  }, [isDarkMode]);

  useEffect(() => {
    if (!API_URL) return;

    const stop = connectLive(API_URL, {
      onCategoryCreated: (c) => {
        setCategories((prev) => (prev.some((x) => x.id === c.id) ? prev : [...prev, c]));
      },
      onCategoryUpdated: (before, after) => {
        setCategories((prev) => prev.map((x) => (x.id === after.id ? after : x)));
        setSelectedCategory((sel) => (sel === (before?.label ?? "") ? after?.label : sel));
      },
      onCategoryDeleted: (c) => {
        setCategories((prev) => prev.filter((x) => x.id !== c.id));
        setSelectedCategory((sel) => (sel === c.label ? null : sel));
      },
      onRowUpserted: (payload: any) => {
        const id = payload.synergyId || payload.id;
        if (!id) return;

        setRows((prev) => {
          const index = prev.findIndex((r) => r.synergyId === id);
          const exists = index !== -1;
          const validForView = isReadyForPosting(payload);

          if (exists) {
            if (payload.status === "INTAKE") {
              return prev.filter((r) => r.synergyId !== id);
            }
            const copy = [...prev];
            copy[index] = addConditionLabel({ ...prev[index], ...payload } as InventoryRow);
            return copy;
          } else {
            if (validForView) {
              return [addConditionLabel(payload as InventoryRow), ...prev];
            }
          }
          return prev;
        });
      },
      onRowDeleted: (id) => {
        setRows((prev) => prev.filter((r) => r.synergyId !== id));
      },
      onRowBulkUpserted: () => {
        fetchRows();
      },
    });

    return stop;
  }, [fetchRows, API_URL]);

  const filteredAndSortedRows = useMemo(() => {
    if (!rows) return [];

    let filtered = rows;

    if (viewMode === "po" && selectedPoId) {
      filtered = filtered.filter((r: any) => {
        const rowPoId = r.poId || r.purchase_order_id;
        if (rowPoId !== selectedPoId) return false;
        
        if (selectedPoSubId) {
           const catId = r.categoryId || (r.category && r.category.id);
           if (String(catId) !== String(selectedPoSubId)) return false;
        }
        return true;
      });
    }

    filtered = filtered.filter((r) => {
      if (statusFilter === "TESTED") return r.status === "TESTED";
      if (statusFilter === "POSTED") return r.status === "POSTED";
      if (statusFilter === "SOLD") return r.status === "SOLD";
      if (statusFilter === "IN_STORE") return r.status === "IN_STORE";
      if (statusFilter === "BOTH") return r.status === "TESTED" || r.status === "POSTED";
      
      if (statusFilter === "ALL") return true; 

      return true;
    });

    if (statusFilter !== "SOLD" && statusFilter !== "ALL") {
      filtered = filtered.filter(isReadyForPosting);
    }
    
    if (statusFilter === "ALL") {
       filtered = filtered.filter(r => r.status === 'TESTED' || r.status === 'POSTED' || r.status === 'SOLD' || r.status === 'IN_STORE');
    }

    const q = query.trim().toLowerCase();
    if (q) {
      filtered = filtered.filter(
        (r) =>
          r.synergyId?.toLowerCase().includes(q) ||
          r.productName?.toLowerCase().includes(q) ||
          (r as any).serial?.toLowerCase().includes(q) ||
          r.testerComment?.toLowerCase().includes(q)
      );
    }

    if (selectedCondition) {
      const gradeValue = selectedCondition.replace("Grade ", "").toUpperCase();
      filtered = filtered.filter((r) => r.grade && r.grade.toUpperCase() === gradeValue);
    }

    if (viewMode === "category") {
        const norm = (v: any) => (v ?? "").toString().trim().toLowerCase();
        const byId = new Map(categories.map((c) => [String(c.id), c.label]));
        const idByLabel = new Map(categories.map((c) => [norm(c.label), String(c.id)]));

        if (selectedCategories && selectedCategories.length) {
            const wanted = new Set(selectedCategories.map(norm));
            filtered = filtered.filter((r: any) => {
                const { id: rowId, label: rowLabel } = resolveRowCategory(r, byId, idByLabel);
                return (
                wanted.has(norm(rowLabel)) ||
                (rowId && [...wanted].includes(norm(byId.get(rowId) || "")))
                );
            });
        } else if (selectedCategory) {
            const rawSel = selectedCategory.toString();
            const selId =
                byId.has(String(rawSel)) ? String(rawSel) : idByLabel.get(norm(rawSel)) ?? "";
            const selLabel = byId.get(selId) ?? rawSel;
            filtered = filtered.filter((r: any) => {
                const { id: rowId, label: rowLabel } = resolveRowCategory(r, byId, idByLabel);
                return (!!selId && !!rowId && rowId === selId) || norm(rowLabel) === norm(selLabel);
            });
        }
    }

    filtered = filtered.map((r: any) => {
      const norm = (v: any) => (v ?? "").toString().trim().toLowerCase();
      const byId = new Map(categories.map((c) => [String(c.id), c.label]));
      const idByLabel = new Map(categories.map((c) => [norm(c.label), String(c.id)]));
      
      const { id, label } = resolveRowCategory(r, byId, idByLabel);
      return {
        ...r,
        categoryId: id || r.categoryId,
        categoryLbl: label || r.categoryLbl || (typeof r.category === "string" ? r.category : ""),
      };
    });

    if (hasPhotos === true) {
      filtered = filtered.filter(
        (r: any) => Array.isArray((r as any).photos) && (r as any).photos.length > 0
      );
    }
    if (hasPrice === true) {
      filtered = filtered.filter(
        (r: any) => (r as any).price != null || (r as any).listPrice != null
      );
    }
    if (hasNotes === true) {
      filtered = filtered.filter(
        (r: any) =>
          typeof r.testerComment === "string" && r.testerComment.trim().length > 0
      );
    }

    filtered.sort((a, b) => {
      const dir = sortConfig.dir === "asc" ? 1 : -1;
      let valA: any = "";
      let valB: any = "";

      switch (sortConfig.key) {
        case "productName":
          valA = a.productName || "";
          valB = b.productName || "";
          break;
        case "date":
          valA = a.postedAt || a.testedDate || a.synergyId;
          valB = b.postedAt || b.testedDate || b.synergyId;
          break;
        case "synergyId":
        default:
          valA = a.synergyId;
          valB = b.synergyId;
          break;
      }

      return String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' }) * dir;
    });

    return filtered;
  }, [
    rows,
    query,
    selectedCondition,
    selectedCategory,
    selectedCategories,
    categories,
    statusFilter,
    hasPhotos,
    hasPrice,
    hasNotes,
    viewMode,
    selectedPoId,
    selectedPoSubId,
    sortConfig
  ]);

  const visible = useMemo(
    () => filteredAndSortedRows.slice(0, visibleCount),
    [filteredAndSortedRows, visibleCount]
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const targets = visible.filter(
        (r: any) =>
          (r.ebayItemUrl || r.status === "POSTED") &&
          (!("ebaySoldCount" in r) || !("ebayLastSoldAt" in r))
      );

      for (const r of targets) {
        if (cancelled) break;
        if (!r.synergyId) continue;

        const stats = await refreshEbaySoldWhen(r.synergyId, 720);
        if (cancelled) break;
        if (!stats || !stats.ok) continue;

        setRows((prev) =>
          prev.map((row: any) =>
            row.synergyId === r.synergyId ? mergeEbayStatsIntoRow(row, stats) : row
          )
        );

        await new Promise((res) => setTimeout(res, 200));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible.map((r: any) => r.synergyId).join("|")]);

  const onRowUpdate = (synergyId: string, patch: Partial<InventoryRow>) => {
    setRows((prev) =>
      prev.map((r: any) =>
        r.synergyId === synergyId
          ? {
              ...r,
              ...patch,
              ...(patch as any).posted
                ? { postedBy: user?.name || "" }
                : {},
            }
          : r
      )
    );
    void saveRowPatch(synergyId, patch);

    if (typeof (patch as any).posted === "boolean") {
      // FIX: Only enforce status change if we aren't explicitly setting it to IN_STORE
      if (patch.status === "IN_STORE") {
          // Do nothing, let the IN_STORE status stick
      } else {
          const enforce: Partial<InventoryRow> = {
            status: (patch as any).posted ? "POSTED" : "TESTED",
            postedAt: (patch as any).posted ? new Date().toISOString() : null,
            ...(patch as any).posted ? { postedBy: user?.name || "" } : {},
          };
          void saveRowPatch(synergyId, enforce);
      }
    }
  };

  if (!user) {
    return (
      <AuthPage
        variant="poster"
        filterByRole
        onAuth={(u) => {
          setUser(u);
          localStorage.setItem(USER_KEY, JSON.stringify(u));
        }}
      />
    );
  }

  const currentCategoryLabel =
    selectedCategories && selectedCategories.length
      ? selectedCategories[0]
      : selectedCategory || "All Categories";

  const filteredCategories = useMemo(
    () =>
      categories.filter((c) =>
        categorySearch.trim()
          ? c.label.toLowerCase().includes(categorySearch.toLowerCase())
          : true
      ),
    [categories, categorySearch]
  );

  const clearAllFilters = () => {
    setSelectedCategory(null);
    setSelectedCategories(null);
    setSelectedCondition(null);
    setQuery("");
    setStatusFilter("TESTED");
    setHasPhotos(null);
    setHasPrice(null);
    setHasNotes(null);
    setVisibleCount(24);
  };

  return (
    <div
      className={cn(
        "flex h-screen w-screen overflow-hidden font-sans",
        isDarkMode ? "bg-[#020617] text-gray-100" : "bg-slate-50 text-slate-900"
      )}
    >
      <DbActivityBar
        connecting={isConnecting}
        syncing={isSyncing}
        saving={savingRows}
        disconnected={dbConnected === false}
      />

      <aside
        className={cn(
          "flex w-72 flex-shrink-0 flex-col border-r h-full",
          isDarkMode ? "border-gray-800 bg-[#020617]" : "border-gray-200 bg-white"
        )}
      >
        <div
          className={cn(
            "flex shrink-0 flex-col items-center justify-center py-6 border-b px-4",
            isDarkMode ? "border-gray-800" : "border-gray-200"
          )}
        >
          <img src="/images/poster.png" alt="Poster Logo" className="h-10 w-10 mb-2" />
          <span className="font-bold text-lg tracking-tight">Synergy</span>
          <span
            className={cn(
              "text-[10px] uppercase font-semibold tracking-wide",
              isDarkMode ? "text-gray-500" : "text-gray-400"
            )}
          >
            Poster Dashboard
          </span>
        </div>

        <div className="px-3 pt-3 pb-2">
           <div className={cn("grid grid-cols-2 gap-1 p-1 rounded-lg", isDarkMode ? "bg-gray-800/50" : "bg-slate-100")}>
              <button 
                onClick={() => { setViewMode("category"); setSelectedPoId(""); setSelectedPoSubId(""); }}
                className={cn("flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md transition-all", 
                  viewMode === "category" ? (isDarkMode ? "bg-gray-700 text-white shadow-sm" : "bg-white text-slate-900 shadow-sm") : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Tags className="h-3.5 w-3.5" /> Cats
              </button>
              <button 
                onClick={() => { setViewMode("po"); setSelectedCategory(null); setSelectedCategories(null); }}
                className={cn("flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md transition-all", 
                  viewMode === "po" ? (isDarkMode ? "bg-gray-700 text-white shadow-sm" : "bg-white text-slate-900 shadow-sm") : "text-muted-foreground hover:text-foreground"
                )}
              >
                <FileText className="h-3.5 w-3.5" /> POs
              </button>
           </div>
        </div>

        <div
          className={cn(
            "shrink-0 border-b px-3 pb-3",
            isDarkMode ? "border-gray-800" : "border-gray-200"
          )}
        >
          <div className="relative">
            <Input
              placeholder={viewMode === 'category' ? "Search categories..." : "Search PO number..."}
              value={categorySearch}
              onChange={(e) => setCategorySearch(e.target.value)}
              className={cn(
                "h-8 w-full rounded-lg pl-7 text-xs shadow-sm focus-visible:ring-1",
                isDarkMode
                  ? "border-gray-700 bg-[#020617] text-gray-100 placeholder:text-gray-500"
                  : "border-gray-300 bg-gray-50 text-gray-800 placeholder:text-gray-500"
              )}
            />
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-800">
          <div className="px-2 py-3">
            {viewMode === "category" && (
                <div className="space-y-1 text-xs">
                <button
                    type="button"
                    onClick={() => {
                    setSelectedCategory(null);
                    setSelectedCategories(null);
                    }}
                    className={cn(
                    "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left transition-colors mb-2",
                    !selectedCategory && !selectedCategories?.length
                        ? isDarkMode
                        ? "bg-indigo-600/20 text-indigo-100"
                        : "bg-indigo-50 text-indigo-700 font-medium"
                        : isDarkMode
                        ? "text-gray-300 hover:bg-gray-800"
                        : "text-gray-700 hover:bg-gray-100"
                    )}
                >
                    <span className="truncate">All Categories</span>
                    <span className="text-[10px] uppercase tracking-wide opacity-60">All</span>
                </button>

                <div className="space-y-0.5">
                    {filteredCategories.map((c) => {
                    const label = c.label;
                    const active =
                        (selectedCategories && selectedCategories.includes(label)) ||
                        selectedCategory === label;
                    return (
                        <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                            setSelectedCategory(label);
                            setSelectedCategories([label]);
                        }}
                        className={cn(
                            "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                            active
                            ? isDarkMode
                                ? "bg-indigo-600/20 text-indigo-100"
                                : "bg-indigo-50 text-indigo-700 font-medium"
                            : isDarkMode
                            ? "text-gray-300 hover:bg-gray-800"
                            : "text-gray-700 hover:bg-gray-100"
                        )}
                        >
                        <span className="truncate">{label}</span>
                        </button>
                    );
                    })}
                </div>
                </div>
            )}

            {viewMode === "po" && (
                <div className="space-y-1">
                    <button
                        onClick={() => { setSelectedPoId(""); setSelectedPoSubId(""); }}
                        className={cn("flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-xs transition-colors mb-2",
                        !selectedPoId ? (isDarkMode ? "bg-indigo-600/20 text-indigo-100" : "bg-indigo-50 text-indigo-700 font-medium") : (isDarkMode ? "text-gray-300 hover:bg-gray-800" : "text-gray-700 hover:bg-gray-100")
                        )}
                    >
                        <span className="flex items-center gap-2"><Box className="h-3.5 w-3.5" /> All Shipments</span>
                    </button>

                    {groupedPOs.map(([vendorName, vendorPos]) => {
                        const isExpanded = expandedVendors[vendorName] || categorySearch.trim().length > 0;

                        return (
                            <div key={vendorName} className="mb-2">
                                <button 
                                    onClick={() => handleVendorToggle(vendorName)}
                                    className={cn(
                                    "flex w-full items-center justify-between px-2 py-1.5 text-xs font-semibold rounded-md transition-colors",
                                    isDarkMode ? "text-gray-200 hover:bg-gray-800" : "text-gray-700 hover:bg-gray-100"
                                    )}
                                >
                                    <div className="flex items-center gap-2">
                                        <Building className="h-3.5 w-3.5 opacity-70" />
                                        <span>{vendorName}</span>
                                        <span className="text-[9px] font-normal opacity-50 ml-1">({vendorPos.length})</span>
                                    </div>
                                    {isExpanded ? <ChevronDown className="h-3 w-3 opacity-50"/> : <ChevronRight className="h-3 w-3 opacity-50"/>}
                                </button>

                                {isExpanded && (
                                    <div className={cn("pl-2 mt-1 space-y-1 border-l ml-2", isDarkMode ? "border-gray-800" : "border-gray-200")}>
                                        {vendorPos.map(po => {
                                            const isActive = selectedPoId === po.id;
                                            const groups = poGroups[po.id] || [];
                                            const hasInventory = (po.inventory_count || 0) > 0;

                                            return (
                                                <div key={po.id} className="mb-1">
                                                    <button
                                                        onClick={(e) => handlePoClick(e, po.id)}
                                                        className={cn("flex flex-col w-full items-start rounded-md px-2 py-2 text-left text-xs transition-colors border border-transparent",
                                                            isActive 
                                                            ? (isDarkMode ? "bg-indigo-600/10 border-indigo-500/30" : "bg-indigo-50 border-indigo-200") 
                                                            : (isDarkMode ? "text-gray-400 hover:bg-gray-800 hover:text-gray-200" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900")
                                                        )}
                                                    >
                                                        <div className="flex items-center justify-between w-full">
                                                            <span className={cn("font-mono font-medium", isActive ? "text-indigo-600 dark:text-indigo-400" : "")}>{po.po_number}</span>
                                                            {isActive ? <ChevronUp className="h-3 w-3 opacity-50"/> : <ChevronDown className="h-3 w-3 opacity-50"/>}
                                                        </div>
                                                        <div className="flex justify-between w-full mt-1">
                                                            <span className={cn("text-[9px]", isActive ? "text-indigo-500/70 dark:text-indigo-300/70" : "text-muted-foreground opacity-70")}>{new Date(po.created_at).toLocaleDateString()}</span>
                                                            {!hasInventory && (
                                                                <span className="text-[9px] text-amber-500 flex items-center gap-1"><Clock className="h-2.5 w-2.5"/> Pending</span>
                                                            )}
                                                        </div>
                                                    </button>

                                                    {isActive && (
                                                        <div className={cn("ml-2 pl-2 border-l mt-1 space-y-0.5", isDarkMode ? "border-indigo-500/20" : "border-indigo-200")}>
                                                            {!hasInventory ? (
                                                                <div className={cn("px-2 py-2 my-1 text-[10px] rounded border border-dashed flex items-start gap-2", isDarkMode ? "bg-amber-900/20 border-amber-800 text-amber-400" : "bg-amber-50 border-amber-200 text-amber-700")}>
                                                                    <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                                                                    <span className="leading-tight">Items have not been sent to testing yet.</span>
                                                                </div>
                                                            ) : (
                                                                <>
                                                                    <button
                                                                        onClick={(e) => handlePoSubClick(e, po.id, "")}
                                                                        className={cn("flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[11px] transition-colors",
                                                                            !selectedPoSubId ? (isDarkMode ? "text-indigo-300 bg-white/5" : "text-indigo-700 bg-white/60 font-medium") : "text-muted-foreground hover:text-foreground"
                                                                        )}
                                                                    >
                                                                        <span>View All</span>
                                                                        <Layers className="h-3 w-3 opacity-50" />
                                                                    </button>
                                                                    
                                                                    {groups.length === 0 ? (
                                                                        <div className="px-2 py-1 text-[10px] text-muted-foreground italic opacity-70">Loading contents...</div>
                                                                    ) : (
                                                                        groups.map(g => {
                                                                            const isSubActive = selectedPoSubId === g.category_id;
                                                                            return (
                                                                            <button
                                                                                key={g.category_id || g.label}
                                                                                onClick={(e) => handlePoSubClick(e, po.id, g.category_id)}
                                                                                className={cn("flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[11px] transition-colors",
                                                                                    isSubActive 
                                                                                        ? (isDarkMode ? "text-indigo-300 bg-white/5" : "text-indigo-700 bg-white/60 font-medium") 
                                                                                        : (isDarkMode ? "text-gray-400 hover:text-gray-200" : "text-gray-600 hover:text-gray-900")
                                                                                )}
                                                                            >
                                                                                <span className="truncate">{g.label || "Unassigned"}</span>
                                                                                <span className="text-[9px] opacity-60 ml-2">{g.units}</span>
                                                                            </button>
                                                                            )
                                                                        })
                                                                    )}
                                                                </>
                                                            )}
                                                        </div>
                                                    )}
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

      <main
        className={cn(
          "flex flex-1 flex-col h-full overflow-hidden min-w-0",
          isDarkMode ? "bg-[#020617]" : "bg-slate-50"
        )}
      >
        <div
          className={cn(
            "flex shrink-0 items-center justify-between border-b px-6 py-3.5 shadow-sm backdrop-blur-sm z-10",
            isDarkMode
              ? "border-gray-800 bg-[#020617]/80"
              : "border-gray-200 bg-white/80"
          )}
        >
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "p-2 rounded-lg",
                isDarkMode ? "bg-gray-800 text-gray-300" : "bg-gray-100 text-gray-500"
              )}
            >
              <LayoutGrid className="h-4 w-4" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider text-gray-400">
                <span>Products</span>
                <ChevronRight className="h-3 w-3" />
                <span>{selectedCondition || "All Grades"}</span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={cn("text-sm font-bold", isDarkMode ? "text-white" : "text-gray-900")}
                >
                  {currentCategoryLabel}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-medium",
                    isDarkMode
                      ? "bg-gray-800 text-gray-300"
                      : "bg-gray-100 text-gray-600"
                  )}
                >
                  {filteredAndSortedRows.length}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative hidden md:block group">
              <Input
                placeholder="Search products..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setVisibleCount(24);
                }}
                className={cn(
                  "h-9 w-72 rounded-full pl-9 text-sm transition-all shadow-sm",
                  isDarkMode
                    ? "border-gray-800 bg-gray-900/50 text-gray-100 placeholder:text-gray-500 focus:bg-gray-900 focus:w-80"
                    : "border-gray-200 bg-white text-gray-800 placeholder:text-gray-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 focus:w-80"
                )}
              />
              <Search
                className={cn(
                  "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors",
                  isDarkMode ? "text-gray-500 group-focus-within:text-indigo-400" : "text-gray-400 group-focus-within:text-indigo-500"
                )}
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-9 w-9 rounded-full",
                refreshing && "animate-spin",
                isDarkMode ? "text-gray-400 hover:bg-gray-800" : "text-gray-500 hover:bg-gray-100"
              )}
              onClick={handleManualRefresh}
            >
              <RefreshCw className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-9 w-9 rounded-full",
                isDarkMode
                  ? "text-gray-400 hover:bg-gray-800 hover:text-gray-100"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              )}
              onClick={() => setIsDarkMode(d => !d)}
            >
              {isDarkMode ? <Sun className="h-5 w-5"/> : <Moon className="h-5 w-5"/>}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-9 w-9 rounded-full",
                isDarkMode
                  ? "text-gray-400 hover:bg-gray-800 hover:text-gray-100"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              )}
            >
              <Settings className="h-5 w-5" />
            </Button>

            {user && (
              <div className="pl-2 border-l border-gray-200 dark:border-gray-800">
                <UserProfile user={user} onUpdate={handleUserUpdate} logoutPath="/login/posters" />
              </div>
            )}
          </div>
        </div>

        <div
          className={cn(
            "flex flex-wrap items-center gap-3 border-b px-6 py-3 shrink-0",
            isDarkMode ? "border-gray-800 bg-[#020617]" : "border-gray-200 bg-slate-50"
          )}
        >
          <div className={cn("flex p-1 rounded-lg border", isDarkMode ? "bg-gray-800/50 border-gray-700" : "bg-gray-100 border-gray-200")}>
              <button onClick={() => setStatusFilter("TESTED")} className={cn("px-3 py-1 text-[11px] font-medium rounded-md transition-all flex items-center gap-1.5", statusFilter === "TESTED" ? (isDarkMode ? "bg-indigo-500/20 text-indigo-300 shadow-sm ring-1 ring-indigo-500/50" : "bg-white text-indigo-700 shadow-sm ring-1 ring-black/5") : "text-muted-foreground hover:text-foreground")}>
                 <CheckCircle className="h-3 w-3" /> Tested
              </button>
              <button onClick={() => setStatusFilter("POSTED")} className={cn("px-3 py-1 text-[11px] font-medium rounded-md transition-all flex items-center gap-1.5", statusFilter === "POSTED" ? (isDarkMode ? "bg-blue-500/20 text-blue-300 shadow-sm ring-1 ring-blue-500/50" : "bg-white text-blue-700 shadow-sm ring-1 ring-black/5") : "text-muted-foreground hover:text-foreground")}>
                 <BadgeCheck className="h-3 w-3" /> Posted
              </button>
              <button onClick={() => setStatusFilter("IN_STORE")} className={cn("px-3 py-1 text-[11px] font-medium rounded-md transition-all flex items-center gap-1.5", statusFilter === "IN_STORE" ? (isDarkMode ? "bg-orange-500/20 text-orange-300 shadow-sm ring-1 ring-orange-500/50" : "bg-white text-orange-700 shadow-sm ring-1 ring-black/5") : "text-muted-foreground hover:text-foreground")}>
                 <Store className="h-3 w-3" /> In Store
              </button>
              <button onClick={() => setStatusFilter("SOLD")} className={cn("px-3 py-1 text-[11px] font-medium rounded-md transition-all flex items-center gap-1.5", statusFilter === "SOLD" ? (isDarkMode ? "bg-amber-500/20 text-amber-300 shadow-sm ring-1 ring-amber-500/50" : "bg-white text-amber-700 shadow-sm ring-1 ring-black/5") : "text-muted-foreground hover:text-foreground")}>
                 <ShoppingCart className="h-3 w-3" /> Sold
              </button>
              <button onClick={() => setStatusFilter("ALL")} className={cn("px-3 py-1 text-[11px] font-medium rounded-md transition-all flex items-center gap-1.5", statusFilter === "ALL" ? (isDarkMode ? "bg-purple-500/20 text-purple-300 shadow-sm ring-1 ring-purple-500/50" : "bg-white text-purple-700 shadow-sm ring-1 ring-black/5") : "text-muted-foreground hover:text-foreground")}>
                 <Filter className="h-3 w-3" /> All
              </button>
           </div>

          <div className="h-6 w-px bg-gray-200 dark:bg-gray-800" />

          <div className="flex items-center gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Grade
            </span>
            {(["A", "B", "C", "D", "P"] as const).map((g) => {
              const active = (selectedCondition ?? "All") === `Grade ${g}`;
              return (
                <Button
                  key={g}
                  size="sm"
                  variant={active ? "default" : "outline"}
                  className={cn(
                    "h-6 w-6 rounded-full text-[10px] font-bold transition-all border",
                    active
                      ? (isDarkMode ? "bg-indigo-600 text-white border-indigo-500" : "bg-indigo-600 text-white border-indigo-600")
                      : (isDarkMode ? "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200" : "bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700")
                  )}
                  onClick={() =>
                    setSelectedCondition(active ? null : `Grade ${g}`)
                  }
                >
                  {g}
                </Button>
              );
            })}
          </div>

          <div className="h-6 w-px bg-gray-200 dark:bg-gray-800" />

          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              More
            </span>
            <Button
              size="sm"
              variant={hasPhotos ? "default" : "outline"}
              className={cn(
                "h-7 gap-1 rounded-full px-2 text-[11px]",
                hasPhotos
                  ? "bg-indigo-600 text-white border-transparent"
                  : isDarkMode
                  ? "border-gray-700 bg-transparent text-gray-300 hover:bg-gray-800"
                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
              )}
              onClick={() => setHasPhotos(hasPhotos ? null : true)}
            >
              <Images className="h-3.5 w-3.5" />
              Photos
            </Button>
            <Button
              size="sm"
              variant={hasPrice ? "default" : "outline"}
              className={cn(
                "h-7 gap-1 rounded-full px-2 text-[11px]",
                hasPrice
                  ? "bg-indigo-600 text-white border-transparent"
                  : isDarkMode
                  ? "border-gray-700 bg-transparent text-gray-300 hover:bg-gray-800"
                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
              )}
              onClick={() => setHasPrice(hasPrice ? null : true)}
            >
              <DollarSign className="h-3.5 w-3.5" />
              Price
            </Button>
            <Button
              size="sm"
              variant={hasNotes ? "default" : "outline"}
              className={cn(
                "h-7 gap-1 rounded-full px-2 text-[11px]",
                hasNotes
                  ? "bg-indigo-600 text-white border-transparent"
                  : isDarkMode
                  ? "border-gray-700 bg-transparent text-gray-300 hover:bg-gray-800"
                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
              )}
              onClick={() => setHasNotes(hasNotes ? null : true)}
            >
              <StickyNote className="h-3.5 w-3.5" />
              Notes
            </Button>
          </div>

          <div className="flex-1 flex justify-end gap-3 items-center">
            <SortControl config={sortConfig} onChange={setSortConfig} />
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-7 rounded-full px-3 text-[11px]",
                isDarkMode
                  ? "text-gray-300 hover:bg-gray-800"
                  : "text-gray-600 hover:bg-gray-100"
              )}
              onClick={clearAllFilters}
              disabled={isSyncing}
            >
              <SlidersHorizontal className="h-3.5 w-3.5 mr-1" />
              Clear
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-800">
          <div
            className={cn(
              "min-h-full rounded-2xl border shadow-sm",
              isDarkMode
                ? "border-gray-800 bg-gray-900/40"
                : "border-gray-200 bg-white"
            )}
          >
            <div className="p-2">
              {loadingRows ? (
                <div className="space-y-3 px-2 py-4">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "flex items-center justify-between gap-4 rounded-lg border border-transparent px-3 py-3",
                        isDarkMode ? "bg-gray-900/60" : "bg-gray-50"
                      )}
                    >
                      <div className="flex flex-1 items-center gap-3">
                        <Skeleton className="h-10 w-10 rounded-md" />
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-40" />
                          <Skeleton className="h-3 w-24" />
                        </div>
                      </div>
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-4 w-20" />
                    </div>
                  ))}
                </div>
              ) : filteredAndSortedRows.length === 0 ? (
                <EmptyState
                  isDark={isDarkMode}
                  testedView={statusFilter === "TESTED"}
                  onShowPosted={() => setStatusFilter("POSTED")}
                  onClear={clearAllFilters}
                />
              ) : (
                <ProductList
                  rows={visible}
                  visibleCount={visibleCount}
                  onLoadMore={() => setVisibleCount((n) => n + 24)}
                  onRowUpdate={onRowUpdate}
                  isDarkMode={isDarkMode}
                  user={user}
                />
              )}
            </div>
          </div>
        </div>

        <ChatWidget user={user} />
      </main>
    </div>
  );
}