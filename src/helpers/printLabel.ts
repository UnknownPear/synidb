// helpers/printLabel.ts
// Single source of truth for creating labels + printing with a barcode.

const API_BASE = "/backend"; // keep your Vite proxy

// Server response for /labels/ensure
type EnsureResp = {
  synergyId: string;
  productName: string;
  msrpDisplay: string;      // e.g. "999" or "999.99" (display-ready)
  ourPriceDisplay: string;  // e.g. "100"
  savedDisplay: string;     // display of savings (optional)
  date: string;             // mm/dd/yy
  qty: number;              // how many labels were added
};

// --- KEEP: server ensure helper (restored) ---
async function ensureLabelOnServer(payload: {
  productName: string;
  msrp?: string | number;
  price?: string | number;
  qty?: number;
  synergyId?: string;
  prefix?: string;
}): Promise<EnsureResp> {
  const r = await fetch(`${API_BASE}/labels/ensure`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`ensureLabel failed (${r.status}): ${txt.slice(0, 300)}`);
  }
  const ct = (r.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("application/json")) {
    const txt = await r.text().catch(() => "");
    throw new Error(`Expected JSON, got ${ct}: ${txt.slice(0, 200)}`);
  }
  return r.json();
}

/** Public: print a label using the EXACT GAS design you provided */
export async function openPrintWindow(payload: {
  productName: string;
  unitPrice: string;        // MSRP (display-able)
  ourPrice: string;         // our price (display-able)
  date: string;             // mm/dd/yy (server returns its own date)
  qty?: number;             // labels to add to inventory (+qty_on_hand)
  synergyId?: string;       // if you pass one we’ll use it (reprints)
  prefix?: string;          // if no synergyId, we’ll generate with this prefix
}) {
  // 1) Ensure server row + authoritative SID
  const ensured = await ensureLabelOnServer({
    productName: payload.productName,
    msrp: payload.unitPrice,
    price: payload.ourPrice,
    qty: payload.qty ?? 1,
    synergyId: payload.synergyId,
    prefix: payload.prefix,
  });

  const product = escapeHtml(ensured.productName || "");
  const msrp    = escapeHtml(ensured.msrpDisplay || "");
  const our     = escapeHtml(ensured.ourPriceDisplay || "");
  const saved   = escapeHtml(ensured.savedDisplay || "");
  const date    = escapeHtml(ensured.date || "");
  const sid     = escapeHtml(ensured.synergyId || "");

  // 2) EXACT label HTML/CSS (positions/sizes) + in-window JsBarcode render
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Print Label</title>
  <style>
    @media print { @page { size: 4in 2.3125in; margin: 0; } html, body { margin: 0; padding: 0; } }
    body { margin: 0; padding: 0; font-family: Arial, sans-serif; }

    .label {
      position: relative; width: 4in; height: 2.3125in;
      padding: 0.10in 0.60in 0 0.60in; box-sizing: border-box; background:#fff;
    }
    .inner { position: relative; width: 2.80in; height: 2.2125in; }
    .el { position: absolute; box-sizing: border-box; overflow: hidden; }

    .product {
      left: 0.00in; top: 0.00in; width: 1.90in;
      font-size: 16px; font-weight: 700; line-height: 1.08;
      display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; white-space: normal;
    }
    .msrp { left: 0.00in; top: 0.56in; width: 2.20in; height: 0.18in; font-size: 12px; }

    .priceStack { left: 1.80in; top: 0.02in; width: 0.85in; height: 0.52in; text-align:right; }
    .priceStack .lbl { font-size: 11px; letter-spacing: 0.4px; font-weight:700; }
    .priceStack .val { font-size: 40px; font-weight: 800; line-height: 1.0; margin-top: 2px; white-space: nowrap; display:block; }

    .logo { left: 2.62in; top: 0.08in; width: 0.60in; height: 0.60in; }
    .logo img { width: 100%; height: 100%; object-fit: contain; display: block; }

    .date { left: 2.37in; top: 0.90in; width: 0.80in; height: 0.22in; font-size: 9px; text-align: right; }

    /* Barcode box exactly as in your working HTML */
    .barcode { left: -0.035in; top: 0.7in; width: 2.80in; height: 1.10in; }
    .barcode img { width: 100% !important; height: 100% !important; object-fit: contain; display: block; }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
</head>
<body>
  <div class="label">
    <div class="inner">
      <div class="el product">${product}</div>
      <div class="el msrp">MSRP: $${msrp}${saved ? " | <b>YOU SAVED $"+saved+"!</b>" : ""}</div>

      <div class="el priceStack">
        <div class="lbl">OUR&nbsp;PRICE</div>
        <div class="val" id="priceVal">$${our}</div>
      </div>

      <div class="el logo">
        <img src="https://images.squarespace-cdn.com/content/v1/65b9315703a0c658ffb46c19/8d1b66b8-e3b1-41f0-9ebb-a116c5a9712e/Synergy-logo-icon.png" alt="Logo" />
      </div>

      <div class="el date">${date}</div>

      <div class="el barcode"><img id="barcodeImg" alt="barcode"></div>
    </div>
  </div>

  <script>
    (function renderBarcode(){
      try {
        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        JsBarcode(svg, ${JSON.stringify(sid)}, {
          format: 'CODE128',
          width: 2.4,
          height: 120,
          displayValue: false,
          textMargin: 10,
          margin: 0,
          lineColor: '#000'
        });
        var xml = new XMLSerializer().serializeToString(svg);
        var url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
        document.getElementById('barcodeImg').src = url;
      } catch(e) { console.error('Barcode render failed:', e); }
    })();

    (function fitPrice(){
      var el = document.getElementById('priceVal');
      if(!el) return;
      var box = el.parentElement, size = 40;
      el.style.whiteSpace='nowrap'; el.style.display='block'; el.style.fontSize=size+'px';
      for (var i=0;i<80;i++){
        if (el.scrollWidth<=box.clientWidth && el.scrollHeight<=box.clientHeight) break;
        size-=1; if (size<20){ size=20; break; } el.style.fontSize=size+'px';
      }
    })();

    function go(){ try{ window.focus(); }catch(_){} window.print(); setTimeout(function(){ try{ window.close(); }catch(_){}} , 300); }
    if (document.readyState === 'complete') setTimeout(go, 60);
    else window.addEventListener('load', function(){ setTimeout(go, 60); });
  <\/script>
</body>
</html>`;

  // 3) Open & print
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank", "width=760,height=600,noopener,noreferrer");
//  if (!w) alert("Pop-up blocked — allow pop-ups to print labels.");
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// --- KEEP: passthrough used elsewhere ---
export function printLabelFromRow(row: {
  synergyId?: string;
  productName: string;
  msrpDisplay?: string | number;
  ourPriceDisplay?: string | number;
  date?: string;
  qty?: number;
  prefix?: string;
}) {
  return openPrintWindow({
    synergyId: row.synergyId,
    productName: row.productName,
    unitPrice: String(row.msrpDisplay ?? ""),
    ourPrice: String(row.ourPriceDisplay ?? ""),
    date: row.date ?? new Date().toLocaleDateString("en-US"),
    qty: row.qty ?? 1,
    prefix: row.prefix,
  });
}

/** Public: record a scan hit (unchanged) */
export async function recordScan(synergyId: string, qty = 1) {
  const r = await fetch(`${API_BASE}/labels/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ synergyId, qty }),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`scan failed (${r.status}): ${txt.slice(0, 300)}`);
  }
  return r.json();
}

// util
function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (m) => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" } as any)[m]);
}
