// AdminTools.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Basic types */
type Log = { t: string; msg: string; kind?: "info" | "ok" | "warn" | "err" };
type Row = Record<string, any>;
type TabKey =
  | "overview"
  | "inventory"
  | "importexport"
  | "directus"
  | "server"
  | "logs";

const ADMIN_KEY_STORAGE = "synergy_admin_key";
const THEME_STORAGE = "theme"; // "light" | "dark" | "system"

/** Utility: download a Blob as a file */
function downloadBlob(name: string, data: Blob) {
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Utility: convert rows to CSV */
function toCSV(rows: Row[]): string {
  if (!rows?.length) return "";
  const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r ?? {}))));
  const esc = (v: any) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "string" ? v : JSON.stringify(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(",")].concat(
    rows.map((r) => cols.map((c) => esc(r[c])).join(","))
  );
  return lines.join("\n");
}

/** Utility: read a File as text */
async function readFileAsText(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(fr.error);
    fr.onload = () => res(String(fr.result || ""));
    fr.readAsText(file);
  });
}

/** Utility: parse CSV (simple, handles quotes) */
function parseCSV(text: string): Row[] {
  const rows: Row[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter(Boolean);
  if (!lines.length) return rows;
  const headers = lines.shift()!.split(",").map((h) => h.replace(/^"|"$/g, "").trim());
  const parseCell = (s: string) => {
    s = s.trim();
    if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1).replace(/""/g, '"');
    try { return JSON.parse(s); } catch { return s; }
  };
  for (const line of lines) {
    const cells: string[] = [];
    let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"' && q) { cur += '"'; i++; continue; }
      if (ch === '"') { q = !q; continue; }
      if (ch === "," && !q) { cells.push(cur); cur = ""; continue; }
      cur += ch;
    }
    cells.push(cur);
    const obj: Row = {};
    headers.forEach((h, i) => (obj[h] = parseCell(cells[i] ?? "")));
    rows.push(obj);
  }
  return rows;
}

export default function AdminTools() {
  const isDev = import.meta.env.DEV;
  const API_URL = import.meta.env.VITE_API_URL as string | undefined;
  const DIRECTUS_URL = import.meta.env.VITE_DIRECTUS_URL as string | undefined;

  // -------------------- Theme (dark / light / system) --------------------
  type ThemeMode = "light" | "dark" | "system";
  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE) as ThemeMode | null;
      return saved || "system";
    } catch {
      return "system";
    }
  });

  const applyTheme = (mode: ThemeMode) => {
    const root = document.documentElement;
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    const isDark = mode === "dark" || (mode === "system" && prefersDark);
    root.classList.toggle("dark", isDark);
    try { localStorage.setItem(THEME_STORAGE, mode); } catch {}
  };

  useEffect(() => {
    applyTheme(theme);
    // React to system changes if on "system"
    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => applyTheme("system");
      mq.addEventListener?.("change", handler);
      return () => mq.removeEventListener?.("change", handler);
    }
  }, [theme]);

  // -------------------- Directus login (for non-technical users) --------------------
  const [directusEmail, setDirectusEmail] = useState("");
  const [directusPassword, setDirectusPassword] = useState("");
  const [directusToken, setDirectusToken] = useState<string | null>(() => {
    try { return localStorage.getItem("directus_token"); } catch { return null; }
  });
  const [directusStatus, setDirectusStatus] = useState<"idle"|"authing"|"ok"|"err">("idle");
  const [whoAmI, setWhoAmI] = useState<any | null>(null);
  const [directusUsers, setDirectusUsers] = useState<any[]>([]);

  const saveDirectusToken = (t: string | null) => {
    setDirectusToken(t);
    try { if (t) localStorage.setItem("directus_token", t); else localStorage.removeItem("directus_token"); } catch {}
  };

  async function directusLogin() {
    if (!DIRECTUS_URL) return log("VITE_DIRECTUS_URL is not set.", "warn");
    setDirectusStatus("authing");
    try {
      const r = await fetch(`${DIRECTUS_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: directusEmail, password: directusPassword }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.errors?.[0]?.message || j?.error || "login failed");
      const token = j?.data?.access_token || j?.access_token;
      if (!token) throw new Error("no access_token");
      saveDirectusToken(token);
      setDirectusStatus("ok");
      log("Directus login successful.", "ok");
    } catch (e: any) {
      setDirectusStatus("err");
      log(`Directus login failed: ${e?.message || String(e)}`, "err");
    }
  }

  function directusLogout() {
    saveDirectusToken(null);
    setWhoAmI(null);
    setDirectusUsers([]);
  }

  async function directusWhoAmI() {
    if (!DIRECTUS_URL) return log("VITE_DIRECTUS_URL is not set.", "warn");
    if (!directusToken) return log("Please log in to Directus first.", "warn");
    setBusy(true);
    try {
      const r = await fetch(`${DIRECTUS_URL}/users/me`, { headers: { Authorization: `Bearer ${directusToken}` } });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.errors?.[0]?.message || j?.error || "whoami failed");
      setWhoAmI(j?.data ?? j);
      log("Directus /users/me succeeded.", "ok");
    } catch (e: any) {
      log(`Directus whoAmI failed: ${e?.message || String(e)}`, "err");
    } finally {
      setBusy(false);
    }
  }

  async function directusListAppUsers() {
    if (!DIRECTUS_URL) return log("VITE_DIRECTUS_URL is not set.", "warn");
    if (!directusToken) return log("Please log in to Directus first.", "warn");
    setBusy(true);
    try {
      const r = await fetch(`${DIRECTUS_URL}/items/app_users?limit=50`, { headers: { Authorization: `Bearer ${directusToken}` } });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.errors?.[0]?.message || j?.error || "list failed");
      const rows = j?.data ?? j;
      setDirectusUsers(Array.isArray(rows) ? rows : []);
      log(`Directus app_users returned ${Array.isArray(rows) ? rows.length : 0} rows.`, "ok");
    } catch (e: any) {
      log(`Directus list failed: ${e?.message || String(e)}`, "err");
    } finally {
      setBusy(false);
    }
  }

  // -------------------- Admin key, status, logs, tabs --------------------
  const [adminKey, setAdminKey] = useState<string>(() => {
    try { return localStorage.getItem(ADMIN_KEY_STORAGE) || ""; } catch { return ""; }
  });
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<Log[]>([]);
  const [tailLogs, setTailLogs] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  const log = (msg: string, kind: Log["kind"] = "info") =>
    setLogs((prev) => [...prev.slice(-399), { t: new Date().toLocaleTimeString(), msg, kind }]);

  useEffect(() => {
    try {
      if (adminKey) localStorage.setItem(ADMIN_KEY_STORAGE, adminKey);
      else localStorage.removeItem(ADMIN_KEY_STORAGE);
    } catch {}
  }, [adminKey]);

  // -------------------- Admin fetch with x-admin-key --------------------
  const callAdmin = async (path: string, init?: RequestInit & { json?: any }) => {
    if (!API_URL) return log("VITE_API_URL is not set.", "warn");
    if (!adminKey) return log("Please enter the Admin Key (x-admin-key).", "warn");
    const url = `${API_URL}${path.startsWith("/") ? "" : "/"}${path}`;
    const headers: Record<string, string> = { "x-admin-key": adminKey };
    let body: any = undefined;
    if (init?.json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(init.json);
    } else {
      body = init?.body;
    }
    const r = await fetch(url, { method: init?.method || "POST", headers, body });
    let j: any = null;
    try { j = await r.json(); } catch {}
    return { ok: r.ok, status: r.status, data: j };
  };

  // -------------------- Health, export/import (existing) --------------------
  const [lastHealthOK, setLastHealthOK] = useState<boolean | null>(null);

  async function health() {
    if (!API_URL) return log("VITE_API_URL is not set.", "warn");
    setBusy(true);
    try {
      const r = await fetch(`${API_URL}/health`, { method: "GET" });
      const j = await r.json();
      setLastHealthOK(r.ok && j?.ok);
      log(`Health: ${r.status} ${JSON.stringify(j)}`, r.ok ? "ok" : "warn");
    } catch (e: any) {
      setLastHealthOK(false);
      log(`Health error: ${e?.message || String(e)}`, "err");
    } finally {
      setBusy(false);
    }
  }

  // Auto-check health when the page is accessed (on mount)
  useEffect(() => {
    health();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportRows = async (fmt: "json" | "csv") => {
    if (!API_URL) return log("VITE_API_URL is not set.", "warn");
    setBusy(true);
    try {
      const r = await fetch(`${API_URL}/rows`, { method: "GET" });
      const rows: Row[] = await r.json();
      if (!Array.isArray(rows)) throw new Error("Unexpected response for /rows");
      if (fmt === "json") {
        downloadBlob(`inventory-${new Date().toISOString()}.json`, new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" }));
      } else {
        downloadBlob(`inventory-${new Date().toISOString()}.csv`, new Blob([toCSV(rows)], { type: "text/csv" }));
      }
      log(`Exported ${rows.length} rows as ${fmt.toUpperCase()}`, "ok");
    } catch (e: any) {
      log(`Export error: ${e?.message || String(e)}`, "err");
    } finally {
      setBusy(false);
    }
  };

  const [dryRun, setDryRun] = useState(true);
  const [preview, setPreview] = useState<Row[] | null>(null);

  async function handleImportFile(file: File) {
    try {
      const text = await readFileAsText(file);
      const rows = file.name.endsWith(".csv") ? parseCSV(text) : JSON.parse(text);
      if (!Array.isArray(rows)) throw new Error("File content must be an array of objects or a CSV.");
      setPreview(rows);
      log(`Preview loaded: ${rows.length} rows.`, "ok");
    } catch (e: any) {
      setPreview(null);
      log(`Import preview error: ${e?.message || String(e)}`, "err");
    }
  }

  async function commitImport() {
    if (!preview) return log("Load a file to preview first.", "warn");
    try {
      setBusy(true);
      const res = await callAdmin("/admin/import", { method: "POST", json: { rows: preview, dryRun } });
      if (!res.ok) throw new Error(res.data?.error || `status ${res.status}`);
      log(`Import result: ${JSON.stringify(res.data)}`, "ok");
    } catch (e: any) {
      log(`Import failed: ${e?.message || String(e)}`, "err");
    } finally {
      setBusy(false);
    }
  }

  // -------------------- Logs SSE (unchanged) --------------------
  useEffect(() => {
    if (!tailLogs || !API_URL || !adminKey) return;
    const url = new URL(`${API_URL}/admin/docker/logs`);
    url.searchParams.set("service", "api");
    const es = new EventSource(url.toString(), { withCredentials: false } as any);
    const handler = (evt: MessageEvent) => {
      const data = String(evt.data || "");
      log(data, "info");
    };
    es.onmessage = handler;
    es.addEventListener("error", () => log("Log stream error.", "warn"));
    return () => { try { es.close(); } catch {} };
  }, [tailLogs, API_URL, adminKey]);

  // -------------------- Beginner-friendly tools --------------------
  // Synergy ID helper
  const [prefix, setPrefix] = useState<string>("SYN");
  const [peekId, setPeekId] = useState<string>("");
  async function peekNextId() {
    if (!API_URL) return log("VITE_API_URL is not set.", "warn");
    try {
      const r = await fetch(`${API_URL}/prefix/${encodeURIComponent(prefix)}/peek`);
      const t = await r.text();
      setPeekId(t);
      log(`Peek: ${t}`, "ok");
    } catch (e: any) { log(`Peek failed: ${e?.message || String(e)}`, "err"); }
  }
  async function takeNextId() {
    if (!API_URL) return log("VITE_API_URL is not set.", "warn");
    try {
      const r = await fetch(`${API_URL}/prefix/${encodeURIComponent(prefix)}/take`, { method: "POST" });
      const t = await r.text();
      setPeekId(t);
      log(`Reserved: ${t}`, "ok");
    } catch (e: any) { log(`Reserve failed: ${e?.message || String(e)}`, "err"); }
  }

  // Categories helper
  const [catLabel, setCatLabel] = useState("");
  const [catPrefix, setCatPrefix] = useState("");
  const [categories, setCategories] = useState<any[]>([]);
  async function loadCategories() {
    if (!API_URL) return log("VITE_API_URL is not set.", "warn");
    try {
      const r = await fetch(`${API_URL}/categories`);
      const j = await r.json();
      setCategories(Array.isArray(j) ? j : []);
      log(`Loaded ${Array.isArray(j) ? j.length : 0} categories.`, "ok");
    } catch (e: any) { log(`Load categories failed: ${e?.message || String(e)}`, "err"); }
  }
  async function createCategory() {
    if (!API_URL) return log("VITE_API_URL is not set.", "warn");
    if (!catLabel || !catPrefix) return log("Enter label and prefix.", "warn");
    try {
      const r = await fetch(`${API_URL}/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: catLabel, prefix: catPrefix })
      });
      if (!r.ok) throw new Error(`status ${r.status}`);
      setCatLabel(""); setCatPrefix("");
      await loadCategories();
      log("Category created.", "ok");
    } catch (e: any) { log(`Create category failed: ${e?.message || String(e)}`, "err"); }
  }

  // Inventory quick view and search (client-side)
  const [invRows, setInvRows] = useState<Row[]>([]);
  const [invQuery, setInvQuery] = useState("");
  const filteredRows = useMemo(() => {
    const q = invQuery.trim().toLowerCase();
    if (!q) return invRows.slice(0, 50);
    return invRows.filter(r =>
      String(r.synergyId ?? "").toLowerCase().includes(q) ||
      String(r.productName ?? "").toLowerCase().includes(q) ||
      String(r.categoryLbl ?? "").toLowerCase().includes(q)
    ).slice(0, 100);
  }, [invRows, invQuery]);

  async function loadInventory() {
    if (!API_URL) return log("VITE_API_URL is not set.", "warn");
    try {
      const r = await fetch(`${API_URL}/rows?limit=100000`);
      const rows: Row[] = await r.json();
      if (!Array.isArray(rows)) throw new Error("Unexpected /rows response");
      setInvRows(rows);
      log(`Loaded ${rows.length} rows.`, "ok");
    } catch (e: any) { log(`Load rows failed: ${e?.message || String(e)}`, "err"); }
  }

  function downloadCsvTemplate() {
    const headers = [
      "synergyId",
      "category",
      "productName",
      "grade",
      "testedBy",
      "testedDate",
      "testerComment",
      "specs",
      "price",
      "ebayPrice",
      "posted",
      "postedAt",
      "postedBy",
    ];
    const csv = headers.join(",") + "\n";
    downloadBlob("inventory-template.csv", new Blob([csv], { type: "text/csv" }));
  }

  // -------------------- UI helpers --------------------
  function StatusPill({ ok, label }: { ok: boolean | null; label: string }) {
    const cls =
      ok === null
        ? "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-100"
        : ok
        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-700/40 dark:text-emerald-200"
        : "bg-rose-100 text-rose-800 dark:bg-rose-700/40 dark:text-rose-200";
    const text = ok === null ? "unknown" : ok ? "online" : "offline";
    return (
      <span className={`inline-flex items-center gap-2 px-2 py-1 rounded-full text-xs ${cls}`}>
        <span className="h-2 w-2 rounded-full bg-current/60" />
        {label}: {text}
      </span>
    );
  }

  function Card({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
    return (
      <section className="rounded-2xl border bg-white/90 dark:bg-gray-900/70 shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-semibold">{title}</div>
          {actions}
        </div>
        {children}
      </section>
    );
  }

  function Tabs() {
    const tabs: { key: TabKey; label: string }[] = [
      { key: "overview", label: "Overview" },
      { key: "inventory", label: "Inventory" },
      { key: "importexport", label: "Import / Export" },
      { key: "directus", label: "Directus" },
      { key: "server", label: "Server & Maintenance" },
      { key: "logs", label: "Logs" },
    ];
    return (
      <div className="flex flex-wrap gap-2">
        {tabs.map(t => (
          <button
            key={t.key}
            className={`px-3 py-1.5 rounded-full text-sm border transition ${
              activeTab === t.key
                ? "bg-purple-600 text-white border-purple-600"
                : "bg-white/70 dark:bg-gray-900/50 hover:bg-white border-gray-300 dark:border-gray-700"
            }`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
    );
  }

  // -------------------- Render --------------------
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-purple-50 dark:from-gray-950 dark:to-gray-900 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Admin Tools</h1>
          <div className="flex items-center gap-3">
            {/* Theme toggle */}
            <div className="flex items-center gap-1 text-xs">
              <label className="opacity-70">Theme:</label>
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value as ThemeMode)}
                className="text-xs rounded border px-2 py-1 bg-white dark:bg-gray-900 dark:border-gray-700"
              >
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>

            <div className="hidden sm:flex items-center gap-3 text-xs opacity-80">
              <span>{isDev ? "development" : "production"}</span>
              <StatusPill ok={lastHealthOK} label="API" />
              <StatusPill ok={directusToken ? true : null} label="Directus" />
            </div>
          </div>
        </header>

        <Tabs />

        {/* Overview */}
        {activeTab === "overview" && (
          <div className="grid gap-4 md:grid-cols-2">
            <Card
              title="Quick Start"
              actions={<Button variant="secondary" onClick={health} disabled={busy}>Check Server</Button>}
            >
              <div className="text-sm opacity-80">Base URL: <code>{API_URL || "(missing VITE_API_URL)"}</code></div>
              <div className="text-sm opacity-80">Directus: <code>{DIRECTUS_URL || "(set VITE_DIRECTUS_URL)"}</code></div>
              <div className="pt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Input placeholder="Directus Email" value={directusEmail} onChange={(e)=>setDirectusEmail(e.target.value)} />
                <Input type="password" placeholder="Directus Password" value={directusPassword} onChange={(e)=>setDirectusPassword(e.target.value)} />
                {!directusToken ? (
                  <Button onClick={directusLogin} disabled={directusStatus==='authing'}>{directusStatus==='authing' ? 'Connecting…' : 'Connect'}</Button>
                ) : (
                  <Button variant="destructive" onClick={directusLogout}>Logout</Button>
                )}
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button variant="secondary" onClick={directusWhoAmI} disabled={!directusToken || busy}>Who am I?</Button>
                <Button variant="secondary" onClick={directusListAppUsers} disabled={!directusToken || busy}>List app_users</Button>
              </div>
            </Card>

            <Card title="Synergy ID Helper">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr,auto,auto] gap-2">
                <Input placeholder="Prefix (e.g., SYN)" value={prefix} onChange={(e)=>setPrefix(e.target.value.toUpperCase())} />
                <Button variant="secondary" onClick={peekNextId}>Peek Next</Button>
                <Button onClick={takeNextId}>Reserve ID</Button>
              </div>
              {!!peekId && (
                <div className="text-sm pt-2">
                  Next ID: <code className="px-1 py-0.5 rounded bg-black/5 dark:bg-white/10">{peekId}</code>
                </div>
              )}
            </Card>

            <Card title="Categories">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr,auto,auto] gap-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Input placeholder="Label (e.g., Laptops)" value={catLabel} onChange={(e)=>setCatLabel(e.target.value)} />
                  <Input placeholder="Prefix (e.g., LAP)" value={catPrefix} onChange={(e)=>setCatPrefix(e.target.value.toUpperCase())} />
                </div>
                <Button variant="secondary" onClick={loadCategories}>Refresh</Button>
                <Button onClick={createCategory}>Create</Button>
              </div>
              {categories.length > 0 && (
                <div className="mt-2 max-h-48 overflow-auto border rounded">
                  <table className="min-w-full text-xs">
                    <thead className="sticky top-0 bg-white/80 dark:bg-gray-900/70">
                      <tr>
                        <th className="text-left p-2 border-b">Label</th>
                        <th className="text-left p-2 border-b">Prefix</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categories.map((c: any) => (
                        <tr key={c.id} className="odd:bg-black/5 dark:odd:bg-white/5">
                          <td className="p-2 border-b">{c.label}</td>
                          <td className="p-2 border-b">{c.prefix}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card title="Helpful Shortcuts">
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => exportRows("json")} disabled={busy || !API_URL}>Export JSON</Button>
                <Button variant="secondary" onClick={() => exportRows("csv")} disabled={busy || !API_URL}>Export CSV</Button>
                <Button onClick={downloadCsvTemplate}>Download CSV Template</Button>
              </div>
            </Card>
          </div>
        )}

        {/* Inventory */}
        {activeTab === "inventory" && (
          <div className="space-y-4">
            <Card
              title="Inventory Viewer"
              actions={<Button variant="secondary" onClick={loadInventory} disabled={!API_URL}>Load Inventory</Button>}
            >
              <div className="grid gap-2 sm:grid-cols-[1fr,auto]">
                <Input placeholder="Search by ID, Name, or Category" value={invQuery} onChange={(e)=>setInvQuery(e.target.value)} />
                <div className="text-xs self-center opacity-70">{invRows.length ? `${filteredRows.length}/${invRows.length} shown` : "no data loaded"}</div>
              </div>
              <div className="overflow-auto max-h-[480px] border rounded mt-3">
                <table className="min-w-full text-xs">
                  <thead className="sticky top-0 bg-white/80 dark:bg-gray-900/70">
                    <tr>
                      <th className="p-2 text-left border-b">Synergy ID</th>
                      <th className="p-2 text-left border-b">Product</th>
                      <th className="p-2 text-left border-b">Category</th>
                      <th className="p-2 text-left border-b">Grade</th>
                      <th className="p-2 text-left border-b">Price</th>
                      <th className="p-2 text-left border-b">eBay Price</th>
                      <th className="p-2 text-left border-b">Posted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((r, i) => (
                      <tr key={r.synergyId || i} className="odd:bg-black/5 dark:odd:bg-white/5">
                        <td className="p-2 border-b">{r.synergyId}</td>
                        <td className="p-2 border-b">{r.productName}</td>
                        <td className="p-2 border-b">{r.categoryLbl}</td>
                        <td className="p-2 border-b">{r.grade}</td>
                        <td className="p-2 border-b">{r.price ?? ""}</td>
                        <td className="p-2 border-b">{r.ebayPrice ?? ""}</td>
                        <td className="p-2 border-b">{r.posted ? "Yes" : "No"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* Import / Export */}
        {activeTab === "importexport" && (
          <div className="space-y-4">
            <Card title="Export">
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => exportRows("json")} disabled={busy || !API_URL}>Export JSON</Button>
                <Button variant="secondary" onClick={() => exportRows("csv")} disabled={busy || !API_URL}>Export CSV</Button>
                <Button onClick={downloadCsvTemplate}>Download CSV Template</Button>
              </div>
            </Card>

            <Card title="Import">
              <div className="grid gap-2">
                <label className="text-sm">Import file (JSON array or CSV)</label>
                <input
                  type="file"
                  accept=".json,.csv"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleImportFile(f);
                  }}
                />
                <label className="text-sm flex items-center gap-2">
                  <input type="checkbox" checked={dryRun} onChange={(e)=>setDryRun(e.target.checked)} />
                  Dry run (recommended)
                </label>
                <div className="flex gap-2">
                  <Button onClick={commitImport} disabled={!preview || busy || !API_URL || !adminKey}>
                    {dryRun ? "Validate Import (Dry Run)" : "Import Now"}
                  </Button>
                </div>
              </div>

              {preview && (
                <div className="mt-4">
                  <div className="font-semibold mb-2">Import Preview (first 25 rows)</div>
                  <div className="overflow-auto max-h-80 border rounded">
                    <table className="min-w-full text-xs">
                      <thead className="sticky top-0 bg-white/80 dark:bg-gray-900/70">
                        <tr>
                          {Object.keys(preview[0] || {}).map((h) => (<th key={h} className="text-left p-2 border-b">{h}</th>))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.slice(0,25).map((row, i) => (
                          <tr key={i} className="odd:bg-black/5 dark:odd:bg-white/5">
                            {Object.keys(preview[0] || {}).map((h) => (<td key={h} className="p-2 border-b">{String(row[h] ?? '')}</td>))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* Directus */}
        {activeTab === "directus" && (
          <div className="space-y-4">
            <Card title="Directus Connection">
              <div className="text-sm opacity-80">Directus URL: <code>{DIRECTUS_URL || "(set VITE_DIRECTUS_URL)"}</code></div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
                <Input placeholder="Email" value={directusEmail} onChange={(e)=>setDirectusEmail(e.target.value)} />
                <Input type="password" placeholder="Password" value={directusPassword} onChange={(e)=>setDirectusPassword(e.target.value)} />
                {!directusToken ? (
                  <Button onClick={directusLogin} disabled={directusStatus==='authing'}>{directusStatus==='authing' ? 'Connecting…' : 'Connect'}</Button>
                ) : (
                  <Button variant="destructive" onClick={directusLogout}>Logout</Button>
                )}
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button variant="secondary" onClick={directusWhoAmI} disabled={!directusToken || busy}>Who am I?</Button>
                <Button variant="secondary" onClick={directusListAppUsers} disabled={!directusToken || busy}>List app_users</Button>
              </div>

              {whoAmI && (
                <pre className="mt-2 text-xs overflow-auto max-h-40 rounded bg-black/5 dark:bg-white/10 p-2">{JSON.stringify(whoAmI, null, 2)}</pre>
              )}
              {Array.isArray(directusUsers) && directusUsers.length > 0 && (
                <div className="mt-2 text-xs">
                  <div className="font-semibold mb-1">Users ({directusUsers.length})</div>
                  <div className="grid gap-1">
                    {directusUsers.slice(0,25).map((u: any) => (
                      <div key={u.id} className="rounded bg-black/5 dark:bg-white/10 px-2 py-1">
                        {u.first_name || u.name || u.email || u.id}
                      </div>
                    ))}
                    {directusUsers.length > 25 && <div className="opacity-60">…and {directusUsers.length - 25} more</div>}
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* Server & Maintenance */}
        {activeTab === "server" && (
          <div className="space-y-4">
            <Card title="Server Access">
              <div className="text-xs opacity-80">Base URL: <code>{API_URL || "(missing VITE_API_URL)"}</code></div>
              <div className="grid gap-3 md:grid-cols-[1fr,auto] mt-2">
                <Input
                  type="password"
                  placeholder="Admin Key for /admin/* (x-admin-key header)"
                  value={adminKey}
                  onChange={(e) => setAdminKey(e.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={health} disabled={busy || !API_URL}>Server Health</Button>
                  <Button onClick={() => callAdmin("/admin/prisma/sync").then(r=>log(`Prisma sync: ${r.status}`, r.ok?'ok':'warn'))} disabled={busy || !API_URL || !adminKey}>Sync Prisma → Database</Button>
                </div>
              </div>
            </Card>

            <Card title="Container Logs">
              <div className="flex items-center gap-2">
                <label className="text-sm flex items-center gap-2">
                  <input type="checkbox" checked={tailLogs} onChange={(e)=>setTailLogs(e.target.checked)} />
                  Tail server container logs
                </label>
              </div>
              <div className="text-xs max-h-64 overflow-auto space-y-1 mt-2">
                {logs.map((l, i) => (
                  <div
                    key={i}
                    className={
                      l.kind === "ok" ? "text-emerald-700"
                      : l.kind === "warn" ? "text-amber-700"
                      : l.kind === "err" ? "text-red-700"
                      : "opacity-80"
                    }
                  >
                    {l.t} — {l.msg}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* Logs */}
        {activeTab === "logs" && (
          <Card title="Logs Only">
            <div className="flex items-center gap-2">
              <label className="text-sm flex items-center gap-2">
                <input type="checkbox" checked={tailLogs} onChange={(e)=>setTailLogs(e.target.checked)} />
                Tail server container logs
              </label>
            </div>
            <div className="text-xs max-h-96 overflow-auto space-y-1 mt-2">
              {logs.map((l, i) => (
                <div
                  key={i}
                  className={
                    l.kind === "ok" ? "text-emerald-700"
                    : l.kind === "warn" ? "text-amber-700"
                    : l.kind === "err" ? "text-red-700"
                    : "opacity-80"
                  }
                >
                  {l.t} — {l.msg}
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
