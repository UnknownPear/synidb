// src/helpers/handlePrintClickClient.ts
import { openPrintWindow } from "@/helpers/printLabel";

export type PrintSpec = {
  modelFamily: "Air" | "Pro";
  sizeInch: number;
  year: number;
  chip: string;
  ramGb: number;
  storageGb: number;
  msrp: number;
  ourPrice?: number; // defaults to 70% of MSRP if not provided
};

export function handlePrintClickClient(s: PrintSpec) {
  const productName = [
    "MacBook",
    s.modelFamily,
    `${Math.round(s.sizeInch)}”`,
    `(${s.year})`,
    s.chip,
    "·",
    `${s.ramGb}GB`,
    "·",
    `${s.storageGb}GB`,
  ].join(" ");

  const msrp = s.msrp;
  const our = s.ourPrice ?? Math.round(msrp * 0.7);

  const pad2 = (n: number) => String(n).padStart(2, "0");
  const d = new Date();
  const date = `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}/${String(
    d.getFullYear()
  ).slice(-2)}`;

  openPrintWindow({
    productName,
    unitPrice: msrp.toFixed(2), // "1299.00"
    ourPrice: our.toFixed(2),   // "909.00"
    date,                       // "MM/DD/YY"
  });
}
