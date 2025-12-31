export interface PrintJob {
  // This is your cleaned label SKU text (what you want huge on the bottom)
  synergyId: string;
  productName: string;
  grade: string;  // kept for compatibility but not rendered
  notes: string;  // used for the charger line (e.g. "65W USB C CHARGER")
}

/**
 * Label / printer sizing constants.
 */
const LABEL_WIDTH_IN = 3.5;    // DYMO 30252 width
const LABEL_HEIGHT_IN = 1.925; // your adjusted height

// Slight shrink so the giant SKU has room
const PRINT_SCALE = 0.97;

export const printLabel = async (job: PrintJob): Promise<boolean> => {
  return new Promise((resolve) => {
    const iframe = document.createElement("iframe");

    iframe.style.position = "fixed";
    iframe.style.top = "0";
    iframe.style.left = "0";
    iframe.style.width = "1px";
    iframe.style.height = "3px";
    iframe.style.opacity = "0";
    iframe.style.border = "none";
    iframe.style.pointerEvents = "none";
    iframe.style.zIndex = "-1000";

    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      alert("Printing failed: Could not create print context.");
      document.body.removeChild(iframe);
      return resolve(false);
    }

    const dateStr = new Date().toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "2-digit",
    });

    const safeName = (job.productName || "").replace(/"/g, "&quot;");
    const safeNotes = (job.notes || "").replace(/"/g, "&quot;");
    const safeSku = (job.synergyId || "").replace(/"/g, "&quot;");

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Print Label</title>
        <style>
          @page {
            size: ${LABEL_WIDTH_IN}in ${LABEL_HEIGHT_IN}in;
            margin: 0;
          }

          html, body {
            width: ${LABEL_WIDTH_IN}in;
            height: ${LABEL_HEIGHT_IN}in;
            margin: 0;
            padding: 0;
            overflow: hidden;
            font-family: "Arial", sans-serif;
            background: white;
            color: black;
          }

          .scale-wrapper {
            width: 100%;
            height: 100%;
            transform: scale(${PRINT_SCALE});
            transform-origin: top left;
            display: flex;
          }

          .label-container {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
            box-sizing: border-box;
            padding: 0.06in 0.08in 0.06in 0.32in;
          }

          /* HEADER: just the date on the right now */
          .header {
            display: flex;
            justify-content: flex-end; /* no left text anymore */
            align-items: flex-end;
            border-bottom: 1px solid #000;
            padding-bottom: 0;
            margin-bottom: 3px;
            line-height: 1;
            margin-top: 0;
          }

          .date {
            font-size: 8px;
            font-family: monospace;
            font-weight: bold;
          }

          .main-content {
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
            overflow: hidden;
            padding-top: 1px;
            margin-bottom: 4px;
          }

          /* Big product name */
          .product-name {
            font-size: 12px;
            font-weight: 900;
            line-height: 1.05;
            max-height: 2.2em;
            overflow: hidden;
            text-overflow: ellipsis;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            margin-bottom: 2px;
          }

          /* Charger / secondary line */
          .specs {
            font-size: 8px;
            font-weight: 600;
            text-transform: uppercase;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            line-height: 1.1;
            color: #333;
            opacity: 0.9;
            margin-top: 1px;
          }

          .footer {
            border-top: 1px solid #000;
            padding-top: 1px;
            padding-bottom: 2px;
            line-height: 1;
          }

          .sku-row {
            display: flex;
            align-items: baseline;
            justify-content: flex-start;
            gap: 4px;
          }

          /* 🔥 BIG LABEL SKU ONLY 🔥 */
          .sku-text {
            flex: 1;
            font-size: 27px;
            font-weight: 900;
            letter-spacing: 0.6px;
            text-transform: uppercase;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          @media print {
            body {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
          }
        </style>
      </head>
      <body>
        <div class="scale-wrapper">
          <div class="label-container">
            <div class="header">
              <span class="date">${dateStr}</span>
            </div>

            <div class="main-content">
              <div class="product-name">${safeName}</div>
              ${
                safeNotes
                  ? `<div class="specs">${safeNotes}</div>`
                  : ""
              }
            </div>

            <div class="footer">
              <div class="sku-row">
                <span class="sku-text">${safeSku}</span>
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    doc.open();
    doc.write(html);
    doc.close();

    iframe.onload = () => {
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (e) {
          console.error("Print error:", e);
        }

        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
          resolve(true);
        }, 2000);
      }, 100);
    };
  });
};
