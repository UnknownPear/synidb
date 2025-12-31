// src/components/manager/CategoryManagerModal.tsx
import React, { useEffect, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import ConfirmDialog from "@/components/ConfirmDialog";
import { 
  Trash2, 
  PlusCircle, 
  Tags, 
  Search, 
  Plus, 
  ChevronRight, 
  ChevronDown, // Added
  X, 
  Save, 
  Hash, 
  Check,
  LayoutGrid,
  Palette
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { Category as Cat } from "@/lib/dataClient";
import { PRESET_ICONS, PRESET_COLORS, getCategoryIcon } from "@/lib/testerTypes";
import { cn } from "@/lib/utils";

// Tailwind Purge Protection: Explicitly map colors for the dots
const DOT_COLORS: Record<string, string> = {
  slate: "bg-slate-500",
  red: "bg-red-500",
  orange: "bg-orange-500",
  amber: "bg-amber-500",
  green: "bg-emerald-500",
  blue: "bg-blue-500",
  sky: "bg-sky-500",
  indigo: "bg-indigo-500",
  violet: "bg-violet-500",
  purple: "bg-purple-500",
  fuchsia: "bg-fuchsia-500",
  pink: "bg-pink-500",
};

type Props = {
  open: boolean;
  onClose: () => void;
  categories: Cat[];
  onCreate: (label: string, prefix: string, icon: string, color: string) => void | Promise<void>;
  onUpdate: (id: string, label: string, prefix: string, icon: string, color: string) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
};

export default function CategoryManagerModal({
  open,
  onClose,
  categories,
  onCreate,
  onUpdate,
  onDelete,
}: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // State
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<Cat | null>(null);
  const [mode, setMode] = useState<"create" | "edit" | "idle">("idle");
  
  // UI State
  const [showIconGrid, setShowIconGrid] = useState(false);

  // Form State
  const [label, setLabel] = useState("");
  const [prefix, setPrefix] = useState("");
  const [iconKey, setIconKey] = useState("box");   
  const [colorKey, setColorKey] = useState("slate"); 
  const [busy, setBusy] = useState(false);
  
  // Delete dialog
  const [pendingDelete, setPendingDelete] = useState<Cat | null>(null);

  // Reset when opening
  useEffect(() => {
    if (open) {
      setMode("idle");
      setSelectedCategory(null);
      setLabel("");
      setPrefix("");
      setSearchTerm("");
      setShowIconGrid(false);
    }
  }, [open]);

  // Sync Form Data
  useEffect(() => {
    if (mode === "create") {
      setLabel(""); setPrefix(""); setIconKey("box"); setColorKey("slate");
      setSelectedCategory(null);
      setShowIconGrid(false);
    } else if (mode === "edit" && selectedCategory) {
      setLabel(selectedCategory.label);
      setPrefix(selectedCategory.prefix);
      setIconKey((selectedCategory as any).icon || "box");
      setColorKey((selectedCategory as any).color || "slate");
      setShowIconGrid(false);
    }
  }, [mode, selectedCategory]);

  const filteredCategories = useMemo(() => {
    if (!searchTerm) return categories;
    const lower = searchTerm.toLowerCase();
    return categories.filter(c => 
      c.label.toLowerCase().includes(lower) || 
      c.prefix.toLowerCase().includes(lower)
    );
  }, [categories, searchTerm]);

  // Handlers
  const handleSelect = (c: Cat) => {
    setSelectedCategory(c);
    setMode("edit");
  };

  const handleCreateMode = () => {
    setSelectedCategory(null);
    setMode("create");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !prefix.trim()) return;
    if (!/^\d{5}$/.test(prefix)) return alert("Prefix should be 5 digits (e.g., 22425).");
    
    setBusy(true);
    try {
      if (mode === "create") {
        await onCreate(label.trim(), prefix.trim(), iconKey, colorKey);
        setLabel(""); setPrefix(""); 
      } else if (mode === "edit" && selectedCategory) {
        await onUpdate(selectedCategory.id, label.trim(), prefix.trim(), iconKey, colorKey);
      }
    } catch (err: any) {
      alert("Operation failed: " + err.message);
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      await onDelete(pendingDelete.id);
      setPendingDelete(null);
      setSelectedCategory(null);
      setMode("idle");
    } catch (err: any) {
      alert("Delete failed: " + err.message);
    } finally {
      setBusy(false);
    }
  };

  const getInitials = (name: string) => (name || "?").substring(0, 2).toUpperCase();

  if (!open || !mounted) return null;

  const SelectedIcon = getCategoryIcon(iconKey);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
<div className="w-full max-w-4xl h-[650px] bg-background rounded-xl shadow-2xl border flex overflow-hidden">        
        {/* ─── LEFT COLUMN: LIST ────────────────────────────────────────── */}
        <div className="w-1/3 min-w-[280px] border-r bg-muted/30 flex flex-col">
          {/* Header */}
          <div className="p-3 border-b bg-background/50">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-base flex items-center gap-2">
                <Tags className="h-4 w-4 text-primary" />
                Categories
              </h2>
              <Button size="sm" variant="default" onClick={handleCreateMode} className="gap-1 h-7 text-xs">
                <Plus className="h-3 w-3" /> New
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input 
                placeholder="Search..." 
                className="pl-8 bg-background h-8 text-xs"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-muted-foreground/20 hover:scrollbar-thumb-muted-foreground/40">
            {filteredCategories.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-60">
                <Tags className="h-10 w-10 mb-2 stroke-1" />
                <p className="text-xs">No categories found</p>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredCategories.map(c => {
                  const ListIcon = getCategoryIcon((c as any).icon);
                  return (
                    <button
                      key={c.id}
                      onClick={() => handleSelect(c)}
                      className={cn(
                        "w-full flex items-center gap-3 p-2 rounded-lg border text-left transition-all",
                        selectedCategory?.id === c.id 
                          ? "bg-primary/5 border-primary/40 shadow-sm" 
                          : "bg-background border-transparent hover:border-border hover:bg-white dark:hover:bg-gray-800"
                      )}
                    >
                      <Avatar className="h-8 w-8 border">
                        <AvatarFallback className={cn("text-[10px] flex items-center justify-center", selectedCategory?.id === c.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                          {(c as any).icon ? <ListIcon className="h-4 w-4" /> : getInitials(c.label)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{c.label}</div>
                        <Badge variant="secondary" className="mt-0.5 text-[9px] h-3.5 px-1 font-mono text-muted-foreground font-normal">
                          #{c.prefix}
                        </Badge>
                      </div>
                      {selectedCategory?.id === c.id && <ChevronRight className="h-3 w-3 text-primary" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          
          <div className="p-2 text-[10px] text-center text-muted-foreground border-t bg-background/50">
             {filteredCategories.length} total
          </div>
        </div>

        {/* ─── RIGHT COLUMN: FORM ───────────────────────────────────────── */}
        <div className="flex-1 bg-background flex flex-col relative min-w-0">
          <Button variant="ghost" size="icon" onClick={onClose} className="absolute top-2 right-2 z-10 h-8 w-8 hover:bg-muted rounded-full">
            <X className="h-4 w-4 text-muted-foreground" />
          </Button>

          {mode === "idle" ? (
             <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground/50 p-10 text-center">
               <div className="bg-muted/30 p-6 rounded-full mb-4">
                 <Tags className="h-12 w-12 stroke-1" />
               </div>
               <h3 className="text-lg font-semibold text-foreground">Select a Category</h3>
               <p className="max-w-xs mx-auto text-xs mt-2 leading-relaxed">
                 Select an item from the list to edit, or click <strong>New</strong> to create one.
               </p>
             </div>
          ) : (
            <form onSubmit={handleSave} className="flex flex-col h-full">
               {/* Fixed Header */}
               <div className="flex-shrink-0 px-6 py-4 border-b">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12 border-2 shadow-sm">
                      <AvatarFallback className="bg-primary/5 text-primary text-lg font-medium flex items-center justify-center">
                        {(() => {
                          const FormIcon = getCategoryIcon(iconKey);
                          return mode === "create" && iconKey === "box" ? <Plus className="h-6 w-6" /> : <FormIcon className="h-6 w-6" />;
                        })()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h2 className="text-lg font-bold tracking-tight">
                        {mode === "create" ? "New Category" : "Edit Category"}
                      </h2>
                      <p className="text-muted-foreground text-xs">
                        {mode === "create" ? "Configure a new item type" : "Update category details"}
                      </p>
                    </div>
                  </div>
               </div>

               {/* Scrollable Content */}
               <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 scrollbar-thin scrollbar-thumb-muted-foreground/20">
                  
                  {/* Basic Info */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Label</Label>
                      <div className="relative">
                        <Tags className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          value={label}
                          onChange={(e) => setLabel(e.target.value)}
                          className="pl-8 h-9 bg-muted/10 border-muted-foreground/20 focus:bg-background text-sm"
                          placeholder="e.g. Tablets - iPad"
                          autoFocus
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Prefix (5 Digits)</Label>
                      <div className="relative">
                        <Hash className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          value={prefix}
                          onChange={(e) => setPrefix(e.target.value.replace(/[^0-9]/g, ""))}
                          className="pl-8 h-9 font-mono bg-muted/10 border-muted-foreground/20 focus:bg-background text-sm"
                          placeholder="00000"
                          maxLength={5}
                        />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Collapsible Icon Picker */}
                  <div className="space-y-2">
                    <Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider flex items-center gap-2">
                      <LayoutGrid className="h-3 w-3" /> Icon
                    </Label>
                    
                    <div className="space-y-2">
                        {/* Trigger Button */}
                        <button
                            type="button"
                            onClick={() => setShowIconGrid(!showIconGrid)}
                            className="flex w-full items-center justify-between p-2 rounded-lg border bg-card hover:bg-muted/50 transition-all group"
                        >
                            <div className="flex items-center gap-3">
                                <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10 text-primary border border-primary/20 group-hover:border-primary/40 transition-colors">
                                     <SelectedIcon className="h-5 w-5" />
                                </div>
                                <div className="text-left">
                                    <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Selected</div>
                                    <div className="text-sm font-semibold capitalize text-foreground">{iconKey}</div>
                                </div>
                            </div>
                            <div className="pr-2 text-muted-foreground group-hover:text-foreground">
                                <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", showIconGrid && "rotate-180")} />
                            </div>
                        </button>

                        {/* Collapsible Grid */}
                        {showIconGrid && (
                            <div className="grid grid-cols-8 gap-2 p-3 rounded-lg border bg-muted/20 animate-in slide-in-from-top-2 fade-in duration-200">
                                {Object.entries(PRESET_ICONS).map(([k, IconComp]) => (
                                    <button
                                        key={k}
                                        type="button"
                                        onClick={() => {
                                            setIconKey(k);
                                            setShowIconGrid(false); // Auto-collapse
                                        }}
                                        className={cn(
                                            "flex items-center justify-center aspect-square rounded-md border transition-all",
                                            iconKey === k 
                                                ? "bg-primary text-primary-foreground border-primary shadow-sm scale-105" 
                                                : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground hover:bg-white dark:hover:bg-gray-800"
                                        )}
                                        title={k}
                                    >
                                        <IconComp className="h-5 w-5" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                  </div>

                  <Separator />

                  {/* Color Picker (Grid Layout - Unchanged) */}
                  <div className="space-y-2">
                    <Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider flex items-center gap-2">
                      <Palette className="h-3 w-3" /> Color Theme
                    </Label>
                    <div className="grid grid-cols-4 gap-2">
                      {Object.keys(PRESET_COLORS).map((k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setColorKey(k)}
                          className={cn(
                            "group relative flex items-center gap-2 px-2 py-2 rounded-lg border transition-all text-xs font-medium capitalize",
                            colorKey === k 
                              ? "bg-accent border-primary ring-1 ring-primary text-accent-foreground shadow-sm" 
                              : "hover:bg-muted/50 border-border bg-card text-muted-foreground"
                          )}
                        >
                          <div 
                            className={cn("w-3 h-3 rounded-full border shadow-sm flex-shrink-0", DOT_COLORS[k] || "bg-gray-500")} 
                          />
                          <span className="truncate">{k}</span>
                        </button>
                      ))}
                    </div>
                  </div>
               </div>

               {/* Fixed Footer */}
               <div className="flex-shrink-0 px-6 py-4 border-t bg-muted/5 flex justify-between items-center gap-4">
                  {mode === "edit" ? (
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="sm"
                      onClick={() => setPendingDelete(selectedCategory)}
                      disabled={busy}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10 h-9"
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Delete
                    </Button>
                  ) : <div />}
                  
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={busy} className="h-9">Cancel</Button>
                    <Button type="submit" size="sm" disabled={busy || !label.trim() || !prefix.trim()} className="min-w-[120px] h-9">
                      {busy ? "Saving..." : mode === "create" ? "Create Category" : "Save Changes"}
                      {!busy && (mode === "create" ? <PlusCircle className="ml-2 h-3.5 w-3.5" /> : <Save className="ml-2 h-3.5 w-3.5" />)}
                    </Button>
                  </div>
               </div>
            </form>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete category?"
        description={
          pendingDelete
            ? `“${pendingDelete.label}” (prefix ${pendingDelete.prefix}) will be removed permanently.`
            : ""
        }
        confirmLabel="Delete Category"
        cancelLabel="Cancel"
        variant="destructive"
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </div>,
    document.body
  );
}