// src/components/VendorManager.tsx
import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Plus, 
  X, 
  Building2, 
  Search, 
  ChevronRight, 
  Store, 
  Save, 
  Trash2,
  PlusCircle 
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

// Keep this component self-contained so it doesn't depend on ManagerDashboard internals
const RAW_API = (import.meta as any).env?.VITE_API_URL as string | undefined;
const API_BASE = (() => {
  if (RAW_API && /^https?:\/\//i.test(RAW_API)) return RAW_API.replace(/\/+$/, "");
  const p = RAW_API && RAW_API.trim() ? RAW_API : "/backend";
  return (p.startsWith("/") ? p : `/${p}`).replace(/\/+$/, "");
})();
const join = (b: string, p: string) => `${b}${p.startsWith("/") ? p : `/${p}`}`;

async function apiDelete(path: string) {
  const r = await fetch(join(API_BASE, path), { method: "DELETE" });
  if (!r.ok) throw new Error(await r.text());
  return r.json().catch(() => ({}));
}
async function apiPost<T = any>(path: string, body: any) {
  const r = await fetch(join(API_BASE, path), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as T;
}
async function apiPatch<T = any>(path: string, body: any) {
  const r = await fetch(join(API_BASE, path), {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as T;
}

export type Vendor = { id: string; name: string; po_count?: number };

export default function VendorManager({
  vendors,
  onClose,
  onUpdate,
}: {
  vendors: Vendor[];
  onClose: () => void;
  onUpdate: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // State
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [mode, setMode] = useState<"create" | "edit" | "idle">("idle");
  
  // Form State
  const [formName, setFormName] = useState("");
  const [busy, setBusy] = useState(false);

  // Initialize form when selection changes
  useEffect(() => {
    if (mode === "create") {
      setFormName("");
      setSelectedVendor(null);
    } else if (mode === "edit" && selectedVendor) {
      setFormName(selectedVendor.name);
    }
  }, [mode, selectedVendor]);

  // Filter Logic
  const filteredVendors = useMemo(() => {
    if (!searchTerm) return vendors;
    return vendors.filter(v => v.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [vendors, searchTerm]);

  const getInitials = (name: string) => {
    return (name || "?").split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
  };

  // Handlers
  const handleSelect = (v: Vendor) => {
    setSelectedVendor(v);
    setMode("edit");
  };

  const handleCreateMode = () => {
    setSelectedVendor(null);
    setMode("create");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;
    
    setBusy(true);
    try {
      if (mode === "create") {
        await apiPost("/vendors", { name: formName.trim() });
      } else if (mode === "edit" && selectedVendor) {
        await apiPatch(`/vendors/${selectedVendor.id}`, { name: formName.trim() });
      }
      onUpdate();
      // Stay in edit mode or reset? Let's reset to idle to show success state effectively or just clear busy
      // If creating, maybe switch to edit mode for the new item? For simplicity, we reset to idle or keep as is.
      // Let's clear form if create, or keep if edit.
      if (mode === "create") {
         setFormName("");
         alert("Vendor created successfully.");
      } else {
         alert("Vendor updated.");
      }
    } catch (err: any) {
      alert(err.message || "Operation failed");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedVendor || !window.confirm("Are you sure you want to delete this vendor?")) return;
    setBusy(true);
    try {
      await apiDelete(`/vendors/${selectedVendor.id}`);
      onUpdate();
      setSelectedVendor(null);
      setMode("idle");
    } catch (err: any) {
      alert(err.message || "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-4xl h-[600px] flex bg-card rounded-2xl shadow-2xl border overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* LEFT COLUMN: Directory */}
        <div className="w-80 md:w-96 border-r bg-muted/10 flex flex-col flex-shrink-0">
          <div className="p-4 border-b space-y-3 bg-background">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-primary font-semibold">
                <Store className="h-5 w-5" />
                <span>Vendor Directory</span>
              </div>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleCreateMode} title="Add New Vendor">
                <Plus className="h-5 w-5 text-primary" />
              </Button>
            </div>
            
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search vendors..." 
                className="pl-9 bg-background border-muted-foreground/20"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filteredVendors.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground/60 text-center px-4">
                <Building2 className="h-10 w-10 mb-2 opacity-20" />
                <p className="text-sm">No vendors found.</p>
                <Button variant="link" onClick={handleCreateMode}>Create one?</Button>
              </div>
            ) : (
              filteredVendors.map(v => (
                <button
                  key={v.id}
                  onClick={() => handleSelect(v)}
                  className={`
                    w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left group
                    ${selectedVendor?.id === v.id 
                      ? "bg-primary/10 border-primary/30 shadow-sm z-10 relative" 
                      : "bg-transparent border-transparent hover:bg-muted/80 hover:border-muted"}
                  `}
                >
                  <Avatar className={`h-10 w-10 border ${selectedVendor?.id === v.id ? "ring-2 ring-primary/20" : ""}`}>
                    <AvatarFallback className={selectedVendor?.id === v.id ? "bg-primary text-primary-foreground" : "bg-muted"}>
                      {getInitials(v.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium truncate ${selectedVendor?.id === v.id ? "text-primary" : "text-foreground"}`}>
                      {v.name}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {v.po_count || 0} Purchase Orders
                    </div>
                  </div>
                  {selectedVendor?.id === v.id && (
                    <ChevronRight className="h-4 w-4 text-primary animate-in slide-in-from-left-1" />
                  )}
                </button>
              ))
            )}
          </div>
          <div className="p-2 text-xs text-center text-muted-foreground border-t bg-background/50">
             {filteredVendors.length} vendors total
          </div>
        </div>

        {/* RIGHT COLUMN: Detail/Form */}
        <div className="flex-1 bg-background relative flex flex-col">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onClose} 
            className="absolute top-3 right-3 z-20 hover:bg-muted rounded-full"
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </Button>

          {mode === "idle" ? (
             <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground/40 p-8 text-center bg-muted/5">
               <div className="bg-muted/20 p-6 rounded-full mb-4">
                 <Store className="h-12 w-12" />
               </div>
               <h3 className="text-lg font-semibold text-foreground/80">Select a Vendor</h3>
               <p className="max-w-xs mx-auto text-sm mt-2">
                 Select a vendor from the list to edit details, or click the <Plus className="inline h-3 w-3"/> icon to create a new one.
               </p>
             </div>
          ) : (
            <div className="flex-1 flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-300">
               <div className="flex-1 flex flex-col items-center justify-center p-8 max-w-sm mx-auto w-full">
                  
                  <div className="flex flex-col items-center mb-8">
                    <Avatar className="h-24 w-24 border-4 border-muted/20 shadow-xl mb-4">
                      <AvatarFallback className="bg-primary/5 text-primary text-3xl font-light">
                        {mode === "create" ? <Plus className="h-10 w-10" /> : getInitials(formName)}
                      </AvatarFallback>
                    </Avatar>
                    <h2 className="text-2xl font-bold text-center">
                      {mode === "create" ? "New Vendor" : "Edit Vendor"}
                    </h2>
                    <p className="text-muted-foreground text-sm">
                      {mode === "create" ? "Enter details below" : "Update vendor information"}
                    </p>
                  </div>

                  <form onSubmit={handleSave} className="w-full space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase text-muted-foreground tracking-wider ml-1">Vendor Name</label>
                      <div className="relative group">
                        <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                        <Input
                          value={formName}
                          onChange={(e) => setFormName(e.target.value)}
                          className="pl-10 h-11 bg-muted/20 border-muted-foreground/20 focus:bg-background"
                          placeholder="e.g., Acme Corp"
                          autoFocus
                        />
                      </div>
                    </div>

                    <Button 
                      type="submit" 
                      disabled={busy || !formName.trim()} 
                      className="w-full h-11 mt-2 text-base font-medium shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all"
                    >
                      {busy ? "Saving..." : mode === "create" ? "Create Vendor" : "Save Changes"}
                      {!busy && (mode === "create" ? <PlusCircle className="ml-2 h-4 w-4" /> : <Save className="ml-2 h-4 w-4" />)}
                    </Button>

                    {mode === "edit" && (
                      <Button 
                        type="button" 
                        variant="ghost"
                        onClick={handleDelete}
                        disabled={busy}
                        className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> Delete Vendor
                      </Button>
                    )}
                  </form>
               </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}