// src/components/manager/WorkbenchList.tsx
import React, { useMemo, useState } from "react";
import { Section } from "@/components/ui/Section";
import { List, Search, Package, DollarSign, ChevronDown, ChevronUp, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { DateRange } from "react-day-picker";
import { formatDate, cls } from "@/lib/api";
import type { PurchaseOrderSummary } from "@/types/manager";

// Helper Functions (Unchanged)
function formatCompact(n: number | null | undefined): string {
  if (n == null) return "0";
  return new Intl.NumberFormat("en-US", { notation: "compact", compactDisplay: "short" }).format(n);
}

interface EnrichedPurchaseOrderSummary extends PurchaseOrderSummary {
  posted_count?: number;
  scrap_count?: number; // Ensure your backend /pos/summaries includes this!
}

type POStatus = "completed" | "inProgress" | "new";

// UPDATE: Adjusted Logic to include Scrap in completion check
const getPOStatus = (po: EnrichedPurchaseOrderSummary): POStatus => {
  const totalUnits = po.total_lines_qty ?? 0;
  const postedCount = po.posted_count ?? 0;
  const scrapCount = po.scrap_count ?? 0; // Capture scrap
  
  // A PO is completed if the sum of Posted + Scrap covers the total units
  const processedCount = postedCount + scrapCount;

  if (totalUnits > 0 && processedCount >= totalUnits) {
    return "completed";
  }
  
  // It is in progress if we have started minting OR have posted/scrapped anything
  if (po.minted_any || processedCount > 0) {
    return "inProgress";
  }
  
  return "new";
};

function StatusPill({ po }: { po: EnrichedPurchaseOrderSummary }) {
  const status = getPOStatus(po);
  const statusMap: Record<POStatus, { text: string; className: string }> = {
    completed: { text: "Completed", className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
    inProgress: { text: "In Progress", className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
    new: { text: "New", className: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300" },
  };
  const { text, className } = statusMap[status];
  return <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${className}`}>{text}</span>;
}

const CalendarView = ({ allPOs, activePOId, onSelect }: { allPOs: EnrichedPurchaseOrderSummary[], activePOId: string | null, onSelect: (p: EnrichedPurchaseOrderSummary) => void }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const posByDate = useMemo(() => {
    return allPOs.reduce((acc, po) => {
      const dateKey = new Date(po.created_at).toISOString().split('T')[0];
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(po);
      return acc;
    }, {} as Record<string, EnrichedPurchaseOrderSummary[]>);
  }, [allPOs]);

  const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
  const startDay = startOfMonth.getDay();

  const daysInMonth = Array.from({ length: endOfMonth.getDate() }, (_, i) => i + 1);
  const leadingEmptyDays = Array.from({ length: startDay }, () => null);

  const handleDayClick = (day: number) => {
    const newSelectedDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    setSelectedDate(newSelectedDate);
  };
  
  const selectedPOs = useMemo(() => {
      if (!selectedDate) return [];
      const dateKey = selectedDate.toISOString().split('T')[0];
      return posByDate[dateKey] || [];
  }, [selectedDate, posByDate]);

  return (
    <div className="p-1">
      <div className="flex items-center justify-between mb-2">
        <Button variant="ghost" size="icon" onClick={() => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-sm font-semibold text-center">
          {currentDate.toLocaleString('default', { month: 'long' })} {currentDate.getFullYear()}
        </div>
        <Button variant="ghost" size="icon" onClick={() => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-xs text-center text-muted-foreground mb-1">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {leadingEmptyDays.map((_, i) => <div key={`empty-${i}`} />)}
        {daysInMonth.map(day => {
          const dateKey = new Date(currentDate.getFullYear(), currentDate.getMonth(), day).toISOString().split('T')[0];
          const poCount = posByDate[dateKey]?.length || 0;
          const isSelected = selectedDate?.toISOString().split('T')[0] === dateKey;

          return (
            <button
              key={day}
              onClick={() => handleDayClick(day)}
              disabled={poCount === 0}
              className={cls(
                "h-8 w-8 rounded-full text-xs flex items-center justify-center relative transition-colors",
                poCount > 0 ? "hover:bg-muted font-semibold" : "text-muted-foreground",
                isSelected ? "bg-primary text-primary-foreground" : (poCount > 0 ? "bg-muted/50" : "")
              )}
            >
              {day}
              {poCount > 0 && <span className="absolute -top-1 -right-1 h-3 w-3 bg-blue-500 text-white rounded-full text-[8px] flex items-center justify-center">{poCount}</span>}
            </button>
          );
        })}
      </div>
      
      {selectedDate && (
        <div className="mt-4">
          <h4 className="font-semibold text-sm mb-2">POs for {selectedDate.toLocaleDateString()}</h4>
          <div className="border rounded-md max-h-56 overflow-y-auto">
            {selectedPOs.length === 0 ? <p className="p-4 text-center text-xs text-muted-foreground">No POs on this date.</p> :
              selectedPOs.map(p => (
                <button
                  key={p.id}
                  onClick={() => onSelect(p)}
                  className={cls("w-full text-left p-2 border-b last:border-b-0", activePOId === p.id ? "bg-primary/10" : "hover:bg-muted/50")}
                >
                   <div className="font-semibold text-sm">{p.po_number}</div>
                   <div className="text-xs text-muted-foreground">{p.vendor_name}</div>
                </button>
              ))
            }
          </div>
        </div>
      )}
    </div>
  );
};

export default function WorkbenchList({
  allPOs,
  activePOId,
  onSelect,
  onUploadClick,
}: {
  allPOs: EnrichedPurchaseOrderSummary[];
  activePOId: string | null;
  onSelect: (p: EnrichedPurchaseOrderSummary) => void;
  onUploadClick: () => void;
}) {
  const [filterText, setFilterText] = useState("");
  const [collapsedVendors, setCollapsedVendors] = useState<Record<string, boolean>>({});
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  
  const [statusFilter, setStatusFilter] = useState<POStatus[]>([]);
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const activeFilterCount = (statusFilter.length > 0 ? 1 : 0) + (dateRange?.from ? 1 : 0);

  const toggleVendor = (vendorName: string) => {
    setCollapsedVendors(prev => ({ ...prev, [vendorName]: !prev[vendorName] }));
  };

  const groupedPOs = useMemo(() => {
    let filteredPOs = allPOs;

    if (statusFilter.length > 0) {
      filteredPOs = filteredPOs.filter(po => statusFilter.includes(getPOStatus(po)));
    }

    if (dateRange?.from) {
      filteredPOs = filteredPOs.filter(po => {
        const poDate = new Date(po.created_at);
        poDate.setHours(0, 0, 0, 0);
        const fromDate = new Date(dateRange.from!);
        fromDate.setHours(0, 0, 0, 0);
        if (dateRange.to) {
          const toDate = new Date(dateRange.to);
          toDate.setHours(0, 0, 0, 0);
          return poDate >= fromDate && poDate <= toDate;
        }
        return poDate.getTime() === fromDate.getTime();
      });
    }

    const needle = filterText.trim().toLowerCase();
    if (needle) {
      filteredPOs = filteredPOs.filter(
        (p) =>
          p.po_number?.toLowerCase().includes(needle) ||
          p.vendor_name?.toLowerCase().includes(needle)
      );
    }

    return filteredPOs.reduce((acc, po) => {
      const vendorName = po.vendor_name || "Unassigned";
      if (!acc[vendorName]) acc[vendorName] = [];
      acc[vendorName].push(po);
      return acc;
    }, {} as Record<string, EnrichedPurchaseOrderSummary[]>);
  }, [allPOs, filterText, statusFilter, dateRange]);

  const vendorOrder = useMemo(() => Object.keys(groupedPOs).sort(), [groupedPOs]);

  const areAllCollapsed = useMemo(() => {
    if (vendorOrder.length === 0) return false;
    return vendorOrder.every(vendorName => collapsedVendors[vendorName]);
  }, [vendorOrder, collapsedVendors]);

  const handleToggleAll = () => {
    const shouldCollapse = !areAllCollapsed;
    const nextState: Record<string, boolean> = {};
    vendorOrder.forEach(vendorName => {
      nextState[vendorName] = shouldCollapse;
    });
    setCollapsedVendors(nextState);
  };

  return (
    <Section title="Purchase Order Workbench" icon={<List className="h-5 w-5 text-primary" />}>
      <div className="flex flex-col gap-3">
        <Button className="w-full" onClick={onUploadClick}>
          Upload New Purchase Order Sheet
        </Button>
        
        <div className="flex items-center gap-2">
          <div className="relative flex-grow">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter by PO or vendor..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="pl-8"
              disabled={viewMode === 'calendar'}
            />
          </div>
          
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="relative">
                <Filter className="h-4 w-4 mr-2" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 w-4 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-sm mb-2">Status</h4>
                  <div className="space-y-2">
                    {(['new', 'inProgress', 'completed'] as const).map(status => (
                      <div key={status} className="flex items-center space-x-2">
                        <Checkbox
                          id={`status-${status}`}
                          checked={statusFilter.includes(status)}
                          onCheckedChange={(checked) => {
                            setStatusFilter(prev => checked ? [...prev, status] : prev.filter(s => s !== status));
                          }}
                        />
                        <label htmlFor={`status-${status}`} className="text-sm">
                          {status === 'inProgress' ? 'In Progress' : status.charAt(0).toUpperCase() + status.slice(1)}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="font-medium text-sm mb-2">Date Range</h4>
                  <DayPicker
                    mode="range"
                    selected={dateRange}
                    onSelect={setDateRange}
                    captionLayout="dropdown-buttons"
                    fromYear={2020}
                    toYear={new Date().getFullYear()}
                  />
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => { setStatusFilter([]); setDateRange(undefined); }}
                  disabled={activeFilterCount === 0}
                >
                  Clear All Filters
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          
          <div className="flex rounded-md border p-0.5">
            <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="icon" onClick={() => setViewMode('list')} title="List View"><List className="h-4 w-4"/></Button>
            <Button variant={viewMode === 'calendar' ? 'secondary' : 'ghost'} size="icon" onClick={() => setViewMode('calendar')} title="Calendar View"><CalendarIcon className="h-4 w-4"/></Button>
            {/* --- START OF ICON CHANGE --- */}
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleToggleAll} 
              title={areAllCollapsed ? 'Expand All' : 'Collapse All'}
              disabled={viewMode !== 'list' || vendorOrder.length <= 1}
              className="border-l"
            >
              {/* Logic to show the correct icon based on state */}
              {areAllCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
            {/* --- END OF ICON CHANGE --- */}
          </div>
        </div>

        {viewMode === 'list' && (
          <div className="border rounded-md max-h-[60vh] overflow-y-auto">
            {vendorOrder.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No purchase orders match your filters.
              </div>
            ) : (
              vendorOrder.map(vendorName => (
                <div key={vendorName} className="border-b last:border-b-0">
                  <button
                    onClick={() => toggleVendor(vendorName)}
                    className="w-full flex items-center justify-between font-bold text-sm bg-muted/50 px-3 py-2 sticky top-0 z-10 hover:bg-muted/70"
                  >
                    <span>{vendorName}</span>
                    {collapsedVendors[vendorName] ? <ChevronUp className="h-4 w-4"/> : <ChevronDown className="h-4 w-4"/>}
                  </button>
                  {!collapsedVendors[vendorName] && groupedPOs[vendorName].map((p) => (
                    <button
                      key={p.id}
                      onClick={() => onSelect(p)}
                      className={cls(
                        "w-full text-left p-3 border-t hover:bg-muted/50 transition-colors relative",
                        activePOId === p.id && "bg-primary/10"
                      )}
                    >
                      {activePOId === p.id && <div className="absolute left-0 top-0 h-full w-1 bg-primary rounded-r-full" />}
                      <div className="flex justify-between items-center">
                        <span className="font-semibold">{p.po_number}</span>
                        <StatusPill po={p} />
                      </div>
                      <div className="text-xs text-muted-foreground mt-2 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1" title="Total Items">
                            <Package className="h-3.5 w-3.5" /> {formatCompact(p.total_lines_qty)}
                          </span>
                          <span className="flex items-center gap-1" title="Estimated Cost">
                             <DollarSign className="h-3.5 w-3.5" /> {formatCompact(p.est_cost)}
                          </span>
                        </div>
                        <span>{formatDate(p.created_at)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        )}
        
        {viewMode === 'calendar' && (
          <div className="border rounded-md p-2">
            <CalendarView allPOs={allPOs} activePOId={activePOId} onSelect={onSelect} />
          </div>
        )}
      </div>
    </Section>
  );
}