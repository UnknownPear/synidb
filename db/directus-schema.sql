-- directus-schema.sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ───────────── core ─────────────
CREATE TABLE IF NOT EXISTS vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  contact_info jsonb
);

CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL UNIQUE,
  prefix varchar(10) NOT NULL UNIQUE,
  notes text
);

CREATE TABLE IF NOT EXISTS id_prefix_counters (
  prefix varchar(10) PRIMARY KEY,
  next_seq integer NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  po_number text,
  lot_label text,
  booked_date date,
  received_date date,
  status text,
  shipping_cost numeric(12,2) DEFAULT 0,
  fees_cost numeric(12,2) DEFAULT 0,
  notes text
);
CREATE INDEX IF NOT EXISTS idx_po_vendor ON purchase_orders(vendor_id);

CREATE TABLE IF NOT EXISTS po_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  vendor_row_id text,
  product_name_raw text,
  upc text,
  asin text,
  msrp numeric(12,2),
  unit_cost numeric(12,2),
  qty integer NOT NULL DEFAULT 1,
  category_guess uuid REFERENCES categories(id) ON DELETE SET NULL,
  raw_json jsonb
);
CREATE INDEX IF NOT EXISTS idx_polines_po ON po_lines(purchase_order_id);

CREATE TABLE IF NOT EXISTS inventory_items (
  item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  synergy_code varchar(32) NOT NULL UNIQUE,
  purchase_order_id uuid REFERENCES purchase_orders(id) ON DELETE SET NULL,
  po_line_id uuid REFERENCES po_lines(id) ON DELETE SET NULL,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  brand text,
  model text,
  description text,
  serial text UNIQUE,
  grade char(1) CHECK (grade IN ('A','B','C','D','P')),
  cost_unit numeric(12,2),
  msrp numeric(12,2),
  tester_comment text,
  tested_by text,
  tested_at timestamptz,
  listed_price numeric(12,2),
  status text CHECK (status IN ('INTAKE','TESTED','POSTED','SOLD','RMA','SCRAP')) DEFAULT 'INTAKE',
  posted_by text,
  posted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_items_po ON inventory_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_items_category ON inventory_items(category_id);

CREATE TABLE IF NOT EXISTS external_ids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES inventory_items(item_id) ON DELETE CASCADE,
  type text NOT NULL,        -- e.g. 'REGENCY', 'ERI', 'ITRENEW'
  value text NOT NULL,
  source_vendor text,
  UNIQUE(type, value),
  UNIQUE(item_id, type)
);
CREATE INDEX IF NOT EXISTS idx_external_ids_item ON external_ids(item_id);

CREATE TABLE IF NOT EXISTS listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES inventory_items(item_id) ON DELETE CASCADE,
  channel text NOT NULL,     -- 'eBay', 'Mercari', etc.
  listing_id text,
  posted_price numeric(12,2),
  posted_at timestamptz,
  status text CHECK (status IN ('ACTIVE','ENDED','SOLD')) DEFAULT 'ACTIVE',
  ended_at timestamptz,
  ended_reason text
);
CREATE INDEX IF NOT EXISTS idx_listings_item ON listings(item_id);

CREATE TABLE IF NOT EXISTS sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL UNIQUE REFERENCES inventory_items(item_id) ON DELETE CASCADE,
  channel text NOT NULL,
  sale_id text,
  sold_price numeric(12,2) NOT NULL,
  fees numeric(12,2) DEFAULT 0,
  shipping_paid_by_buyer numeric(12,2) DEFAULT 0,
  shipping_cost numeric(12,2) DEFAULT 0,
  tax_collected numeric(12,2) DEFAULT 0,
  sold_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  po_id uuid REFERENCES purchase_orders(id) ON DELETE SET NULL,
  original_file text,
  mapping_used jsonb,
  status text CHECK (status IN ('UPLOADED','MAPPED','COMMITTED','FAILED')) DEFAULT 'UPLOADED',
  counters jsonb,
  errors jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id uuid NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  raw jsonb,
  normalized jsonb,
  status text CHECK (status IN ('SKIPPED','READY','ERROR')) DEFAULT 'READY'
);

-- ───────────── view ─────────────
DROP VIEW IF EXISTS vw_po_profit;
CREATE VIEW vw_po_profit AS
SELECT
  po.id AS purchase_order_id,
  po.po_number,
  po.vendor_id,
  COUNT(i.item_id) AS total_units,
  COALESCE(SUM(i.cost_unit),0) AS total_inventory_cost,
  COALESCE(SUM(CASE WHEN s.id IS NOT NULL THEN 1 ELSE 0 END),0) AS units_sold,
  COALESCE(SUM(s.sold_price - s.fees - s.shipping_cost),0) AS sales_net_revenue,
  COALESCE(SUM((s.sold_price - s.fees - s.shipping_cost) - i.cost_unit),0) AS gross_profit,
  COALESCE(SUM(i.cost_unit) FILTER (WHERE s.id IS NULL),0) AS cost_in_unsold_inventory
FROM purchase_orders po
LEFT JOIN po_lines pl ON pl.purchase_order_id = po.id
LEFT JOIN inventory_items i ON i.po_line_id = pl.id
LEFT JOIN sales s ON s.item_id = i.item_id
GROUP BY po.id, po.po_number, po.vendor_id;
