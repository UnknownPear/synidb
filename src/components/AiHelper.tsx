import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TitleDescInput, generateTitle, generatePreviewHTML } from "./ai";
import { dataClient, type InventoryRow } from "@/lib/dataClient";

/** Props */
type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;

  /** Optional legacy path: pass an already-formed input */
  input?: TitleDescInput;

  /** Preferred: let the helper pull the row by id */
  synergyId?: string;

  /** Optional: kept for API-compat with callers that pass it */
  onApply?: (patch: Partial<InventoryRow>) => void;
};

/* ───────────────────────── Grade ↔ Condition bridge ─────────────────────────
   Single source of truth so A/B/C/D/**P** all map correctly. */
import { gradeToCondition, conditionToGrade } from "@/lib/grades";

/** Convert a DB row into AI input */
function toInputFromRow(row: InventoryRow): TitleDescInput {
  const condition =
    (row as any)?.condition ??
    gradeToCondition(((row as any)?.grade ?? "B") as any);

  return {
    productName: row.productName || "",
    condition,
    testerComment: row.testerComment || "",
    included: (row as any).included || "",
    specs: row.specs || {},
    ...(row as any).category ? { category: (row as any).category } : {},
  };
}

function humanizeError(err: unknown): string {
  const msg = (err as any)?.message?.toString?.() ?? String(err);
  const status = (err as any)?.status ?? (msg.match(/\[(\d{3})\]/)?.[1] ?? "");
  if (status === "503") return "Gemini is overloaded (503). Please retry in a few seconds.";
  if (status === "429") return "Rate limit hit (429). Please slow down and try again.";
  if (/network|fetch|Failed to fetch/i.test(msg)) return "Network error. Check your connection and try again.";
  return msg;
}

export function AiHelper({ open, onOpenChange, input, synergyId }: Props) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedTitle, setCopiedTitle] = useState(false);
  const [copiedPreview, setCopiedPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const previewRef = useRef<HTMLDivElement | null>(null);

  // DB row state (only used if synergyId provided)
  const [dbRow, setDbRow] = useState<InventoryRow | null>(null);
  const [dbTried, setDbTried] = useState(false);

  // reset when closed (ensures the title starts EMPTY on each open)
  useEffect(() => {
    if (!open) {
      setTitle("");
      setPreviewHtml("");
      setBusy(false);
      setError(null);
      setCopiedTitle(false);
      setCopiedPreview(false);
      setDbRow(null);
      setDbTried(false);
    }
  }, [open]);

  // fetch from DB if synergyId is provided
  useEffect(() => {
    if (!open || !synergyId) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await dataClient.getRows();
        if (cancelled) return;
        const found =
          rows.find((r) => r.synergyId.toLowerCase() === synergyId.toLowerCase()) || null;
        setDbRow(found);
        setDbTried(true);
        if (!found) setError(`Item ${synergyId} not found in database.`);
      } catch (e) {
        if (!cancelled) {
          setError(humanizeError(e));
          setDbTried(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, synergyId]);

  /** Build the final input we will send to Gemini.
   *  If both DB row and `input` prop exist, merge them (prop wins). */
  const buildSourceInput = (): TitleDescInput => {
    let base: TitleDescInput | null = null;
    if (synergyId) {
      if (!dbTried) throw new Error("Loading…");
      if (!dbRow) throw new Error(`Item ${synergyId} not found.`);
      base = toInputFromRow(dbRow);
    }
    if (!base) {
      if (!input) throw new Error("No input provided.");
      base = { ...input };
    }
    if (input) {
      base = {
        ...base,
        ...input,
        productName: input.productName || base.productName,
        testerComment: input.testerComment ?? base.testerComment,
        included: input.included ?? base.included,
        specs: input.specs ?? base.specs,
        category: (input as any).category ?? (base as any).category,
      };
    }
    return base;
  };

  const generate = async () => {
    setBusy(true);
    setError(null);
    setCopiedTitle(false);
    setCopiedPreview(false);
    try {
      let src: TitleDescInput;
      try {
        src = buildSourceInput();
      } catch (e) {
        setError(humanizeError(e));
        return;
      }

      // ALWAYS generate the title with Gemini; fallback to productName on error/empty
      let t = "";
      try {
        const out = await generateTitle(src);
        t = (out && out.trim()) || src.productName || "Item";
      } catch (e) {
        setError(humanizeError(e));
        t = src.productName || "Item";
      }
      setTitle(t); // overwrite field with Gemini’s result (or fallback)

      // Description (uses chosen title)
      const html = await generatePreviewHTML(src, t).catch((e) => {
        setError((prev) => prev ?? humanizeError(e));
        const grade = conditionToGrade((src as any).condition || src.condition || "Good");
        return `
          <div style="text-align:center; font-weight:700; font-size:20px;">(${t})</div>
          <div style="font-weight:700; margin-top:6px;">Grade:</div>
          <ul style="margin:0 0 10px 22px; list-style:disc;"><li>Grade ${grade} (${src.condition})</li></ul>
          <div style="font-weight:700; margin-top:6px;">Functionality:</div>
          <ul style="margin:0 0 10px 22px; list-style:disc;"><li>${src.testerComment || "See photos for exact cosmetic state."}</li></ul>
          <div style="font-weight:700; margin-top:6px;">Included:</div>
          <ul style="margin:0 0 10px 22px; list-style:disc;"><li>${(src as any).included || "Device only"}</li></ul>
        `;
      });
      setPreviewHtml(html);
    } finally {
      setBusy(false);
    }
  };

  // Copy EXACT formatting by selecting the *rendered* preview DOM
  const copyPreview = () => {
    const el = previewRef.current;
    if (!el) return;

    const prevContentEditable = el.getAttribute("contenteditable");
    const prevUserSelect = el.style.userSelect;

    el.setAttribute("contenteditable", "true");
    el.style.userSelect = "text";
    el.focus();

    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);

    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }

    sel?.removeAllRanges();
    if (prevContentEditable === null) el.removeAttribute("contenteditable");
    else el.setAttribute("contenteditable", prevContentEditable);
    el.style.userSelect = prevUserSelect;

    if (ok) {
      setCopiedPreview(true);
      setTimeout(() => setCopiedPreview(false), 1200);
    }
  };

  const copyTitle = async () => {
    if (!title) return;
    try {
      await navigator.clipboard.writeText(title);
      setCopiedTitle(true);
      setTimeout(() => setCopiedTitle(false), 1200);
    } catch {}
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Synergy AI Helper</DialogTitle>
        </DialogHeader>

        {error && (
          <div className="mb-2 rounded-md border border-destructive/30 bg-destructive/10 text-destructive px-3 py-2 text-sm">
            {error}
          </div>
        )}

        {/* Title row with copy */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label className="text-sm font-medium">Generated Title</label>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={generate} disabled={busy}>
                {busy ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                    Generating…
                  </span>
                ) : (
                  "Generate"
                )}
              </Button>
              <Button size="sm" onClick={copyTitle} disabled={!title}>
                {copiedTitle ? "Copied!" : "Copy Title"}
              </Button>
            </div>
          </div>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Click Generate to create a title"
          />
        </div>

        {/* Preview (copy this) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Generated Description</label>
            <Button size="sm" onClick={copyPreview} disabled={!previewHtml}>
              {copiedPreview ? "Copied!" : "Copy Description"}
            </Button>
          </div>

          <div className="rounded-md border p-4 bg-white text-black">
            <div
              ref={previewRef}
              className="text-sm leading-6"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
