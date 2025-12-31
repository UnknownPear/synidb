# routes_category_vendor.py

import os
from uuid import UUID
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Query, Body, Header
from pydantic import BaseModel, HttpUrl
import psycopg2

from db_utils import db

router = APIRouter()

# --- Categories ---
class CategoryBody(BaseModel):
    label: str
    prefix: str
    notes: Optional[str] = None
    icon: Optional[str] = "box"     
    color: Optional[str] = "slate"  

@router.get("/categories")
def categories_list():
    with db() as (con, cur):
        cur.execute("SELECT id, label, prefix, notes, icon_key as icon, color_key as color FROM categories ORDER BY label;")
        return [dict(r) for r in cur.fetchall()]

@router.post("/categories")
def categories_create(body: CategoryBody):
    with db() as (con, cur):
        cur.execute(
            """
            INSERT INTO categories(label, prefix, notes, icon_key, color_key) 
            VALUES (%s, %s, %s, %s, %s) 
            RETURNING id, label, prefix, notes, icon_key as icon, color_key as color
            """,
            (body.label, body.prefix, body.notes, body.icon, body.color),
        )
        con.commit()
        return dict(cur.fetchone())

@router.patch("/categories/{cat_id}")
def categories_patch(cat_id: str, body: dict = Body(...)):
    fields, vals = [], []
    
    # Map API keys to DB columns
    mapping = {
        "label": "label", "prefix": "prefix", "notes": "notes",
        "icon": "icon_key", "color": "color_key"
    }

    for k, db_col in mapping.items():
        if k in body:
            fields.append(f"{db_col}=%s")
            vals.append(body[k])

    if not fields:
        raise HTTPException(400, "no fields")
    
    vals.append(cat_id)
    with db() as (con, cur):
        cur.execute(
            f"UPDATE categories SET {', '.join(fields)} WHERE id=%s RETURNING id, label, prefix, notes, icon_key as icon, color_key as color",
            vals,
        )
        if cur.rowcount == 0: raise HTTPException(404, "not found")
        con.commit()
        return dict(cur.fetchone())

@router.delete("/categories/{cat_id}")
def categories_delete(cat_id: str):
    with db() as (con, cur):
        cur.execute("DELETE FROM categories WHERE id=%s", (cat_id,))
        con.commit()
        return {"ok": cur.rowcount > 0}
    
@router.get("/categories/summary")
def get_category_summary(x_user_id: Optional[str] = Header(None, alias="X-User-ID")):
    with db() as (con, cur):
        is_manager = False
        if x_user_id:
            cur.execute("SELECT roles FROM app_users WHERE id = %s", (x_user_id,))
            u = cur.fetchone()
            if u and ('manager' in u['roles'] or 'admin' in u['roles']):
                is_manager = True

        cur.execute("""
            SELECT
                c.id,
                c.label,
                c.prefix,
                c.icon_key as icon,
                c.color_key as color,
                COUNT(pl.id) AS total_lines,
                COALESCE(SUM(pl.qty), 0) AS total_units,
                COALESCE(SUM(pl.qty * pl.unit_cost), 0) AS total_cost
            FROM categories c
            LEFT JOIN po_lines pl ON c.id = pl.category_guess
            GROUP BY c.id, c.label, c.prefix
            ORDER BY total_cost DESC, total_units DESC, c.label ASC;
        """)
        results = [dict(r) for r in cur.fetchall()]
        
        if not is_manager:
            for r in results:
                r['total_cost'] = 0
                
        return results

# --- Vendors ---
class VendorIn(BaseModel):
    name: str

class VendorUpdate(BaseModel):
    name: str

@router.get("/vendors")
def vendors_list(q: Optional[str] = Query(None)):
    with db() as (con, cur):
        if q:
            cur.execute("""
                SELECT v.id, v.name, COALESCE(COUNT(p.id),0) AS po_count
                FROM vendors v
                LEFT JOIN purchase_orders p ON p.vendor_id = v.id
                WHERE v.name ILIKE %s
                GROUP BY v.id, v.name
                ORDER BY v.name ASC
            """, (f"%{q}%",))
        else:
            cur.execute("""
                SELECT v.id, v.name, COALESCE(COUNT(p.id),0) AS po_count
                FROM vendors v
                LEFT JOIN purchase_orders p ON p.vendor_id = v.id
                GROUP BY v.id, v.name
                ORDER BY v.name ASC
            """)
        return [dict(r) for r in cur.fetchall()]

@router.post("/vendors")
def create_vendor(body: VendorIn):
    with db() as (con, cur):
        cur.execute("""
            INSERT INTO vendors (name) VALUES (%s)
            ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
            RETURNING id, name;
        """, (body.name.strip(),))
        con.commit()
        return dict(cur.fetchone())

@router.patch("/vendors/{vendor_id}")
def update_vendor(vendor_id: str, body: VendorUpdate):
    with db() as (con, cur):
        cur.execute("""
            UPDATE vendors SET name = %s
            WHERE id = %s
            RETURNING id, name;
        """, (body.name.strip(), vendor_id))
        con.commit()
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Vendor not found")
        return dict(row)

@router.delete("/vendors/{vendor_id}")
def delete_vendor(vendor_id: str):
    with db() as (con, cur):
        try:
            cur.execute("DELETE FROM vendors WHERE id = %s RETURNING id;", (vendor_id,))
            con.commit()
        except Exception as e:
            raise HTTPException(409, f"Cannot delete vendor with existing POs: {e}")
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Vendor not found")
        return {"ok": True, "id": row["id"]}

@router.get("/vendors/{vendor_id}/pos")
def vendor_pos(vendor_id: str):
    with db() as (con, cur):
        cur.execute("""
            SELECT p.id, p.po_number,
                   COALESCE(SUM(pl.qty),0) AS total_lines_qty,
                   COALESCE(SUM(pl.qty * COALESCE(pl.unit_cost,0)),0)::numeric(12,2) AS est_cost
            FROM purchase_orders p
            LEFT JOIN po_lines pl ON pl.purchase_order_id = p.id
            WHERE p.vendor_id = %s
            GROUP BY p.id, p.po_number
            ORDER BY p.po_number DESC NULLS LAST, p.id DESC
        """, (vendor_id,))
        return [dict(r) for r in cur.fetchall()]