import os
import re
import json
from uuid import UUID
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Body, Path, Header
from fastapi.responses import JSONResponse
import psycopg2.extras
from pydantic import BaseModel
from ebay_utils import _summarize_sales_for_legacy_id 

from db_utils import db, _uuid_list, _resolve_po_id, is_uuid_like, to_num

from pubsub_utils import _broadcast

router = APIRouter()

class CreatePOBody(BaseModel):
    po_number: str
    vendor_id: str | None = None
    vendor_name: str | None = None

class PurchaseOrderUpdate(BaseModel):
    vendor_id: str

class LineUpdate(BaseModel):
    product_name_raw: Optional[str] = None
    qty: Optional[int] = None
    unit_cost: Optional[float] = None
    category_id: Optional[str] = None
    msrp: Optional[float] = None        
    upc: Optional[str] = None
    status: Optional[str] = None
    tester_comment: Optional[str] = None 
    ebay_price: Optional[float] = None
    ebay_item_url: Optional[str] = None

class BulkUpdatePayload(BaseModel):
    line_ids: List[str]
    updates: LineUpdate   

BROADCAST_SQL = """
    SELECT i.synergy_code AS "synergyId", COALESCE(pl.product_name_raw, '') AS "productName",
           i.category_id AS "categoryId", i.status AS "status",
           COALESCE(i.cost_unit, 0) AS "purchaseCost", COALESCE(pl.qty, 1) AS "qty",
           COALESCE(i.msrp, pl.msrp, 0) AS "msrp",
           i.purchase_order_id AS "poId", i.po_line_id AS "lineId",
           i.grade AS "grade", i.tested_by AS "testedBy", i.tested_date AS "testedDate",
           i.tester_comment AS "testerComment", i.posted_at AS "postedAt",
           i.posted_by::text AS "postedBy", i.ebay_item_url AS "ebayItemUrl",
           COALESCE(i.specs, '{}'::jsonb) AS "specs",
           COALESCE(i.price, 0) AS "price", COALESCE(i.ebay_price, 0) AS "ebayPrice",
           c.label AS "categoryLabel", c.prefix AS "categoryPrefix",
           i.last_printed_at as "lastPrintedAt"
    FROM public.inventory_items i
    LEFT JOIN po_lines pl ON pl.id = i.po_line_id
    LEFT JOIN categories c ON c.id = i.category_id
    WHERE pl.id = %s
"""

def require_manager_role(x_user_id: int = Header(None, alias="X-User-ID")):
    """
    Validates that the request comes from a Manager or Admin.
    ALLOWS access if DEBUG=True (Local Mode) to prevent breaking the office.
    """
    is_debug = os.getenv("DEBUG", "False").lower() in ("true", "1", "t")
    
    if is_debug:
        if not x_user_id:
            return 0
    
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Missing User Identity")
        
    with db() as (con, cur):
        cur.execute("SELECT roles FROM app_users WHERE id = %s", (x_user_id,))
        row = cur.fetchone()
        
        if not row:
            if is_debug:
                return x_user_id
            raise HTTPException(status_code=403, detail="User not found")
        
        user_roles = [r.lower() for r in (row.get('roles') or [])]
        
        if "manager" not in user_roles and "admin" not in user_roles:
            if is_debug:
                return x_user_id
            raise HTTPException(status_code=403, detail="Insufficient Permissions")
            
    return x_user_id

# === SNAPSHOT: summary + first page ===
@router.get("/pos/{po_id}/snapshot")
def po_snapshot(po_id: UUID, limit: int = Query(200, ge=50, le=1000), offset: int = 0) -> Dict[str, Any]:
    with db() as (con, cur):
        cur.execute("""
            SELECT
              COUNT(*)::int AS line_count,
              COALESCE(SUM(qty), 0)::int AS qty_total,
              COALESCE(SUM((qty)*(unit_cost)), 0)::numeric AS cost_total,
              COALESCE(MAX(updated_at), NOW()) AS version_ts
            FROM po_lines WHERE purchase_order_id = %s
        """, (str(po_id),))
        s = cur.fetchone()
        summary = {
            "rowCount": s["line_count"],
            "qty_total": int(s["qty_total"] or 0),
            "cost_total": float(s["cost_total"] or 0),
            "version": str(s["version_ts"]),
        }

        cur.execute("""
            SELECT id, synergy_id, product_name_raw, upc, asin, qty, unit_cost, msrp, updated_at
            FROM po_lines WHERE purchase_order_id = %s
            ORDER BY id ASC LIMIT %s OFFSET %s
        """, (str(po_id), limit, offset))
        rows = [dict(r) for r in cur.fetchall()]

        return {"summary": summary, "page": {"limit": limit, "offset": offset, "rows": rows}}

# --- PO CRUD ---
@router.post("/purchase_orders", status_code=201)
def purchase_order_create(body: CreatePOBody):
    po_number = (body.po_number or "").strip()
    if not po_number:
        raise HTTPException(400, "po_number is required")
    if not body.vendor_id and not (body.vendor_name or "").strip():
        raise HTTPException(400, "vendor_id or vendor_name is required")

    with db() as (con, cur):
        vendor_id = body.vendor_id
        if not vendor_id:
            vname = body.vendor_name.strip()
            cur.execute("SELECT id FROM vendors WHERE name=%s LIMIT 1", (vname,))
            row = cur.fetchone()
            if row:
                vendor_id = row["id"]
            else:
                cur.execute("INSERT INTO vendors(name) VALUES (%s) RETURNING id", (vname,))
                vendor_id = cur.fetchone()["id"]
        else:
            cur.execute("SELECT 1 FROM vendors WHERE id=%s", (vendor_id,))
            if not cur.fetchone():
                raise HTTPException(400, "vendor_id not found")

        cur.execute("SELECT id FROM purchase_orders WHERE vendor_id=%s AND po_number=%s", (vendor_id, po_number))
        existing_po = cur.fetchone()
        if existing_po:
            raise HTTPException(status_code=409, detail={"error": "DuplicatePO", "id": str(existing_po["id"])})

        cur.execute(
            "INSERT INTO purchase_orders (po_number, vendor_id) VALUES (%s, %s) RETURNING id",
            (po_number, vendor_id),
        )
        po_id = cur.fetchone()["id"]
        return {"ok": True, "id": str(po_id), "vendor_id": str(vendor_id)}

@router.patch("/purchase_orders/{po_id}")
def update_purchase_order(po_id: str, body: dict = Body(...)):
    updates = {}
    if "vendor_id" in body:
        updates["vendor_id"] = body["vendor_id"]
    if "po_number" in body:
        updates["po_number"] = body["po_number"]
    if not updates:
        return {"updated": 0}

    fields = ", ".join([f"{k} = %s" for k in updates.keys()])
    values = list(updates.values()) + [po_id]

    with db() as (con, cur):
        cur.execute(f"UPDATE purchase_orders SET {fields} WHERE id = %s", tuple(values))
        return {"updated": cur.rowcount}

@router.delete("/purchase_orders/{po_id}")
def delete_purchase_order(
    po_id: str, 
    user_id: int = Depends(require_manager_role)
):
    with db() as (con, cur):
        cur.execute("DELETE FROM inventory_items WHERE purchase_order_id = %s", (po_id,))
        cur.execute("DELETE FROM po_lines WHERE purchase_order_id = %s", (po_id,))
        cur.execute("DELETE FROM purchase_orders WHERE id = %s", (po_id,))
        
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Purchase Order not found")
            
    return {"ok": True}

# --- PO Summaries ---
@router.get("/pos/summaries")
def po_summaries(
    _auth: int = Depends(require_manager_role) 
):
    with db() as (con, cur):
        cur.execute("""
            SELECT 
                p.id, 
                p.po_number, 
                v.name AS vendor_name, 
                p.created_at,
                COALESCE(s.line_count, 0) AS line_count,
                COALESCE(s.minted_any, false) AS minted_any,
                COALESCE(s.minted_all, false) AS minted_all,
                COALESCE(s.total_lines_qty, 0) AS total_lines_qty,
                COALESCE(s.est_cost, 0) AS est_cost,
                COALESCE(inv.posted_count, 0) as posted_count,
                COALESCE(inv.inventory_count, 0) as inventory_count
            FROM purchase_orders p
            LEFT JOIN vendors v ON v.id = p.vendor_id
            LEFT JOIN (
                SELECT
                    purchase_order_id,
                    COUNT(*) AS line_count,
                    COALESCE(SUM(qty), 0) AS total_lines_qty,
                    COALESCE(SUM(qty * unit_cost), 0) AS est_cost,
                    BOOL_OR(synergy_id IS NOT NULL) AS minted_any,
                    BOOL_AND(synergy_id IS NOT NULL) AS minted_all
                FROM po_lines
                GROUP BY purchase_order_id
            ) s ON s.purchase_order_id = p.id
            LEFT JOIN (
                SELECT
                    purchase_order_id,
                    COUNT(*) as inventory_count,
                    COUNT(*) FILTER (WHERE posted_at IS NOT NULL OR (ebay_item_url IS NOT NULL AND ebay_item_url <> '')) as posted_count
                FROM inventory_items
                GROUP BY purchase_order_id
            ) inv ON inv.purchase_order_id = p.id
            ORDER BY p.created_at DESC NULLS LAST, p.id DESC LIMIT 200
        """)
        return [dict(r) for r in cur.fetchall()]

@router.get("/pos/{po_id}/summary")
def po_summary(po_id: str):
    with db() as (con, cur):
        cur.execute(
            "SELECT p.*, v.name as vendor_name FROM purchase_orders p LEFT JOIN vendors v ON v.id = p.vendor_id WHERE p.id = %s",
            (po_id,),
        )
        po = cur.fetchone()
        if not po:
            raise HTTPException(404, "PO not found")
        
        cur.execute(
            "SELECT COUNT(*) as line_count, SUM(qty) as qty_total, SUM(qty * unit_cost) as cost_total FROM po_lines WHERE purchase_order_id = %s",
            (po_id,),
        )
        lines_agg = cur.fetchone()
        
        cur.execute(
            "SELECT status, COUNT(*) as n FROM inventory_items WHERE purchase_order_id = %s GROUP BY status",
            (po_id,),
        )
        inv_agg = {r['status']: r['n'] for r in cur.fetchall()}

        return {**po, **lines_agg, "inventory_counts": inv_agg}

# --- PO Lines ---
@router.get("/pos/{po_id}/lines")
def get_po_lines(po_id: UUID):
    with db() as (con, cur):
        # Added raw_json to SELECT
        cur.execute("""
            SELECT
                id,
                product_name_raw,
                upc,
                asin,
                qty,
                unit_cost,
                msrp,
                synergy_id,
                category_guess AS category_id,
                raw_json 
            FROM po_lines
            WHERE purchase_order_id = %s
            ORDER BY id ASC
        """, (str(po_id),))
        return {"rows": [dict(r) for r in cur.fetchall()]}

@router.post("/pos/{po_id}/lines")
def create_po_line(po_id: str, body: Dict[str, Any] = Body(...)):
    with db() as (con, cur):
        cur.execute(
            """
            INSERT INTO po_lines (purchase_order_id, product_name_raw, qty, upc, unit_cost, msrp)
            VALUES (%s, %s, %s, %s, %s, %s) RETURNING id
            """,
            (po_id, body.get("product_name_raw"), body.get("qty", 1), body.get("upc"), body.get("unit_cost"), body.get("msrp")),
        )
        new_id = cur.fetchone()["id"]
        return {"ok": True, "id": str(new_id)}


@router.patch("/pos/lines/{line_id}")
def patch_po_line(line_id: str, body: LineUpdate):
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        return JSONResponse({"detail": "No fields to update"}, status_code=400)
    
    inv_fields = {"status", "tester_comment"}
    po_fields_map = {"category_id": "category_guess"}
    
    # Security Fix: Allowlist for PO columns to prevent SQL Injection
    ALLOWED_PO_COLS = {"product_name_raw", "qty", "unit_cost", "msrp", "upc", "category_guess", "asin", "synergy_id"}

    po_updates = {k: v for k, v in updates.items() if k not in inv_fields}
    inv_updates = {k: v for k, v in updates.items() if k in inv_fields}

    with db() as (con, cur):
        updated_row = None
        
        if po_updates:
            set_clauses = []
            values = []
            for k, v in po_updates.items():
                db_col = po_fields_map.get(k, k)
                # Only add if the column is in our allowlist
                if db_col in ALLOWED_PO_COLS:
                    set_clauses.append(f"{db_col} = %s")
                    values.append(v)
            
            if set_clauses:
                cur.execute(
                    f"UPDATE po_lines SET {', '.join(set_clauses)} WHERE id = %s RETURNING *",
                    (*values, line_id),
                )
                updated_row = cur.fetchone()
                if not updated_row:
                    raise HTTPException(404, "Line not found")
        
        if not updated_row:
            cur.execute("SELECT * FROM po_lines WHERE id = %s", (line_id,))
            updated_row = cur.fetchone()
            if not updated_row:
                raise HTTPException(404, "Line not found")

        if inv_updates:
            inv_sets = []
            inv_vals = []
            if "status" in inv_updates:
                inv_sets.append("status = %s")
                inv_vals.append(inv_updates["status"])
            if "tester_comment" in inv_updates:
                inv_sets.append("tester_comment = %s")
                inv_vals.append(inv_updates["tester_comment"])
            
            if inv_sets:
                inv_vals.append(line_id)
                cur.execute(
                    f"UPDATE inventory_items SET {', '.join(inv_sets)} WHERE po_line_id = %s",
                    tuple(inv_vals),
                )

        cur.execute(BROADCAST_SQL, (line_id,))
        affected_items = cur.fetchall()
        con.commit()

        for item in affected_items:
            _broadcast("row.upserted", dict(item))

        return dict(updated_row)
    
@router.delete("/pos/lines/{line_id}")
def delete_po_line(line_id: str):
    with db() as (con, cur):
        cur.execute("DELETE FROM inventory_items WHERE po_line_id = %s", (line_id,))
        
        _broadcast("row.bulk_upserted", {"reason": "deleted"})
        
        cur.execute("DELETE FROM po_lines WHERE id = %s", (line_id,))
    return {"ok": True}

@router.post("/pos/lines/bulk_update")
def bulk_update_lines(payload: BulkUpdatePayload):
    # Local imports to ensure dependencies exist
    from ebay_utils import _parse_ebay_legacy_id, _ebay_app_access_token, session, EBAY_MARKETPLACE_ID
    
    line_ids = _uuid_list(payload.line_ids)
    if not line_ids: return {"updated": 0}
    
    updates = payload.updates.model_dump(exclude_unset=True)
    if not updates: return {"updated": 0}

    inv_fields = {"status", "tester_comment", "ebay_price", "ebay_item_url"}
    po_fields_map = {"category_id": "category_guess"}

    # Security Fix: Allowlist for PO columns
    ALLOWED_PO_COLS = {"product_name_raw", "qty", "unit_cost", "msrp", "upc", "category_guess", "asin", "synergy_id"}

    po_updates = {k: v for k, v in updates.items() if k not in inv_fields}
    inv_updates = {k: v for k, v in updates.items() if k in inv_fields}

    count = 0

    with db() as (con, cur):
        if po_updates:
            set_clauses = []
            values = []
            for k, v in po_updates.items():
                db_col = po_fields_map.get(k, k)
                # Only add if the column is in our allowlist
                if db_col in ALLOWED_PO_COLS:
                    set_clauses.append(f"{db_col} = %s")
                    values.append(v)
            
            if set_clauses:
                values.append(line_ids)
                sql = f"UPDATE po_lines SET {', '.join(set_clauses)} WHERE id = ANY(%s::uuid[])"
                cur.execute(sql, values)
                count = cur.rowcount

        if inv_updates or po_updates:
            new_status = inv_updates.get("status")
            new_comment = inv_updates.get("tester_comment")
            new_price = inv_updates.get("ebay_price")
            new_url = inv_updates.get("ebay_item_url")
            
            new_thumbnail = None
            
            if new_url:
                # 1. Try parsing as URL
                legacy_id = _parse_ebay_legacy_id(new_url)
                # 2. Fallback: If parsing failed but string is numeric, treat as raw ID
                if not legacy_id and str(new_url).strip().isdigit():
                    legacy_id = str(new_url).strip()

                if legacy_id:
                    try:
                        token = _ebay_app_access_token()
                        r = session.get(
                            "https://api.ebay.com/buy/browse/v1/item/get_item_by_legacy_id",
                            params={"legacy_item_id": legacy_id},
                            headers={
                                "Authorization": f"Bearer {token}",
                                "Accept": "application/json",
                                "X-EBAY-C-MARKETPLACE-ID": EBAY_MARKETPLACE_ID
                            },
                            timeout=5
                        )
                        if r.status_code == 200:
                            data = r.json()
                            
                            val = (data.get("price") or {}).get("value")
                            if val: new_price = float(val)
                            
                            img = (data.get("image") or {}).get("imageUrl")
                            if img: new_thumbnail = img
                                
                            avail = ((data.get("availability") or {}).get("status") or "").upper()
                            if avail in ["OUT_OF_STOCK", "UNAVAILABLE", "ENDED"]:
                                new_status = "SOLD"
                    except Exception as e:
                        print(f"[Bulk Update] eBay sync error: {e}")

            upsert_sql = """
            INSERT INTO inventory_items (
                purchase_order_id, po_line_id, synergy_code, 
                category_id, cost_unit, msrp, 
                status, tester_comment, ebay_price, ebay_item_url, ebay_thumbnail,
                tested_date, posted_at, sold_at
            )
            SELECT 
                pl.purchase_order_id, pl.id, pl.synergy_id,
                pl.category_guess, 
                COALESCE(pl.unit_cost, 0), 
                COALESCE(pl.msrp, 0),
                COALESCE(%s, 'INTAKE'), 
                %s, %s, %s, %s,
                CASE WHEN %s IN ('TESTED','POSTED','SOLD','SCRAP') THEN NOW() ELSE NULL END,
                CASE WHEN %s IN ('POSTED','SOLD') THEN NOW() ELSE NULL END,
                CASE WHEN %s = 'SOLD' THEN NOW() ELSE NULL END
            FROM po_lines pl
            WHERE pl.id = ANY(%s::uuid[])
              AND pl.synergy_id IS NOT NULL
            ON CONFLICT (synergy_code) DO UPDATE
            SET
                status = CASE WHEN %s IS NOT NULL THEN %s ELSE inventory_items.status END,
                tester_comment = CASE WHEN %s IS NOT NULL THEN %s ELSE inventory_items.tester_comment END,
                ebay_price = CASE WHEN %s IS NOT NULL THEN %s ELSE inventory_items.ebay_price END,
                ebay_item_url = CASE WHEN %s IS NOT NULL THEN %s ELSE inventory_items.ebay_item_url END,
                ebay_thumbnail = CASE WHEN %s IS NOT NULL THEN %s ELSE inventory_items.ebay_thumbnail END,
                
                cost_unit = EXCLUDED.cost_unit,
                msrp = EXCLUDED.msrp,
                category_id = EXCLUDED.category_id,
                
                tested_date = COALESCE(inventory_items.tested_date, EXCLUDED.tested_date),
                posted_at   = COALESCE(inventory_items.posted_at,   EXCLUDED.posted_at),
                sold_at     = COALESCE(inventory_items.sold_at,     EXCLUDED.sold_at);
            """
            
            params = (
                new_status, new_comment, new_price, new_url, new_thumbnail,
                new_status, new_status, new_status, 
                line_ids, 
                new_status, new_status, 
                new_comment, new_comment,
                new_price, new_price,
                new_url, new_url,
                new_thumbnail, new_thumbnail
            )
            
            cur.execute(upsert_sql, params)
            inv_count = cur.rowcount
            if count == 0: count = inv_count

        if count > 0:
            _broadcast("row.bulk_upserted", {"count": count})

        return {"updated": count}
@router.post("/pos/lines/bulk_category")
def bulk_set_category(payload: dict = Body(...)):
    raw_ids = payload.get("line_ids") or []
    if not raw_ids:
        return {"updated": 0}

    line_ids = _uuid_list(raw_ids)
    cat_id_raw = payload.get("category_id")
    new_category_id = str(UUID(str(cat_id_raw))) if cat_id_raw and is_uuid_like(cat_id_raw) else None

    with db() as (con, cur):
        cur.execute(
            """
            SELECT id FROM po_lines
            WHERE id = ANY(%s::uuid[])
              AND category_guess IS NOT DISTINCT FROM %s
            """,
            (line_ids, new_category_id),
        )
        ids_to_ignore = {str(row['id']) for row in cur.fetchall()}
        ids_to_change = [lid for lid in line_ids if str(lid) not in ids_to_ignore]

        if not ids_to_change:
            return {"updated": 0}

        cur.execute("DELETE FROM inventory_items WHERE po_line_id = ANY(%s::uuid[])", (ids_to_change,))

        cur.execute(
            """
            UPDATE po_lines
            SET category_guess = %s, synergy_id = NULL
            WHERE id = ANY(%s::uuid[])
            """,
            (new_category_id, ids_to_change),
        )
        updated_count = cur.rowcount
        
        if updated_count > 0:
            _broadcast("row.bulk_upserted", {"count": updated_count})

    return {"updated": updated_count}

# --- PO Groups ---
@router.get("/pos/{po_id}/groups")
def po_groups(po_id: str):
    with db() as (con, cur):
        cur.execute("""
            SELECT COALESCE(pl.category_guess::text, 'UNASSIGNED') AS category_id,
              COUNT(*) AS line_count, SUM(COALESCE(pl.qty,1)) AS units,
              ROUND(SUM(COALESCE(pl.unit_cost,0) * COALESCE(pl.qty,1))::numeric, 2) AS total_cost,
              c.label, c.prefix
            FROM po_lines pl LEFT JOIN categories c ON c.id = pl.category_guess
            WHERE pl.purchase_order_id = %s
            GROUP BY pl.category_guess, c.label, c.prefix ORDER BY c.label NULLS LAST, category_id
        """, (po_id,))
        return [dict(r) for r in cur.fetchall()]

@router.get("/pos/{po_ref}/profit")
def unified_po_profit(po_ref: str):
    with db() as (con, cur):
        try:
            po_id = _resolve_po_id(cur, po_ref)
        except HTTPException:
            raise
        except Exception as e:
            return JSONResponse(
                status_code=500,
                content={"error": "resolve_failed", "detail": str(e)},
            )

        sql = """
        WITH po_base AS (
            SELECT
                %s::uuid AS purchase_order_id,
                SUM(COALESCE(pl.qty, 1)) AS total_units,
                SUM(COALESCE(pl.unit_cost, 0) * COALESCE(pl.qty, 1)) AS total_inventory_cost
            FROM po_lines pl
            WHERE pl.purchase_order_id = %s::uuid
        ),
        inv_agg AS (
            SELECT
                i.purchase_order_id,

                -- how many units actually sold
                COUNT(*) FILTER (WHERE i.status = 'SOLD') AS units_sold,

                -- "revenue" for sold items (what we got from eBay / listing)
                SUM(COALESCE(i.sold_price, i.ebay_price, i.price, 0))
                    FILTER (WHERE i.status = 'SOLD') AS sales_net_revenue,

                -- this is the important part:
                -- sum of (ebay_price - PO unit_cost) for SOLD items
                SUM(
                    COALESCE(i.ebay_price, i.sold_price, i.price, 0)
                    - COALESCE(pl.unit_cost, 0)
                ) FILTER (WHERE i.status = 'SOLD') AS line_profit_sold,

                -- cost still sitting in unsold inventory
                SUM(COALESCE(pl.unit_cost, 0))
                    FILTER (WHERE i.status <> 'SOLD') AS cost_in_unsold_inventory,

                -- posting status
                COUNT(*) FILTER (
                    WHERE (i.ebay_item_url IS NOT NULL AND i.ebay_item_url <> '')
                       OR i.posted_at IS NOT NULL
                ) AS units_posted,
                COUNT(*) FILTER (
                    WHERE (i.ebay_item_url IS NULL OR i.ebay_item_url = '')
                      AND i.posted_at IS NULL
                ) AS units_unposted,

                -- asking price for posted items
                SUM(COALESCE(i.ebay_price, i.price, 0))
                    FILTER (
                        WHERE (i.ebay_item_url IS NOT NULL AND i.ebay_item_url <> '')
                           OR i.posted_at IS NOT NULL
                    ) AS posted_value,

                -- cost of items not posted yet
                SUM(COALESCE(pl.unit_cost, 0))
                    FILTER (
                        WHERE (i.ebay_item_url IS NULL OR i.ebay_item_url = '')
                          AND i.posted_at IS NULL
                    ) AS unposted_cost
            FROM inventory_items i
            LEFT JOIN po_lines pl ON pl.id = i.po_line_id
            WHERE i.purchase_order_id = %s::uuid
            GROUP BY i.purchase_order_id
        )
        SELECT
            COALESCE(pb.total_units, 0)                    AS total_units,
            COALESCE(pb.total_inventory_cost, 0.0)         AS total_inventory_cost,
            COALESCE(ia.units_sold, 0)                     AS units_sold,
            COALESCE(ia.sales_net_revenue, 0.0)            AS sales_net_revenue,
            COALESCE(ia.line_profit_sold, 0.0)             AS line_profit_sold,
            COALESCE(ia.line_profit_sold, 0.0)             AS gross_profit,
            COALESCE(ia.cost_in_unsold_inventory, 0.0)     AS cost_in_unsold_inventory,
            COALESCE(ia.units_posted, 0)                   AS units_posted,
            COALESCE(ia.units_unposted, 0)                 AS units_unposted,
            COALESCE(ia.posted_value, 0.0)                 AS posted_value,
            COALESCE(ia.unposted_cost, 0.0)                AS unposted_cost
        FROM po_base pb
        LEFT JOIN inv_agg ia ON pb.purchase_order_id = ia.purchase_order_id;
        """

        cur.execute(sql, (po_id, po_id, po_id))
        row = cur.fetchone()
        payload = dict(row) if row else {}

        defaults = {
            "total_units": 0,
            "total_inventory_cost": 0.0,
            "units_sold": 0,
            "sales_net_revenue": 0.0,
            "line_profit_sold": 0.0,
            "gross_profit": 0.0,
            "cost_in_unsold_inventory": 0.0,
            "units_posted": 0,
            "units_unposted": 0,
            "posted_value": 0.0,
            "unposted_cost": 0.0,
        }

        final_payload = {
            **defaults,
            **payload,
            "_resolved_po_id": po_id,
            "_ref": po_ref,
        }

        return final_payload

@router.post("/pos/{po_id}/reconcile-sales")
def reconcile_po_sales(po_id: str):
    """
    Time-Based Reconciliation:
    1. Gets active items.
    2. Fetches specific sale transactions from eBay (GetItemTransactions).
    3. ONLY marks items sold if the eBay Sale happened AFTER the item was posted locally.
    """
    updated_count = 0
    
    # Local imports to ensure dependencies are available
    from datetime import datetime, timedelta, timezone
    import requests
    import xml.etree.ElementTree as ET
    from ebay_utils import get_ebay_token
    from config import EBAY_TRADING_ENDPOINT, EBAY_NS
    
    with db() as (con, cur):
        # 1. Get active items, sorted by oldest first (FIFO)
        # REMOVED 'created_at' and 'id' to fix database errors
        cur.execute("""
            SELECT synergy_code, ebay_item_id, posted_at, status, ebay_price
            FROM inventory_items 
            WHERE purchase_order_id = %s 
              AND ebay_item_id IS NOT NULL 
              AND status = 'POSTED'
            ORDER BY posted_at ASC
        """, (po_id,))
        
        active_items = cur.fetchall()
        
        # Timestamp update
        try:
            cur.execute("UPDATE purchase_orders SET last_reconciled_at = NOW() WHERE id = %s", (po_id,))
            con.commit()
        except: pass

        if not active_items:
            return {"ok": True, "updated": 0, "message": "No active posted items to check."}

        # Group by eBay ID
        by_ebay_id = {}
        for item in active_items:
            eid = item['ebay_item_id']
            if eid not in by_ebay_id:
                by_ebay_id[eid] = []
            by_ebay_id[eid].append(item)

        token = get_ebay_token()
        if not token:
             return {"ok": False, "error": "No eBay User Token available."}

        for ebay_id, items in by_ebay_id.items():
            try:
                # 2. Fetch Recent Transactions (Sales) from eBay
                # We look back 30 days.
                
                # XML Request for GetItemTransactions
                # Ensure UTC awareness
                start_time = (datetime.now(timezone.utc) - timedelta(days=30)).strftime('%Y-%m-%dT%H:%M:%S.000Z')
                
                xml = f"""<?xml version="1.0" encoding="utf-8"?>
                <GetItemTransactionsRequest xmlns="urn:ebay:apis:eBLBaseComponents">
                  <ItemID>{ebay_id}</ItemID>
                  <ModTimeFrom>{start_time}</ModTimeFrom>
                  <DetailLevel>ReturnAll</DetailLevel>
                </GetItemTransactionsRequest>"""

                r = requests.post(
                    EBAY_TRADING_ENDPOINT,
                    headers={
                        "X-EBAY-API-CALL-NAME": "GetItemTransactions",
                        "X-EBAY-API-SITEID": "0",
                        "X-EBAY-API-COMPATIBILITY-LEVEL": "1193",
                        "X-EBAY-API-IAF-TOKEN": token,
                        "Content-Type": "text/xml",
                    },
                    data=xml.encode("utf-8"),
                    timeout=20
                )
                
                if r.status_code != 200:
                    print(f"eBay API Error {r.status_code}")
                    continue

                root = ET.fromstring(r.text)
                
                # Parse Transactions
                sales_events = []
                for trans in root.findall(".//e:Transaction", EBAY_NS):
                    created_date_str = getattr(trans.find("e:CreatedDate", EBAY_NS), 'text', None)
                    amt_node = trans.find("e:AmountPaid", EBAY_NS)
                    amt = float(amt_node.text) if amt_node is not None else 0.0
                    qty_node = trans.find("e:QuantityPurchased", EBAY_NS)
                    qty = int(qty_node.text) if qty_node is not None else 1
                    
                    if created_date_str:
                        # Convert eBay Time string to datetime object
                        # Format: 2025-12-30T15:00:00.000Z
                        try:
                            # Strip milliseconds if present for strptime, or handle Z
                            clean_date = created_date_str.split('.')[0].replace('Z', '')
                            sale_dt = datetime.strptime(clean_date, "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)
                            
                            sales_events.append({
                                "date": sale_dt,
                                "price": amt,
                                "qty": qty
                            })
                        except Exception as e:
                            print(f"Date parse error: {e}")

                # Sort sales by date (Oldest first)
                sales_events.sort(key=lambda x: x['date'])

                # 3. Matching Logic
                for sale in sales_events:
                    units_sold_in_transaction = sale['qty']
                    eligible_indices = []
                    
                    for idx, item in enumerate(items):
                        # Determine when this item became "trackable"
                        # Use posted_at. If missing (rare), assume item is old enough (min date).
                        item_start_time = item.get('posted_at')
                        
                        if not item_start_time:
                            # If no posted_at, we can't reliably time-match, so we skip precise matching
                            # or assume it's eligible. Let's assume eligible if missing.
                            item_start_time = datetime.min.replace(tzinfo=timezone.utc)
                        
                        # Ensure timezone awareness
                        if item_start_time.tzinfo is None:
                            item_start_time = item_start_time.replace(tzinfo=timezone.utc)
                        
                        # CHECK: Was item posted BEFORE sale happened? (+15min buffer)
                        if item_start_time < (sale['date'] + timedelta(minutes=15)):
                            eligible_indices.append(idx)
                            if len(eligible_indices) == units_sold_in_transaction:
                                break
                    
                    # Mark matched items as sold
                    # Process in reverse order to pop safely
                    for idx in sorted(eligible_indices, reverse=True):
                        matched_item = items.pop(idx) 
                        
                        # Unit price logic
                        unit_price = sale['price'] / sale['qty'] if sale['qty'] > 0 else sale['price']

                        cur.execute("""
                            UPDATE inventory_items 
                            SET status = 'SOLD', 
                                sold_at = %s,
                                sold_price = %s 
                            WHERE synergy_code = %s
                        """, (
                            sale['date'],
                            unit_price,
                            matched_item['synergy_code']
                        ))
                        updated_count += 1
                        print(f"Matched Sale: {matched_item['synergy_code']} -> Sold at {sale['date']}")

            except Exception as e:
                print(f"Error reconciling eBay ID {ebay_id}: {e}")
                continue

        con.commit()
        return {"ok": True, "updated": updated_count}
@router.get("/pos/active")
def get_active_pos_for_testers():
    """
    Returns a list of Purchase Orders that have active inventory items.
    Safe for Testers: Excludes cost data and only shows POs with generated items.
    """
    with db() as (con, cur):
        # Changed COUNT(i.id) to COUNT(*) to avoid "column i.id does not exist" error
        cur.execute("""
            SELECT 
                p.id, 
                p.po_number, 
                v.name AS vendor_name, 
                p.created_at,
                COUNT(*) AS inventory_count
            FROM purchase_orders p
            LEFT JOIN vendors v ON v.id = p.vendor_id
            JOIN inventory_items i ON i.purchase_order_id = p.id
            GROUP BY p.id, p.po_number, v.name, p.created_at
            HAVING COUNT(*) > 0
            ORDER BY p.created_at DESC
        """)
        return [dict(r) for r in cur.fetchall()]

    # --- Analytics ---
@router.get("/analytics/daily-sales")
def analytics_daily_sales(
    _auth: int = Depends(require_manager_role)
):
    with db() as (con, cur):
        # 1. Totals for "Today" (UTC/Server Time)
        cur.execute("""
            SELECT 
                COUNT(*) as total_items,
                COALESCE(SUM(COALESCE(sold_price, ebay_price, price, 0)), 0) as total_revenue
            FROM inventory_items 
            WHERE status = 'SOLD' 
              AND sold_at::date = CURRENT_DATE
        """)
        totals = cur.fetchone()
        
        if not totals:
            totals = {"total_items": 0, "total_revenue": 0}

        # 2. Top POs
        cur.execute("""
            SELECT 
                p.id as po_id,
                p.po_number,
                COUNT(*) as items_sold,
                COALESCE(SUM(COALESCE(i.sold_price, i.ebay_price, i.price, 0)), 0) as revenue
            FROM inventory_items i
            JOIN purchase_orders p ON p.id = i.purchase_order_id
            WHERE i.status = 'SOLD' 
              AND i.sold_at::date = CURRENT_DATE
            GROUP BY p.id, p.po_number
            ORDER BY revenue DESC
            LIMIT 5
        """)
        top_pos = [dict(r) for r in cur.fetchall()]

        # 3. Recent Sales Feed
        cur.execute("""
            SELECT 
                COALESCE(pl.product_name_raw, 'Unknown Item') as title,
                COALESCE(i.sold_price, i.ebay_price, i.price, 0) as amount,
                to_char(i.sold_at, 'HH12:MI AM') as time,
                p.po_number
            FROM inventory_items i
            LEFT JOIN po_lines pl ON pl.id = i.po_line_id
            LEFT JOIN purchase_orders p ON p.id = i.purchase_order_id
            WHERE i.status = 'SOLD' 
              AND i.sold_at::date = CURRENT_DATE
            ORDER BY i.sold_at DESC
            LIMIT 50
        """)
        recent_sales = [dict(r) for r in cur.fetchall()]

        return {
            "total_revenue": float(totals["total_revenue"] or 0),
            "total_items": int(totals["total_items"] or 0),
            "top_pos": top_pos,
            "recent_sales": recent_sales
        }

# --- AUTOMATION UTILS ---

def run_global_ebay_sync():
    """
    Finds all Purchase Orders that have active (un-sold) eBay items
    and reconciles them. This is meant to be run by a background scheduler.
    """
    print("[Auto-Sync] Starting global eBay reconciliation...")
    try:
        # 1. Find all POs that have items listed on eBay but not marked SOLD
        with db() as (con, cur):
            cur.execute("""
                SELECT DISTINCT purchase_order_id 
                FROM inventory_items 
                WHERE ebay_item_id IS NOT NULL 
                  AND status <> 'SOLD'
            """)
            active_pos = [str(r['purchase_order_id']) for r in cur.fetchall()]

        print(f"[Auto-Sync] Found {len(active_pos)} active POs to check.")

        # 2. Loop through them and run the existing reconcile logic
        # Note: This reuses your existing 'reconcile_po_sales' function
        for po_id in active_pos:
            try:
                # We call the function directly (not via HTTP)
                result = reconcile_po_sales(po_id)
                if result.get('updated', 0) > 0:
                    print(f"[Auto-Sync] PO {po_id}: Detect {result['updated']} new sales.")
            except Exception as e:
                print(f"[Auto-Sync] Failed to reconcile PO {po_id}: {e}")
                
        print("[Auto-Sync] Completed.")
        
    except Exception as e:
        print(f"[Auto-Sync] Critical Error: {e}")


# ... existing imports

@router.get("/analytics/weekly-pulse")
def analytics_weekly_pulse(_auth: int = Depends(require_manager_role)):
    with db() as (con, cur):
        # 1. Weekly Totals
        cur.execute("""
            SELECT 
                COUNT(*) as total_items,
                COALESCE(SUM(sold_price), 0) as total_revenue
            FROM inventory_items 
            WHERE status = 'SOLD' 
              AND sold_at >= CURRENT_DATE - INTERVAL '6 days'
        """)
        totals = cur.fetchone()

        # 2. Daily Breakdown (Ensuring all 7 days are represented is better done in frontend or complex SQL, keeping simple here)
        cur.execute("""
            SELECT 
                TO_CHAR(sold_at, 'Mon DD') as day_label,
                TO_CHAR(sold_at, 'YYYY-MM-DD') as date_sort,
                SUM(sold_price) as daily_rev
            FROM inventory_items
            WHERE status = 'SOLD' 
              AND sold_at >= CURRENT_DATE - INTERVAL '6 days'
            GROUP BY 1, 2
            ORDER BY 2 ASC
        """)
        chart_data = [dict(r) for r in cur.fetchall()]

        # 3. Top Sellers (Now with Image!)
        # We use MAX(ebay_thumbnail) to pick one image for the product group
        cur.execute("""
            SELECT 
                pl.product_name_raw as name,
                COUNT(*) as qty,
                SUM(i.sold_price) as rev,
                MAX(i.ebay_thumbnail) as thumbnail
            FROM inventory_items i
            JOIN po_lines pl ON i.po_line_id = pl.id
            WHERE i.status = 'SOLD' 
              AND i.sold_at >= CURRENT_DATE - INTERVAL '30 days' -- Widened window for 'Top Movers' context
            GROUP BY pl.product_name_raw
            ORDER BY rev DESC
            LIMIT 4
        """)
        top_items = [dict(r) for r in cur.fetchall()]

        return {
            "revenue": float(totals['total_revenue'] or 0),
            "units": int(totals['total_items'] or 0),
            "chart": chart_data,
            "top_items": top_items
        }