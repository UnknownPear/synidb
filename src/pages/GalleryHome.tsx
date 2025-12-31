// src/pages/GalleryHome.tsx — Directus-free, same UI

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { dataClient } from "@/lib/dataClient";

// A unique ID generator for file previews
let fileIdCounter = 0;

/* ------------------------- API base + helpers ------------------------- */

// Resolve API base identical to ManagerDashboard style
const RAW_API = (import.meta as any).env?.VITE_API_URL as string | undefined;
const API_BASE = (() => {
  if (RAW_API && /^https?:\/\//i.test(RAW_API)) return RAW_API.replace(/\/+$/, "");
  const p = RAW_API && RAW_API.trim() ? RAW_API : "/backend";
  return (p.startsWith("/") ? p : `/${p}`).replace(/\/+$/, "");
})();

const join = (b: string, p: string) => `${b}${p.startsWith("/") ? p : `/${p}`}`;

/** Build public asset URL (backend: GET /assets/{fileId}) */
function assetUrl(fileId: string) {
  return join(API_BASE, `/assets/${encodeURIComponent(fileId)}`);
}

/** Thin GET returning JSON with nice errors */
async function getJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, {
    credentials: "include",
    headers: { Accept: "application/json", ...(init?.headers || {}) },
    ...init,
  });
  const ct = r.headers.get("content-type") || "";
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`GET ${url} -> ${r.status} ${r.statusText}\n${body.slice(0, 300)}`);
  }
  if (!ct.includes("application/json")) {
    const body = await r.text().catch(() => "");
    throw new Error(`Expected JSON, got ${ct}. Body: ${body.slice(0, 200)}`);
  }
  return r.json() as Promise<T>;
}

/* upload helpers (POST /assets) — tries multiple endpoints like ManagerDashboard */
async function uploadFiles(files: File[]): Promise<string[]> {
  const ids: string[] = [];

  const candidates = [
    join(API_BASE, "/assets"),
    join(API_BASE, "/gallery/files"),
    "/backend/assets",
    "/assets",
  ];

  for (const f of files) {
    const form = new FormData();
    form.append("file", f, f.name);

    let lastErr: any = null;
    let ok = false;

    for (const url of candidates) {
      try {
        const res = await fetch(url, { method: "POST", body: form, credentials: "include" });
        if (res.ok) {
          const j = await res.json().catch(() => ({} as any));
          const fid = j.id || j.file_id || j.data?.id;
          if (!fid) throw new Error(`Upload succeeded but no id in response from ${url}`);
          ids.push(String(fid));
          ok = true;
          break;
        } else {
          lastErr = await res.text();
          // try next candidate
        }
      } catch (e) {
        lastErr = e;
        // try next candidate
      }
    }

    if (!ok) {
      throw new Error(`Upload failed for ${f.name}: ${typeof lastErr === "string" ? lastErr : (lastErr?.message || "unknown")}`);
    }
  }

  return ids;
}

/* ------------------------------- Types ------------------------------- */

type GalleryLink = {
  id?: string;
  synergyId?: string | null;
  partNumber?: string | null;
  file: { id: string; title?: string | null } | string; // server may allow string id
  is_primary?: boolean | null;
  order?: number | null;
  categories?: string[] | null;

  angle?: string | null;
  folder?: string | null;
  grade?: "A" | "B" | "C" | "D" | null;
  partGrade?: "A" | "B" | "C" | "D" | null;
  problems?: string[] | null;
  alt?: string | null;
  notes?: string | null;
};

async function createLinks(payload: Array<
  Partial<GalleryLink> & {
    file: string;                 // we pass file id string
    synergyId?: string | null;
    angle?: string | null;
    folder?: string | null;
    grade?: "A" | "B" | "C" | "D" | null;
    partGrade?: "A" | "B" | "C" | "D" | null;
    problems?: string[] | null;
    alt?: string | null;
    notes?: string | null;
    is_primary?: boolean | null;
  }
>) {
  const bodies = [
    { url: join(API_BASE, "/gallery/links"), shape: (p: any) => p },                 // expects raw array
    { url: join(API_BASE, "/gallery/links/bulk"), shape: (p: any) => ({ data: p }) },// expects {data:[]}
    { url: "/backend/gallery/links", shape: (p: any) => p },
  ];

  let lastErr: any = null;
  for (const b of bodies) {
    try {
      const res = await fetch(b.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(b.shape(payload)),
      });
      if (res.ok) return await res.json().catch(() => ({}));
      lastErr = await res.text();
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`Create links failed: ${typeof lastErr === "string" ? lastErr : (lastErr?.message || "unknown")}`);
}

/* ------------------------------- UI bits ------------------------------- */

// --- Dark Mode Toggle Component with localStorage persistence ---
function DarkModeToggle() {
  const [isDark, setIsDark] = useState(false);
  const STORAGE_KEY = 'theme-mode';

  useEffect(() => {
    const storedMode = localStorage.getItem(STORAGE_KEY);
    const initialIsDark = storedMode === 'dark';
    setIsDark(initialIsDark);
    if (initialIsDark) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, []);

  const toggleDarkMode = () => {
    setIsDark(prevIsDark => {
      const next = !prevIsDark;
      localStorage.setItem('theme-mode', next ? 'dark' : 'light');
      if (next) document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
      return next;
    });
  };

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={toggleDarkMode}
      className="h-10 w-10 p-2 dark:bg-gray-700 dark:hover:bg-gray-600 dark:border-gray-600 dark:text-gray-300 transition-colors"
      aria-label="Toggle dark mode"
    >
      {isDark ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-400"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path></svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-orange-500"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path></svg>
      )}
    </Button>
  );
}

function Chip({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1 text-xs border rounded-full transition-all duration-300 shadow-sm whitespace-nowrap overflow-hidden",
        active
          ? "bg-blue-600 text-white border-blue-700 shadow-lg shadow-blue-500/50 dark:bg-blue-600 dark:border-blue-500 dark:shadow-md"
          : "bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-600"
      )}
    >
      {children}
    </button>
  );
}

function MultiSelect({
  label,
  options,
  value,
  onChange,
  emptyHint,
}: {
  label: string;
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  emptyHint?: string;
}) {
  const [local, setLocal] = useState<string[]>(value ?? []);
  useEffect(() => setLocal(value ?? []), [value]);
  return (
    <div className="flex flex-col space-y-1">
      <label className="block font-medium text-gray-700 dark:text-gray-300">{label}</label>
      {options.length ? (
        <select
          multiple
          value={local}
          onChange={(e) => {
            const next = Array.from(e.currentTarget.selectedOptions).map((o) => o.value);
            setLocal(next);
            onChange(next);
          }}
          className="min-h-24 h-28 w-full border rounded p-1 text-sm bg-white/70 dark:bg-gray-700/70 dark:border-gray-600 focus:ring-2 focus:ring-blue-500/50 transition-all dark:text-gray-100"
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <div className="flex-1 text-sm text-muted-foreground border rounded p-2 bg-gray-50 dark:bg-gray-800 dark:border-gray-600">
          {emptyHint ?? "No options"}
        </div>
      )}
    </div>
  );
}

type SelectedFile = {
  id: number;
  file: File;
  previewUrl: string;
};

function FilePreview({ file, onRemove }: { file: SelectedFile; onRemove: () => void }) {
  const isImage = file.file.type.startsWith("image/");
  useEffect(() => () => URL.revokeObjectURL(file.previewUrl), [file.previewUrl]);
  return (
    <div className="relative w-28 h-28 border rounded-lg shadow-md group overflow-hidden flex flex-col bg-white dark:bg-gray-800 dark:border-gray-700 transition-shadow">
      <button
        onClick={onRemove}
        className="absolute top-0 right-0 z-10 p-1 bg-red-600 text-white rounded-bl-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
        aria-label={`Remove file ${file.file.name}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
      <div className="flex-grow grid place-items-center p-1 overflow-hidden">
        {isImage ? (
          <img src={file.previewUrl} alt={file.file.name} className="max-w-full max-h-full object-contain" />
        ) : (
          <span className="text-xs text-muted-foreground break-all text-center p-2 dark:text-gray-400">
            {file.file.name.split(".").pop()?.toUpperCase() ?? "FILE"}
          </span>
        )}
      </div>
      <div className="text-[10px] text-center w-full truncate p-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
        {file.file.name}
      </div>
    </div>
  );
}

/* ------------------------- helpers: SID ↔ category ------------------------- */

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

/* ------------------------- Gallery Home (Manager) ------------------------- */

export default function GalleryHome() {
  const nav = useNavigate();
  const [err, setErr] = useState<string | null>(null);

  const [isDark, setIsDark] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem('theme-mode') === 'dark'
  );
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const [cards, setCards] = useState<
    { synergyId: string; name?: string | null; preview?: string | null; count: number; categories: string[] }[]
  >([]);

  const [search, setSearch] = useState("");

  // Canonical categories from Posters/Tester DB (already via dataClient)
  const [dbCats, setDbCats] = useState<Cat[]>([]);
  const [activeDbCat, setActiveDbCat] = useState<string | null>(null);

  // “Create new gallery”
  // With FastAPI, assume cookie/session or open dev mode; keep UI same and enable creation.
  const isAuthed = true;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);

  const [sid, setSid] = useState("");
  const [defAngle, setDefAngle] = useState("");
  const [defFolder, setDefFolder] = useState("");
  const [defGrade, setDefGrade] = useState<"A" | "B" | "C" | "D" | "">("");
  const [defPartGrade, setDefPartGrade] = useState<"A" | "B" | "C" | "D" | "">("");
  const [defProblems, setDefProblems] = useState("");
  const [defAlt, setDefAlt] = useState("");
  const [defNotes, setDefNotes] = useState("");
  const [selCats, setSelCats] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newFiles = files.map(file => ({
      id: fileIdCounter++,
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setSelectedFiles(prev => [...prev, ...newFiles]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const removeFile = useCallback((id: number) => {
    setSelectedFiles(prev => {
      const fileToRemove = prev.find(f => f.id === id);
      if (fileToRemove) URL.revokeObjectURL(fileToRemove.previewUrl);
      return prev.filter(f => f.id !== id);
    });
  }, []);

  // fetch canonical categories once
  useEffect(() => {
    dataClient.getCategories().then(setDbCats).catch(() => setDbCats([]));
  }, []);

  /*
   * 🔗 AUTO: Derives SID based on the first selected category's prefix.
   */
  useEffect(() => {
    if (!selCats.length) {
      setSid("");
      return;
    }
    const c = dbCats.find((x) => x.label === selCats[0]);
    setSid(c?.prefix ? `${c.prefix}-` : "");
  }, [selCats, dbCats]);

  /* --- load galleries lightweight (thumb grid) --- */
  useEffect(() => {
    (async () => {
      setErr(null);

      // 1) Try backend cards endpoint
      const candidatesList = [
        join(API_BASE, "/gallery/cards"),
        join(API_BASE, "/gallery/links?mode=cards"),
        "/backend/gallery/cards",
        "/gallery/cards",
      ];

      let loaded = false;
      let lastErr: any = null;

      for (const url of candidatesList) {
        try {
          const resp = await getJSON<any>(url);
          // Accept either already-aggregated cards or raw links array
          if (Array.isArray(resp) && resp.length && resp[0]?.synergyId && ("count" in resp[0])) {
            setCards(resp);
            loaded = true;
            break;
          }
          if (Array.isArray(resp) && resp.length) {
            // assume raw links -> aggregate
            const bySID = new Map<string, { synergyId: string; preview?: string | null; count: number; categories: string[] }>();
            for (const r of resp) {
              const s = r.synergyId ?? "(missing)";
              const ex = bySID.get(s);
              const fileId = typeof r.file === "string" ? r.file : r.file?.id;
              bySID.set(s, {
                synergyId: s,
                preview: ex?.preview ?? fileId ?? null,
                count: (ex?.count ?? 0) + 1,
                categories: Array.from(new Set([...(ex?.categories ?? []), ...((r.categories ?? []) as string[])])),
              });
            }
            setCards(Array.from(bySID.values()));
            loaded = true;
            break;
          }

          // if object wrapper {data:[...]}
          if (resp?.data && Array.isArray(resp.data)) {
            const bySID = new Map<string, { synergyId: string; preview?: string | null; count: number; categories: string[] }>();
            for (const r of resp.data) {
              const s = r.synergyId ?? "(missing)";
              const ex = bySID.get(s);
              const fileId = typeof r.file === "string" ? r.file : r.file?.id;
              bySID.set(s, {
                synergyId: s,
                preview: ex?.preview ?? fileId ?? null,
                count: (ex?.count ?? 0) + 1,
                categories: Array.from(new Set([...(ex?.categories ?? []), ...((r.categories ?? []) as string[])])),
              });
            }
            setCards(Array.from(bySID.values()));
            loaded = true;
            break;
          }

          lastErr = "Unexpected response shape";
        } catch (e) {
          lastErr = e;
        }
      }

      if (!loaded && lastErr) {
        setErr(typeof lastErr === "string" ? lastErr : (lastErr?.message || "Failed to load galleries"));
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = cards;
    if (q) {
      list = list.filter((c) => [c.synergyId, c.categories.join(" ")].join(" ").toLowerCase().includes(q));
    }
    if (activeDbCat) {
      const wanted = activeDbCat.toLowerCase();
      list = list.filter((c) => c.categories.some((t) => t.toLowerCase() === wanted));
    }
    return list;
  }, [cards, search, activeDbCat]);

  async function onCreate() {
    if (!isAuthed) return alert("Read-only mode.");
    if (!sid.trim()) return alert("Select a Category to generate the Synergy ID prefix.");

    const filesToUpload = selectedFiles.map(sf => sf.file);
    if (!filesToUpload.length) return alert("Choose one or more images to upload");

    setCreating(true);
    try {
      const ids = await uploadFiles(filesToUpload);
      const problems = defProblems.split(",").map((s) => s.trim()).filter(Boolean);
      const gallerySid = sid.trim();

      const payload = ids.map((fid, i) => ({
        synergyId: gallerySid,
        file: fid,                 // backend expects string id
        order: i,
        angle: defAngle || null,
        folder: defFolder || null,
        grade: (defGrade || null) as any,
        partGrade: (defPartGrade || null) as any,
        problems: problems.length ? problems : null,
        alt: defAlt || null,
        notes: defNotes || null,
        categories: selCats.length ? Array.from(new Set(selCats)) : null,
        is_primary: i === 0,
      }));

      await createLinks(payload);

      // cleanup previews + reset
      selectedFiles.forEach(f => URL.revokeObjectURL(f.previewUrl));
      setSelectedFiles([]);
      setSelCats([]);
      setSid("");
      setDefAngle("");
      setDefFolder("");
      setDefGrade("");
      setDefPartGrade("");
      setDefProblems("");
      setDefAlt("");
      setDefNotes("");

      nav(`/gallery/${encodeURIComponent(gallerySid)}`);
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="relative min-h-screen">
      {isDark && (
        <div className="absolute inset-0 overflow-hidden bg-slate-950">
          <style>{`
            @keyframes floatSlow { 0%{transform:translate3d(-10%,-5%,0) scale(1)} 50%{transform:translate3d(10%,5%,0) scale(1.05)} 100%{transform:translate3d(-10%,-5%,0) scale(1)} }
            @keyframes drift { 0%{transform:translate3d(8%,-6%,0) scale(1.1) rotate(0)} 50%{transform:translate3d(-6%,6%,0) scale(1.15) rotate(15deg)} 100%{transform:translate3d(8%,-6%,0) scale(1.1) rotate(0)} }
          `}</style>
          <div aria-hidden className="pointer-events-none absolute -top-1/3 -left-1/4 w-[60rem] h-[60rem] rounded-full bg-gradient-to-br from-cyan-500/35 via-indigo-500/20 to-fuchsia-500/10 blur-[120px]" style={{animation:"floatSlow 24s ease-in-out infinite"}} />
          <div aria-hidden className="pointer-events-none absolute -bottom-1/3 -right-1/4 w-[60rem] h-[60rem] rounded-full bg-gradient-to-br from-emerald-400/30 via-teal-500/20 to-sky-400/10 blur-[120px]" style={{animation:"drift 28s ease-in-out infinite"}} />
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(1200px_600px_at_50%_-20%,rgba(255,255,255,0.06),transparent_60%),radial-gradient(1000px_700px_at_50%_120%,rgba(255,255,255,0.06),transparent_60%)]" />
        </div>
      )}

      <div className="relative z-10 p-4 lg:p-6 max-w-[1400px] mx-auto bg-gray-50 dark:bg-gray-900 dark:text-gray-100 min-h-screen">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
          <h1 className="text-3xl font-extrabold text-gray-800 dark:text-gray-100 tracking-tight">Gallery Manager</h1>
          <div className="sm:ml-auto flex items-center gap-2 w-full sm:w-auto">
            <Input 
              value={search} 
              onChange={(e) => setSearch(e.target.value)} 
              placeholder="Search by ID or category…" 
              className="h-10 flex-1 sm:w-[260px] bg-white dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400" 
            />
            <Button 
              variant="outline" 
              onClick={() => { setSearch(""); setActiveDbCat(null); }}
              className="h-10 dark:bg-gray-700 dark:hover:bg-gray-600 dark:border-gray-600 dark:text-gray-300"
            >
              Clear
            </Button>
            <DarkModeToggle />
          </div>
        </div>

        <div className="mb-8">
          <div className="flex items-center flex-wrap gap-2 overflow-x-auto pb-2">
            <span className="text-sm uppercase tracking-wider font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">Filter by Category:</span>
            <Chip active={!activeDbCat} onClick={() => setActiveDbCat(null)}>
              All Galleries
            </Chip>
            {dbCats.map((c) => (
              <Chip key={c.id}
                active={activeDbCat === c.label}
                onClick={() => setActiveDbCat((prev) => (prev === c.label ? null : c.label))}
                title={`Prefix ${c.prefix ?? ""}`}>
                {c.label}
              </Chip>
            ))}
          </div>
        </div>

        <div className="rounded-xl p-6 mb-10 shadow-2xl backdrop-blur-xl bg-white/50 dark:bg-gray-800/30 ring-1 ring-white/10 dark:ring-white/5 overflow-hidden">
          <div className="text-2xl font-bold mb-5 text-gray-800 dark:text-gray-100 border-b pb-3 dark:border-gray-700">Create a New Gallery</div>
          
          {!isAuthed ? (
            <div className="text-sm text-yellow-800 dark:text-yellow-300 border border-yellow-400 bg-yellow-50 dark:bg-yellow-900/30 p-4 rounded-lg">
              <span className="font-semibold">Read-only mode.</span> Authentication required to upload images.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
              <div className="space-y-4 md:col-span-1">
                <h3 className="font-medium text-base mb-2 text-gray-700 dark:text-gray-200">Core Product Data</h3>
                <div className="space-y-2">
                  <label className="block font-medium text-gray-700 dark:text-gray-300">Synergy ID (Generated)</label>
                  <div className="h-10 px-3 py-2 bg-gray-200/50 dark:bg-gray-700/50 rounded border border-dashed border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 flex items-center">
                    {sid || <span className="text-muted-foreground italic dark:text-gray-400">Select a Category to generate prefix</span>}
                  </div>
                </div>

                <MultiSelect
                  label="Categories"
                  options={dbCats.map((c) => c.label)}
                  value={selCats}
                  onChange={setSelCats}
                  emptyHint="No categories yet—add them in Posters/Tester admin."
                />
                <p className="text-xs text-muted-foreground mt-1 dark:text-gray-400">
                  Selecting the **first category** determines the Synergy ID prefix.
                </p>
              </div>
              
              <div className="space-y-4 md:col-span-1">
                <h3 className="font-medium text-base mb-2 text-gray-700 dark:text-gray-200">Default Image Attributes</h3>
                <div className="flex flex-col space-y-1">
                  <label className="font-medium text-gray-700 dark:text-gray-300">Default Grade</label>
                  <select value={defGrade} onChange={(e) => setDefGrade(e.target.value as any)} 
                    className="h-10 border rounded px-3 bg-white/70 dark:bg-gray-700/70 dark:border-gray-600 focus:ring-2 focus:ring-blue-500/50 transition-all dark:text-gray-100">
                    <option value="">(none)</option><option value="A">A</option><option value="B">B</option>
                    <option value="C">C</option><option value="D">D</option>
                  </select>
                </div>

                <div className="flex flex-col space-y-1">
                  <label className="font-medium text-gray-700 dark:text-gray-300">Default Part Grade</label>
                  <select value={defPartGrade} onChange={(e) => setDefPartGrade(e.target.value as any)} 
                    className="h-10 border rounded px-3 bg-white/70 dark:bg-gray-700/70 dark:border-gray-600 focus:ring-2 focus:ring-blue-500/50 transition-all dark:text-gray-100">
                    <option value="">(none)</option><option value="A">A</option><option value="B">B</option>
                    <option value="C">C</option><option value="D">D</option>
                  </select>
                </div>
                
                <div className="flex flex-col space-y-1">
                  <label className="font-medium text-gray-700 dark:text-gray-300">Default Angle</label>
                  <Input value={defAngle} onChange={(e) => setDefAngle(e.target.value)} 
                    className="h-10 bg-white/70 dark:bg-gray-700/70 dark:border-gray-600 dark:placeholder-gray-400 focus:bg-white dark:focus:bg-gray-700 transition-all" 
                    placeholder="front, back, left side…" />
                </div>
                
                <div className="flex flex-col space-y-1">
                  <label className="font-medium text-gray-700 dark:text-gray-300">Default Folder</label>
                  <Input value={defFolder} onChange={(e) => setDefFolder(e.target.value)} 
                    className="h-10 bg-white/70 dark:bg-gray-700/70 dark:border-gray-600 dark:placeholder-gray-400 focus:bg-white dark:focus:bg-gray-700 transition-all" 
                    placeholder="optional folder name" />
                </div>
              </div>

              <div className="space-y-4 md:col-span-1">
                <h3 className="font-medium text-base mb-2 text-gray-700 dark:text-gray-200">Notes & Upload</h3>

                <div className="flex flex-col space-y-1">
                  <label className="font-medium text-gray-700 dark:text-gray-300">Default Problems</label>
                  <Input value={defProblems} onChange={(e) => setDefProblems(e.target.value)} 
                    className="h-10 bg-white/70 dark:bg-gray-700/70 dark:border-gray-600 dark:placeholder-gray-400 focus:bg-white dark:focus:bg-gray-700 transition-all" 
                    placeholder="e.g., scratch, dent, tear (comma separated)" />
                </div>

                <div className="flex flex-col space-y-1">
                  <label className="font-medium text-gray-700 dark:text-gray-300">Default Alt Text</label>
                  <Input value={defAlt} onChange={(e) => setDefAlt(e.target.value)} 
                    className="h-10 bg-white/70 dark:bg-gray-700/70 dark:border-gray-600 dark:placeholder-gray-400 focus:bg-white dark:focus:bg-gray-700 transition-all" 
                    placeholder="short alt text for SEO/accessibility" />
                </div>

                <div className="flex flex-col space-y-1">
                  <label className="font-medium text-gray-700 dark:text-gray-300">Default Notes</label>
                  <Input value={defNotes} onChange={(e) => setDefNotes(e.target.value)} 
                    className="h-10 bg-white/70 dark:bg-gray-700/70 dark:border-gray-600 dark:placeholder-gray-400 focus:bg-white dark:focus:bg-gray-700 transition-all" 
                    placeholder="optional internal notes" />
                </div>

                <div className="pt-4 border-t border-dashed dark:border-gray-700">
                  <label className="font-medium block mb-2 text-gray-700 dark:text-gray-300">Images to Upload</label>
                  
                  <input 
                    ref={fileInputRef} 
                    type="file" 
                    multiple 
                    accept="image/*"
                    onChange={handleFileChange}
                    className="text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-600/10 file:text-blue-600 hover:file:bg-blue-600/20 dark:text-gray-300 dark:file:bg-blue-800/50 dark:file:text-blue-300 dark:hover:file:bg-blue-800" 
                  />

                  {selectedFiles.length > 0 && (
                    <div className="flex flex-wrap gap-3 mt-4 p-3 border rounded-lg dark:border-gray-700 max-h-48 overflow-y-auto bg-gray-100/50 dark:bg-gray-700/50">
                      {selectedFiles.map(file => (
                        <FilePreview 
                          key={file.id} 
                          file={file} 
                          onRemove={() => removeFile(file.id)} 
                        />
                      ))}
                    </div>
                  )}
                  
                  <Button 
                    className="w-full mt-4 h-10 bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700 dark:text-white transition-colors" 
                    onClick={onCreate} 
                    disabled={creating || !sid.trim() || selectedFiles.length === 0}
                  >
                    {creating ? "Creating & Uploading..." : "Create Gallery & Upload Images"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {err && (
          <div className="text-sm rounded-lg border border-red-400 bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-300 p-4 mb-5">
            <div className="font-bold mb-1">Error Loading Galleries</div>
            <pre className="whitespace-pre-wrap text-xs font-mono text-red-700 dark:text-red-400">{err}</pre>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
          {filtered.map((c) => (
            <div key={c.synergyId} className="rounded-lg overflow-hidden shadow-lg transition-all duration-300 bg-white dark:bg-gray-800 hover:shadow-xl hover:ring-2 hover:ring-blue-500/50 dark:hover:ring-blue-500/50">
              <button 
                className="block w-full h-32" 
                onClick={() => nav(`/gallery/${encodeURIComponent(c.synergyId)}`)}
                title={`View ${c.synergyId}`}
              >
                {c.preview ? (
                  <img 
                    src={assetUrl(c.preview)} 
                    alt={`Preview for ${c.synergyId}`} 
                    className="w-full h-full object-cover" 
                    loading="lazy" 
                  />
                ) : (
                  <div className="w-full h-full grid place-items-center text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700">No preview</div>
                )}
              </button>
              <div className="p-3 space-y-1">
                <div className="text-sm font-extrabold font-mono text-blue-600 dark:text-blue-400 tracking-wider truncate">
                  {c.synergyId}
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400">{c.count} images</div>
                {!!c.categories.length && (
                  <div className="flex gap-1 flex-wrap mt-2">
                    {c.categories.slice(0, 3).map((t) => ( 
                      <span key={t} className="text-[10px] bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-full px-2 py-[2px] font-medium">
                        {t}
                      </span>
                    ))}
                    {c.categories.length > 3 && (
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 rounded-full px-2 py-[2px]">
                        +{c.categories.length - 3} more
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
