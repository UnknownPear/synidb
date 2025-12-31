// src/components/TesterIntakeModal.tsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  X,
  CalendarDays,
  Check,
  User,
  Copy,
  Printer,
  Loader2,
  RefreshCcw,
  DollarSign,
  Trash2,
  Wrench,
  PackageCheck,
} from "lucide-react";
import { getBrowseAvg } from "@/lib/dataClient";
import { ALL_GRADES } from "@/lib/grades";
import { API_BASE } from "@/lib/testerTypes";
import Barcode from "@/components/ui/Barcode";
import { cn } from "@/lib/utils";

function printBarcode(svgElement: SVGSVGElement | null) {
  if (!svgElement) {
    alert("Barcode element not found. Cannot print.");
    return;
  }

  const svgData = new XMLSerializer().serializeToString(svgElement);
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    svgData,
  )}`;

  const printWindow = window.open("", "_blank", "width=400,height=200");
  if (!printWindow) {
    alert("Popup blocked. Please allow popups for this site to print labels.");
    return;
  }

  printWindow.document.write(`
    <html>
      <head>
        <title>Print Barcode</title>
        <style>
          @page { size: auto; margin: 0; }
          body { margin: 0; padding: 0; }
          @media print {
            html, body { height: 99vh; overflow: hidden; }
            .label { page-break-inside: avoid; break-inside: avoid-page; }
          }
          .label {
            width: 3.43in; height: 0.6in;
            display: flex; align-items: center; justify-content: center;
            padding-top: 1.0in; padding-right: 0.25in;
          }
          img { display: block; max-width: 3.2in; max-height: 1in; object-fit: contain; }
        </style>
      </head>
      <body onload="
        window.print();
        window.onafterprint = () => window.close();
        setTimeout(() => window.close(), 1500);
      ">
        <div class="label"><img src="${dataUrl}" alt="barcode"/></div>
      </body>
    </html>
  `);
  printWindow.document.close();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600 dark:border-blue-700 dark:border-t-blue-400"
      style={{ animationDuration: "800ms" }}
    />
  );
}

function StatusToast({ state, message }: any) {
  if (!state) return null;
  const text = state === "error" ? message || "Failed to save" : "Saved";
  const bg =
    state === "error"
      ? "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-900"
      : "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-900";
  const textColor =
    state === "error"
      ? "text-red-800 dark:text-red-400"
      : "text-green-800 dark:text-green-400";
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-lg ${bg} px-4 py-2 text-sm ${textColor} font-medium animate-in fade-in-0 duration-300`}
    >
      <Check className="h-4 w-4" /> {text}
    </div>
  );
}

function diffInventory(a: any, b: any) {
  const patch: any = {};
  const KEYS = [
    "productName",
    "categoryId",
    "grade",
    "testedBy",
    "testedDate",
    "testerComment",
    "specs",
    "price",
    "ebayPrice",
    "status",
    "purchaseCost",
    "partStatus", // tracking string status
  ];
  for (const k of KEYS) {
    const av = a?.[k];
    const bv = b?.[k];
    if (JSON.stringify(av) !== JSON.stringify(bv)) {
      patch[k] = bv;
    }
  }
  return patch;
}

function GradePills({ value, onChange, list }: any) {
  const tone = (g: string, active: boolean) => {
    if (active) {
      return {
        A: "bg-emerald-500 text-white border-emerald-500 shadow-md",
        B: "bg-blue-500 text-white border-blue-500 shadow-md",
        C: "bg-amber-500 text-white border-amber-500 shadow-md",
        D: "bg-red-500 text-white border-red-500 shadow-md",
        P: "bg-purple-500 text-white border-purple-500 shadow-md",
      }[g] || "bg-gray-500 text-white border-gray-500 shadow-md";
    }
    return "bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700 dark:hover:border-gray-500";
  };

  return (
    <div className="flex gap-2">
      {list.map((g: string) => {
        const active = g === value;
        return (
          <button
            key={g}
            type="button"
            onClick={() => onChange(g)}
            className={`h-8 px-4 rounded-full text-xs font-medium border transition-all duration-200 hover:scale-105 ${tone(
              g,
              active,
            )}`}
            aria-pressed={active}
          >
            Grade {g}
          </button>
        );
      })}
    </div>
  );
}

const normalizeSpecs = (s: any = {}) => ({
  processor: Array.isArray(s.processor) ? s.processor[0] ?? "" : s.processor ?? "",
  ram: Array.isArray(s.ram) ? s.ram[0] ?? "" : s.ram ?? "",
  storage: Array.isArray(s.storage) ? s.storage[0] ?? "" : s.storage ?? "",
  screen: Array.isArray(s.screen) ? s.screen[0] ?? "" : s.screen ?? "",
  batteryHealth: Array.isArray(s.batteryHealth)
    ? s.batteryHealth[0] ?? ""
    : s.batteryHealth ?? "",
  color: Array.isArray(s.color) ? s.color[0] ?? "" : s.color ?? "",
});

const PRESET = {
  processor: [
    "Apple M1",
    "Apple M2",
    "Apple M3",
    "Apple M4",
    "Intel Core i5",
    "Intel Core i7",
    "Intel Core i9",
    "AMD Ryzen 5",
    "AMD Ryzen 7",
    "AMD Ryzen 9",
  ],
  ram: ["4GB", "8GB", "16GB", "32GB", "64GB"],
  storage: ["128GB SSD", "256GB SSD", "512GB SSD", "1TB SSD", "2TB SSD"],
  screen: ["11-inch", "13-inch", "14-inch", "15-inch", "16-inch", "17-inch"],
  batteryHealth: ["100%", "90-99%", "80-89%", "70-79%", "<70%"],
  color: ["Black", "Silver", "Space Gray", "White", "Blue", "Red", "Green"],
};

function QuickPicks({ items, onPick }: any) {
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {items.map((v: string) => (
        <button
          key={v}
          type="button"
          onClick={() => onPick(v)}
          className="rounded-full bg-gray-100 border border-gray-200 px-2 py-0.5 text-[10px] leading-3 text-gray-600 transition-all duration-200 hover:bg-gray-200 hover:border-gray-300 hover:scale-105 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:border-gray-500"
          title={v}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

function SelectOrType({ label, value, onChange, options, placeholder, id }: any) {
  return (
    <div className="space-y-1">
      <Label
        htmlFor={id}
        className="text-[10px] font-medium text-gray-700 dark:text-gray-200 uppercase tracking-wide"
      >
        {label}
      </Label>
      <div className="flex gap-2">
        <select
          id={`${id}-select`}
          className="h-8 w-32 rounded-lg border border-gray-200 bg-white px-2 text-xs focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200 dark:focus:border-blue-400 dark:focus:ring-blue-400/20 transition-all duration-200"
          value={options.includes(value || "") ? value : ""}
          onChange={(e) => {
            const val = e.target.value;
            if (val) onChange(val);
          }}
        >
          <option value="">{label}…</option>
          {options.map((opt: string) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        <Input
          id={id}
          className="h-8 text-xs rounded-lg border-gray-200 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500/20"
          placeholder={placeholder}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      <QuickPicks items={options} onPick={onChange} />
    </div>
  );
}

export default function TesterIntakeModal({
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
  const preferredTester = useMemo(
    () => fixedTester || user?.name || row.testedBy || "",
    [fixedTester, user?.name, row.testedBy],
  );

  const initialRow = {
    ...row,
    testedDate: row.testedDate || today,
    testedBy: row.testedBy || preferredTester,
    specs: row.specs || {},
    productName: row.productName || "",
    partStatus: row.partStatus || null,
  };
  const [local, setLocal] = useState(initialRow);
  const [initial, setInitial] = useState(initialRow);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [avgLoading, setAvgLoading] = useState(false);
  const [avgUSD, setAvgUSD] = useState<number | null>(null);
  const [avgN, setAvgN] = useState<any>(null);
  const [avgErr, setAvgErr] = useState<string | null>(null);
  const [recentEntries, setRecentEntries] = useState<{
    productName: string[];
    testedBy: string[];
    specs: any;
  }>({
    productName: [],
    testedBy: [],
    specs: {
      processor: [],
      ram: [],
      storage: [],
      screen: [],
      batteryHealth: [],
      color: [],
    },
  });

  useEffect(() => {
    if (!open) return;
    setLocal({
      ...row,
      testedDate: row.testedDate || today,
      testedBy: row.testedBy || preferredTester,
      specs: row.specs || {},
      productName: row.productName || "",
      partStatus: row.partStatus || null,
    });
    setInitial({
      ...row,
      testedDate: row.testedDate || today,
      testedBy: row.testedBy || preferredTester,
      specs: row.specs || {},
      productName: row.productName || "",
      partStatus: row.partStatus || null,
    });
    setTimeout(() => firstInputRef.current?.focus(), 0);
  }, [open, row, preferredTester, today]);

  const dirty = useMemo(() => {
    const changes = diffInventory(initial, local);
    if (changes.testedDate && changes.testedDate === today) delete changes.testedDate;
    if (changes.testedBy && changes.testedBy === preferredTester) delete changes.testedBy;
    return Object.keys(changes).length > 0;
  }, [initial, local, today, preferredTester]);

  const coerceNum = (v: any) => {
    if (v === "" || v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const toISODate = (d?: string | Date | null) => {
    if (!d) return today;
    if (typeof d === "string") return d.slice(0, 10);
    return d.toISOString().slice(0, 10);
  };

  const doSave = useCallback(
    async (statusOverride?: string) => {
      if (saving) return;
      setSaving(true);
      setErrorMessage(null);

      try {
        const id = local?.synergyId || initial?.synergyId;
        if (!id) throw new Error("Missing synergyId");

        const statusToSave = statusOverride || "TESTED";

        const payload: any = {
          status: statusToSave,
          grade:
            typeof local?.grade === "string" ? local.grade : initial?.grade ?? "",
          testedBy:
            typeof local?.testedBy === "string" && local.testedBy.trim() !== ""
              ? local.testedBy
              : initial?.testedBy || preferredTester,
          testedDate: toISODate(local?.testedDate || today),
          testerComment:
            typeof local?.testerComment === "string" ? local.testerComment : "",
          partStatus: local.partStatus,
        };

        if (local?.specs && typeof local.specs === "object") payload.specs = local.specs;
        if (typeof local?.price === "number") payload.price = local.price;
        if (typeof local?.ebayPrice === "number") payload.ebayPrice = local.ebayPrice;
        if (typeof local?.purchaseCost === "number") {
          payload.purchaseCost = local.purchaseCost;
          payload.price = local.purchaseCost;
        }
        if (typeof local?.categoryId === "string") payload.categoryId = local.categoryId;

        const res = await fetch(
          `${API_BASE}/rows/${encodeURIComponent(id)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );

        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(`PATCH failed ${res.status}: ${txt || res.statusText}`);
        }

        const json = await res.json();

        // Only update recent entries if not scrapping
        if (statusToSave !== "SCRAP") {
          setRecentEntries((prev) => ({
            productName: [
              ...new Set([local.productName, ...prev.productName].slice(0, 5)),
            ],
            testedBy: [
              ...new Set([payload.testedBy, ...prev.testedBy].slice(0, 5)),
            ],
            specs: {
              processor: [
                ...new Set(
                  [local.specs?.processor, ...prev.specs.processor].slice(0, 5),
                ),
              ],
              ram: [
                ...new Set([local.specs?.ram, ...prev.specs.ram].slice(0, 5)),
              ],
              storage: [
                ...new Set(
                  [local.specs?.storage, ...prev.specs.storage].slice(0, 5),
                ),
              ],
              screen: [
                ...new Set(
                  [local.specs?.screen, ...prev.specs.screen].slice(0, 5),
                ),
              ],
              batteryHealth: [
                ...new Set(
                  [
                    local.specs?.batteryHealth,
                    ...prev.specs.batteryHealth,
                  ].slice(0, 5),
                ),
              ],
              color: [
                ...new Set([local.specs?.color, ...prev.specs.color].slice(0, 5)),
              ],
            },
          }));
        }

        const updated: any = {
          synergyId: id,
          ...(json || {}),
          ...(payload || {}),
        };

        onChange?.(updated);
        await Promise.resolve(onSave?.(updated));

        window.dispatchEvent(new CustomEvent("rows:upserted", { detail: updated }));
        setInitial({ ...local, ...payload });

        setFlash("save");
        await sleep(300);
        onClose();
      } catch (err: any) {
        console.error(err);
        setErrorMessage(err.message);
        setFlash("error");
      } finally {
        setSaving(false);
        setTimeout(() => setFlash(null), 900);
      }
    },
    [saving, local, initial, onChange, onSave, preferredTester, today, onClose],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        doSave();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        if (!dirty) onClose();
        else if (confirm("Discard changes?")) onClose();
        return;
      }
      const target = e.target as HTMLElement;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (!typing) {
        const k = e.key.toUpperCase();
        // grade hotkeys removed by request
        if (k === "T") {
          e.preventDefault();
          setLocal((prev) => ({ ...prev, testedDate: today }));
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, doSave, dirty, onClose, today]);

  const fetchAvg = async () => {
    if (!local.productName) {
      setAvgErr("Missing product name");
      return;
    }
    setAvgLoading(true);
    setAvgErr(null);
    setAvgN(null);
    try {
      const res = await getBrowseAvg(local.productName, {
        fixed: true,
        condition: "USED",
        currency: "USD",
        limit: 100,
      });
      setAvgUSD(typeof res.avg === "number" ? res.avg : null);
      setAvgN({ valid: res.valid ?? 0, sampled: res.sampled ?? 0 });
      if (!res.ok || res.avg == null) setAvgErr("No data");
    } catch (e: any) {
      setAvgErr(e?.message || "Failed to fetch market avg");
    } finally {
      setAvgLoading(false);
    }
  };

  const copyRecentSpecs = (entry: any) => {
    const next = normalizeSpecs(entry.specs);
    setLocal((prev) => ({ ...prev, specs: next }));
    onChange?.({ specs: next });
  };

  if (!open) return null;

  return (
    <>
      <div style={{ display: "none" }}>
        {local.synergyId && <Barcode ref={barcodeSvgRef} value={local.synergyId} />}
      </div>

      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-label="Tester Intake"
      >
        <div
          className="absolute inset-0 bg-black/60 dark:bg-black/80 animate-in fade-in-0 duration-300"
          onClick={() =>
            !dirty ? onClose() : confirm("Discard changes?") ? onClose() : null
          }
        />
        <div className="relative w-full max-w-7xl max-h-[98vh] flex flex-col bg-white rounded-2xl shadow-xl border border-gray-100 dark:bg-gray-900 dark:border-gray-800 animate-in fade-in-0 zoom-in-95 duration-300">
          {/* Header */}
          <div className="flex-none flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50 rounded-t-2xl dark:border-gray-800 dark:bg-gray-950">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center dark:bg-blue-900">
                <User className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Device Testing
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Log and grade device details
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() =>
                !dirty ? onClose() : confirm("Discard changes?") ? onClose() : null
              }
              className="text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Content Body */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex flex-col lg:flex-row gap-4">
              {/* Left Column */}
              <div className="flex-1 space-y-3 bg-gray-50 rounded-xl p-4 dark:bg-gray-950">
                <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide">
                  Core Information
                </h3>

                <div>
                  <Label className="text-[10px] font-medium text-gray-700 dark:text-gray-200 uppercase tracking-wide">
                    Product Name
                  </Label>
                  <Input
                    ref={firstInputRef}
                    className="mt-1 h-8 text-sm rounded-lg border-gray-200 bg-gray-100 text-gray-600 dark:bg-gray-800/70 dark:border-gray-600 dark:text-gray-300 cursor-not-allowed"
                    value={local.productName || ""}
                    disabled
                    readOnly
                    placeholder="e.g., Google Pixel 7 128GB"
                  />
                </div>

                <div>
                  <Label className="text-[10px] font-medium text-gray-700 dark:text-gray-200 uppercase tracking-wide">
                    Grade Assessment
                  </Label>
                  <div className="mt-1">
                    <GradePills
                      value={local.grade}
                      list={grades}
                      onChange={(g: any) => setLocal({ ...local, grade: g })}
                    />
                  </div>

                  {/* Issues / Parts + Scrap button */}
                  <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-800 pt-3 mt-3">
                    <Label className="text-[10px] font-medium text-gray-700 dark:text-gray-200 uppercase tracking-wide">
                      Issues / Parts
                    </Label>
                    <div className="flex items-center gap-2">
                      {local.partStatus === "ARRIVED" ? (
                        <Button
                          type="button"
                          size="sm"
                          className="h-8 text-xs gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={() =>
                            setLocal((prev) => ({ ...prev, partStatus: null }))
                          }
                          title="Click to acknowledge parts and clear flag"
                        >
                          <PackageCheck className="h-3.5 w-3.5" />
                          Parts Arrived (Clear)
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant={
                            local.partStatus === "NEEDED" ? "destructive" : "outline"
                          }
                          className={cn(
                            "h-8 text-xs gap-2",
                            local.partStatus === "NEEDED" &&
                              "bg-amber-100 text-amber-900 border-amber-300",
                          )}
                          onClick={() =>
                            setLocal((prev) => ({
                              ...prev,
                              partStatus:
                                prev.partStatus === "NEEDED" ? null : "NEEDED",
                            }))
                          }
                        >
                          <Wrench className="h-3.5 w-3.5" />
                          {local.partStatus === "NEEDED"
                            ? "Parts Needed"
                            : "Flag Missing Parts"}
                        </Button>
                      )}

                      {/* Scrap button moved here */}
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-8 text-xs gap-2"
                        onClick={() => {
                          if (confirm("Are you sure you want to SCRAP this item?")) {
                            doSave("SCRAP");
                          }
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                        Scrap Item
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[10px] font-medium text-gray-700 dark:text-gray-200 uppercase tracking-wide">
                      Tested By
                    </Label>
                    <Input
                      value={preferredTester}
                      disabled
                      readOnly
                      className="mt-1 h-8 text-sm rounded-lg border-gray-200 bg-gray-100 text-gray-600 dark:bg-gray-800/70 dark:border-gray-600 dark:text-gray-300 cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <Label className="text-[10px] font-medium text-gray-700 dark:text-gray-200 uppercase tracking-wide">
                        Tested Date
                      </Label>
                      <button
                        type="button"
                        className="text-[10px] text-blue-600 hover:text-blue-700 flex items-center gap-1 dark:text-blue-400 dark:hover:text-blue-300"
                        onClick={() =>
                          setLocal((prev) => ({ ...prev, testedDate: today }))
                        }
                      >
                        <CalendarDays className="h-3 w-3" /> Today
                      </button>
                    </div>
                    <Input
                      type="date"
                      value={today}
                      disabled
                      readOnly
                      className="mt-1 h-8 text-sm rounded-lg border-gray-200 bg-gray-100 text-gray-600 dark:bg-gray-800/70 dark:border-gray-600 dark:text-gray-300 cursor-not-allowed"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-[10px] font-medium text-gray-700 dark:text-gray-200 uppercase tracking-wide">
                    Testing Notes
                  </Label>
                  <Textarea
                    className="mt-1 h-16 rounded-lg border-gray-200 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500/20 text-xs"
                    value={local.testerComment ?? ""}
                    onChange={(e) =>
                      setLocal({ ...local, testerComment: e.target.value })
                    }
                    placeholder="Add observations, issues, or notes..."
                  />
                </div>
              </div>

              {/* Right Column */}
              <div className="flex-1 space-y-4 bg-gray-50 rounded-xl p-4 dark:bg-gray-950">
                <div className="flex items-start justify-between border-b border-gray-200 dark:border-gray-700 pb-2">
                  <div>
                    <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide">
                      Specifications
                    </h3>
                  </div>
                  <div className="flex items-center gap-2 -mt-1">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center h-7 px-3 rounded-md border border-gray-200 bg-white text-xs font-mono text-gray-600 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200">
                        {local.synergyId || "—"}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Copy Synergy ID"
                        onClick={() =>
                          local.synergyId &&
                          navigator.clipboard.writeText(local.synergyId)
                        }
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        title="Print Barcode Label"
                        onClick={() => printBarcode(barcodeSvgRef.current)}
                        disabled={!local.synergyId}
                      >
                        <Printer className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <SelectOrType
                    id="processor"
                    label="Processor"
                    value={local.specs?.processor ?? ""}
                    onChange={(val: any) =>
                      setLocal({
                        ...local,
                        specs: { ...local.specs, processor: val },
                      })
                    }
                    options={PRESET.processor}
                    placeholder="e.g., Apple M2 Pro"
                  />
                  <SelectOrType
                    id="ram"
                    label="RAM"
                    value={local.specs?.ram ?? ""}
                    onChange={(val: any) =>
                      setLocal({
                        ...local,
                        specs: { ...local.specs, ram: val },
                      })
                    }
                    options={PRESET.ram}
                    placeholder="e.g., 16GB"
                  />
                  <SelectOrType
                    id="storage"
                    label="Storage"
                    value={local.specs?.storage ?? ""}
                    onChange={(val: any) =>
                      setLocal({
                        ...local,
                        specs: { ...local.specs, storage: val },
                      })
                    }
                    options={PRESET.storage}
                    placeholder="e.g., 512GB SSD"
                  />
                  <SelectOrType
                    id="screen"
                    label="Screen"
                    value={local.specs?.screen ?? ""}
                    onChange={(val: any) =>
                      setLocal({
                        ...local,
                        specs: { ...local.specs, screen: val },
                      })
                    }
                    options={PRESET.screen}
                    placeholder="e.g., 14-inch"
                  />
                  <SelectOrType
                    id="batteryHealth"
                    label="Battery Health"
                    value={local.specs?.batteryHealth ?? ""}
                    onChange={(val: any) =>
                      setLocal({
                        ...local,
                        specs: { ...local.specs, batteryHealth: val },
                      })
                    }
                    options={PRESET.batteryHealth}
                    placeholder="e.g., 90-99%"
                  />
                  <SelectOrType
                    id="color"
                    label="Color"
                    value={local.specs?.color ?? ""}
                    onChange={(val: any) =>
                      setLocal({
                        ...local,
                        specs: { ...local.specs, color: val },
                      })
                    }
                    options={PRESET.color}
                    placeholder="e.g., Space Gray"
                  />
                </div>

                <h3 className="text-xs font-semibold text-gray-900 mb-2 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 pb-1 uppercase tracking-wide">
                  Pricing
                </h3>

                <div className="grid grid-cols-2 gap-4">
                  {/* Unit Cost - Editable */}
                  <div>
                    <Label className="text-[10px] font-medium text-gray-700 dark:text-gray-200 uppercase tracking-wide">
                      Unit Cost
                    </Label>
                    <div className="relative mt-1">
                      <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
                      <Input
                        type="number"
                        className="h-8 rounded-lg border-gray-200 bg-white pl-7 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200 font-mono text-xs focus:ring-2 focus:ring-blue-500/20"
                        value={local.purchaseCost ?? ""}
                        onChange={(e) =>
                          setLocal({
                            ...local,
                            purchaseCost: coerceNum(e.target.value),
                          })
                        }
                        placeholder="0.00"
                        inputMode="decimal"
                      />
                    </div>
                  </div>

                  {/* eBay Price */}
                  <div>
                    <div className="flex items-center justify-between">
                      <Label className="text-[10px] font-medium text-gray-700 dark:text-gray-200 uppercase tracking-wide">
                        eBay Price
                      </Label>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-5 w-5 p-0 text-gray-500 hover:text-blue-600"
                        onClick={fetchAvg}
                        disabled={avgLoading}
                        title="Fetch Market Average"
                      >
                        {avgLoading ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RefreshCcw className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                    <Input
                      type="number"
                      className="mt-1 h-8 rounded-lg border-gray-200 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500/20 text-xs"
                      value={local.ebayPrice ?? ""}
                      onChange={(e) =>
                        setLocal({
                          ...local,
                          ebayPrice: coerceNum(e.target.value),
                        })
                      }
                      placeholder="—"
                      inputMode="decimal"
                    />
                  </div>
                </div>

                {/* Market Data Helper */}
                {(avgUSD != null || avgErr) && !avgLoading && (
                  <div
                    className={`mt-2 text-xs rounded-lg p-2 flex justify-between items-center ${
                      avgErr
                        ? "bg-red-50 text-red-600"
                        : "bg-blue-50 text-blue-700"
                    }`}
                  >
                    {avgErr ? (
                      <span>{avgErr}</span>
                    ) : (
                      <>
                        <span>
                          Market Avg: ${avgUSD?.toFixed(2)}{" "}
                          {avgN ? `(${avgN.valid} sold)` : ""}
                        </span>
                        <button
                          onClick={() =>
                            setLocal((prev) => ({
                              ...prev,
                              ebayPrice:
                                Math.round((avgUSD ?? 0) * 100) / 100,
                            }))
                          }
                          className="underline hover:no-underline font-medium"
                        >
                          Apply
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {recentEntries.productName.length > 0 && (
              <div className="mt-3 bg-gray-50 rounded-xl p-3 dark:bg-gray-950">
                <h3 className="text-xs font-semibold text-gray-900 mb-2 dark:text-gray-100 uppercase tracking-wide">
                  Recent Entries
                </h3>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {recentEntries.productName.map((name, i) => (
                    <button
                      key={i}
                      type="button"
                      className="rounded-full bg-gray-100 border border-gray-200 px-3 py-1 text-[10px] text-gray-600 hover:bg-gray-200 hover:border-gray-300 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:border-gray-500 whitespace-nowrap"
                      onClick={() =>
                        copyRecentSpecs({
                          productName: name,
                          specs: recentEntries.specs,
                        })
                      }
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex-none flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50 rounded-b-2xl dark:border-gray-800 dark:bg-gray-950">
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {dirty ? "Unsaved changes" : "All changes saved"}
              </span>
              <StatusToast state={flash} message={errorMessage} />
            </div>
            <div className="flex items-center gap-3">
              <Button
                onClick={() => doSave()}
                disabled={saving}
                className="h-8 px-4 text-xs rounded-lg bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-700 dark:hover:bg-blue-600"
              >
                {saving ? (
                  <>
                    <Spinner />
                    <span className="ml-2">Saving…</span>
                  </>
                ) : (
                  "Save"
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
