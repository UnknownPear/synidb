#!/usr/bin/env python3
import os, sys, csv, json, re
import psycopg2, psycopg2.extras
from uuid import UUID

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("Set DATABASE_URL", file=sys.stderr)
    sys.exit(1)

def db():
    return psycopg2.connect(DATABASE_URL, sslmode=os.getenv("PGSSLMODE", "prefer"))

def to_num(v):
    if v is None: return None
    try:
        return float(re.sub(r"[^0-9.\-]", "", str(v)))
    except Exception:
        return None

def map_header(h: str) -> str:
    s = h.strip().lower()
    if "orig" in s or "msrp" in s or "retail" in s: return "msrp"
    if "stock image" in s or "unit cost" in s or "price paid" in s or s == "cost": return "unit_cost"
    if s in ("qty",) or "quantity" in s: return "qty"
    if "upc" in s: return "upc"
    if "asin" in s: return "asin"
    if "serial" in s: return "serial"
    if "product" in s or "desc" in s or "name" in s: return "product_name_raw"
    return h

def upsert(cur, table, where: dict, data: dict):
    # Direct Postgres upsert by a unique field
    wh_cols = list(where.keys())
    wh_vals = [where[k] for k in wh_cols]
    cur.execute(f"SELECT * FROM {table} WHERE " + " AND ".join([f"{k}=%s" for k in wh_cols]) + " LIMIT 1", wh_vals)
    row = cur.fetchone()
    if row:
        return row
    cols = list(data.keys())
    vals = [data[k] for k in cols]
    cur.execute(f"INSERT INTO {table} ({','.join(cols)}) VALUES ({','.join(['%s']*len(cols))}) RETURNING *", vals)
    return cur.fetchone()

def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", required=True, help="CSV file")
    ap.add_argument("--po", required=True, help="PO number")
    ap.add_argument("--vendor", required=True, help="Vendor name")
    ap.add_argument("--category", required=True, help="Default category label")
    args = ap.parse_args()

    with open(args.file, newline="", encoding="utf-8") as f:
        raw = list(csv.DictReader(f))

    # remap headers
    rows = []
    for r in raw:
        rr = {}
        for k, v in r.items():
            rr[map_header(k)] = v
        rows.append(rr)

    con = db()
    cur = con.cursor(cursor_factory=psycopg2.extras.DictCursor)
    try:
        cur.execute("BEGIN")
        vendor = upsert(cur, "vendors", {"name": args.vendor}, {"name": args.vendor})
        cur.execute("SELECT * FROM categories WHERE label=%s", (args.category,))
        cat = cur.fetchone()
        if not cat:
            cur.execute("INSERT INTO categories(label,prefix) VALUES (%s,%s) RETURNING *", (args.category, "00000"))
            cat = cur.fetchone()
        po = upsert(cur, "purchase_orders", {"po_number": args.po}, {"po_number": args.po, "vendor_id": vendor["id"], "status": "Here"})

        created = 0
        for r in rows:
            line = {
                "purchase_order_id": po["id"],
                "product_name_raw": r.get("product_name_raw"),
                "upc": r.get("upc"),
                "asin": r.get("asin"),
                "msrp": to_num(r.get("msrp")),
                "unit_cost": to_num(r.get("unit_cost")),
                "qty": int(re.sub(r"[^0-9]", "", str(r.get("qty") or 1)) or 1),
                "category_guess": cat["id"],
                "raw_json": json.dumps(r)
            }
            cols = list(line.keys())
            cur.execute(f"INSERT INTO po_lines ({','.join(cols)}) VALUES ({','.join(['%s']*len(cols))})", [line[c] for c in cols])
            created += 1

        con.commit()
        print(f"OK — created {created} po_lines for PO {args.po}")
        print(f"Next: POST /imports/{po['id']}/explode with {{\"categoryId\": \"{cat['id']}\"}}")
    except Exception as e:
        con.rollback()
        print("ERROR:", e, file=sys.stderr)
        sys.exit(2)
    finally:
        cur.close()
        con.close()

if __name__ == "__main__":
    main()
