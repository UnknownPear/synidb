// src/lib/printInStoreLabel.ts

export interface PrintLabelData {
  productName: string;
  unitPrice: number;
  ourPrice: number;
  defectStatus?: string;
  sku: string;
}

export function printInStoreLabel(data: PrintLabelData) {
  const width = 500;
  const height = 300;
  const left = (window.screen.width - width) / 2;
  const top = (window.screen.height - height) / 2;

  const win = window.open(
    "",
    "PrintLabel",
    `width=${width},height=${height},left=${left},top=${top}`
  );

  if (!win) {
    alert("Please allow popups to print labels.");
    return;
  }

  const currentDate = new Date().toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });

  // These styles match the "PricePreview" component layout from your script
  const hasDefect = !!data.defectStatus;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Print Label</title>
      <style>
        @page { size: 4in 1.6in; margin: 0; }
        body { 
          margin: 0; 
          padding: 0; 
          font-family: Arial, sans-serif; 
          -webkit-print-color-adjust: exact; 
          background-color: white;
        }
        .label-container {
          width: 4in;
          height: 1.6in;
          position: relative;
          padding: 0.1in 0.6in; /* Matches padding from script */
          box-sizing: border-box;
          overflow: hidden;
        }
        .logo {
          position: absolute;
          top: 0.1in;
          right: 0.2in;
          width: 0.75in;
          height: auto;
          z-index: 1;
        }
        .product-name {
          font-size: ${hasDefect ? "15px" : "16px"};
          font-weight: bold;
          margin-bottom: 6px;
          z-index: 2;
          position: relative;
          line-height: 1.1;
          max-height: 2.2em;
          overflow: hidden;
          color: #000;
        }
        .defect {
          font-size: 9px;
          font-weight: bold;
          color: #cc0000;
          margin-bottom: 2px;
          padding: 2px 4px;
          border: 1px dashed #cc0000;
          display: inline-block;
          line-height: 1.2;
          z-index: 2;
          position: relative;
        }
        .msrp {
          font-size: ${hasDefect ? "11px" : "12px"};
          margin-bottom: 4px;
          z-index: 2;
          position: relative;
          color: #444;
        }
        .our-price-label {
          font-size: ${hasDefect ? "14px" : "16px"};
          margin-bottom: 4px;
          z-index: 2;
          position: relative;
          color: #000;
        }
        .price-val {
          font-size: ${hasDefect ? "30px" : "38px"};
          font-weight: bold;
          color: #000;
        }
        .date {
          font-size: 8px;
          position: absolute;
          bottom: 0.1in;
          right: 0.25in;
          z-index: 2;
          color: #666;
        }
        .sku {
          font-size: 8px;
          position: absolute;
          bottom: 0.1in;
          left: 0.6in;
          z-index: 2;
          color: #666;
          font-family: monospace;
        }
      </style>
    </head>
    <body>
      <div class="label-container">
        <img 
          src="https://images.squarespace-cdn.com/content/v1/65b9315703a0c658ffb46c19/8d1b66b8-e3b1-41f0-9ebb-a116c5a9712e/Synergy-logo-icon.png" 
          class="logo" 
          alt="Synergy"
        />
        
        <div class="product-name">${data.productName}</div>
        
        ${
          data.defectStatus
            ? `<div class="defect">DEFECT: ${data.defectStatus}</div>`
            : ""
        }
        
        <div class="msrp">MSRP: $${Number(data.unitPrice).toFixed(2)}</div>
        
        <div class="our-price-label">
          OUR PRICE: <span class="price-val">$${Number(data.ourPrice).toFixed(2)}</span>
        </div>

        <div class="sku">${data.sku}</div>
        <div class="date">${currentDate}</div>
      </div>
      <script>
        window.onload = function() {
          window.print();
          // Optional: close after print
          // setTimeout(function() { window.close(); }, 500);
        };
      </script>
    </body>
    </html>
  `;

  win.document.write(html);
  win.document.close();
}