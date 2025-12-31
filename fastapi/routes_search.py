import re
import logging
from fastapi import APIRouter, Query, HTTPException
from db_utils import db

router = APIRouter()
log = logging.getLogger(__name__)

@router.get("/search")
def global_search(q: str = Query(..., min_length=2)):
    try:
        if not q:
            return {"vendors": [], "pos": [], "lines": []}
        
        needle = f"%{q}%"

        with db() as (con, cur):
            # --- START OF CHANGE: ENHANCED VENDORS QUERY ---
            cur.execute("""
                SELECT v.id, v.name, COUNT(p.id) as po_count
                FROM vendors v
                LEFT JOIN purchase_orders p ON p.vendor_id = v.id
                WHERE v.name ILIKE %s
                GROUP BY v.id, v.name
                ORDER BY v.name
                LIMIT 5
            """, (needle,))
            vendors = [dict(r) for r in cur.fetchall()]
            # --- END OF CHANGE ---

            # --- START OF CHANGE: ENHANCED PURCHASE ORDERS QUERY ---
            cur.execute("""
                SELECT 
                    p.id, 
                    p.po_number, 
                    COALESCE(v.name, 'Unknown Vendor') as vendor_name,
                    p.created_at,
                    COALESCE(s.total_lines_qty, 0) as total_lines_qty,
                    COALESCE(s.est_cost, 0) as est_cost
                FROM purchase_orders p
                LEFT JOIN vendors v ON p.vendor_id = v.id
                LEFT JOIN (
                    SELECT 
                        purchase_order_id,
                        SUM(qty) as total_lines_qty,
                        SUM(qty * unit_cost) as est_cost
                    FROM po_lines
                    GROUP BY purchase_order_id
                ) s ON s.purchase_order_id = p.id
                WHERE COALESCE(p.po_number, '') ILIKE %s
                ORDER BY p.created_at DESC
                LIMIT 10
            """, (needle,))
            pos = [dict(r) for r in cur.fetchall()]
            # --- END OF CHANGE ---

            # --- START OF CHANGE: ENHANCED LINES QUERY ---
            cur.execute("""
                SELECT
                    pl.id AS line_id,
                    pl.purchase_order_id AS po_id,
                    p.po_number,
                    v.name as vendor_name,
                    pl.product_name_raw,
                    pl.synergy_id,
                    pl.upc,
                    pl.asin,
                    pl.qty,
                    pl.unit_cost,
                    'line' as type
                FROM po_lines pl
                JOIN purchase_orders p ON pl.purchase_order_id = p.id
                LEFT JOIN vendors v ON p.vendor_id = v.id
                WHERE 
                    COALESCE(pl.product_name_raw, '') ILIKE %s OR
                    COALESCE(pl.synergy_id, '') ILIKE %s OR
                    COALESCE(pl.upc, '') ILIKE %s OR
                    COALESCE(pl.asin, '') ILIKE %s
                ORDER BY p.created_at DESC, pl.id
                LIMIT 25
            """, (needle, needle, needle, needle))
            lines = [dict(r) for r in cur.fetchall()]
            # --- END OF CHANGE ---

        return {"vendors": vendors, "pos": pos, "lines": lines}

    except Exception as e:
        log.exception("An error occurred in the global_search endpoint")
        raise HTTPException(status_code=500, detail="An internal server error occurred during search.")