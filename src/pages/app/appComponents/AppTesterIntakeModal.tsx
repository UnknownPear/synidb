import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  X, CalendarDays, Check, Printer, Loader2,
  RefreshCcw, DollarSign, Trash2, Wrench,
  Cpu, HardDrive, Monitor, Battery, Palette, Save, AlertTriangle, ChevronDown
} from "lucide-react";
import { getBrowseAvg } from "@/lib/dataClient";
import { ALL_GRADES } from "@/lib/grades";
import { API_BASE } from "@/lib/testerTypes";
import Barcode from "@/components/ui/Barcode";
import { cn } from "@/lib/utils";

// --- HELPERS ---

const toISODate = (d?: string | Date | null) => {
  if (!d) return new Date().toISOString().slice(0, 10);
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
};

function printBarcode(svgElement: SVGSVGElement | null) {
  if (!svgElement) { alert("Barcode element not found."); return; }
  const svgData = new XMLSerializer().serializeToString(svgElement);
  const printWindow = window.open("", "_blank", "width=400,height=200");
  if (!printWindow) return;
  printWindow.document.write(`
    <html><head><style>@page{size:auto;margin:0}body{margin:0;padding:0}@media print{html,body{height:99vh;overflow:hidden}.label{page-break-inside:avoid}} .label{width:3.43in;height:0.6in;display:flex;align-items:center;justify-content:center;padding-top:1.0in;padding-right:0.25in} img{display:block;max-width:3.2in;max-height:1in;object-fit:contain}</style></head>
    <body onload="window.print();window.onafterprint=()=>window.close();setTimeout(()=>window.close(),1500)"><div class="label"><img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgData)}" alt="barcode"/></div></body></html>
  `);
  printWindow.document.close();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const diffInventory = (a: any, b: any) => {
  const patch: any = {};
  ["productName", "categoryId", "grade", "testedBy", "testedDate", "testerComment", "specs", "price", "ebayPrice", "status", "purchaseCost", "partStatus"].forEach(k => {
    if (JSON.stringify(a?.[k]) !== JSON.stringify(b?.[k])) patch[k] = b?.[k];
  });
  return patch;
};

const PRESET = {
  processor: ["Apple M1", "Apple M2", "Apple M3", "Apple M4", "Intel Core i5", "Intel Core i7", "Intel Core i9", "AMD Ryzen 5", "AMD Ryzen 7"],
  ram: ["4GB", "8GB", "16GB", "32GB", "64GB"],
  storage: ["128GB SSD", "256GB SSD", "512GB SSD", "1TB SSD", "2TB SSD"],
  screen: ["11-inch", "13-inch", "14-inch", "15-inch", "16-inch", "17-inch"],
  batteryHealth: ["100%", "90-99%", "80-89%", "70-79%", "<70%"],
  color: ["Black", "Silver", "Space Gray", "White", "Blue", "Red", "Green"],
};

// --- APP MODE COMPONENTS ---

function AppGradePills({ value, onChange, list }: any) {
  return (
    <div className="flex gap-2 p-1">
      {list.map((g: string) => {
        const active = g === value;
        const activeStyle = {
          A: "bg-emerald-500 text-black border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.5)]",
          B: "bg-blue-500 text-white border-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.5)]",
          C: "bg-amber-500 text-black border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.5)]",
          D: "bg-red-500 text-white border-red-400 shadow-[0_0_15px_rgba(239,68,68,0.5)]",
          P: "bg-purple-500 text-white border-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.5)]",
        }[g] || "bg-slate-700 text-white";

        return (
          <button
            key={g}
            type="button"
            onClick={() => onChange(g)}
            className={`flex-1 h-10 rounded-lg text-sm font-bold transition-all border ${active ? activeStyle : "border-white/10 bg-white/5 text-slate-500 hover:text-white hover:bg-white/10"}`}
          >
            {g}
          </button>
        );
      })}
    </div>
  );
}

function AppSelectOrType({ label, value, onChange, options, placeholder, id, icon: Icon }: any) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
        {Icon && <Icon className="h-3 w-3 text-indigo-400" />} {label}
      </label>
      <div className="relative group">
        <Input
          id={id}
          className="h-10 w-full rounded-xl bg-black/20 border-white/10 text-white placeholder:text-slate-700 focus:border-indigo-500/50 focus:bg-black/40 text-sm font-medium pl-3 pr-8 transition-all hover:border-white/20"
          placeholder={placeholder}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
        <div className="absolute right-0 top-0 h-full w-10 flex items-center justify-center pointer-events-none text-slate-600 group-hover:text-slate-400 transition-colors">
             <ChevronDown className="h-4 w-4" />
        </div>
        <select
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          onChange={(e) => { if(e.target.value) onChange(e.target.value); }}
          value=""
        >
            <option value="" disabled>Select...</option>
            {options.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      </div>
      <div className="flex flex-wrap gap-1.5 pt-1">
        {options.slice(0, 3).map((v: string) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className="px-2 py-1 rounded-md bg-white/5 border border-white/5 text-[10px] text-slate-400 hover:text-white hover:bg-white/10 hover:border-white/20 transition-colors"
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

// --- MAIN COMPONENT ---

export default function AppTesterIntakeView({
  open,
  row,
  onChange,
  onClose,
  onSave,
  grades = ALL_GRADES,
  fixedTester,
  user,
}: any) {
  const firstInputRef = useRef<HTMLInputElement>(null);
  const barcodeSvgRef = useRef<SVGSVGElement>(null);

  const today = new Date().toISOString().slice(0, 10);
  const preferredTester = useMemo(() => fixedTester || user?.name || row.testedBy || "", [fixedTester, user?.name, row.testedBy]);

  const [local, setLocal] = useState({ ...row, testedDate: row.testedDate || today, testedBy: row.testedBy || preferredTester, specs: row.specs || {} });
  const [initial, setInitial] = useState({ ...row });
  
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [avgLoading, setAvgLoading] = useState(false);
  const [avgUSD, setAvgUSD] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const cleanRow = {
        ...row,
        testedDate: row.testedDate || today,
        testedBy: row.testedBy || preferredTester,
        specs: row.specs || {},
        productName: row.productName || "",
        partStatus: row.partStatus || null,
    };
    setLocal(cleanRow);
    setInitial(cleanRow);
    // Tiny delay to allow animation
    setTimeout(() => firstInputRef.current?.focus(), 50);
  }, [open, row]);

  const dirty = useMemo(() => {
    const changes = diffInventory(initial, local);
    return Object.keys(changes).length > 0;
  }, [initial, local]);

  const doSave = useCallback(async (statusOverride?: string) => {
    if (saving) return;
    setSaving(true);
    try {
        const id = local?.synergyId;
        if (!id) throw new Error("Missing ID");
        const statusToSave = statusOverride || "TESTED";
        
        const payload: any = {
            status: statusToSave,
            grade: local.grade,
            testedBy: local.testedBy,
            testedDate: local.testedDate,
            testerComment: local.testerComment,
            partStatus: local.partStatus,
            specs: local.specs,
            price: local.price,
            ebayPrice: local.ebayPrice,
            purchaseCost: local.purchaseCost
        };

        const res = await fetch(`${API_BASE}/rows/${encodeURIComponent(id)}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error("Save failed");
        
        const updated = { ...local, ...payload };
        onChange?.(updated);
        await Promise.resolve(onSave?.(updated));
        setStatusMsg("Saved!");
        await sleep(500);
        onClose();
    } catch (e) {
        setStatusMsg("Error saving");
    } finally {
        setSaving(false);
        setTimeout(() => setStatusMsg(null), 2000);
    }
  }, [saving, local, onChange, onSave, onClose]);

  // Hotkeys
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); doSave(); }
      if (e.key === "Escape") { e.preventDefault(); if(!dirty || confirm("Discard?")) onClose(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, doSave, dirty, onClose]);

  const fetchAvg = async () => {
    if (!local.productName) return;
    setAvgLoading(true);
    try {
      const res = await getBrowseAvg(local.productName, { fixed: true, condition: "USED", currency: "USD", limit: 100 });
      setAvgUSD(typeof res.avg === "number" ? res.avg : null);
    } finally { setAvgLoading(false); }
  };

  if (!open) return null;

  return (
    // FULL SCREEN CONTAINER (z-index ensures it covers everything)
    <div className="fixed inset-0 z-[100] bg-[#09090b] flex flex-col text-white font-sans overflow-hidden animate-in slide-in-from-bottom-5 duration-300">
      
      <div style={{ display: "none" }}>{local.synergyId && <Barcode ref={barcodeSvgRef} value={local.synergyId} />}</div>

      {/* --- HEADER BAR --- */}
      <div className="flex-none h-16 flex items-center justify-between px-8 border-b border-white/5 bg-[#0F1115]">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center border border-indigo-500/20 shadow-lg shadow-indigo-500/10">
            <Wrench className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight leading-tight">Device Intake</h2>
            <div className="flex items-center gap-3 text-[11px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">
               <span className="text-white/80">{local.synergyId}</span>
               <span className="w-1 h-1 rounded-full bg-slate-700"/>
               <span className={dirty ? "text-amber-400" : "text-emerald-500"}>{dirty ? "UNSAVED CHANGES" : "ALL SYNCED"}</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => printBarcode(barcodeSvgRef.current)} className="h-10 px-4 gap-2 text-slate-400 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/5 rounded-xl">
                <Printer className="w-4 h-4" /> Print Label
            </Button>
            <div className="w-px h-6 bg-white/10 mx-2" />
            <Button variant="ghost" size="icon" onClick={onClose} className="h-10 w-10 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl">
                <X className="w-5 h-5" />
            </Button>
        </div>
      </div>

      {/* --- MAIN CONTENT (2 Columns) --- */}
      <div className="flex-1 overflow-hidden flex">
        
        {/* LEFT PANEL: PRODUCT DATA (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-8 border-r border-white/5">
           <div className="max-w-3xl mx-auto space-y-8">
              
              {/* Product Title Input */}
              <div className="space-y-3">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Product Identification</label>
                  <div className="relative group">
                    <Input 
                        ref={firstInputRef}
                        className="h-14 text-xl font-bold bg-white/5 border-white/10 text-white rounded-xl px-5 shadow-inner focus:border-indigo-500/50 focus:bg-black/40 focus:ring-0 transition-all"
                        value={local.productName || ""}
                        disabled // Typically read-only for tester
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 px-2 py-1 bg-black/40 rounded text-[10px] text-slate-500 font-mono">READ ONLY</div>
                  </div>
              </div>

              {/* Specs Grid */}
              <div className="space-y-3">
                 <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Hardware Specifications</label>
                 </div>
                 <div className="grid grid-cols-2 gap-6">
                    <AppSelectOrType id="proc" label="Processor" icon={Cpu} options={PRESET.processor} value={local.specs?.processor} onChange={(v:any)=>setLocal({...local, specs:{...local.specs, processor:v}})} />
                    <AppSelectOrType id="ram" label="RAM" icon={HardDrive} options={PRESET.ram} value={local.specs?.ram} onChange={(v:any)=>setLocal({...local, specs:{...local.specs, ram:v}})} />
                    <AppSelectOrType id="store" label="Storage" icon={HardDrive} options={PRESET.storage} value={local.specs?.storage} onChange={(v:any)=>setLocal({...local, specs:{...local.specs, storage:v}})} />
                    <AppSelectOrType id="screen" label="Screen" icon={Monitor} options={PRESET.screen} value={local.specs?.screen} onChange={(v:any)=>setLocal({...local, specs:{...local.specs, screen:v}})} />
                    <AppSelectOrType id="bat" label="Battery" icon={Battery} options={PRESET.batteryHealth} value={local.specs?.batteryHealth} onChange={(v:any)=>setLocal({...local, specs:{...local.specs, batteryHealth:v}})} />
                    <AppSelectOrType id="col" label="Color" icon={Palette} options={PRESET.color} value={local.specs?.color} onChange={(v:any)=>setLocal({...local, specs:{...local.specs, color:v}})} />
                 </div>
              </div>

              {/* Grade Selection */}
              <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 space-y-4">
                 <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-500"/> Quality Assessment
                 </label>
                 <AppGradePills value={local.grade} list={grades} onChange={(g: any) => setLocal({ ...local, grade: g })} />
              </div>

           </div>
        </div>

        {/* RIGHT PANEL: ACTIONS & META (Fixed Width) */}
        <div className="w-[400px] bg-[#0C0E12] border-l border-white/5 p-8 flex flex-col gap-8 overflow-y-auto">
            
            {/* Status Actions */}
            <div className="space-y-3">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Item Status</label>
                <div className="flex flex-col gap-3">
                    <button 
                        onClick={() => setLocal((p: any) => ({ ...p, partStatus: p.partStatus === 'NEEDED' ? null : 'NEEDED' }))}
                        className={cn(
                            "w-full h-12 flex items-center px-4 rounded-xl border transition-all text-sm font-bold",
                            local.partStatus === 'NEEDED' 
                                ? "bg-amber-500/10 border-amber-500/30 text-amber-400" 
                                : "bg-white/5 border-white/5 text-slate-400 hover:bg-white/10 hover:text-white"
                        )}
                    >
                        <Wrench className="w-4 h-4 mr-3" />
                        {local.partStatus === 'NEEDED' ? "Part Request Active" : "Flag Missing Part"}
                    </button>

                    <button 
                        onClick={() => { if(confirm("Scrap this item?")) doSave("SCRAP"); }}
                        className="w-full h-12 flex items-center px-4 rounded-xl border border-white/5 bg-white/5 text-slate-400 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 transition-all text-sm font-bold"
                    >
                        <Trash2 className="w-4 h-4 mr-3" />
                        Mark as Scrap
                    </button>
                </div>
            </div>

            {/* Pricing Section */}
            <div className="space-y-4">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <DollarSign className="h-3 w-3"/> Valuation
                </label>
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-4">
                    <div className="space-y-1">
                        <div className="flex justify-between text-[10px] font-medium text-slate-400 uppercase">
                            <span>Cost Basis</span>
                        </div>
                        <div className="relative">
                            <span className="absolute left-3 top-2.5 text-slate-500 text-sm">$</span>
                            <Input type="number" className="pl-6 h-10 bg-black/40 border-white/10 text-white font-mono text-sm" value={local.purchaseCost || ""} onChange={e => setLocal({...local, purchaseCost: parseFloat(e.target.value)})} />
                        </div>
                    </div>
                    
                    <div className="h-px bg-white/5"/>

                    <div className="space-y-1">
                        <div className="flex justify-between text-[10px] font-medium text-slate-400 uppercase">
                            <span>Target Price</span>
                            {avgUSD && <span className="text-emerald-400 cursor-pointer hover:underline" onClick={() => setLocal({...local, ebayPrice: avgUSD})}>Avg: ${avgUSD}</span>}
                        </div>
                        <div className="flex gap-2">
                             <div className="relative flex-1">
                                <span className="absolute left-3 top-2.5 text-slate-500 text-sm">$</span>
                                <Input type="number" className="pl-6 h-10 bg-black/40 border-white/10 text-emerald-400 font-bold font-mono text-sm" value={local.ebayPrice || ""} onChange={e => setLocal({...local, ebayPrice: parseFloat(e.target.value)})} />
                             </div>
                             <Button size="icon" variant="outline" onClick={fetchAvg} disabled={avgLoading} className="h-10 w-10 border-white/10 bg-white/5 hover:bg-white/10 text-slate-400">
                                {avgLoading ? <Loader2 className="h-4 w-4 animate-spin"/> : <RefreshCcw className="h-4 w-4"/>}
                             </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Notes */}
            <div className="flex-1 flex flex-col space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Technician Notes</label>
                <Textarea 
                    value={local.testerComment || ""} 
                    onChange={e => setLocal({...local, testerComment: e.target.value})}
                    className="flex-1 bg-white/[0.02] border-white/10 text-white placeholder:text-slate-600 text-sm p-4 resize-none focus:border-indigo-500/50 focus:bg-black/40 rounded-xl"
                    placeholder="Add observations about condition or repairs..."
                />
            </div>

        </div>
      </div>

      {/* --- FOOTER BAR --- */}
      <div className="flex-none h-20 px-8 bg-[#0F1115] border-t border-white/5 flex items-center justify-between z-20">
         <div className="flex items-center gap-4">
             <div className="text-xs text-slate-500 font-medium">
                 Tested by <span className="text-white font-bold">{preferredTester}</span> on <span className="text-white font-bold">{toISODate(local.testedDate)}</span>
             </div>
             {statusMsg && (
                <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
                    <Check className="h-3 w-3" /> {statusMsg}
                </span>
            )}
         </div>
         
         <div className="flex gap-4">
             <Button variant="ghost" onClick={onClose} className="h-12 px-6 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 text-sm font-medium">
                 Cancel (Esc)
             </Button>
             <Button onClick={() => doSave()} disabled={saving} className="h-12 px-8 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_0_30px_rgba(79,70,229,0.3)] text-sm font-bold tracking-wide transition-all hover:scale-105">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-2" /> Save Record (⌘S)</>}
             </Button>
         </div>
      </div>

    </div>
  );
}