import { cls } from "@/lib/api";
import { BriefRow } from "./types";

export function cleanCpuString(cpu: string | null | undefined): string {
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

export function formatDate(d?: string | null) {
  if (!d) return null;
  return String(d).slice(0, 10);
}

export function money(n?: number | null) {
  if (n == null) return null;
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

export function getDaysOnMarket(dateStr?: string | null) {
  if (!dateStr) return 0;
  const posted = new Date(dateStr);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - posted.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export async function fetchJson<T = any>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const r = await fetch(input, init);
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || `HTTP ${r.status}`);
  }
  if (r.status === 204) return {} as T;
  const ct = r.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    const text = await r.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      return { ok: true, text } as unknown as T;
    }
  }
  return r.json() as Promise<T>;
}

export function normalizeBrief(x: any): BriefRow | null {
  const sid = x?.synergyId || x?.synergy_id || x?.id || x?.synergy || x?.rowId;
  if (!sid) return null;

  const rawStatus = String(x?.status || x?.testStatus || "").toUpperCase();

  return {
    synergyId: sid,
    status: rawStatus,
    grade: x?.grade ?? x?.testGrade ?? null,
    testedBy: x?.testedBy ?? x?.tester ?? null,
    testedDate: x?.testedDate ?? x?.tested_at ?? null,
    testedByName: x?.testedByName ?? x?.testerName ?? null,
    postedByName: x?.postedByName ?? x?.posterName ?? null,
    posted: !!(x?.posted ?? x?.ebayItemId ?? x?.postedAt),
    postedAt: x?.postedAt ?? null,
    postedBy: x?.postedBy ?? null,
    ebayPrice: x?.ebayPrice ?? x?.price ?? null,
    ebayItemUrl: x?.ebayItemUrl ?? x?.listingUrl ?? null,
    ebayThumbnail: x?.ebayThumbnail || null,
    partStatus: x?.partStatus || null,
  };
}