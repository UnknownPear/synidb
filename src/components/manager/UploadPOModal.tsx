
// src/components/UploadPOModal.tsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { 
  X, UploadCloud, PlusCircle, Loader2, Brain, List, Trash2, 
  Library, File as FileIcon, PackageSearch, Tag, Hash, DollarSign, Package, 
  FileText, AlertTriangle, CheckCircle2, Info, Building2, Calendar, FileSpreadsheet, StickyNote, Cpu,
  MemoryStick,
  Database
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { API_BASE } from "@/lib/api";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress"; 
import { Badge } from "@/components/ui/badge"; // Add Badge

type Vendor = { id: string; name: string; po_count: number };
type ExistingPOSummary = {
  id: string;
  po_number: string | null;
  created_at: string;
  total_units: number;
  estimated_total_cost: number;
};
type PreviewPOLine = {
  product_name_raw: string | null;
  qty: number | null;
  unit_cost: number | null;
  msrp: number | null;
  upc?: string | null;
  category_guess?: string | null;
  specs?: Record<string, string>;
  item_notes?: string | null;
};

type StagedLine = PreviewPOLine & {
  splitLine: boolean;
};

type UploadPreviewResponse = {
  ok: boolean;
  vendor_id: string;
  file_name: string;
  new_po_lines: PreviewPOLine[];
  existing_pos_summary: ExistingPOSummary[];
  headers_seen?: string[];
  ai_notes?: string;
  ai_model?: string;
};
type Category = { id: string; label: string; prefix?: string | null };
type AiHealth = { genai_imported: boolean; has_key: boolean; ai_first: boolean; configured: boolean };

type ManualLineInput = {
  name: string;
  qty: string;
  unitCost: string;
  msrp: string;
  upc: string;
};
const INITIAL_MANUAL_INPUT: ManualLineInput = {
  name: "",
  qty: "1",
  unitCost: "",
  msrp: "",
  upc: "",
};

function join(base: string, path: string) {
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function money(v: number | null | undefined) {
  return v === null || typeof v === "undefined" ? "—" : `$${Number(v).toFixed(2)}`;
}

function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// --- START OF STREAMING UI: New Progress Component ---
function StreamingProgress({ progress, error }: { progress: { pct: number; label: string } | null; error: string | null }) {
    if (error) {
        return (
            <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 animate-in fade-in slide-in-from-top-2">
                <h4 className="font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4"/> Preview Failed</h4>
                <p className="text-sm mt-1">{error}</p>
            </div>
        );
    }
    if (!progress) return null;

    return (
        <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 space-y-3 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center justify-between text-sm font-semibold text-blue-800 dark:text-blue-300">
                <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                    <span>Processing File...</span>
                </div>
                <span className="font-mono text-xs opacity-80">{progress.pct}%</span>
            </div>
            <Progress value={progress.pct} className="w-full h-2" />
            <p className="text-xs text-blue-700 dark:text-blue-400 font-medium truncate">{progress.label}</p>
        </div>
    );
}
// --- END OF STREAMING UI ---


export default function UploadPOModal({
  vendors,
  onClose,
  onSuccess,
  apiBase = API_BASE,
  aiPaths = { health: "/ai/health", preview: "/imports/ai-preview-stream", upload: "/imports/ai-upload" },
}: {
  vendors: Vendor[];
  onClose: () => void;
  onSuccess: (poId: string) => void | Promise<void>;
  onJobEnqueued?: (jobId: string, poNumber: string) => void;
  apiBase?: string;
  aiPaths?: { health: string; preview: string; upload: string };
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const [mode, setMode] = useState<"upload" | "manual">("upload");
  const [step, setStep] = useState<"initial" | "preview">("initial");

  const [useAI, setUseAI] = useState(true); 
  const [selectedModel, setSelectedModel] = useState("openai");

  const [file, setFile] = useState<File | null>(null);
  const [vendorId, setVendorId] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [previewData, setPreviewData] = useState<UploadPreviewResponse | null>(null);
  const [filterMode, setFilterMode] = useState<"all" | "errors">("all");

  const [aiHealth, setAiHealth] = useState<AiHealth | null>(null);
  const [aiModel, setAiModel] = useState<string>("");
  const [aiNotes, setAiNotes] = useState<string>("");
  const [expandUnits, setExpandUnits] = useState(true);
  
  const [manualExpandUnits, setManualExpandUnits] = useState(false);

  const [vendorMode, setVendorMode] = useState<"existing" | "new">("existing");
  const [newVendorName, setNewVendorName] = useState("");
  const [vendorsLocal, setVendorsLocal] = useState<Vendor[]>(vendors);
  const [categories, setCategories] = useState<Category[]>([]);
  const [defaultCategoryId, setDefaultCategoryId] = useState<string>("");

  const [stagedLines, setStagedLines] = useState<StagedLine[]>([]);
  const [manualInput, setManualInput] = useState<ManualLineInput>(INITIAL_MANUAL_INPUT);
  
  const [isBulkUpcOpen, setIsBulkUpcOpen] = useState(false);
  const [bulkUpcText, setBulkUpcText] = useState("");

  const [selectedIndices, setSelectedIndices] = useState<Record<number, boolean>>({});

  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [streamProgress, setStreamProgress] = useState<{ pct: number; label: string } | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);

  const isManualCommitPending = useRef(false);

  const selectedCount = useMemo(() => Object.values(selectedIndices).filter(Boolean).length, [selectedIndices]);
  const allSelected = useMemo(() => stagedLines.length > 0 && selectedCount === stagedLines.length, [stagedLines, selectedCount]);
  const someSelected = useMemo(() => selectedCount > 0 && !allSelected, [selectedCount, allSelected]);

  const toggleSelection = useCallback((index: number) => { setSelectedIndices(prev => ({ ...prev, [index]: !prev[index] })); }, []);
  const toggleSelectAll = useCallback(() => { if (allSelected) { setSelectedIndices({}); } else { const newSelection: Record<number, boolean> = {}; stagedLines.forEach((_, index) => { newSelection[index] = true; }); setSelectedIndices(newSelection); } }, [allSelected, stagedLines]);
  const handleDeleteSelected = useCallback(() => { if (selectedCount === 0) return; if (window.confirm(`Are you sure you want to delete ${selectedCount} selected line(s)?`)) { setStagedLines(prev => prev.filter((_, index) => !selectedIndices[index])); setSelectedIndices({}); } }, [selectedCount, selectedIndices]);

  // Safe Close Handler
  const handleSafeClose = () => {
      if (isLoading) {
          if (!window.confirm("A parsing/upload process is currently running.\n\nAre you sure you want to close? All progress will be lost.")) {
              return;
          }
      }
      onClose();
  };

  useEffect(() => {
    fetch(join(apiBase, aiPaths.health)).then(r => r.ok ? r.json() : null).then(setAiHealth).catch(() => setAiHealth(null));
    fetch(join(apiBase, "/categories"), { credentials: "include" }).then(r => r.ok ? r.json() : []).then((cats: Category[]) => setCategories((cats || []).sort((a, b) => a.label.localeCompare(b.label)))).catch(() => setCategories([]));
    fetch(join(apiBase, "/vendors"), { credentials: "include" }).then(r => r.ok ? r.json() : vendors).then(setVendorsLocal).catch(() => setVendorsLocal(vendors));
  }, []);

  const selectedVendor = useMemo(() => vendorsLocal.find((v) => v.id === vendorId) || null, [vendorsLocal, vendorId]);
  const aiOn = !!aiHealth?.configured && !!aiHealth?.has_key && !!aiHealth?.genai_imported;

  async function ensureVendorId(): Promise<string> {
    if (vendorMode === "existing") {
      if (!vendorId) throw new Error("Select a vendor.");
      return vendorId;
    }
    const name = newVendorName.trim();
    if (!name) throw new Error("Enter a vendor name.");
    const resp = await fetch(join(apiBase, "/vendors"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name }),
    });
    if (!resp.ok) throw new Error(await resp.text());
    const created = (await resp.json()) as Vendor;
    setVendorsLocal((prev) => (prev.some((v) => v.id === created.id) ? prev : [...prev, created]));
    setVendorId(created.id);
    return created.id;
  }

  const getPreview = useCallback(async () => {
    if (!file) {
      alert("Choose a CSV or XLSX file.");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      alert("File is too large (Maximum 50MB). Please split the file.");
      return;
    }
    if (!poNumber.trim()) {
      alert("Please enter a PO/Lot #.");
      return;
    }

    setIsLoading(true);
    setStreamProgress({ pct: 1, label: "Initializing..." });
    setStreamError(null);
    setPreviewData(null);
    setFilterMode("all");

    try {
      const id = await ensureVendorId();
      const fd = new FormData();
      fd.append("po_file", file);
      fd.append("expand_units", String(expandUnits));
      
      fd.append("limit_rows", "8000"); 

       fd.append("require_ai", String(useAI)); 
      fd.append("ai_model", selectedModel);   

      const url = `${apiBase}${aiPaths.preview}/${encodeURIComponent(id)}`;

      const response = await fetch(url, { method: "POST", body: fd });
      if (!response.ok || !response.body) {
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let sepIndex: number;
        while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
          const rawEvent = buffer.slice(0, sepIndex).trim();
          buffer = buffer.slice(sepIndex + 2); 

          if (!rawEvent) continue;
          if (rawEvent.startsWith(":")) continue;

          const dataLine = rawEvent
            .split("\n")
            .map((l) => l.trim())
            .find((l) => l.startsWith("data:"));

          if (!dataLine) continue;
          const dataString = dataLine.replace(/^data:\s*/, "");

          try {
            const event = JSON.parse(dataString);

            if (event.type === "progress") {
              setStreamProgress({
                pct: typeof event.pct === "number" ? event.pct : 1,
                label: event.label || "Working…",
              });
            } else if (event.type === "complete") {
              const data: UploadPreviewResponse = {
                ok: true,
                vendor_id: id,
                file_name: file.name,
                new_po_lines: event.payload?.new_po_lines || [],
                existing_pos_summary: event.payload?.existing_pos_summary || [],
                headers_seen: event.payload?.headers_seen || [],
                ai_notes: event.payload?.ai_notes,
                ai_model: event.payload?.ai_model,
              };
              setAiModel(event.payload?.ai_model || "");
              setAiNotes(event.payload?.ai_notes || "");
              setPreviewData(data);
              setStep("preview");
              setIsLoading(false);
              setStreamProgress(null);
              return;
            } else if (event.type === "error") {
              throw new Error(event.message || "Server error");
            } else if (event.type === "log") {
              console.debug("[AI LOG]", event.message || event.msg || event.text || event);
            } else if (event.type === "ping") {
                if (event.label) {
                    setStreamProgress(prev => prev ? ({ ...prev, label: event.label }) : null);
                }
            }
          } catch (err) {
            console.error("Failed to parse stream event:", dataString, err);
          }
        }
      }

      setIsLoading(false);
      setStreamProgress(null);
      setStreamError("Preview stream ended unexpectedly.");
    } catch (e: any) {
      setStreamError(e.message || "An unknown error occurred during preview.");
      setIsLoading(false);
      setStreamProgress(null);
    }
  }, [
    file,
    poNumber,
    vendorId,
    newVendorName,
    vendorMode,
    expandUnits,
    apiBase,
    aiPaths.preview,
  ]);

  async function doUpload() {
    if (!previewData || (previewData.new_po_lines || []).length === 0) {
      alert("Nothing to commit. Run Preview first.");
      return;
    }
    if (!poNumber.trim()) {
      alert("Please enter a PO/Lot #.");
      return;
    }
    if ((vendorMode === "existing" && !vendorId) || (vendorMode === "new" && !newVendorName.trim())) {
      alert("Please choose or create a vendor.");
      return;
    }

    setIsLoading(true);
    
    const makeJSONPayload = (allowAppend: boolean) => ({
      po_number: poNumber.trim(),
      vendor_id: vendorMode === "existing" ? vendorId : undefined,
      vendor_name: vendorMode === "new" ? newVendorName.trim() : undefined,
      allow_append: allowAppend,
      expand_units: expandUnits,
      category_id: defaultCategoryId || undefined,
      lines: previewData!.new_po_lines,
    });

    try {
      let res = await fetch(`${apiBase}/imports/manual-commit`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(makeJSONPayload(false)),
      });

      if (res.status === 409) {
        const j = await res.json().catch(() => ({} as any));
        const existingId = String(j?.detail?.id || j?.id || "");
        if (window.confirm("A PO with this number already exists for this vendor.\n\nAppend these lines to it?")) {
          res = await fetch(`${apiBase}/imports/manual-commit`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(makeJSONPayload(true)),
          });
        } else {
            setIsLoading(false);
            return;
        }
      }

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Commit failed (${res.status}): ${txt}`);
      }

      const j = await res.json();
      alert(`Committed ${j.created_lines ?? 0} lines to PO ${poNumber}.`);
      await onSuccess(String(j.po_id));
      onClose();
    } catch (e: any) {
      alert("Commit failed: " + (e?.message || "unknown error"));
      setIsLoading(false);
    }
  }

  async function doCreateBarePO() {
    if (!poNumber.trim()) {
      alert("Please enter a PO/Lot #.");
      return;
    }
    setIsLoading(true);
    try {
      const id = await ensureVendorId();
      const res = await fetch(join(apiBase, "/purchase_orders"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ po_number: poNumber.trim(), vendor_id: id }),
      });

      if (res.status === 409) {
        let existingId = "";
        try { const j = await res.json(); existingId = String(j?.detail?.id || j?.id || ""); } catch {}
        if (existingId && window.confirm("A PO with this number already exists. Open it?")) {
          onSuccess(existingId);
          onClose();
        }
        return;
      }

      if (!res.ok) throw new Error(await res.text());

      const j = await res.json();
      alert(`Created PO ${poNumber} (no lines yet).`);
      onSuccess(String(j.id));
      onClose();
    } catch (e: any) {
      alert("Create failed: " + (e?.message || "unknown error"));
    } finally {
      setIsLoading(false);
    }
  }

  const handleAddStagedLine = (e: React.FormEvent) => {
    e.preventDefault();
    const { name, qty, unitCost, msrp, upc } = manualInput;
    if (!name.trim()) return alert("Product name cannot be empty.");
    const parsedQty = parseInt(qty, 10);
    if (!Number.isFinite(parsedQty) || parsedQty <= 0) return alert("Quantity must be a positive number.");
    const newLine: StagedLine = { product_name_raw: name.trim(), qty: parsedQty, unit_cost: unitCost ? Number(unitCost.replace(/[^0-9.]/g, "")) : null, msrp: msrp ? Number(msrp.replace(/[^0-9.]/g, "")) : null, upc: upc.trim() || undefined, splitLine: manualExpandUnits };
    setStagedLines(prev => [...prev, newLine]);
    setManualInput(INITIAL_MANUAL_INPUT);
    document.getElementById("manual-input-name")?.focus();
  };

  function cleanCpuString(cpu: string | null | undefined): string {
  if (!cpu) return "";
  return cpu
    .replace(/Intel\(R\)/yi, "")
    .replace(/Core\(TM\)/yi, "")
    .replace(/CPU/yi, "")
    .replace(/@.*/, "") // Remove clock speed
    .replace(/1\dth Gen/yi, "")
    .replace(/Processor/yi, "")
    .trim();
}

  const handleRemoveStagedLine = (index: number) => {
    setStagedLines(prev => prev.filter((_, i) => i !== index));
    setSelectedIndices(prev => { const newSelection = { ...prev }; delete newSelection[index]; return newSelection; });
  };
  
  const manualTotals = useMemo(() => {
    const cost = stagedLines.reduce((acc, line) => acc + (line.unit_cost || 0) * (line.qty || 1), 0);
    const items = stagedLines.reduce((acc, line) => acc + (line.qty || 1), 0);
    return { cost, items };
  }, [stagedLines]);

  useEffect(() => {
    if (previewData && isManualCommitPending.current) {
      isManualCommitPending.current = false;
      void doUpload();
    }
  }, [previewData, doUpload]);

  const handleBulkUpcSubmit = () => {
    const { name, unitCost, msrp } = manualInput;
    if (!name.trim()) return alert("Product name cannot be empty.");
    const upcs = bulkUpcText.split('\n').map(u => u.trim()).filter(Boolean);
    if (upcs.length === 0) return alert("Please paste at least one UPC.");
    const newLines: StagedLine[] = upcs.map(upc => ({ product_name_raw: name.trim(), qty: 1, unit_cost: unitCost ? Number(unitCost.replace(/[^0-9.]/g, "")) : null, msrp: msrp ? Number(msrp.replace(/[^0-9.]/g, "")) : null, upc: upc, splitLine: false }));
    setStagedLines(prev => [...prev, ...newLines]);
    setManualInput(INITIAL_MANUAL_INPUT);
    setIsBulkUpcOpen(false);
    setBulkUpcText("");
  };
  
  const upcCount = useMemo(() => bulkUpcText.split('\n').map(u => u.trim()).filter(Boolean).length, [bulkUpcText]);
  
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragging(false); const files = e.dataTransfer.files; if (files && files[0]) setFile(files[0]); };
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files && e.target.files[0]) setFile(e.target.files[0]); };

  const analysis = useMemo(() => {
    if (!previewData?.new_po_lines) return null;

    const lines = previewData.new_po_lines;
    const totalQty = lines.reduce((acc, l) => acc + (l.qty || 0), 0);
    const totalCost = lines.reduce((acc, l) => acc + ((l.unit_cost || 0) * (l.qty || 1)), 0);
    
    const zeroCostLines = lines.filter(l => !l.unit_cost || l.unit_cost === 0);
    const missingNames = lines.filter(l => !l.product_name_raw || l.product_name_raw.trim() === "");
    const weirdChars = lines.filter(l => l.product_name_raw && /[^a-zA-Z0-9\s\-\.\(\)]/.test(l.product_name_raw) && l.product_name_raw.length > 50); 

    return { totalQty, totalCost, zeroCostLines, missingNames, weirdChars };
  }, [previewData]); 

  const visibleLines = useMemo(() => {
    if (!previewData?.new_po_lines) return [];
    if (filterMode === 'all') return previewData.new_po_lines;
    
    return previewData.new_po_lines.filter(l => 
      (!l.unit_cost || l.unit_cost === 0) || 
      (!l.product_name_raw || l.product_name_raw.trim() === "")
    );
  }, [previewData, filterMode]);

  const [, setForceUpdate] = useState(0);
  const handleLineChange = (line: PreviewPOLine, field: keyof PreviewPOLine, value: any) => {
      // @ts-ignore
      line[field] = value; 
      setForceUpdate(prev => prev + 1); 
      if (previewData) {
          setPreviewData({ ...previewData });
      }
  };

  if (!mounted) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" role="dialog">
        {/* Changed to max-h-[85vh] to allow shrinking for Step 1 but expanding for Step 2 */}
        <div className={`bg-background rounded-xl w-[min(1400px,96vw)] shadow-2xl overflow-hidden transition-all duration-300 ease-in-out flex flex-col ${step === 'initial' ? 'max-h-[85vh]' : 'h-[90vh]'}`}>
          
          {/* Header only shows for Input Step */}
          {step === 'initial' && (
            <div className="p-6 pb-4 border-b bg-background dark:bg-card flex-shrink-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between">
                <div className="flex items-center gap-3">
                    <UploadCloud className="h-6 w-6 text-primary" />
                    <h3 id="upload-po-title" className="text-xl font-bold">
                    {mode === "upload" ? `Upload New PO Sheet` : "Create New Purchase Order (Manual Entry)"}
                    </h3>
                </div>
                <div className="flex items-center gap-4 mt-3 sm:mt-0">
                    <div className="inline-flex rounded-full border bg-muted p-0.5 text-sm">
                    <button 
                        disabled={isLoading}
                        className={`px-3 py-1 rounded-full transition-colors ${mode === "upload" ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:bg-muted/70"} ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`} 
                        onClick={() => { setMode("upload"); setStep("initial"); setPreviewData(null); setStreamProgress(null); setStreamError(null); }}
                    >
                        Upload File
                    </button>
                    <button 
                        disabled={isLoading}
                        className={`px-3 py-1 rounded-full transition-colors ${mode === "manual" ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:bg-muted/70"} ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`} 
                        onClick={() => { setMode("manual"); setStep("initial"); setPreviewData(null); setStagedLines([]); }}
                    >
                        Manual Entry
                    </button>
                    </div>
                    <Button variant="ghost" size="icon" onClick={handleSafeClose}><X className="h-5 w-5" /></Button>
                </div>
                </div>
            </div>
          )}

          {/* CONTENT AREA 
            For 'initial', we use standard padding. 
            For 'preview', we use FLEX to allow full-height table + sidebar 
           */}
          <div className={`flex-1 flex flex-col overflow-hidden ${step === 'initial' ? 'p-6 overflow-y-auto' : ''}`}>
            
            {step === "initial" && (
              <div className="bg-card p-5 rounded-xl shadow-sm border space-y-5">
                {/* Top Row: Vendor & PO - COMPACT GRID */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-semibold">Vendor (Required)</Label>
                      {/* Tighter Radio Toggle */}
                      <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg">
                         <button 
                            onClick={() => setVendorMode("existing")} 
                            className={`px-2 py-0.5 text-xs font-medium rounded-md transition-all ${vendorMode === 'existing' ? 'bg-background dark:bg-slate-700 shadow text-primary dark:text-white' : 'text-muted-foreground hover:text-foreground'}`}
                         >
                            Existing
                         </button>
                         <button 
                            onClick={() => setVendorMode("new")} 
                            className={`px-2 py-0.5 text-xs font-medium rounded-md transition-all ${vendorMode === 'new' ? 'bg-background dark:bg-slate-700 shadow text-primary dark:text-white' : 'text-muted-foreground hover:text-foreground'}`}
                         >
                            Create New
                         </button>
                      </div>
                    </div>
                    
                    {vendorMode === "existing" ? ( 
                        <select 
                            className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" 
                            value={vendorId} 
                            onChange={(e) => setVendorId(e.target.value)}
                        >
                            <option value="">— Select Vendor —</option>
                            {vendorsLocal.map((v) => (<option key={v.id} value={v.id}>{v.name} ({v.po_count} POs)</option>))}
                        </select> 
                    ) : ( 
                        <div className="flex items-center gap-2">
                            <Input className="rounded-lg" value={newVendorName} onChange={(e) => setNewVendorName(e.target.value)} placeholder="Enter new vendor name" />
                            <Button variant="secondary" size="icon" onClick={async () => { try { await ensureVendorId(); } catch (e: any) { alert(e?.message || "Could not create vendor"); } }} title="Create vendor"><PlusCircle className="h-4 w-4" /></Button>
                        </div> 
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold block">PO / Lot # (Required)</Label>
                    <Input className="rounded-lg h-10" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="e.g., 22150" />
                  </div>
                </div>

                {mode === "upload" && (
                  <div className="pt-4 border-t">
                    {(streamProgress || streamError) && (
                        <div className="mb-4">
                            <StreamingProgress progress={streamProgress} error={streamError} />
                        </div>
                    )}
                    
                    {!(streamProgress || streamError) && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
                          {/* Left: Compact File Drop */}
                          <div>
                              <Label className="text-sm font-semibold block mb-1.5">Manifest File</Label>
                              {!file ? (
                                  <div
                                      onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                                      onClick={() => fileInputRef.current?.click()}
                                      className={`relative flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${isDragging ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50 dark:hover:bg-muted/20'}`}
                                  >
                                      <div className="flex flex-col items-center justify-center pt-3 pb-4 text-center">
                                          <UploadCloud className="w-6 h-6 mb-2 text-muted-foreground"/>
                                          <p className="mb-1 text-xs text-muted-foreground"><span className="font-semibold text-primary">Click to upload</span> or drag</p>
                                      </div>
                                      <input ref={fileInputRef} type="file" className="hidden" accept=".csv,.xlsx" onChange={handleFileSelect} />
                                  </div>
                              ) : (
                                  <div className="flex items-center justify-between w-full p-3 bg-muted/60 dark:bg-muted/20 border rounded-lg h-32">
                                      <div className="flex items-center gap-3 overflow-hidden">
                                          <div className="p-2 bg-background rounded border">
                                              <FileIcon className="h-6 w-6 text-blue-600" />
                                          </div>
                                          <div className="flex-1 truncate">
                                              <p className="text-sm font-medium truncate">{file.name}</p>
                                              <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                                          </div>
                                      </div>
                                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setFile(null)}><X className="h-4 w-4"/></Button>
                                  </div>
                              )}
                          </div>
                          
                         {/* Right: Options Grid */}
                          <div className="space-y-4">
                             
                             {/* Category Selector */}
                             <div>
                                  <Label className="text-sm font-semibold block mb-1.5">Default Category <span className="text-muted-foreground font-normal text-xs ml-1">(Optional)</span></Label>
                                  <select className="w-full h-10 rounded-lg border bg-background px-3 text-sm" value={defaultCategoryId} onChange={(e) => setDefaultCategoryId(e.target.value)}>
                                    <option value="">— Auto-guess on server —</option>
                                    {categories.map((c) => (<option key={c.id} value={c.id}>{c.label}{c.prefix ? ` (${c.prefix})` : ""}</option>))}
                                  </select>
                              </div>

                             {/* AI Settings Group */}
                             <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
                                {/* AI Toggle */}
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="use-ai-switch" className="cursor-pointer pr-4">
                                        <div className="flex items-center gap-2">
                                            <Brain className={`h-4 w-4 ${useAI ? 'text-purple-600' : 'text-muted-foreground'}`} />
                                            <span className="font-semibold text-sm">Use AI Parsing</span>
                                        </div>
                                        <p className="text-[10px] text-muted-foreground mt-0.5">Slower but smarter. Disable for simple CSVs.</p>
                                    </Label>
                                    <Switch id="use-ai-switch" checked={useAI} onCheckedChange={setUseAI} />
                                </div>

                                {/* Model Selector (Only if AI is On) */}
                                {useAI && (
                                    <div className="pt-2 border-t border-border/50 animate-in slide-in-from-top-1 fade-in">
                                        <Label className="text-xs font-medium block mb-1.5">AI Model</Label>
                                        <select 
                                            className="w-full h-8 rounded-md border bg-background px-2 text-xs" 
                                            value={selectedModel} 
                                            onChange={(e) => setSelectedModel(e.target.value)}
                                        >
                                            <option value="openai">OpenAI (Fast & Standard)</option>
                                            <option value="qwen">Qwen 2.5 (Good Logic)</option>
                                            {/* <option value="searchgpt">SearchGPT (Web Aware)</option> */}
                                        </select>
                                    </div>
                                )}
                             </div>

                             {/* Expand Units Toggle */}
                             <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border">
                                <Label htmlFor="expand-units-switch" className="cursor-pointer pr-4">
                                  <span className="font-semibold block text-sm">Expand Units</span>
                                  <p className="text-[10px] text-muted-foreground">Split quantity &gt;1 into rows</p>
                                </Label>
                                <Switch id="expand-units-switch" checked={expandUnits} onCheckedChange={setExpandUnits} />
                             </div>
                          </div>
                      </div>
                    )}
                  </div>
                )}

                {mode === 'manual' && ( <div className="pt-6 border-t space-y-6"> <div> <h3 className="text-lg font-semibold">Line Item Entry</h3> <p className="text-sm text-muted-foreground"> Add items one by one, or use the "Bulk Add" for items with unique UPCs. </p> </div> <form onSubmit={handleAddStagedLine} className="p-4 border rounded-lg bg-muted/40 dark:bg-muted/10 space-y-4"> <div className="w-full"> <Label htmlFor="manual-input-name" className="text-sm font-medium">Product Name *</Label> <Input id="manual-input-name" placeholder="e.g., Apple MacBook Pro 14-inch M3" value={manualInput.name} onChange={e => setManualInput(p => ({...p, name: e.target.value}))} className="mt-1"/> </div> <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4"> <div> <Label className="text-sm font-medium">Quantity *</Label> <Input type="number" min={1} value={manualInput.qty} onChange={e => setManualInput(p => ({...p, qty: e.target.value}))} className="mt-1" /> </div> <div> <Label className="text-sm font-medium">Unit Cost ($)</Label> <Input inputMode="decimal" placeholder="e.g., 850.00" value={manualInput.unitCost} onChange={e => setManualInput(p => ({...p, unitCost: e.target.value}))} className="mt-1" /> </div> <div> <Label className="text-sm font-medium">MSRP ($)</Label> <Input inputMode="decimal" placeholder="e.g., 1599.99" value={manualInput.msrp} onChange={e => setManualInput(p => ({...p, msrp: e.target.value}))} className="mt-1" /> </div> <div> <Label className="text-sm font-medium">UPC</Label> <div className="flex items-center gap-2 mt-1"> <Input placeholder="Single UPC" value={manualInput.upc} onChange={e => setManualInput(p => ({...p, upc: e.target.value}))} /> <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => setIsBulkUpcOpen(true)} title="Add multiple items with unique UPCs"> <Library className="h-4 w-4 mr-1.5"/> Bulk Add </Button> </div> </div> </div> <div className="flex items-center justify-between pt-2"> <div className="flex items-center space-x-2"> <Switch id="manual-expand-toggle" checked={manualExpandUnits} onCheckedChange={setManualExpandUnits} /> <Label htmlFor="manual-expand-toggle" className="cursor-pointer">Split this line's quantity into individual units</Label> </div> <Button type="submit" className="w-40"><PlusCircle className="h-4 w-4 mr-2" /> Add to Staging</Button> </div> </form> <hr className="border-dashed" /> <div> <div className="flex items-center justify-between mb-2"> <h3 className="text-lg font-semibold">Staged Lines ({stagedLines.length})</h3> {selectedCount > 0 && ( <div className="flex items-center gap-2 bg-muted/50 border rounded-lg px-2 py-1"> <span className="text-sm font-medium">{selectedCount} selected</span> <Button variant="ghost" size="sm" onClick={handleDeleteSelected} className="text-red-500 hover:text-red-600 hover:bg-red-50"> <Trash2 className="h-4 w-4 mr-1"/> Delete </Button> </div> )} </div> {stagedLines.length === 0 ? ( <div className="text-center py-10 border-2 border-dashed rounded-lg mt-2 flex flex-col items-center"> <PackageSearch className="h-10 w-10 text-muted-foreground/50 mb-3" /> <h4 className="font-semibold text-muted-foreground">The staging area is empty</h4> <p className="text-sm text-muted-foreground/80">Use the form above to add lines to this purchase order.</p> </div> ) : ( <div className="border rounded-lg max-h-[40vh] overflow-y-auto mt-2"> <table className="w-full text-sm"> <thead className="bg-muted sticky top-0 z-10"> <tr> <th className="p-2 w-12 text-center"> <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary" checked={allSelected} ref={input => { if (input) input.indeterminate = someSelected; }} onChange={toggleSelectAll} /> </th> <th className="p-2 text-left font-medium">Product Name</th> <th className="p-2 text-center font-medium w-24">Qty</th> <th className="p-2 text-right font-medium w-24">Unit Cost</th> <th className="p-2 text-right font-medium w-24">MSRP</th> <th className="p-2 text-left font-medium w-32">UPC</th> <th className="p-2 w-16 text-center font-medium">Action</th> </tr> </thead> <tbody> {stagedLines.map((line, i) => ( <tr key={i} className={`border-b last:border-0 ${selectedIndices[i] ? 'bg-primary/10' : 'even:bg-muted/30 even:dark:bg-muted/10'}`}> <td className="p-2 text-center"> <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary" checked={!!selectedIndices[i]} onChange={() => toggleSelection(i)} /> </td> <td className="p-2 font-medium">{line.product_name_raw}</td> <td className="p-2 text-center"> {line.qty} {line.splitLine && (line.qty ?? 0) > 1 && ( <span title="This line will be split into individual units upon creation" className="ml-2 text-xs font-semibold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full"> Split </span> )} </td> <td className="p-2 text-right font-mono">{money(line.unit_cost)}</td> <td className="p-2 text-right font-mono">{money(line.msrp)}</td> <td className="p-2 font-mono">{line.upc || "—"}</td> <td className="p-2 text-center"> <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleRemoveStagedLine(i)} title="Remove line"><Trash2 className="h-4 w-4 text-red-500" /></Button> </td> </tr> ))} </tbody> </table> </div> )} {stagedLines.length > 0 && (<div className="text-sm font-semibold mt-2 text-right">Total Staged Units: {manualTotals.items.toLocaleString()} &nbsp;•&nbsp; Est. Total Cost: {money(manualTotals.cost)}</div>)} </div> </div> )}
              </div>
            )}

            {step === "preview" && previewData && (
              <div className="flex flex-col h-full overflow-hidden">
                
                {/* 1. REVIEW HEADER BAR (Replaces Modal Header for Step 2) */}
                <div className="flex-shrink-0 px-5 py-3 border-b bg-background dark:bg-card flex items-center justify-between shadow-sm z-20 h-16">
                    <div className="flex items-center gap-6 text-sm">
                        <div className="flex items-center gap-2.5">
                            <div className="p-1.5 bg-primary/10 rounded-md text-primary">
                                <Building2 className="h-4 w-4" />
                            </div>
                            <div>
                                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Vendor</p>
                                <p className="font-bold text-foreground leading-tight">{selectedVendor?.name || newVendorName}</p>
                            </div>
                        </div>
                        <div className="w-px h-8 bg-border/60"></div>
                        <div className="flex items-center gap-2.5">
                            <div className="p-1.5 bg-primary/10 rounded-md text-primary">
                                <FileText className="h-4 w-4" />
                            </div>
                            <div>
                                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">PO Number</p>
                                <p className="font-bold text-foreground leading-tight">{poNumber}</p>
                            </div>
                        </div>
                        <div className="w-px h-8 bg-border/60"></div>
                         <div className="flex items-center gap-2.5">
                             <div className="p-1.5 bg-blue-50 dark:bg-blue-900/30 rounded-md text-blue-600 dark:text-blue-300">
                                <FileSpreadsheet className="h-4 w-4" />
                            </div>
                            <div className="hidden lg:block">
                                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Source File</p>
                                <p className="font-medium text-foreground leading-tight truncate max-w-[150px]" title={previewData.file_name}>{previewData.file_name}</p>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                         <Button variant="outline" onClick={handleSafeClose} disabled={isLoading} className="border-border">Cancel</Button>
                         <Button onClick={doUpload} disabled={isLoading || !previewData || (previewData?.new_po_lines || []).length === 0} className="bg-green-600 hover:bg-green-700 text-white font-bold shadow-md">
                            {isLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</> : `Commit ${previewData.new_po_lines.length} Lines`}
                        </Button>
                    </div>
                </div>

                {/* 2. SPLIT PANE CONTENT - Fixed Overflow */}
                <div className="flex-1 flex overflow-hidden bg-muted/20 min-h-0">
                  
                  {/* LEFT: DATA GRID (Fills Space) */}
                  <div className="flex-1 flex flex-col bg-card min-w-0 shadow-sm m-4 mr-2 rounded-xl border overflow-hidden">
                     {/* Toolbar */}
                     <div className="flex-shrink-0 border-b px-4 py-2 bg-card flex justify-between items-center">
                         <div className="flex items-center gap-2 text-sm text-foreground">
                             <PackageSearch className="h-4 w-4 text-primary" />
                             <span className="font-semibold">Parsed Line Items</span>
                             <span className="bg-muted text-muted-foreground px-2 py-0.5 rounded-full text-xs font-medium">{previewData.new_po_lines.length}</span>
                         </div>
                         {filterMode === 'errors' && (
                             <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-200 px-3 py-1 rounded-md text-xs font-medium animate-pulse">
                                 <AlertTriangle className="h-3.5 w-3.5" />
                                 Reviewing Issues
                                 <button onClick={() => setFilterMode('all')} className="ml-2 hover:underline font-bold">Clear Filter</button>
                             </div>
                         )}
                     </div>

                    {/* Table Container - Ensure it scrolls */}
                   <div className="flex-1 overflow-auto">
                        <table className="w-full table-fixed text-sm relative border-collapse">
                            <colgroup>
                                {/* Adjusted widths: Product Name gets 50% since it holds specs/notes now */}
                                <col className="w-[50%]" /> 
                                <col className="w-[16%]" /> 
                                <col className="w-[8%]" />  
                                <col className="w-[13%]" /> 
                                <col className="w-[13%]" /> 
                            </colgroup>
                            <thead className="bg-muted/50 sticky top-0 z-10 shadow-sm ring-1 ring-black/5">
                            <tr>
                                <th className="p-3 text-left font-semibold text-muted-foreground border-b bg-muted/50 pl-4">
                                    <div className="flex items-center gap-2">
                                        <Package className="h-3.5 w-3.5" />
                                        Product & Specs
                                    </div>
                                </th>
                                <th className="p-3 text-left font-semibold text-muted-foreground border-b bg-muted/50">
                                    <div className="flex items-center gap-2">
                                        <Tag className="h-3.5 w-3.5" />
                                        Category
                                    </div>
                                </th>
                                <th className="p-3 text-center font-semibold text-muted-foreground border-b bg-muted/50">
                                    <div className="flex items-center justify-center gap-2">
                                        <Hash className="h-3.5 w-3.5" />
                                        Qty
                                    </div>
                                </th>
                                <th className="p-3 text-right font-semibold text-muted-foreground border-b bg-muted/50">
                                    <div className="flex items-center justify-end gap-2">
                                        <DollarSign className="h-3.5 w-3.5" />
                                        Cost
                                    </div>
                                </th>
                                <th className="p-3 text-right font-semibold text-muted-foreground border-b bg-muted/50 pr-6">
                                    <div className="flex items-center justify-end gap-2">
                                        <DollarSign className="h-3.5 w-3.5" />
                                        MSRP
                                    </div>
                                </th>
                            </tr>
                            </thead>
                            <tbody className="bg-card divide-y divide-border">
                            {(visibleLines || []).slice(0, 300).map((line, i) => {
                                const isZeroCost = !line.unit_cost || line.unit_cost === 0;
                                const isNoName = !line.product_name_raw;
                                
                                // Extract specs for display
                                const specs = line.specs || {};
                                const cpu = cleanCpuString(specs.processor || specs.cpu);
                                const ram = specs.ram || specs.memory;
                                const storage = specs.storage || specs.hdd || specs.ssd;
                                const otherSpecs = [specs.screen, specs.color, specs.batteryHealth].filter(Boolean).join(" • ");
                                const hasAnySpecs = cpu || ram || storage || otherSpecs;

                                return (
                                    <tr key={i} className="hover:bg-muted/50 transition-colors group">
                                        
                                    {/* --- COL 1: Product Name + Specs + Notes --- */}
                                    <td className="p-3 pl-4 border-r border-transparent group-hover:border-border align-top">
                                        <div className="flex flex-col gap-2">
                                            {/* 1. Name Input */}
                                            <input 
                                                className={`w-full bg-transparent font-medium border border-transparent hover:border-border focus:border-primary focus:ring-2 focus:ring-primary/20 rounded-md px-2 py-1 text-sm transition-all ${isNoName ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900 placeholder:text-red-400' : 'text-foreground'}`}
                                                defaultValue={line.product_name_raw || ""}
                                                placeholder={isNoName ? "Missing Name..." : ""}
                                                onChange={(e) => handleLineChange(line, 'product_name_raw', e.target.value)}
                                            />

                                            {/* 2. Specs Row (Badges) */}
                                            {hasAnySpecs && (
                                                <div className="flex flex-wrap items-center gap-2 pl-2">
                                                    {cpu && (
                                                        <Badge variant="secondary" className="h-5 px-1.5 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700 font-medium text-[10px] gap-1">
                                                            <Cpu className="h-3 w-3 opacity-70" /> {cpu}
                                                        </Badge>
                                                    )}
                                                    {ram && (
                                                        <Badge variant="secondary" className="h-5 px-1.5 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700 font-medium text-[10px] gap-1">
                                                            <MemoryStick className="h-3 w-3 opacity-70" /> {ram}
                                                        </Badge>
                                                    )}
                                                    {storage && (
                                                        <Badge variant="secondary" className="h-5 px-1.5 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700 font-medium text-[10px] gap-1">
                                                            <Database className="h-3 w-3 opacity-70" /> {storage}
                                                        </Badge>
                                                    )}
                                                    {otherSpecs && (
                                                        <span className="text-[10px] text-muted-foreground ml-1">{otherSpecs}</span>
                                                    )}
                                                </div>
                                            )}

                                            {/* 3. Notes Alert (if present) */}
                                            {line.item_notes && (
                                                <div className="flex items-start gap-2 mt-1 mx-1 p-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/50">
                                                    <StickyNote className="h-3.5 w-3.5 text-amber-600 dark:text-amber-500 mt-0.5 shrink-0" />
                                                    <p className="text-xs text-amber-800 dark:text-amber-300 leading-snug">
                                                        {line.item_notes}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </td>
            
                                    {/* --- COL 2: Category --- */}
                                    <td className="p-2 border-r border-transparent group-hover:border-border align-top pt-3">
                                        <div className="bg-muted text-muted-foreground px-2 py-1 rounded-md border border-border inline-flex items-center gap-1.5 whitespace-nowrap font-medium text-xs max-w-full overflow-hidden text-ellipsis">
                                            {line.category_guess || "Uncategorized"}
                                        </div>
                                    </td>
            
                                    {/* --- COL 3: Qty --- */}
                                    <td className="p-2 text-center font-medium text-foreground border-r border-transparent group-hover:border-border align-top pt-3.5">
                                        {line.qty ?? "—"}
                                    </td>
                                    
                                    {/* --- COL 4: Cost --- */}
                                    <td className={`p-2 text-right font-mono border-r border-transparent group-hover:border-border align-top pt-3`}>
                                        <div className={`relative rounded-md overflow-hidden transition-all ${isZeroCost ? 'ring-1 ring-amber-300 dark:ring-amber-700 bg-amber-50 dark:bg-amber-950/20' : 'hover:bg-muted'}`}>
                                            <span className={`absolute left-2 top-1/2 -translate-y-1/2 text-xs pointer-events-none ${isZeroCost ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>$</span>
                                            <input 
                                                className={`w-full text-right bg-transparent border-none focus:ring-2 focus:ring-primary/20 py-1.5 pr-3 pl-5 text-sm outline-none ${isZeroCost ? 'text-amber-800 dark:text-amber-200 font-bold' : 'text-foreground'}`}
                                                defaultValue={line.unit_cost || ""}
                                                placeholder="0.00"
                                                type="number"
                                                step="0.01"
                                                onChange={(e) => handleLineChange(line, 'unit_cost', parseFloat(e.target.value))}
                                            />
                                        </div>
                                    </td>

                                    {/* --- COL 5: MSRP --- */}
                                    <td className="p-2 text-right font-mono text-muted-foreground text-sm pr-6 align-top pt-3.5">
                                        {money(line.msrp)}
                                    </td>
                                    
                                    </tr>
                                );
                            })}
                            
                            {/* Hidden Lines Indicator */}
                            {(visibleLines || []).length > 300 && (
                                <tr>
                                <td colSpan={5} className="p-4 text-center text-sm text-muted-foreground bg-muted/20">
                                    ... and <strong>{(visibleLines.length - 300).toLocaleString()}</strong> more lines hidden for performance ...
                                </td>
                                </tr>
                            )}
                            </tbody>
                        </table>
                    </div>
                  </div>

                  {/* RIGHT: ANALYSIS SIDEBAR (Fixed) */}
                  <div className="w-80 flex-shrink-0 bg-card border-l border-border m-4 ml-0 rounded-xl shadow-sm flex flex-col overflow-hidden">
                     <div className="p-4 border-b bg-muted/20">
                        <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                            <Brain className="h-4 w-4 text-purple-600" />
                            Import Analysis
                        </h4>
                     </div>
                     
                     <div className="flex-1 overflow-y-auto p-4 space-y-6">
                        {/* 1. Totals */}
                        <div className="space-y-3">
                            <div className="p-3 rounded-lg border bg-card shadow-sm">
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Estimated Total Value</p>
                                <div className="text-2xl font-bold text-green-700 dark:text-green-400 tracking-tight">{money(analysis?.totalCost)}</div>
                            </div>
                             <div className="p-3 rounded-lg border bg-card shadow-sm">
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Total Units Count</p>
                                <div className="text-2xl font-bold text-blue-700 dark:text-blue-400 tracking-tight">{analysis?.totalQty}</div>
                            </div>
                        </div>

                        {/* 2. Issues / Validation */}
                        <div className="space-y-3">
                            <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Data Validation</h5>
                            
                            {(!analysis?.zeroCostLines.length && !analysis?.missingNames.length) ? (
                                <div className="flex items-start gap-3 text-sm text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/30 p-3 rounded-lg border border-green-100 dark:border-green-900">
                                <CheckCircle2 className="h-5 w-5 shrink-0" />
                                <div>
                                    <p className="font-semibold">All Clear</p>
                                    <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">All lines have names and valid costs.</p>
                                </div>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                {analysis.zeroCostLines.length > 0 && (
                                    <button 
                                    onClick={() => setFilterMode(filterMode === 'errors' ? 'all' : 'errors')}
                                    className={`w-full flex items-center justify-between text-sm p-3 rounded-lg border transition-all text-left group ${filterMode === 'errors' ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 ring-1 ring-amber-200 dark:ring-amber-800' : 'bg-card border-border hover:border-amber-300 hover:shadow-sm'}`}
                                    >
                                    <div className="flex items-center gap-3">
                                        <div className="p-1.5 bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-200 rounded-md">
                                            <AlertTriangle className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <p className="font-semibold text-foreground group-hover:text-amber-800 dark:group-hover:text-amber-200">Missing Costs</p>
                                            <p className="text-xs text-muted-foreground">{analysis.zeroCostLines.length} items at $0.00</p>
                                        </div>
                                    </div>
                                    </button>
                                )}
                                {analysis.missingNames.length > 0 && (
                                    <button 
                                    onClick={() => setFilterMode(filterMode === 'errors' ? 'all' : 'errors')}
                                    className={`w-full flex items-center justify-between text-sm p-3 rounded-lg border transition-all text-left group ${filterMode === 'errors' ? 'bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-700 ring-1 ring-red-200 dark:ring-red-800' : 'bg-card border-border hover:border-red-300 hover:shadow-sm'}`}
                                    >
                                    <div className="flex items-center gap-3">
                                        <div className="p-1.5 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 rounded-md">
                                            <AlertTriangle className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <p className="font-semibold text-foreground group-hover:text-red-800 dark:group-hover:text-red-200">Missing Names</p>
                                            <p className="text-xs text-muted-foreground">{analysis.missingNames.length} items blank</p>
                                        </div>
                                    </div>
                                    </button>
                                )}
                                </div>
                            )}
                        </div>

                        {/* 3. AI Meta */}
                         <div className="pt-4 border-t space-y-2">
                             <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                 <Info className="h-3 w-3" />
                                 <span>Parsing Meta</span>
                             </div>
                             <div className="text-xs text-muted-foreground space-y-1">
                                <div className="flex justify-between">
                                    <span>Model:</span>
                                    <span className="font-mono bg-muted px-1 rounded">{aiModel}</span>
                                </div>
                                 {previewData.headers_seen && (
                                     <div className="mt-2">
                                         <span className="block mb-1">Mapped Columns:</span>
                                         <div className="flex flex-wrap gap-1">
                                             {previewData.headers_seen.map(h => (
                                                 <span key={h} className="bg-muted border border-border px-1.5 py-0.5 rounded text-[10px] font-mono text-muted-foreground">{h}</span>
                                             ))}
                                         </div>
                                     </div>
                                 )}
                             </div>
                         </div>

                     </div>
                  </div>

                </div>
              </div>
            )}
          </div>

          {/* FOOTER ACTION BAR */}
          {step === "initial" && (
            <div className="flex justify-end gap-3 p-4 border-t bg-background rounded-b-xl shadow-inner flex-shrink-0">
                <Button variant="outline" onClick={handleSafeClose} disabled={isLoading}>Cancel</Button>
                {mode === "upload" ? (
                    <Button onClick={getPreview} disabled={isLoading || !file || !poNumber.trim() || (vendorMode === 'existing' && !vendorId) || (vendorMode === 'new' && !newVendorName.trim())} className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
                    {isLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Working...</> : "Next: Review & Commit"}
                    </Button>
                ) : (
                    <Button
                        onClick={async () => {
                        if (stagedLines.length > 0) {
                            try {
                            const id = await ensureVendorId();
                            const finalLines = stagedLines.flatMap(line => {
                                if (line.splitLine && (line.qty ?? 0) > 1) { return Array.from({ length: line.qty! }, () => ({ ...line, qty: 1 })); }
                                return line;
                            });
                            setExpandUnits(false);
                            isManualCommitPending.current = true;
                            setPreviewData({ ok: true, vendor_id: id, file_name: "Manual Entry", new_po_lines: finalLines, existing_pos_summary: [] });
                            } catch (e: any) {
                            alert("Manual commit failed: " + (e?.message || "unknown error"));
                            }
                        } else {
                            doCreateBarePO();
                        }
                        }}
                        disabled={isLoading || !poNumber.trim() || (vendorMode === 'existing' && !vendorId) || (vendorMode === 'new' && !newVendorName.trim())}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                    >
                        {isLoading ? ( <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating…</> ) : ( stagedLines.length > 0 ? `Create PO with ${stagedLines.length} Lines` : 'Create Empty PO' )}
                    </Button>
                )}
            </div>
          )}
        </div>
      </div>

      {isBulkUpcOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl w-full max-w-lg shadow-2xl flex flex-col">
            <div className="p-4 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Library className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-semibold">Bulk Add Items with Unique UPCs</h3>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setIsBulkUpcOpen(false)}><X className="h-5 w-5" /></Button>
              </div>
            </div>
            <div className="p-4 space-y-4">
              <div className="p-3 border rounded-lg bg-yellow-50 dark:bg-yellow-950/20 text-yellow-800 dark:text-yellow-200 text-sm space-y-1">
                <p className="font-semibold">The main form's quantity field will be ignored.</p>
                <p>The number of unique UPCs you paste below will determine the number of items created, each with a quantity of 1.</p>
              </div>
              <div className="p-3 border rounded-lg bg-muted/50 text-sm space-y-1">
                <p><strong>Product Name:</strong> {manualInput.name || <span className="text-red-500">Please enter a name first</span>}</p>
                <p><strong>Unit Cost:</strong> {money(Number(manualInput.unitCost) || null)}</p>
                <p><strong>MSRP:</strong> {money(Number(manualInput.msrp) || null)}</p>
              </div>
              <div>
                <label htmlFor="bulk-upc-textarea" className="text-sm font-semibold block mb-2">
                  Paste UPCs (one per line)
                </label>
                <Textarea
                  id="bulk-upc-textarea"
                  className="h-48 font-mono text-sm"
                  placeholder="190199098428&#10;190199098435&#10;190199098442&#10;..."
                  value={bulkUpcText}
                  onChange={(e) => setBulkUpcText(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Found <strong>{upcCount}</strong> unique UPCs.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-4 border-t bg-background rounded-b-xl">
              <Button variant="outline" onClick={() => setIsBulkUpcOpen(false)}>Cancel</Button>
              <Button onClick={handleBulkUpcSubmit} disabled={!manualInput.name.trim() || upcCount === 0}>
                <PlusCircle className="h-4 w-4 mr-2" />
                Add {upcCount} Items
              </Button>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body
  );
}