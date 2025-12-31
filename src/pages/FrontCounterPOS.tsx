import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Package, ShoppingCart, Plus, X, CreditCard, Scan } from "lucide-react";

/** ==========================================================
 *  FrontCounterPOS.tsx — Modern POS Design
 *  - Scan SID -> add to cart
 *  - Manual entry (qty/desc/msrp/price)
 *  - Tax Exempt toggle, Payment Type, Employee select
 *  - Submit -> POST /labels/order (for inventory lines)
 *  - Prints 58mm receipt window
 *  - Shows details of the last scanned item (first added / last sold)
 *  ========================================================== */

type ProductDetail = {
  synergy_id: string;
  product_name: string;
  msrpDisplay?: string;
  ourPriceDisplay?: string;
  qty_on_hand: number;
  sold_count: number;
  updated_at: string;
  first_added?: string;
  last_sold?: string | null;
};

type CartLineInv = {
  kind: "inv";
  synergy_id: string;
  product_name: string;
  qty: number;
  price: number;
  msrp?: number | null;
};

type CartLineManual = {
  kind: "manual";
  description: string;
  qty: number;
  price: number;
  msrp?: number | null;
};

type CartLine = CartLineInv | CartLineManual;

const DEFAULT_API_BASE = "/backend";
const API_BASE = (typeof window !== "undefined" && (window as any).__API_BASE__) || DEFAULT_API_BASE;

// Fallback employees so the Select works even before you wire the real endpoint.
const FALLBACK_EMPLOYEES = ["Unassigned", "Front Counter", "Manager"];

/* ----------------------- Utility functions ----------------------- */
function money(n: number) {
  return `$${(n ?? 0).toFixed(2)}`;
}

function toNum(s?: string | null) {
  if (!s) return undefined;
  const v = Number(String(s).replace(/[^0-9.]/g, ""));
  return Number.isFinite(v) ? v : undefined;
}

/* ----------------------- API helpers ----------------------- */
async function fetchEmployees(): Promise<string[]> {
  try {
    const r = await fetch(`${API_BASE}/employees`, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(String(r.status));
    const data = await r.json();
    if (Array.isArray(data)) {
      const out = (data as string[]).filter(Boolean);
      localStorage.setItem("pos_employees_cache", JSON.stringify(out));
      return out.length ? out : FALLBACK_EMPLOYEES;
    }
    throw new Error("bad employees payload");
  } catch {
    const cached = localStorage.getItem("pos_employees_cache");
    if (cached) {
      const parsed = JSON.parse(cached) as string[];
      return parsed.length ? parsed : FALLBACK_EMPLOYEES;
    }
    return FALLBACK_EMPLOYEES;
  }
}

async function fetchDetail(sid: string): Promise<ProductDetail> {
  const r = await fetch(`${API_BASE}/labels/detail?synergy_id=${encodeURIComponent(sid)}`, {
    headers: { Accept: "application/json" },
  });
  if (!r.ok) throw new Error(r.status === 404 ? "Not found" : `HTTP ${r.status}`);
  return r.json();
}

async function submitOrderInventoryOnly(payload: {
  items: { synergyId: string; qty: number }[];
  paymentType?: string;
  employee?: string;
  taxExempt?: boolean;
  taxRate?: number;
}): Promise<{
  salesId: number | string;
  created_at: string;
  subtotal: number;
  salesTax: number;
  finalTotal: number;
  lines: any[];
  paymentType?: string;
}> {
  const r = await fetch(`${API_BASE}/labels/order`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`Order failed (${r.status})`);
  return r.json();
}

/* ----------------------- Component ----------------------- */
export default function FrontCounterPOS() {
  // Return mode
  const [returnMode, setReturnMode] = React.useState(false);

  // Employees
  const [employees, setEmployees] = React.useState<string[]>([]);
  const [employee, setEmployee] = React.useState(""); // allow empty -> placeholder

  // Payment type
  const [paymentType, setPaymentType] = React.useState<"Cash" | "Card" | "Gift Card">("Cash");

  // Tax exempt
  const [taxExempt, setTaxExempt] = React.useState(false);

  // Scan box
  const [scan, setScan] = React.useState("");
  const [scanBusy, setScanBusy] = React.useState(false);
  const scanRef = React.useRef<HTMLInputElement | null>(null);

  // Manual entry
  const [manQty, setManQty] = React.useState<number | "">("");
  const [manDesc, setManDesc] = React.useState("");
  const [manMsrp, setManMsrp] = React.useState<number | "">("");
  const [manPrice, setManPrice] = React.useState<number | "">("");

  // Cart
  const [cart, setCart] = React.useState<CartLine[]>([]);
  const [submitting, setSubmitting] = React.useState(false);

  // Last scanned detail panel
  const [lastDetail, setLastDetail] = React.useState<ProductDetail | null>(null);

  // Auto focus scan
  React.useEffect(() => {
    scanRef.current?.focus();
  }, []);

  // Load employee list
  React.useEffect(() => {
    fetchEmployees()
      .then(setEmployees)
      .catch(() => setEmployees(FALLBACK_EMPLOYEES));
  }, []);

  // Scan debounce
  const debounceRef = React.useRef<number | null>(null);
  const lastTriggeredRef = React.useRef<string>("");

  function commitScanIfReady() {
  if (scanBusy) return;                      // don't double fire while a scan is running
  const code = scan.trim();
  if (!code) return;

  // prevent immediate duplicate on same value
  if (lastTriggeredRef.current === code) return;
  lastTriggeredRef.current = code;

  handleScan(code).finally(() => {
    // allow a new identical value after a brief moment if needed
    setTimeout(() => { lastTriggeredRef.current = ""; }, 200);
  });
}

  async function handleScan(raw: string) {
  const sid = extractSID(raw);
  setScanBusy(true);
  try {
    const d = await fetchDetail(sid);
    setLastDetail(d); // save full details for the panel

    const price = toNum(d.ourPriceDisplay) ?? 0;
    const msrp = toNum(d.msrpDisplay) ?? null;
    const line: CartLineInv = {
      kind: "inv",
      synergy_id: d.synergy_id,
      product_name: d.product_name,
      qty: returnMode ? -1 : 1,
      price,
      msrp,
    };

    setCart((c) => mergeLine(c, line));
    flashLast();

    // 🔑 IMPORTANT: reset scan box so the next barcode starts fresh
    setScan("");
    // also reset the duplicate guard so the same item can be scanned again right away
    lastTriggeredRef.current = "";

  } catch (e: any) {
    alert(e?.message || String(e));
  } finally {
    setScanBusy(false);
    // keep the cursor ready for the next scan
    requestAnimationFrame(() => scanRef.current?.focus());
  }
}

  function mergeLine(list: CartLine[], add: CartLine): CartLine[] {
    if (add.kind === "inv") {
      const idx = list.findIndex(
        (l) => l.kind === "inv" && l.synergy_id === add.synergy_id && l.price === add.price
      );
      if (idx >= 0) {
        const next = [...list];
        const at = next[idx] as CartLineInv;
        next[idx] = { ...at, qty: at.qty + add.qty };
        return next;
      }
      return [...list, add];
    }
    const idx = list.findIndex(
      (l) => l.kind === "manual" && l.description.trim() === add.description.trim() && l.price === add.price
    );
    if (idx >= 0) {
      const next = [...list];
      const at = next[idx] as CartLineManual;
      next[idx] = { ...at, qty: at.qty + add.qty };
      return next;
    }
    return [...list, add];
  }

  function addManual() {
    const qty = Number(manQty || 0);
    const desc = manDesc.trim();
    const price = Number(manPrice || 0);
    const msrp = manMsrp === "" ? null : Number(manMsrp);
    if (qty <= 0 || !desc || price <= 0) {
      alert("Please fill in Quantity, Description, and Sales Price correctly.");
      return;
    }
    const signedQty = returnMode ? -Math.abs(qty) : qty;
    const line: CartLineManual = { kind: "manual", qty: signedQty, description: desc, price, msrp };
    setCart((c) => mergeLine(c, line));
    setManQty("");
    setManDesc("");
    setManMsrp("");
    setManPrice("");
    flashLast();
  }

  function removeLine(i: number) {
    setCart((c) => c.filter((_, idx) => idx !== i));
  }

  // Totals
  const totals = React.useMemo(() => {
    let subtotal = 0;
    let saved = 0;
    for (const ln of cart) {
      subtotal += ln.qty * ln.price;
      if (ln.msrp && ln.msrp > 0) {
        const per = Math.max(0, ln.msrp - ln.price);
        saved += per * ln.qty;
      }
    }
    const tax = taxExempt ? 0 : subtotal * 0.05;
    const total = subtotal + tax;
    const countItems = cart.reduce((n, l) => n + l.qty, 0);
    return { subtotal, tax, total, saved, countItems };
  }, [cart, taxExempt]);

  async function submitOrder() {
  if (cart.length === 0) {
    alert("Please add items to the order before submitting.");
    return;
  }

  const invLines = cart.filter((l): l is CartLineInv => l.kind === "inv");
  const manualLines = cart.filter((l): l is CartLineManual => l.kind === "manual");

  setSubmitting(true);

  try {
    let resInv:
      | {
          salesId: number | string;
          created_at: string;
          subtotal: number;
          salesTax: number;
          finalTotal: number;
          paymentType?: string;
        }
      | null = null;

    if (invLines.length) {
      resInv = await submitOrderInventoryOnly({
        items: invLines.map((l) => ({ synergyId: l.synergy_id, qty: l.qty })),
        paymentType,
        employee: employee || undefined,
        taxExempt,
        taxRate: 0.05,
      });
    }

    if (manualLines.length) {
      console.warn("Manual lines present; printing only. Add /pos/manual-order to persist.");
    }

    const orderMeta = {
      salesId: resInv?.salesId ?? `LOCAL-${Date.now()}`,
      subtotal: resInv?.subtotal ?? totals.subtotal,
      salesTax: resInv?.salesTax ?? totals.tax,
      finalTotal: resInv?.finalTotal ?? totals.total,
      paymentType,
      employee,
      created_at: resInv?.created_at ?? new Date().toISOString(),
    };
    printReceipt(orderMeta, cart);

    // clear cart
    setCart([]);

    // 🔑 reset scan input & duplicate guard, refocus for next customer
    setScan("");
    lastTriggeredRef.current = "";
    setTimeout(() => scanRef.current?.focus(), 0);

    // Optional: leave as-is if you prefer to stay in return mode after a return
    // setReturnMode(false);

  } catch (e: any) {
    alert(e?.message || String(e));
  } finally {
    setSubmitting(false);
  }
}

  function extractSID(raw: string) {
    const s = String(raw || "").trim();
    if (/^\d{2,6}-\d{3,6}$/.test(s)) return s;
    return s;
  }

  function flashLast() {
    requestAnimationFrame(() => {
      const body = document.getElementById("receiptItems");
      if (!body) return;
      const last = body.lastElementChild as HTMLElement | null;
      if (!last) return;
      last.classList.add("animate-flash");
      setTimeout(() => last.classList.remove("animate-flash"), 650);
    });
  }

  function handleKeyDownScan(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.key === "Enter") {
    // IMPORTANT: kill any pending debounce before committing
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    e.preventDefault();
    commitScanIfReady();
    return;
  }
  // re-arm debounce on every non-Enter keystroke
  if (debounceRef.current) window.clearTimeout(debounceRef.current);
  debounceRef.current = window.setTimeout(commitScanIfReady, 150) as unknown as number;
}

  function printReceipt(
    response: {
      salesId: any;
      subtotal: number;
      salesTax: number;
      finalTotal: number;
      paymentType?: string;
      employee?: string;
      created_at?: string;
    },
    lines: CartLine[]
  ) {
    let totalSaved = 0;
    for (const item of lines) {
      if (item.msrp != null && !isNaN(item.msrp)) {
        const diff = Math.max(0, (item.msrp || 0) - (item.price || 0));
        totalSaved += diff * item.qty;
      }
    }

    const printWindow = window.open("", "", "width=300,height=200");
    if (!printWindow) return;

    const itemsHtml = lines
      .map((ln) => {
        const name = ln.kind === "inv" ? ln.product_name : ln.description;
        return `<div><strong>${ln.qty}×</strong> ${escapeHtml(name)} — ${money(ln.price)} each</div>`;
      })
      .join("");

    printWindow.document.write(`
      <html>
        <head>
          <title>Receipt</title>
          <meta charset="utf-8" />
          <style>
            body { font-family: monospace; font-size: 12px; margin: 0; padding: 0; width: 58mm; }
            h2 { text-align: center; font-size: 14px; margin: 5px 0; }
            .line { border-top: 1px dashed #000; margin: 6px 0; }
            div { margin: 0; padding: 0; }
            .r { float: right; }
          </style>
        </head>
        <body>
          <h2>Synergy Industrial Corporation</h2>
          <div>Receipt for Order ID: ${escapeHtml(String(response.salesId))}</div>
          <div>Employee: ${escapeHtml(response.employee || employee || "-")}</div>
          <div>Time: ${new Date(response.created_at || Date.now()).toLocaleString()}</div>
          <div class="line"></div>
          ${itemsHtml}
          <div class="line"></div>
          <div>Subtotal: <span class="r">${money(response.subtotal)}</span></div>
          <div>Sales Tax: <span class="r">${money(response.salesTax)}</span></div>
          <strong>Total: <span class="r">${money(response.finalTotal)}</span></strong>
          <div style="margin-top:4px; font-weight:bold; text-align:center;">
            YOU SAVED: ${money(totalSaved)}
          </div>
          <div class="line"></div>
          <div>Payment Method: ${escapeHtml(response.paymentType || paymentType)}</div>
          <div style="text-align:center;">Thank you for your business!</div>
          <br><br><br><br>
          <div style="text-align:center;">--</div>
          <br><br>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.onload = function () {
      setTimeout(function () {
        const contentHeight = printWindow.document.body.scrollHeight;
        printWindow.resizeTo(350, contentHeight + 20);
        printWindow.print();
        setTimeout(function () {
          printWindow.close();
          window.focus();
        }, 500);
      }, 100);
    };
  }

  function escapeHtml(s: any) {
    return String(s).replace(
      /[&<>"']/g,
      (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m] as string)
    );
  }

  /* ----------------------- Render ----------------------- */
  return (
    <div className="min-h-screen p-4 md:p-6">
      {/* Header */}
      <div className="max-w-[1800px] mx-auto mb-6">
        <Card className="shadow-pos-md border-border/40">
          <div className="p-5 flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Package className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Synergy POS</h1>
                <p className="text-sm text-muted-foreground">Fast Checkout System</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Badge 
                variant={returnMode ? "destructive" : "secondary"} 
                className="px-4 py-2 cursor-pointer transition-all hover:opacity-80" 
                onClick={() => setReturnMode(!returnMode)}
              >
                {returnMode ? "Return Mode (ON)" : "Sale Mode"}
              </Badge>
              <Badge variant="outline" className="px-4 py-2 font-semibold">
                {totals.countItems} {Math.abs(totals.countItems) === 1 ? "item" : "items"}
              </Badge>
            </div>
          </div>
        </Card>
      </div>

      {/* Main Layout */}
      <div className="max-w-[1800px] mx-auto grid lg:grid-cols-[1fr_480px] gap-6">
        {/* Left Column */}
        <div className="space-y-6">
          {/* Scan Section */}
          <Card className="shadow-pos-md border-primary/20 bg-gradient-to-br from-primary/[0.03] to-accent/[0.03]">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Scan className="w-5 h-5 text-primary" />
                </div>
                <h2 className="text-lg font-semibold">Quick Scan</h2>
              </div>
              <div className="relative">
                <Input
  ref={scanRef}
  value={scan}
  onChange={(e) => setScan(e.target.value)}
  onKeyDown={handleKeyDownScan}
  disabled={scanBusy}
  placeholder="Scan barcode here (e.g., 22542-0001)..."
  className="h-14 text-lg font-medium pr-12 border-primary/30 focus:border-primary focus:ring-primary/20"
  // NEW:
  onFocus={(e) => e.currentTarget.select()}
  autoComplete="off"
  autoCapitalize="off"
  spellCheck={false}
/>
                {scanBusy && (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                Auto-adds on Enter or after brief pause
              </p>
            </div>
          </Card>

          {/* Last Scan Details */}
          {lastDetail && (
            <Card className="shadow-pos-md border-border/40">
              <div className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-muted-foreground">Last Scan Details</h3>
                  <span className="font-mono text-xs opacity-80">{lastDetail.synergy_id}</span>
                </div>

                <div className="text-sm font-semibold mb-1">{lastDetail.product_name}</div>

                <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Our Price:</span>
                    <span className="font-semibold">
                      {lastDetail.ourPriceDisplay ? `$${Number(lastDetail.ourPriceDisplay).toFixed(2)}` : "—"}
                    </span>
                    {lastDetail.msrpDisplay && (
                      <span className="text-xs text-muted-foreground line-through">
                        ${Number(lastDetail.msrpDisplay).toFixed(2)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">On Hand:</span>
                    <span className="font-semibold">{lastDetail.qty_on_hand}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Sold Count:</span>
                    <span className="font-semibold">{lastDetail.sold_count}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Updated:</span>
                    <span className="font-mono">
                      {new Date(lastDetail.updated_at).toLocaleString()}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">First Added:</span>
                    <span className="font-mono">
                      {lastDetail.first_added ? new Date(lastDetail.first_added).toLocaleDateString() : "—"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Last Sold:</span>
                    <span className="font-mono">
                      {lastDetail.last_sold ? new Date(lastDetail.last_sold).toLocaleDateString() : "—"}
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Manual Entry */}
          <Card className="shadow-pos-md border-border/40">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg bg-accent/10">
                  <Plus className="w-5 h-5 text-accent" />
                </div>
                <h2 className="text-lg font-semibold">Manual Entry</h2>
              </div>
              
              <div className="grid sm:grid-cols-2 gap-4 mb-5">
                <div className="space-y-2">
                  <Label htmlFor="quantity" className="text-sm font-medium">Quantity</Label>
                  <Input
                    id="quantity"
                    type="number"
                    placeholder="0"
                    value={manQty}
                    onChange={(e) => setManQty(e.target.value === "" ? "" : Number(e.target.value))}
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description" className="text-sm font-medium">Description</Label>
                  <Input
                    id="description"
                    type="text"
                    placeholder="Item description"
                    maxLength={64}
                    value={manDesc}
                    onChange={(e) => setManDesc(e.target.value)}
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="msrp" className="text-sm font-medium">MSRP (Optional)</Label>
                  <Input
                    id="msrp"
                    type="number"
                    placeholder="0.00"
                    step="0.01"
                    value={manMsrp}
                    onChange={(e) => setManMsrp(e.target.value === "" ? "" : Number(e.target.value))}
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="salesPrice" className="text-sm font-medium">Sales Price</Label>
                  <Input
                    id="salesPrice"
                    type="number"
                    placeholder="0.00"
                    step="0.01"
                    value={manPrice}
                    onChange={(e) => setManPrice(e.target.value === "" ? "" : Number(e.target.value))}
                    className="h-11"
                  />
                </div>
              </div>

              <Button onClick={addManual} className="w-full h-11 font-semibold" variant="secondary">
                <Plus className="w-4 h-4 mr-2" />
                Add to Cart
              </Button>
            </div>
          </Card>
        </div>

        {/* Right Column - Cart */}
        <div className="lg:sticky lg:top-6 h-fit">
          <Card className="shadow-pos-lg border-border/40 overflow-hidden">
            {/* Cart Header */}
            <div className="p-5 border-b border-border/50 bg-gradient-to-r from-primary/[0.04] to-accent/[0.04]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <ShoppingCart className="w-5 h-5 text-primary" />
                  </div>
                  <h2 className="text-xl font-bold">Shopping Cart</h2>
                </div>
                <Badge variant="secondary" className="px-3 py-1">{cart.length} lines</Badge>
              </div>
            </div>

            {/* Cart Items */}
            <div id="receiptItems" className="p-4 space-y-3 max-h-[420px] overflow-y-auto">
              {cart.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted/30 mb-4">
                    <ShoppingCart className="w-8 h-8 text-muted-foreground/40" />
                  </div>
                  <p className="text-muted-foreground font-medium">Cart is empty</p>
                  <p className="text-sm text-muted-foreground/60 mt-1">Scan or add items to begin</p>
                </div>
              ) : (
                cart.map((item, index) => {
                  const msrpDisp = item.msrp != null && !isNaN(item.msrp) ? item.msrp.toFixed(2) : null;
                  const priceDisp = (item.price || 0).toFixed(2);
                  const saved = msrpDisp != null ? Math.max(Number(msrpDisp) - Number(priceDisp), 0) : null;
                  
                  return (
                    <div key={index} className="group relative bg-pos-card border border-border/30 rounded-xl p-4 transition-all hover:shadow-pos-sm hover:border-border/60 animate-flash">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            <Badge variant="outline" className="text-xs px-2 py-0.5 font-bold">{item.qty}×</Badge>
                            <p className="font-semibold truncate text-[15px]">
                              {item.kind === "inv" ? item.product_name : item.description}
                            </p>
                          </div>
                          {item.kind === "inv" && (
                            <p className="text-xs text-muted-foreground mb-2 font-mono">{item.synergy_id}</p>
                          )}
                          <div className="flex items-center gap-3 text-sm flex-wrap">
                            <span className="font-bold text-primary text-base">${priceDisp}</span>
                            {msrpDisp && (
                              <>
                                <span className="text-muted-foreground line-through text-xs">${msrpDisp}</span>
                                <span className="text-success text-xs font-semibold px-2 py-0.5 bg-success/10 rounded-md">
                                  Save ${(saved || 0).toFixed(2)}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                          onClick={() => removeLine(index)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <Separator className="bg-border/50" />

            {/* Totals & Checkout */}
            <div className="p-6 space-y-5 bg-gradient-to-br from-pos-card-secondary/30 to-background/20">
              {/* Totals */}
              <div className="space-y-2.5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-semibold">{money(totals.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Sales Tax (5%)</span>
                  <span className="font-semibold">{money(totals.tax)}</span>
                </div>
                {totals.saved > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-success font-semibold">You Saved</span>
                    <span className="font-bold text-success">{money(totals.saved)}</span>
                  </div>
                )}
                <Separator className="my-3 bg-border/50" />
                <div className="flex justify-between items-center pt-1">
                  <span className="text-lg font-bold">Total</span>
                  <span className="text-2xl font-bold text-primary">{money(totals.total)}</span>
                </div>
              </div>

              <Separator className="bg-border/50" />

              {/* Controls */}
              <div className="space-y-4">
                <div className="flex items-center space-x-2.5">
                  <Checkbox 
                    id="taxExempt" 
                    checked={taxExempt} 
                    onCheckedChange={(checked) => setTaxExempt(checked === true)}
                  />
                  <Label htmlFor="taxExempt" className="text-sm font-semibold cursor-pointer">
                    Tax Exempt Purchase
                  </Label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="payment" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Payment</Label>
                    <Select value={paymentType} onValueChange={(v) => setPaymentType(v as any)}>
                      <SelectTrigger id="payment" className="h-10">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Cash">Cash</SelectItem>
                        <SelectItem value="Card">Card</SelectItem>
                        <SelectItem value="Gift Card">Gift Card</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="employee" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Employee</Label>
                    {/* Radix rule: NO empty-string SelectItem values. Use a sentinel and map it to "" in state. */}
                    <Select
                      value={employee || ""} 
                      onValueChange={(v) => setEmployee(v === "__none" ? "" : v)}
                    >
                      <SelectTrigger id="employee" className="h-10">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">Unassigned</SelectItem>
                        {[...new Set(employees)].map((emp) => (
                          <SelectItem key={emp} value={emp}>{emp}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <Button 
                onClick={submitOrder} 
                disabled={submitting || cart.length === 0}
                className="w-full h-12 text-base font-bold shadow-pos-sm"
                size="lg"
              >
                <CreditCard className="w-5 h-5 mr-2" />
                {submitting ? "Processing..." : "Complete Sale"}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
