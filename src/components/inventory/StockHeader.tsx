import * as React from "react";

export default function StockHeader() {
  return (
    <div
      className="
        grid grid-cols-[160px,1fr,110px,110px,110px,170px,120px]
        items-center text-[11px] font-semibold
        px-3 py-2 border-b border-gray-800 bg-gray-900/50 text-gray-400
        [&>div]:tracking-wide
      "
      style={{ fontVariantNumeric: "tabular-nums" }}
    >
      <div className="uppercase">ID</div>
      <div className="uppercase">Product</div>
      <div className="uppercase text-right">MSRP</div>
      <div className="uppercase text-right">Price</div>
      <div className="uppercase text-center">On Hand</div>
      <div className="uppercase text-center">Updated</div>
      <div className="uppercase text-center">Actions</div>
    </div>
  );
}
