// src/types/manager.ts
export type Category = {
  id: string;
  label: string;
  prefix?: string | null;
  notes?: string | null;
};

export type Vendor = {
  id: string;
  name: string;
  po_count: number;
};

export type PurchaseOrderSummary = {
  id: string;
  po_number: string | null;
  vendor_name: string | null;
  created_at: string;
  vendor_id: string | null;
};

export type PurchaseOrder = {
  id: string;
  po_number: string | null;
  vendor_id: string | null;
};

export type ProfitRow = {
  purchase_order_id: string;
  po_number: string | null;
  vendor_id: string | null;
  total_units: number;
  total_inventory_cost: number;
  units_sold: number;
  sales_net_revenue: number;
  gross_profit: number;
  cost_in_unsold_inventory: number;
  units_posted: number;
  units_unposted: number;
  posted_value: number;
  unposted_cost: number;
};

export type POLine = {
  id: string;
  product_name_raw: string;
  upc?: string | null;
  asin?: string | null;
  qty: number;
  unit_cost: number | null;
  msrp?: number | null;
  category_id?: string | null;
};

export type VendorPO = {
  id: string;
  po_number: string | null;
  total_lines_qty: number;
  est_cost: number;
};

export type BrowserPOLine = {
  id: string;
  product_name_raw: string | null;
  upc?: string | null;
  asin?: string | null;
  qty: number | null;
  unit_cost: number | null;
  msrp: number | null;
  category_id?: string | null;
};

export type AiHealth = {
  genai_imported: boolean;
  has_key: boolean;
  ai_first: boolean;
  configured: boolean;
};
