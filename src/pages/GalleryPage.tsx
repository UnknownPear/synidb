import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";


/* --------------------------------- ATOMS --------------------------------- */

/**
 * Modernized Chip Component: Pill shape, subtle shadow, and vibrant active state (Glassmorphism-compatible).
 */
function Chip({ active, children, onClick }: { active?: boolean; children: React.ReactNode; onClick?: () => void }) {
  return (
    <button 
      onClick={onClick} 
      className={cn(
        "px-3 py-1 text-xs border rounded-full transition-all duration-300 shadow-sm whitespace-nowrap", // Rounded pill shape
        active 
          ? "bg-blue-600 text-white border-blue-700 shadow-lg shadow-blue-500/50 dark:bg-blue-600 dark:border-blue-500 dark:shadow-md" // Active state stands out
          : "bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-600"
      )}
    >
      {children}
    </button>
  );
}


/* ------------------------------- CRUD helpers ------------------------------ */

async function uploadFiles(files: File[]): Promise<string[]> {
  const ids: string[] = [];
  for (const f of files) {
    const form = new FormData();
    form.append("file", f, f.name);
    const res = await fetch(new URL("/files", DIRECTUS_BASE).toString(), { method: "POST", headers: { ...authedHeaders() }, body: form });
    if (!res.ok) throw new Error(`Upload failed: ${f.name} (${res.status})`);
    const { data } = await res.json();
    ids.push(data.id);
  }
  return ids;
}
type CreateLink = Partial<GalleryItem> & { file: string; synergyId?: string | null; partNumber?: string | null };
async function createLinks(items: CreateLink[]) {
  const res = await fetch(new URL("/items/product_image_links", DIRECTUS_BASE).toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authedHeaders() },
    body: JSON.stringify({ data: items }),
  });
  if (!res.ok) throw new Error(`Create links failed: ${res.status}`);
  return (await res.json()).data;
}
async function patchLink(id: string, patch: Partial<GalleryItem>) {
  const res = await fetch(new URL(`/items/product_image_links/${id}`, DIRECTUS_BASE).toString(), {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authedHeaders() },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Update ${id} failed: ${res.status}`);
  return (await res.json()).data;
}
async function deleteLink(id: string) {
  const res = await fetch(new URL(`/items/product_image_links/${id}`, DIRECTUS_BASE).toString(), { method: "DELETE", headers: { ...authedHeaders() } });
  if (!res.ok) throw new Error(`Delete ${id} failed: ${res.status}`);
}
async function reorderLinks(idsInOrder: string[]) {
  // Parallelized update to reorder for better performance
  const updates = idsInOrder.map((id, i) => 
    patchLink(id, { order: i })
  );
  await Promise.all(updates);
}

/* -------------------------- SID ↔ category helpers ------------------------- */

type Cat = { id: string; label: string; prefix?: string | null };
function extractPrefixFromSID(sid: string): string | null {
  const m = (sid || "").match(/\d{5}/);
  return m ? m[0] : null;
}
function findCatByPrefix(prefix: string | null, cats: Cat[]): Cat | null {
  if (!prefix) return null;
  const p = prefix.padStart(5, "0");
  return cats.find((c) => (c.prefix ?? "").padStart(5, "0") === p) ?? null;
}

/* --------------------------- EDITOR FIELD ATOM --------------------------- */

function EditorField({
    label,
    initialValue,
    onSave,
    placeholder,
    parser,
}: {
    label: string;
    initialValue: string;
    onSave: (value: string) => Promise<any>;
    placeholder: string;
    parser?: (value: string) => string;
}) {
    const [localValue, setLocalValue] = useState(initialValue);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    
    useEffect(() => {
        setLocalValue(initialValue);
    }, [initialValue]);

    const handleSave = useCallback(async (e: React.FocusEvent<HTMLInputElement>) => {
        if (e.currentTarget.value === initialValue) return;

        setSaving(true);
        setSaved(false);
        const valueToSave = parser ? parser(e.currentTarget.value) : e.currentTarget.value;
        
        try {
            await onSave(valueToSave);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (error) {
            console.error("Save error:", error);
            alert("Save failed: " + (error as any)?.message);
        } finally {
            setSaving(false);
        }
    }, [initialValue, onSave, parser]);

    return (
        <div className="flex items-center gap-2">
            <label className="w-20 opacity-80 text-gray-700 dark:text-gray-300">{label}</label>
            <Input
                value={localValue}
                onChange={(e) => setLocalValue(e.target.value)}
                onBlur={handleSave}
                // Sleek input styling for the glass panel
                className="h-8 flex-1 bg-white/70 dark:bg-gray-700/70 border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 focus:bg-white dark:focus:bg-gray-700 transition-all"
                placeholder={placeholder}
                disabled={saving}
            />
            {saving ? (
                <span className="text-xs text-blue-400 w-10 text-right">Saving...</span>
            ) : saved ? (
                <span className="text-xs text-green-500 w-10 text-right">Saved!</span>
            ) : (
                <div className="w-10" />
            )}
        </div>
    );
}

/* -------------------------- MAIN COMPONENT -------------------------- */

export default function GalleryPage() {
  const { synergyId = "" } = useParams();
  const [rows, setRows] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const [dbCats, setDbCats] = useState<Cat[]>([]);
  const autoCat = useMemo(() => findCatByPrefix(extractPrefixFromSID(synergyId), dbCats), [synergyId, dbCats]);

  // filters
  const [gradeFilter, setGradeFilter] = useState<Grade | null>(null);
  const [problemFilter, setProblemFilter] = useState<string[]>([]);
  const [folderFilter, setFolderFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // editor state
  const isAuthed = Boolean(getDirectusToken());
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [defaultFolder, setDefaultFolder] = useState<string>("");
  const [defaultAngle, setDefaultAngle] = useState<string>("");
  const [defaultUploadCats, setDefaultUploadCats] = useState<string[]>([]);

  // initial load / effects
  useEffect(() => { dataClient.getCategories().then(setDbCats).catch(() => setDbCats([])); }, []);
  useEffect(() => {
    if (autoCat && defaultUploadCats.length === 0) setDefaultUploadCats([autoCat.label]);
  }, [autoCat, defaultUploadCats.length]); 

  // --- Data Fetching ---
  const refresh = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await fetchProductGalleryBySID(synergyId);
      setRows(data);
      setActiveId((prev) => {
        if (prev && data.some((d) => d.id === prev)) return prev;
        return data[0]?.id ?? null;
      });
    } catch (e: any) {
      setErr(e?.message ?? String(e));
      setRows([]);
      setActiveId(null);
    } finally {
      setLoading(false);
    }
  }, [synergyId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // --- Filtered List Logic ---
  const filtered = useMemo(() => {
    let list = rows;
    if (gradeFilter) list = list.filter((r) => getDisplayGrade(r) === gradeFilter);
    if (problemFilter.length) {
      list = list.filter((r) => {
        const names = new Set(r.problems ?? []);
        return problemFilter.every((t) => names.has(t));
      });
    }
    if (folderFilter) list = list.filter((r) => r.folder === folderFilter);
    if (categoryFilter) list = list.filter((r) => (r.categories ?? []).includes(categoryFilter));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((r) => {
        const fields = [r.alt ?? "", r.notes ?? "", r.angle ?? "", (r.categories ?? []).join(" "), (r.problems ?? []).join(" "), r.file.title ?? ""]
          .join(" ")
          .toLowerCase();
        return fields.includes(q);
      });
    }
    return list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0));
  }, [rows, gradeFilter, problemFilter, folderFilter, categoryFilter, search]);

  useEffect(() => {
    if (!filtered.length) {
      setActiveId(null);
      return;
    }
    if (!activeId || !filtered.some((f) => f.id === activeId)) setActiveId(filtered[0].id);
  }, [filtered, activeId]);

  const active = filtered.find((f) => f.id === activeId) ?? null;

  // --- Action Handlers ---

  /** FIX: Define copyLinks within the component scope using useCallback **/
  const copyLinks = useCallback(async () => {
    const urls = filtered.map((r) => assetUrl(r.file.id)).join("\n");
    try {
      await navigator.clipboard.writeText(urls);
      alert(`Copied ${filtered.length} link${filtered.length === 1 ? "" : "s"} to clipboard.`);
    } catch {
      // Fallback for older browsers
      const ta = document.createElement("textarea");
      ta.value = urls;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      alert(`Copied ${filtered.length} link${filtered.length === 1 ? "" : "s"} (fallback method).`);
    }
  }, [filtered]);
  /** END FIX **/

  const actionSaveCategories = useCallback(async (id: string, v: string) => {
    const tags = v.split(",").map((s) => s.trim()).filter(Boolean);
    await patchLink(id, { categories: tags.length ? tags : null }); await refresh();
  }, [refresh]);

  const actionSaveProblems = useCallback(async (id: string, v: string) => {
    const tags = v.split(",").map((s) => s.trim()).filter(Boolean);
    await patchLink(id, { problems: tags.length ? tags : null }); await refresh();
  }, [refresh]);
  
  const actionSaveString = useCallback((field: keyof GalleryItem) => {
    return async (id: string, v: string) => {
      await patchLink(id, { [field]: v || null }); await refresh();
    };
  }, [refresh]);
  
  async function remove(id: string) { 
    if (confirm("Delete this image link? This action is permanent.")) { 
      await deleteLink(id); await refresh(); 
    } 
  }
  
  async function move(id: string, dir: -1 | 1) {
    const ordered = [...rows].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const idx = ordered.findIndex((x) => x.id === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= ordered.length) return;
    
    // Efficient swap logic: swap the order values and send parallel updates
    const tempOrderA = ordered[idx].order ?? idx;
    const tempOrderB = ordered[j].order ?? j;
    
    await Promise.all([
        patchLink(ordered[idx].id, { order: tempOrderB }),
        patchLink(ordered[j].id, { order: tempOrderA }),
    ]);
    await refresh();
  }
  
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    try {
      const fileIds = await uploadFiles(files);
      const payload: CreateLink[] = fileIds.map((fid, i) => ({
        synergyId,
        file: fid,
        order: rows.length + i,
        folder: defaultFolder || null,
        angle: defaultAngle || null,
        categories: defaultUploadCats.length ? Array.from(new Set(defaultUploadCats)) : null,
      }));
      await createLinks(payload);
      await refresh();
      // Clear inputs
      setDefaultFolder("");
      setDefaultAngle("");
      setDefaultUploadCats(autoCat ? [autoCat.label] : []);
    } catch (ex: any) {
      alert(ex?.message ?? String(ex));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }


  return (
    // Main container with dark mode background
    <div className="p-4 max-w-7xl mx-auto bg-gray-50 dark:bg-gray-900 dark:text-gray-100 min-h-screen">
      
      {/* Header */}
      <div className="flex items-center gap-4 mb-6 pt-2">
        <h1 className="text-3xl font-extrabold text-gray-800 dark:text-gray-100 tracking-tight">Gallery • {synergyId}</h1>
        <div className="ml-auto flex items-center gap-2">
          <Input 
            placeholder="Search notes, tags, title…" 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            className="h-9 w-[200px] bg-white dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400" 
          />
          <Link to="/">
            <Button variant="outline" size="sm" className="h-9 dark:bg-gray-700 dark:hover:bg-gray-600 dark:border-gray-600 dark:text-gray-300">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
              <span className="ml-1 hidden sm:inline">Back to Galleries</span>
            </Button>
          </Link>
          <Button size="sm" onClick={copyLinks} className="h-9 bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 dark:text-white">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            <span className="ml-1 hidden sm:inline">Copy {filtered.length} Links</span>
          </Button>
        </div>
      </div>

      {/* Auto category hint */}
      {autoCat && (
        <div className="text-sm mb-4 p-2 bg-blue-50/50 rounded dark:bg-gray-800/50 dark:text-gray-400 border border-blue-100 dark:border-gray-700">
          <span className="font-semibold">Context:</span> Auto category from SID prefix <code>{autoCat.prefix}</code> is **{autoCat.label}**.
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3 mb-6 border-b pb-4 dark:border-gray-800">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Quick Filters:</span>
        <div className="flex flex-wrap items-center gap-2">
          
          {/* Grade Filters */}
          <div className="flex gap-2 p-1 rounded-full bg-gray-100 dark:bg-gray-800">
            {(["A","B","C","D"] as Grade[]).map((g) => (
              <Chip key={g} active={gradeFilter === g} onClick={() => setGradeFilter((p) => (p === g ? null : g))}>Grade {g}</Chip>
            ))}
          </div>

          {/* Problem, Folder, Category Filters */}
          {rows.length > 0 && 
            <div className="flex flex-wrap gap-2">
              {/* Problem Tags */}
              {Array.from(new Set(rows.flatMap(r => r.problems ?? []))).sort().map((tag) => (
                <Chip key={tag} active={problemFilter.includes(tag)} onClick={() => {
                  setProblemFilter((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
                }}>{tag}</Chip>
              ))}
              
              {/* Folder Tags */}
              {Array.from(new Set(rows.map(r => r.folder).filter(Boolean) as string[])).sort().map((f) => (
                <Chip key={f} active={folderFilter === f} onClick={() => setFolderFilter((p) => (p === f ? null : f))}>{f}</Chip>
              ))}

              {/* Category Tags */}
              {Array.from(new Set(rows.flatMap(r => r.categories ?? []))).sort().map((c) => (
                <Chip key={c} active={categoryFilter === c} onClick={() => setCategoryFilter((p) => (p === c ? null : c))}>{c}</Chip>
              ))}
            </div>
          }
        </div>
      </div>

      {/* Viewer / Editor Layout */}
      {loading && <div className="text-sm text-gray-500 dark:text-gray-400">Loading gallery for {synergyId}...</div>}
      {err && (
        <div className="text-sm rounded-lg border border-red-400 bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-300 p-4 mb-3">
          <div className="font-bold mb-1">Error Loading Gallery</div>
          <pre className="whitespace-pre-wrap text-[11px] font-mono text-red-700 dark:text-red-400">{err}</pre>
          {/* Added context for 403 Forbidden error */}
          {(err as string).includes('403') && (
            <p className="mt-2 text-red-600 dark:text-red-300 font-semibold">
              The 403 (Forbidden) error often indicates a permissions issue. Please check your authentication token/login status.
            </p>
          )}
        </div>
      )}

      {!loading && !err && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr,420px] gap-8">
          
          {/* Left: Thumbnails Grid */}
          <div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
              {filtered.map((r) => (
                <div key={r.id} className="relative group">
                  <button 
                    onClick={() => setActiveId(r.id)} 
                    className={cn(
                      "block w-full text-left p-1 rounded-lg transition-all duration-200", 
                      activeId === r.id 
                        ? "ring-4 ring-blue-500/80 shadow-lg shadow-blue-500/40 opacity-100 bg-white dark:bg-gray-800" 
                        : "opacity-80 hover:opacity-100 hover:ring-2 hover:ring-gray-300 dark:hover:ring-gray-700"
                    )} 
                    title={r.alt ?? r.file.title ?? ""}
                  >
                    <img 
                      src={assetUrl(r.file.id)} 
                      alt={r.alt ?? r.file.title ?? ""} 
                      className="w-full h-32 object-cover rounded-md" 
                      loading="lazy" 
                    />
                    <div className="mt-1 text-[10px] text-gray-500 dark:text-gray-400 font-mono truncate px-1">
                      {r.folder ? `${r.folder} • ` : ""}{r.angle ?? "—"} 
                      {getDisplayGrade(r) ? `• G${getDisplayGrade(r)}` : ""}
                      {r.is_primary && <span className="text-blue-500 ml-1">★</span>}
                    </div>
                  </button>
                </div>
              ))}
            </div>
            {!filtered.length && <div className="text-sm text-gray-500 border border-dashed rounded p-4 mt-4 dark:border-gray-700 dark:text-gray-400">No images match the current filters.</div>}
          </div>

          {/* Right: Modern Glass Editor Panel */}
          <div className="sticky top-4 h-fit">
            <div className="rounded-xl p-6 shadow-2xl backdrop-blur-xl bg-white/50 dark:bg-gray-800/30 ring-1 ring-white/10 dark:ring-white/5">
              
              {/* Image Preview + Core Info */}
              {active ? (
                <>
                  <h2 className="text-lg font-bold mb-4 border-b pb-2 dark:border-gray-700 text-gray-800 dark:text-gray-100">Image Editor</h2>
                  <figure className="mb-4 text-center">
                    <img 
                      src={assetUrl(active.file.id)} 
                      alt={active.alt ?? active.file.title ?? ""} 
                      className="max-h-[360px] w-auto rounded-lg mx-auto border border-gray-200 dark:border-gray-700 shadow-md" 
                      draggable={false} 
                    />
                    <figcaption className="mt-2 text-xs text-gray-600 dark:text-gray-400 font-mono">
                      {active.file.id.substring(0, 8)}... | Order: {active.order ?? 'N/A'}
                    </figcaption>
                  </figure>

                  {isAuthed ? (
                    <div className="space-y-4 text-sm">
                      
                      {/* Angle & Grade Quick Selects */}
                      <div className="flex flex-col gap-2 p-3 rounded-lg bg-gray-100/50 dark:bg-gray-700/50">
                        <div className="flex gap-2">
                            <label className="w-20 opacity-80 text-gray-700 dark:text-gray-300">Angle</label>
                            {["front", "back", "side", "label", "closeup"].map((a) => (
                            <Chip key={a} active={active.angle === a} onClick={() => patchLink(active.id, { angle: a }).then(refresh)}>{a}</Chip>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <label className="w-20 opacity-80 text-gray-700 dark:text-gray-300">Grades</label>
                            {(["A","B","C","D"] as Grade[]).map((g) => <Chip key={"pg"+g} active={active.partGrade === g} onClick={() => patchLink(active.id, { partGrade: g }).then(refresh)}>Part G{g}</Chip>)}
                            {(["A","B","C","D"] as Grade[]).map((g) => <Chip key={"g"+g} active={active.grade === g} onClick={() => patchLink(active.id, { grade: g }).then(refresh)}>Prod G{g}</Chip>)}
                        </div>
                      </div>

                      {/* Editor Fields */}
                      <div className="space-y-3">
                        {/* Note: actionSaveString needs to be called as actionSaveString('field_name')(active.id, v) 
                           but since it's used inside the EditorField atom, we can bind active.id in the parent. */}
                        <EditorField label="Folder" initialValue={active.folder ?? ""} onSave={actionSaveString('folder').bind(null, active.id)} placeholder="e.g., main, defects, packaging" parser={(v) => v.trim()} />
                        <EditorField label="Alt Text" initialValue={active.alt ?? ""} onSave={actionSaveString('alt').bind(null, active.id)} placeholder="short alt text for SEO" parser={(v) => v.trim()} />
                        <EditorField label="Notes" initialValue={active.notes ?? ""} onSave={actionSaveString('notes').bind(null, active.id)} placeholder="internal notes" parser={(v) => v.trim()} />
                        <EditorField label="Problems" initialValue={(active.problems ?? []).join(", ")} onSave={actionSaveProblems.bind(null, active.id)} placeholder="scratch, dent, tear (comma separated)" parser={(v) => v.trim()} />
                        
                        {/* Categories Field + Chips */}
                        <div className="flex flex-col gap-2">
                            <EditorField label="Categories" initialValue={(active.categories ?? []).join(", ")} onSave={actionSaveCategories.bind(null, active.id)} placeholder="electronics, furniture (comma separated)" parser={(v) => v.trim()} />
                            {!!dbCats.length && (
                              <div className="flex gap-1 flex-wrap pl-20 -mt-1">
                                {dbCats.map((c) => {
                                  const on = (active.categories ?? []).includes(c.label);
                                  return (
                                    <Chip key={c.id} active={on} onClick={async () => {
                                      const set = new Set(active.categories ?? []);
                                      on ? set.delete(c.label) : set.add(c.label);
                                      await patchLink(active.id, { categories: Array.from(set).length ? Array.from(set) : null });
                                      await refresh();
                                    }}>
                                      {c.label}
                                    </Chip>
                                  );
                                })}
                              </div>
                            )}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                        <Button size="sm" variant="outline" onClick={() => move(active.id, -1)} className="dark:bg-gray-700 dark:hover:bg-gray-600 dark:border-gray-600 dark:text-gray-300">Move Up</Button>
                        <Button size="sm" variant="outline" onClick={() => move(active.id, +1)} className="dark:bg-gray-700 dark:hover:bg-gray-600 dark:border-gray-600 dark:text-gray-300">Move Down</Button>
                        
                        <Button 
                            size="sm" 
                            variant={active.is_primary ? "default" : "outline"} 
                            onClick={() => patchLink(active.id, { is_primary: !active.is_primary }).then(refresh)}
                            className={cn("transition-colors", active.is_primary ? "bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700 dark:text-white" : "dark:bg-gray-700 dark:hover:bg-gray-600 dark:border-gray-600 dark:text-gray-300")}
                        >
                          {active.is_primary ? "Primary ✓" : "Set Primary"}
                        </Button>
                        
                        <Button size="sm" variant="destructive" onClick={() => remove(active.id)} className="ml-auto">
                           <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500 border border-dashed rounded p-3 dark:border-gray-700 dark:text-gray-400">Read-only mode. Sign in to edit image details.</div>
                  )}
                </>
              ) : (
                <div className="text-base text-center py-16 text-gray-500 dark:text-gray-400">
                    <p>No image selected.</p>
                    <p className="mt-2 text-sm">Select a thumbnail or upload new images to begin editing.</p>
                </div>
              )}
            </div>

            {/* Upload Section (Integrated) */}
            {isAuthed && (
              <div className="mt-4 rounded-xl p-6 shadow-xl backdrop-blur-md bg-white/50 dark:bg-gray-800/30 ring-1 ring-white/10 dark:ring-white/5">
                <h3 className="text-lg font-bold mb-3 border-b pb-2 dark:border-gray-700 text-gray-800 dark:text-gray-100">Upload to This Gallery</h3>
                
                <div className="space-y-3 text-sm">
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                        New uploads will inherit these default values.
                    </p>
                    
                    <div className="flex items-center gap-2">
                        <label className="opacity-80 text-gray-700 dark:text-gray-300 w-24">Default folder</label>
                        <Input value={defaultFolder} onChange={(e) => setDefaultFolder(e.target.value)} className="h-8 flex-1 dark:bg-gray-700/70 dark:border-gray-600 dark:placeholder-gray-400" placeholder="optional" />
                    </div>
                    
                    <div className="flex items-center gap-2">
                        <label className="opacity-80 text-gray-700 dark:text-gray-300 w-24">Default angle</label>
                        <Input value={defaultAngle} onChange={(e) => setDefaultAngle(e.target.value)} className="h-8 flex-1 dark:bg-gray-700/70 dark:border-gray-600 dark:placeholder-gray-400" placeholder="front/back…" />
                    </div>
                    
                    {/* default categories control */}
                    {!!dbCats.length && (
                    <div className="flex flex-col gap-2 pt-2">
                        <div className="text-xs font-medium text-gray-600 dark:text-gray-400 border-t pt-2 dark:border-gray-700">Default categories for new uploads:</div>
                        <div className="flex gap-1 flex-wrap">
                          {dbCats.map((c) => {
                            const on = defaultUploadCats.includes(c.label);
                            return (
                              <Chip key={c.id} active={on} onClick={() => {
                                setDefaultUploadCats((prev) => {
                                  const set = new Set(prev);
                                  on ? set.delete(c.label) : set.add(c.label);
                                  return Array.from(set);
                                });
                              }}>
                                {c.label}
                              </Chip>
                            );
                          })}
                        </div>
                    </div>
                    )}

                    <div className="pt-2">
                        <input 
                            ref={fileInputRef} 
                            type="file" 
                            multiple 
                            accept="image/*"
                            onChange={handleUpload} 
                            className="text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-600/10 file:text-blue-600 hover:file:bg-blue-600/20 dark:text-gray-300 dark:file:bg-blue-800/50 dark:file:text-blue-300 dark:hover:file:bg-blue-800"
                        />
                        {uploading && <div className="mt-1 text-xs text-blue-500 dark:text-blue-400">Uploading {fileInputRef.current?.files?.length ?? 0} file(s)…</div>}
                    </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}