// src/components/manager/GlobalSearch.tsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Search, Loader2, Building, FileText, ListOrdered, X, CornerDownLeft, Package, DollarSign, Calendar, Hash } from "lucide-react";
import { apiGet, cls } from "@/lib/api";
import { useDebounce } from "@/hooks/useDebounce";

// Types remain the same
type VendorResult = { id: string; name: string; po_count: number; };
type POResult = { id: string; po_number: string; vendor_name: string; created_at: string; total_lines_qty: number; est_cost: number; };
type LineResult = { line_id: string; po_id: string; po_number: string; vendor_name: string; product_name_raw: string; synergy_id: string | null; upc: string | null; asin: string | null; qty: number; unit_cost: number | null; };

type SearchResults = {
  vendors: VendorResult[];
  pos: POResult[];
  lines: LineResult[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  onPickPO: (po: { id: string; po_number: string }) => void;
  onPickLine: (poId: string, lineId: string) => void;
};

// Helper functions remain the same
function formatDate(isoString: string | null) {
  if (!isoString) return '';
  return new Date(isoString).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
function formatCurrency(n: number | null) {
  if (n == null) return '';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

// --- Main Component ---
export default function GlobalSearch({ open, onClose, onPickPO, onPickLine }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const debouncedQuery = useDebounce(query, 250);

  // --- START OF SCROLLING FIX ---
  const scrollContainerRef = useRef<HTMLUListElement>(null);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);
  // --- END OF SCROLLING FIX ---

  const flatResults = React.useMemo(() => {
    if (!results) return [];
    return [
      ...results.pos.map(p => ({ type: 'po' as const, data: p })),
      ...results.lines.map(l => ({ type: 'line' as const, data: l })),
      ...results.vendors.map(v => ({ type: 'vendor' as const, data: v })),
    ];
  }, [results]);

  const performSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<SearchResults>(`/search?q=${encodeURIComponent(q)}`);
      setResults(data);
    } catch (e: any) {
      setError("Search failed: Could not connect to the server.");
      setResults(null);
    } finally {
      setLoading(false);
      setActiveIndex(0);
    }
  }, []);

  useEffect(() => {
    performSearch(debouncedQuery);
  }, [debouncedQuery, performSearch]);

  const handleSelect = (index: number) => {
    const item = flatResults[index];
    if (!item) return;

    if (item.type === 'po') {
      onPickPO({ id: item.data.id, po_number: item.data.po_number });
    } else if (item.type === 'line') {
      onPickLine(item.data.po_id, item.data.line_id);
    } else if (item.type === 'vendor') {
      console.log("Vendor selected, no action defined yet.", item.data);
    }
    onClose();
  };

  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex(prev => Math.min(prev + 1, flatResults.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleSelect(activeIndex);
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [open, activeIndex, flatResults, onClose]);

  useEffect(() => {
    itemRefs.current = [];
  }, [results]);

  useEffect(() => {
    const activeItem = itemRefs.current[activeIndex];
    if (activeItem) {
      activeItem.scrollIntoView({
        block: 'nearest',
      });
    }
  }, [activeIndex]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults(null);
      setError(null);
      setLoading(false);
    }
  }, [open]);

  if (!open || !mounted) return null;

  return createPortal(
    // CHANGED: Removed backdrop-blur-sm, using solid bg-black/60
    <div className="fixed inset-0 z-50 flex justify-center items-start pt-20 bg-black/60" onClick={onClose}>
      <div className="w-full max-w-2xl bg-card rounded-xl border shadow-2xl" role="dialog" onClick={e => e.stopPropagation()}>
        <div className="relative flex items-center border-b">
          <Search className="absolute left-4 h-5 w-5 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search POs, products, vendors, Synergy IDs..."
            className="w-full bg-transparent h-14 pl-12 pr-4 text-base outline-none"
            autoFocus
          />
          {loading && <Loader2 className="animate-spin h-5 w-5 mr-4 text-muted-foreground" />}
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {error && <div className="p-4 text-center text-rose-500">{error}</div>}
          
          {!results && !loading && !error && (
            <div className="p-8 text-center text-muted-foreground">
              {debouncedQuery.length < 2 ? "Enter at least 2 characters to search." : "No results found."}
            </div>
          )}

          {results && flatResults.length === 0 && !loading && (
             <div className="p-8 text-center text-muted-foreground">No results found for "{debouncedQuery}".</div>
          )}

          {results && (
            <ul ref={scrollContainerRef}> 
              {flatResults.map((item, index) => {
                 const prevItem = index > 0 ? flatResults[index - 1] : null;
                 const showHeader = !prevItem || prevItem.type !== item.type;
                 
                 return (
                    <React.Fragment key={`${item.type}-${item.data.id || item.data.line_id}`}>
                      {showHeader && (
                        <li className="px-3 pt-3 pb-2 text-xs font-semibold text-muted-foreground uppercase">
                          {item.type === 'po' ? 'Purchase Orders' : item.type === 'line' ? 'Products' : 'Vendors'}
                        </li>
                      )}
                      <SearchResultItem
                        ref={(el: HTMLLIElement | null) => (itemRefs.current[index] = el)}
                        active={activeIndex === index}
                        onClick={() => handleSelect(index)}
                      >
                        {item.type === 'po' && <POResultItem data={item.data as POResult} />}
                        {item.type === 'line' && <LineResultItem data={item.data as LineResult} />}
                        {item.type === 'vendor' && <VendorResultItem data={item.data as VendorResult} />}
                      </SearchResultItem>
                    </React.Fragment>
                 )
              })}
            </ul>
          )}
        </div>
        {flatResults.length > 0 && (
          <div className="border-t p-2 text-xs text-muted-foreground flex items-center justify-between">
            <span>Use ↑/↓ to navigate, <CornerDownLeft className="inline h-3 w-3 mx-1"/> to select.</span>
            <button onClick={onClose} className="px-2 py-1 rounded hover:bg-muted">Esc</button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

const SearchResultItem = React.forwardRef<HTMLLIElement, any>(({ children, active, ...props }, ref) => {
  return (
    <li
      ref={ref}
      className={cls(
        "flex items-center p-3 rounded-md cursor-pointer",
        active ? "bg-primary/10 text-primary font-semibold" : "hover:bg-muted/50"
      )}
      {...props}
    >
      {children}
    </li>
  );
});

function VendorResultItem({ data }: { data: VendorResult }) {
  return (
    <div className="flex items-center w-full">
      <Building className="h-5 w-5 mr-3 text-muted-foreground" />
      <span className="font-medium">{data.name}</span>
      <span className="ml-auto text-sm text-muted-foreground">{data.po_count} POs</span>
    </div>
  );
}

function POResultItem({ data }: { data: POResult }) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <FileText className="h-5 w-5 mr-3 text-muted-foreground" />
          <span className="font-medium">{data.po_number}</span>
        </div>
        <span className="text-sm font-semibold">{formatCurrency(data.est_cost)}</span>
      </div>
      <div className="text-xs text-muted-foreground mt-1.5 flex items-center justify-between pl-8">
        <span>{data.vendor_name}</span>
        <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><Package className="h-3 w-3"/> {data.total_lines_qty} units</span>
            <span className="flex items-center gap-1"><Calendar className="h-3 w-3"/> {formatDate(data.created_at)}</span>
        </div>
      </div>
    </div>
  );
}

function LineResultItem({ data }: { data: LineResult }) {
  return (
    <div className="w-full">
      <div className="flex items-center">
        <ListOrdered className="h-5 w-5 mr-3 mt-0.5 self-start text-muted-foreground" />
        <div className="flex-1">
          <p className="font-medium leading-snug">{data.product_name_raw}</p>
          <div className="text-xs text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            {data.synergy_id && <span className="font-mono text-blue-500 flex items-center gap-1"><Hash className="h-3 w-3"/>{data.synergy_id}</span>}
            {data.upc && <span className="font-mono">UPC: {data.upc}</span>}
            {data.asin && <span className="font-mono">ASIN: {data.asin}</span>}
          </div>
          <div className="text-xs text-muted-foreground mt-1.5 flex items-center justify-between">
              <span>in PO {data.po_number}</span>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1"><Package className="h-3 w-3"/> Qty: {data.qty}</span>
                <span className="flex items-center gap-1"><DollarSign className="h-3 w-3"/> {formatCurrency(data.unit_cost)}</span>
              </div>
          </div>
        </div>
      </div>
    </div>
  );
}