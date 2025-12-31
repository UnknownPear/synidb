// src/components/tester/TesterCardRow.tsx

import React, { useMemo, useRef } from "react";
import { CheckCircle, AlertTriangle, Printer, ScanBarcode, KanbanSquare, Wrench, PackageCheck, Cpu, Database, StickyNote, MemoryStick } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge"; 
import Barcode from "@/components/ui/Barcode";
import { ListRow, getCompletenessStatus, getCategoryIcon, categoryTone } from "@/lib/testerTypes";
import { printBarcode } from "@/components/tester/TesterUI"; 
import { cn } from "@/lib/utils";

function cleanCpuString(cpu: string | null | undefined): string {
  if (!cpu) return "";
  return cpu
    .replace(/Intel\(R\)/yi, "")
    .replace(/Core\(TM\)/yi, "")
    .replace(/CPU/yi, "")
    .replace(/@.*/, "")
    .replace(/1\dth Gen/yi, "")
    .replace(/Processor/yi, "")
    .trim();
}

interface CardRowProps {
  row: ListRow;
  style?: React.CSSProperties;
  onRecordPrint: (synergyId: string) => void;
  onEdit: (synergyId: string) => void;
  onWorkspace: (row: ListRow) => void;
  denseMode?: boolean;
  showSpecsInline?: boolean;
}

export const CardRow = React.memo(function CardRow({
  row,
  style,
  onRecordPrint,
  onEdit,
  onWorkspace,
  denseMode,
  showSpecsInline
}: CardRowProps) {
  const barcodeSvgRef = useRef<SVGSVGElement>(null);

  const catLabel = useMemo(() => {
    if (typeof row.categoryLbl === "string" && row.categoryLbl.trim()) return row.categoryLbl.trim();
    if (typeof row.category === "string" && row.category.trim()) return row.category.trim();
    const obj = (row as any)?.category;
    if (obj && typeof obj === "object" && typeof obj.label === "string") return obj.label.trim();
    return "";
  }, [row]);

  const IconComp = getCategoryIcon((row as any).categoryIcon); 
  const badgeClass = categoryTone((row as any).categoryColor);

  const { isReady, missingFields } = getCompletenessStatus(row);
  const rowPad = denseMode ? "p-2 sm:p-2.5" : "p-2.5 sm:p-3";
  const commentPreview = row.testerComment && row.testerComment.length > 30 ? `${row.testerComment.slice(0, 27)}...` : row.testerComment;
  const wasPrinted = !!row.lastPrintedAt;
  const printTitle = wasPrinted ? `Label printed on ${new Date(row.lastPrintedAt!).toLocaleString()}` : "Label not printed yet";

  const handlePrintClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    printBarcode(barcodeSvgRef.current);
    onRecordPrint(row.synergyId);
  };

  const specs = row.specs || {};
  const cpu = cleanCpuString(specs.processor || specs.cpu);
  const ram = specs.ram || specs.memory;
  const storage = specs.storage || specs.hdd || specs.ssd;
  const hasSpecs = cpu || ram || storage;
  const hasNote = !!row.testerComment;

  return (
    <>
      <div style={{ display: 'none' }}>{row.synergyId && <Barcode ref={barcodeSvgRef} value={row.synergyId} />}</div>
      <div
        role="button"
        tabIndex={0}
        aria-label={`Edit ${row.productName}`}
        className={`border rounded-lg hover:shadow-md hover:border-primary/40 focus:outline focus:outline-2 focus:outline-primary transition-all duration-200 ${rowPad} bg-card text-card-foreground cursor-pointer`}
        style={style}
        onClick={() => onEdit(row.synergyId)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onEdit(row.synergyId)}
      >
        <div className="flex items-center gap-2">
          <div className="shrink-0 text-muted-foreground/70">
             <IconComp className="h-5 w-5" /> 
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 truncate">
              {isReady ? <CheckCircle className="h-4 w-4 text-green-600" /> : <AlertTriangle className="h-4 w-4 text-yellow-600" title={`Missing: ${missingFields.join(", ")}`} />}
              <Printer className={cn("h-4 w-4", wasPrinted ? "text-blue-500" : "text-muted-foreground/60")} title={printTitle} />
              
              <h3 className="font-semibold text-sm sm:text-base truncate">{row.productName || <span className="text-muted-foreground">Untitled Device</span>}</h3>
              
              {row.partStatus === 'NEEDED' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 border border-amber-200 ml-1">
                  <Wrench className="h-3 w-3" /> <span className="hidden sm:inline">Parts Needed</span>
                </span>
              )}

              {row.partStatus === 'ARRIVED' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800 border border-emerald-200 ml-1 animate-pulse">
                  <PackageCheck className="h-3 w-3" /> <span className="hidden sm:inline">Parts Arrived</span>
                </span>
              )}

              <span className="hidden sm:inline"></span>
              <span title="Synergy ID" className="inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] sm:text-[11px] font-normal border border-border font-mono">{row.synergyId}</span>
              
              {catLabel && (
                <span className={`inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] sm:text-[11px] font-normal border ${badgeClass}`}>
                  {catLabel}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              {hasSpecs && (
                <>
                  {cpu && (
                    <Badge variant="secondary" className="h-5 px-1.5 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700 font-medium text-[10px] gap-1 hover:bg-slate-200">
                        <Cpu className="h-3 w-3 opacity-70" /> {cpu}
                    </Badge>
                  )}
                  {ram && (
                    <Badge variant="secondary" className="h-5 px-1.5 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700 font-medium text-[10px] gap-1 hover:bg-slate-200">
                        <MemoryStick className="h-3 w-3 opacity-70" /> {ram}
                    </Badge>
                  )}
                  {storage && (
                    <Badge variant="secondary" className="h-5 px-1.5 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700 font-medium text-[10px] gap-1 hover:bg-slate-200">
                        <Database className="h-3 w-3 opacity-70" /> {storage}
                    </Badge>
                  )}
                </>
              )}
              
              {hasNote && (
                 <Badge variant="outline" className="h-5 px-1.5 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800 font-medium text-[10px] gap-1">
                    <StickyNote className="h-3 w-3" /> Note
                 </Badge>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground mt-1.5">
              {row.testedBy && <span className="text-foreground/80">Tester: {row.testedBy}</span>}
              {row.upc && <span title="UPC" className="inline-flex items-center gap-1 text-foreground/70 font-mono ml-2"><ScanBarcode className="h-3 w-3" /> {row.upc}</span>}
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <Button variant="outline" size="icon" onClick={handlePrintClick} title="Print" className="h-8 w-8 text-xs"><Printer className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => onWorkspace(row)} className="h-8 gap-1 pl-2 pr-2 text-xs"><KanbanSquare className="h-4 w-4" /><span className="hidden sm:inline">Workspace</span></Button>
          </div>
        </div>
      </div>
    </>
  );
});