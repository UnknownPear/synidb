import re
import json
import os
from uuid import UUID
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Header, Query, Body, Path, Depends, status
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import psycopg2.extras
from pydantic import BaseModel
import requests
import jwt

from db_utils import db, to_num, to_ymd, is_uuid_like, _uuid_list
from pubsub_utils import _broadcast
from ebay_utils import _parse_ebay_legacy_id, get_ebay_token, session, EBAY_MARKETPLACE_ID
from config import CONNECT_TIMEOUT, READ_TIMEOUT
from ai_utils import generate_ebay_listing_content 

# --- AUTH CONFIG (Matches Admin Router) ---
JWT_SECRET = os.getenv("JWT_SECRET", "unsafe_default_secret")
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
security = HTTPBearer(auto_error=False)

router = APIRouter()

# --- Shared Models ---
class RowPatch(BaseModel):
    grade: Optional[str] = None
    testedBy: Optional[str] = None
    testedDate: Optional[str] = None
    testerComment: Optional[str] = None
    specs: Optional[dict] = None
    price: Optional[float] = None
    ebayPrice: Optional[float] = None
    categoryId: Optional[str] = None
    postedAt: Optional[str] = None
    postedBy: Optional[str] = None
    ebayItemUrl: Optional[str] = None
    status: Optional[str] = None
    purchaseCost: Optional[float] = None
    partStatus: Optional[str] = None

class PostedSearch(BaseModel):
    productName: Optional[str] = None
    grade: Optional[str] = None

class AssocBody(BaseModel):
    synergyId: str
    ebayUrl: str

class EbaySyncBody(BaseModel):
    synergyId: str
    ebayUrl: str

class SmartMatchRequest(BaseModel):
    product_name: str

# --- AUTH HELPER (Hybrid JWT + Legacy) ---
def verify_token(token: str):
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        return payload
    except Exception:
        return None

def get_current_user_id(
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
    token_auth: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> int:
    # 1. Try JWT (Production Secure)
    if token_auth:
        payload = verify_token(token_auth.credentials)
        if payload:
            return int(payload["sub"])
    
    # 2. Try Legacy Header (Local/Fallback)
    # Check if debug mode allows this
    is_debug = os.getenv("DEBUG", "False").lower() in ("true", "1", "t")
    if is_debug or (x_user_id and str(x_user_id).isdigit()):
        # We allow this in prod ONLY if the frontend hasn't upgraded yet
        # Once frontend is 100% JWT, you can wrap this in `if is_debug:`
        if x_user_id and str(x_user_id).isdigit():
            return int(x_user_id)

    return 0

# --- ROUTES ---

@router.get("/rows")
def rows_list(
    q: Optional[str] = Query(None, description="Free text across synergy_code, product_name_raw, specs"),
    grade: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    categoryId: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    po_id: Optional[str] = Query(None, description="Filter by Purchase Order ID"),
    ebayItemId: Optional[str] = Query(None, description="Filter inventory by eBay item id"),
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    user_id: int = Depends(get_current_user_id) # Using Hybrid Auth
):
    if categoryId and not category: 
        category = categoryId
        
    with db() as (con, cur):
        # 1. CHECK PERMISSIONS
        is_manager = False
        if user_id:
            cur.execute("SELECT roles FROM app_users WHERE id = %s", (user_id,))
            user_row = cur.fetchone()
            if user_row:
                roles = [r.lower() for r in (user_row.get('roles') or [])]
                if 'manager' in roles or 'admin' in roles:
                    is_manager = True

        base_sql = """
            SELECT 
              i.synergy_code AS "synergyId", 
              COALESCE(pl.product_name_raw, '') AS "productName",
              COALESCE(i.category_id, pl.category_guess) AS "categoryId", 
              i.status AS "status", 
              %(empty_json)s::jsonb AS "attrs",
              COALESCE(NULLIF(i.cost_unit, 0), pl.unit_cost, 0) AS "purchaseCost", 
              COALESCE(pl.qty, 1) AS "qty", 
              COALESCE(i.msrp, pl.msrp, 0) AS "msrp",
              i.purchase_order_id AS "poId", 
              i.po_line_id AS "lineId", 
              i.grade AS "grade", 
              i.tested_by AS "testedBy",
              i.tested_date AS "testedDate", 
              i.tester_comment AS "testerComment", 
              i.posted_at AS "postedAt",
              i.posted_by::text AS "postedBy", 
              i.ebay_item_url AS "ebayItemUrl",
              i.ebay_thumbnail AS "ebayThumbnail",
              i.ebay_sku AS "ebaySku",
              COALESCE(i.specs, %(empty_json)s::jsonb) AS "specs", 
              COALESCE(i.price, 0) AS "price", 
              COALESCE(i.ebay_price, 0) AS "ebayPrice",
              COALESCE(i.sold_price, 0) AS "soldPrice",
              c.label AS "categoryLabel", 
              c.prefix AS "categoryPrefix",
              COALESCE(c.icon_key, 'box') AS "categoryIcon",
              COALESCE(c.color_key, 'slate') AS "categoryColor",
              i.last_printed_at as "lastPrintedAt",
              pl.upc AS "upc", 
              pl.asin AS "asin",
              i.part_status AS "partStatus"
            FROM public.inventory_items i
            LEFT JOIN po_lines pl ON pl.id = i.po_line_id
            LEFT JOIN categories c ON c.id = COALESCE(i.category_id, pl.category_guess)
        """

        where: list[str] = []
        params: dict[str, object] = {"limit": limit, "offset": offset, "empty_json": "{}"}

        # Status Logic
        ready_sql = "(i.grade IS NOT NULL AND i.tested_by IS NOT NULL AND (i.tested_date IS NOT NULL OR i.tested_at IS NOT NULL))"
        if status == "ready": where.append(ready_sql)
        elif status == "incomplete": where.append(f"NOT {ready_sql}")
        elif status == "ALL": pass 
        elif status: where.append("i.status = %(status)s"); params["status"] = status
        else: where.append("i.status IN ('INTAKE','TESTING','READY','HOLD','TESTED','IN_STORE')")

        if grade: where.append("i.grade = %(grade)s"); params["grade"] = grade

        if po_id:
            if is_uuid_like(po_id): where.append("i.purchase_order_id = %(po_id)s::uuid"); params["po_id"] = po_id
            else: where.append("1=0")

        if category:
            if str(category).upper() == "UNASSIGNED": where.append("COALESCE(i.category_id, pl.category_guess) IS NULL")
            elif is_uuid_like(category): where.append("COALESCE(i.category_id, pl.category_guess) = %(category_uuid)s::uuid"); params["category_uuid"] = category
            else: where.append("(c.label ILIKE %(cat_like)s ESCAPE '\\' OR c.prefix ILIKE %(cat_like)s ESCAPE '\\')"); params["cat_like"] = f"%{category}%"

        if ebayItemId:
            where.append("i.ebay_item_id = %(ebay_item_id)s"); params["ebay_item_id"] = ebayItemId

        if q:
            if re.match(r'^[A-Z]{2,4}-\d+$', q.strip().upper()):
                where.append("i.synergy_code = %(exact_code)s")
                params["exact_code"] = q.strip().upper()
            else:
                needle = f"%{q}%"
                params["needle"] = needle
                where.append("""
                    (i.synergy_code ILIKE %(needle)s ESCAPE '\\' 
                     OR pl.product_name_raw ILIKE %(needle)s ESCAPE '\\' 
                     OR CAST(i.specs AS text) ILIKE %(needle)s ESCAPE '\\'
                     OR pl.upc ILIKE %(needle)s ESCAPE '\\'
                     OR pl.asin ILIKE %(needle)s ESCAPE '\\'
                     OR i.tester_comment ILIKE %(needle)s ESCAPE '\\')
                """)

        sql = f"""{base_sql} WHERE {" AND ".join(where) if where else "TRUE"}
            ORDER BY i.synergy_code LIMIT %(limit)s OFFSET %(offset)s
        """

        cur.execute(sql, params)
        results = [dict(r) for r in cur.fetchall()]

        # 2. REDACT FINANCIALS (But keep IDs)
        if not is_manager:
            for row in results:
                # We overwrite the sensitive costs with 0. 
                # This protects the business data while keeping the app functional.
                row["purchaseCost"] = 0
                row["soldPrice"] = 0
                row["msrp"] = 0

        return results

@router.patch("/rows/{synergy_id}")
def rows_patch(synergy_id: str, body: RowPatch):
    if not synergy_id: raise HTTPException(400, "Missing synergyId")

    mapping = {"grade": "grade", "testedBy": "tested_by", "testedDate": "tested_date", "testerComment": "tester_comment",
               "specs": "specs", "price": "price", "ebayPrice": "ebay_price", "categoryId": "category_id",
               "postedAt": "posted_at", "postedBy": "posted_by", "ebayItemUrl": "ebay_item_url", "status": "status",
               "purchaseCost": "cost_unit", "partStatus": "part_status"}
    
    ALLOWED_COLS = {
        "grade", "tested_by", "tested_date", "tester_comment", "specs", "price", 
        "ebay_price", "category_id", "posted_at", "posted_by", "ebay_item_url", 
        "status", "cost_unit", "part_status"
    }

    data = body.model_dump(exclude_unset=True)

    fields, vals = [], []
    for k, v in data.items():
        col = mapping.get(k)
        if not col: continue
        
        if col not in ALLOWED_COLS:
            continue

        if col == "tested_date": fields.append(f"{col} = %s::date"); vals.append(to_ymd(v))
        elif col == "posted_at": fields.append(f"{col} = %s::timestamptz"); vals.append(v or None)
        elif col in ("price","ebay_price","cost_unit"): fields.append(f"{col} = %s"); vals.append(to_num(v))
        elif col == "category_id": fields.append(f"{col} = %s::uuid"); vals.append(str(UUID(str(v))) if v else None)
        elif col == "specs": fields.append(f"{col} = %s::jsonb"); vals.append(json.dumps(v or {}))
        else: fields.append(f"{col} = %s"); vals.append(v if v != "" else None)

    if not fields: return {"ok": True, "updated": 0}

    where_sql, key_vals = ("WHERE synergy_id = %s::uuid", [synergy_id]) if is_uuid_like(synergy_id) else ("WHERE synergy_code = %s", [synergy_id])
    
    update_sql = f"UPDATE public.inventory_items SET {', '.join(fields)} {where_sql}"

    with db() as (con, cur):
        cur.execute(update_sql, vals + key_vals)
        if cur.rowcount == 0: raise HTTPException(404, f"No row found for '{synergy_id}'")
        
        select_sql = f"""
            SELECT i.synergy_code AS "synergyId", COALESCE(pl.product_name_raw, '') AS "productName", i.category_id AS "categoryId", i.status AS "status",
                   %s::jsonb AS "attrs", COALESCE(NULLIF(i.cost_unit, 0), pl.unit_cost, 0) AS "purchaseCost", COALESCE(pl.qty, 1) AS "qty", COALESCE(i.msrp, pl.msrp, 0) AS "msrp",
                   i.purchase_order_id AS "poId", i.po_line_id AS "lineId", i.grade AS "grade", i.tested_by AS "testedBy", i.tested_date AS "testedDate",
                   i.tester_comment AS "testerComment", COALESCE(i.specs, %s::jsonb) AS "specs", COALESCE(i.price, 0) AS "price",
                   COALESCE(i.ebay_price, 0) AS "ebayPrice", i.posted_at AS "postedAt", i.posted_by::text AS "postedBy", i.ebay_item_url AS "ebayItemUrl",
                   i.last_printed_at as "lastPrintedAt", pl.upc AS "upc", pl.asin AS "asin", i.part_status AS "partStatus"
            FROM public.inventory_items i LEFT JOIN po_lines pl ON pl.id = i.po_line_id {where_sql}
        """
        cur.execute(select_sql, ["{}", "{}"] + key_vals)
        row = cur.fetchone()
        if row: _broadcast("row.upserted", dict(row))
        return {"ok": True, "updated": 1}
    
@router.post("/rows/{synergy_id}/record-print")
def record_print_for_row(synergy_id: str):
    if not synergy_id:
        raise HTTPException(400, "Missing synergyId")

    where_sql, key_vals = ("WHERE synergy_id = %s::uuid", [synergy_id]) if is_uuid_like(synergy_id) else ("WHERE synergy_code = %s", [synergy_id])
    update_sql = f"UPDATE public.inventory_items SET last_printed_at = NOW() {where_sql}"

    with db() as (con, cur):
        cur.execute(update_sql, key_vals)
        if cur.rowcount == 0:
            raise HTTPException(404, f"No inventory item found for '{synergy_id}'")
    
    return {"ok": True, "synergyId": synergy_id}

@router.post("/rows/brief")
def rows_brief_post(body: Dict[str, List[str]] = Body(...)):
    arr: List[str] = body.get("ids", [])
    if not arr: 
        return []

    arr = [s for s in arr if s]
    if not arr:
        return []

    out: List[Dict] = []
    with db() as (_, cur):
        cur.execute(
            """
            WITH agg AS (
              SELECT
                pl.synergy_id::text AS "synergyId",
                MAX(i.status) AS real_status,
                MAX(i.grade) FILTER (WHERE i.grade IS NOT NULL) AS grade,
                MAX(i.tested_by::text) AS "testedById",
                MAX(i.tested_date) AS tested_date,
                COALESCE(BOOL_OR(COALESCE(i.ebay_item_url,'') <> '' OR i.posted_at IS NOT NULL OR i.posted_by IS NOT NULL), FALSE) AS posted,
                MAX(i.posted_at) AS "postedAt",
                MAX(i.posted_by::text) AS "postedById",
                MAX(i.ebay_price) AS "ebayPrice",
                MAX(i.ebay_item_url) AS "ebayItemUrl",
                MAX(i.part_status) AS "partStatus",
                MAX(i.ebay_thumbnail) AS "ebayThumbnail"
              FROM public.po_lines pl
              LEFT JOIN public.inventory_items i ON i.po_line_id = pl.id
              WHERE pl.synergy_id = ANY(%s)
              GROUP BY pl.synergy_id
            )
            SELECT
              a."synergyId",
              COALESCE(
                  a.real_status, 
                  CASE WHEN a.grade IS NOT NULL AND a."testedById" IS NOT NULL AND a.tested_date IS NOT NULL THEN 'TESTED' ELSE 'UNTESTED' END
              ) AS status,
              a.grade,
              a."testedById" AS "testedBy",
              COALESCE(tester.name, a."testedById") AS "testedByName",
              TO_CHAR(a.tested_date, 'YYYY-MM-DD') AS "testedDate",
              a.posted,
              a."postedAt",
              a."postedById" AS "postedBy",
              COALESCE(poster.name, a."postedById") AS "postedByName",
              a."ebayPrice",
              a."ebayItemUrl",
              a."partStatus",
              a."ebayThumbnail"
            FROM agg a
            LEFT JOIN app_users tester ON CASE WHEN a."testedById" ~ '^[0-9]+$' THEN tester.id = CAST(a."testedById" AS INTEGER) ELSE FALSE END
            LEFT JOIN app_users poster ON CASE WHEN a."postedById" ~ '^[0-9]+$' THEN poster.id = CAST(a."postedById" AS INTEGER) ELSE FALSE END
            """, (arr,)
        )
        line_rows = [dict(r) for r in cur.fetchall()]
        out.extend(line_rows)
        
    return out

@router.get("/rows/count")
def rows_count(
    q: Optional[str] = Query(None),
    grade: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    categoryId: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    po_id: Optional[str] = Query(None),
    ebayItemId: Optional[str] = Query(None)
):
    if categoryId and not category: category = categoryId
    
    with db() as (con, cur):
        where = []
        params = {}

        ready_sql = "(i.grade IS NOT NULL AND i.tested_by IS NOT NULL AND (i.tested_date IS NOT NULL OR i.tested_at IS NOT NULL))"
        if status == "ready": where.append(ready_sql)
        elif status == "incomplete": where.append(f"NOT {ready_sql}")
        elif status == "ALL": pass 
        elif status: 
            where.append("i.status = %(status)s")
            params["status"] = status
        else: 
            where.append("i.status IN ('INTAKE','TESTING','READY','HOLD','TESTED')")

        if grade: 
            where.append("i.grade = %(grade)s")
            params["grade"] = grade

        if po_id:
            if is_uuid_like(po_id):
                where.append("i.purchase_order_id = %(po_id)s::uuid")
                params["po_id"] = po_id
            else:
                where.append("1=0")

        if category:
            if str(category).upper() == "UNASSIGNED":
                 where.append("COALESCE(i.category_id, pl.category_guess) IS NULL")
            elif is_uuid_like(category):
                where.append("COALESCE(i.category_id, pl.category_guess) = %(category_uuid)s::uuid")
                params["category_uuid"] = category
            else:
                cat_like = "%" + str(category).replace("%", r"\%").replace("_", r"\_") + "%"
                where.append("(c.label ILIKE %(cat_like)s ESCAPE '\\' OR c.prefix ILIKE %(cat_like)s ESCAPE '\\')")
                params["cat_like"] = cat_like

        if ebayItemId:
            where.append("i.ebay_item_id = %(ebay_item_id)s")
            params["ebay_item_id"] = ebayItemId

        if q:
            needle = "%" + q.replace("%", r"\%").replace("_", r"\_") + "%"
            params["needle"] = needle
            where.append("""
                (i.synergy_code ILIKE %(needle)s ESCAPE '\\' 
                 OR pl.product_name_raw ILIKE %(needle)s ESCAPE '\\' 
                 OR CAST(i.specs AS text) ILIKE %(needle)s ESCAPE '\\'
                 OR pl.upc ILIKE %(needle)s ESCAPE '\\'
                 OR pl.asin ILIKE %(needle)s ESCAPE '\\'
                 OR i.tester_comment ILIKE %(needle)s ESCAPE '\\')
            """)

        sql = f"""
            SELECT COUNT(*) AS total 
            FROM public.inventory_items i
            LEFT JOIN po_lines pl ON pl.id = i.po_line_id
            LEFT JOIN categories c ON c.id = COALESCE(i.category_id, pl.category_guess)
            WHERE {" AND ".join(where) if where else "TRUE"}
        """
        
        cur.execute(sql, params)
        return {"total": int(cur.fetchone()["total"])}

@router.get("/rows/counts")
def rows_counts():
    sql = """
      SELECT COUNT(*) AS total,
        COUNT(*) FILTER (WHERE grade IS NOT NULL AND tested_by IS NOT NULL AND (tested_date IS NOT NULL OR tested_at IS NOT NULL)) AS ready,
        COUNT(*) FILTER (WHERE NOT (grade IS NOT NULL AND tested_by IS NOT NULL AND (tested_date IS NOT NULL OR tested_at IS NOT NULL))) AS incomplete,
        COUNT(*) FILTER (WHERE tested_date = CURRENT_DATE) AS today_tested
      FROM public.inventory_items
    """
    with db() as (_, cur):
      cur.execute(sql)
      r = cur.fetchone()
      return {
        "total": int(r["total"]), "ready": int(r["ready"]), "incomplete": int(r["incomplete"]), "todayTested": int(r["today_tested"]),
      }

@router.post("/rows/search_posted")
def search_posted_row(body: PostedSearch):
    name = (body.productName or "").strip().lower()
    if name and "laptop" in name: return {"ebayItemUrl": "https://www.ebay.com/itm/MOCK_COMP_LINK"}
    return {}

@router.get("/rows/similar")
def rows_similar(productName: str = Query(..., min_length=2), limit: int = Query(5, ge=1, le=20)):
    terms = [t for t in re.findall(r"[A-Za-z0-9]+", productName) if len(t) >= 3]
    if not terms: return []

    where = " AND ".join([f"pl.product_name_raw ILIKE %s" for _ in terms])
    params = [f"%{t}%" for t in terms]

    sql = f"""
        SELECT DISTINCT ON (pl.product_name_raw) pl.product_name_raw AS "productName", COALESCE(i.specs, '{{}}'::jsonb) AS "specs"
        FROM po_lines pl LEFT JOIN public.inventory_items i ON i.po_line_id = pl.id
        WHERE pl.product_name_raw <> %s AND ({where})
        ORDER BY pl.product_name_raw LIMIT %s
    """
    with db() as (con, cur):
        cur.execute(sql, [productName] + params + [limit])
        return cur.fetchall() or []

@router.post("/rows/search_similar")
def rows_search_similar(payload: Dict[str, Any] = Body(...)):
    name = (payload.get("productName") or "").strip()
    specs = payload.get("specs") or {}
    grade = (payload.get("grade") or None) or None
    category_id = payload.get("categoryId") or None
    exclude_synergy = (payload.get("excludeSynergyId") or "").strip()
    limit = int(payload.get("limit") or 5)

    def _tokenize_for_like(s: str) -> List[str]:
        raw = re.split(r"[\s\-_/|,.;:()+]+", s or "")
        toks: List[str] = []
        for t in raw:
            t = t.strip()
            if len(t) < 2: continue
            toks.append(t[:64])
            if len(toks) >= 8: break
        return toks

    blob = " ".join([name, str(specs.get("processor") or ""), str(specs.get("ram") or ""), str(specs.get("storage") or ""),
                     str(specs.get("screen") or ""), str(specs.get("batteryHealth") or ""), str(specs.get("color") or "")])
    tokens = _tokenize_for_like(blob)

    where = ["TRUE"]; params: Dict[str, Any] = {"limit": limit, "empty_json": "{}"}
    if exclude_synergy: where.append("i.synergy_code <> %(exclude)s"); params["exclude"] = exclude_synergy

    if category_id:
        if is_uuid_like(str(category_id)):
            where.append("i.category_id = %(cat_uuid)s::uuid"); params["cat_uuid"] = str(category_id)
        else:
            params["cat_like"] = "%" + str(category_id).replace("%", r"\%").replace("_", r"\_") + "%"
            where.append("(c.label ILIKE %(cat_like)s ESCAPE '\\' OR c.prefix ILIKE %(cat_like)s ESCAPE '\\')")

    if grade: where.append("i.grade = %(grade)s"); params["grade"] = grade

    match_clauses: List[str] = []; score_parts: List[str] = ["0"]
    for idx, tok in enumerate(tokens):
        key = f"tok{idx}"; like = "%" + tok.replace("%", r"\%").replace("_", r"\_") + "%"
        params[key] = like
        match_clauses.append(f"(pl.product_name_raw ILIKE %({key})s ESCAPE '\\' OR CAST(i.specs AS text) ILIKE %({key})s ESCAPE '\\')")
        score_parts.append(f"CASE WHEN pl.product_name_raw ILIKE %({key})s ESCAPE '\\' THEN 2 ELSE 0 END")
        score_parts.append(f"CASE WHEN CAST(i.specs AS text) ILIKE %({key})s ESCAPE '\\' THEN 1 ELSE 0 END")

    text_where = f"({' OR '.join(match_clauses)})" if match_clauses else "TRUE"

    sql = f"""
      SELECT i.synergy_code AS "synergyId", COALESCE(pl.product_name_raw, '') AS "productName", i.grade AS "grade", i.status AS "status",
        i.category_id AS "categoryId", c.label AS "categoryLabel", COALESCE(i.specs, %(empty_json)s::jsonb) AS "specs", COALESCE(i.price, 0) AS "price",
        COALESCE(i.ebay_price, 0) AS "ebayPrice", ({' + '.join(score_parts)}) AS score,
        i.last_printed_at as "lastPrintedAt", pl.upc AS "upc", pl.asin AS "asin"
      FROM inventory_items i
      LEFT JOIN po_lines pl ON pl.id = i.po_line_id
      LEFT JOIN categories c ON c.id = i.category_id
      WHERE {' AND '.join(where)} AND {text_where}
      ORDER BY score DESC, COALESCE(i.posted_at, i.tested_date, i.tested_at) DESC NULLS LAST, i.synergy_code ASC
      LIMIT %(limit)s
    """

    with db() as (con, cur):
        cur.execute(sql, params)
        return {"items": [dict(r) for r in cur.fetchall()]}

@router.post("/listings/link-ebay")
def link_ebay_listing(body: AssocBody):
    url = (body.ebayUrl or "").strip()
    if not url: raise HTTPException(400, "ebayUrl required")

    legacy_id = _parse_ebay_legacy_id(url)
    link_ok = True
    status = "ACTIVE"

    with db() as (con, cur):
        inv_id = None
        cur.execute("""
            SELECT id FROM public.inventory_items
            WHERE synergy_code = %s
            ORDER BY posted_at NULLS FIRST, created_at NULLS LAST
            LIMIT 1
        """, (body.synergyId,))
        r = cur.fetchone()
        inv_id = (r or {}).get("id")

        cur.execute("""
            INSERT INTO public.external_listings
                (platform, sku, synergy_code, inventory_item_id, url, ebay_legacy_id, price_num, currency, status)
            VALUES ('ebay', %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (synergy_code) DO UPDATE SET
                url = EXCLUDED.url,
                ebay_legacy_id = EXCLUDED.ebay_legacy_id,
                inventory_item_id = COALESCE(public.external_listings.inventory_item_id, EXCLUDED.inventory_item_id)
            RETURNING id
        """, (
            None, body.synergyId, inv_id, url, legacy_id, None, None, status
        ))
        _ = cur.fetchone()
        
        if inv_id:
            cur.execute("""
                UPDATE public.inventory_items
                   SET ebay_item_url = COALESCE(%s, ebay_item_url)
                 WHERE id = %s
            """, (url, inv_id))

    return ebay_sync_by_url(EbaySyncBody(synergyId=body.synergyId, ebayUrl=body.ebayUrl))

@router.post("/ebay/sync_by_url")
def ebay_sync_by_url(body: EbaySyncBody):
    url = (body.ebayUrl or "").strip()
    if not url: raise HTTPException(400, "ebayUrl required")
    legacy_id = _parse_ebay_legacy_id(url)
    if not legacy_id: raise HTTPException(400, "Could not extract itemId from ebayUrl")

    price, currency, sold, title, thumbnail = None, None, False, None, None

    token = get_ebay_token()
    if token:
        r = session.get(
            "https://api.ebay.com/buy/browse/v1/item/get_item_by_legacy_id",
            params={"legacy_item_id": legacy_id},
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json", "X-EBAY-C-MARKETPLACE-ID": EBAY_MARKETPLACE_ID},
            timeout=(6, 12),
        )
        if r.status_code == 200:
            j = r.json()
            title = j.get("title")
            p = (j.get("price") or {}).get("value")
            if p: price = to_num(p)
            currency = (j.get("price") or {}).get("currency")
            availability = ((j.get("availability") or {}).get("status") or "").upper()
            item_end = j.get("itemEndDate") or j.get("itemEndTime")
            sold = (availability in {"OUT_OF_STOCK", "UNAVAILABLE"}) or bool(item_end)
            
            img_obj = j.get("image") or {}
            thumbnail = img_obj.get("imageUrl")

    with db() as (con, cur):
        cur.execute(
            """
            UPDATE inventory_items
               SET ebay_item_url = %s,
                   ebay_price    = COALESCE(%s, ebay_price),
                   status        = CASE WHEN %s THEN 'SOLD' ELSE status END,
                   ebay_thumbnail = COALESCE(%s, ebay_thumbnail)
             WHERE synergy_code  = %s
            """, (url, price, sold, thumbnail, body.synergyId)
        )

    return {
        "ok": True, "synergyId": body.synergyId, "ebayItemUrl": url, "ebayPrice": price,
        "currency": currency or "USD", "sold": bool(sold), "title": title, "thumbnail": thumbnail
    }

@router.post("/pos/{po_id}/ai_category_draft")
def ai_category_draft(po_id: str, body: Dict[str, Any] = Body(...)):
    line_ids = body.get("line_ids") or []
    if not isinstance(line_ids, list) or not line_ids: return {"suggestions": []}

    suggestions = []
    with db() as (con, cur):
        cur.execute(
            """
            SELECT pl.id, pl.product_name_raw FROM po_lines pl
            WHERE pl.purchase_order_id = %s AND pl.id = ANY(%s::uuid[])
            """, (po_id, _uuid_list(line_ids))
        )
        line_rows = {str(r["id"]): (r.get("product_name_raw") or "").lower() for r in cur.fetchall()}

        cur.execute("SELECT id, label FROM categories")
        cats = [(str(r["id"]), (r["label"] or "").lower()) for r in cur.fetchall()]

    for lid, name in line_rows.items():
        chosen = None
        for cid, label in cats:
          if label and any(tok and tok in name for tok in label.split()):
              chosen = cid; break
        suggestions.append({"line_id": lid, "category_id": chosen})

    return {"suggestions": suggestions}

@router.get("/rows/{synergy_id}/ebay-listing")
def get_ebay_listing_data(
    synergy_id: str,
    x_user_id: Optional[int] = Header(None, alias="X-User-ID")
):
    def get_condition_label(grade):
        g = (grade or "").upper()
        if g == 'A': return "Excellent - Refurbished"
        if g == 'B': return "Good - Used"
        if g == 'C': return "Fair - Heavy Wear"
        if g == 'D': return "Rough - Damaged"
        if g == 'P': return "For Parts or Not Working"
        return "Used"

    with db() as (con, cur):
        cur.execute("""
            SELECT 
                i.synergy_code, 
                pl.product_name_raw, 
                i.grade, 
                i.tester_comment, 
                i.specs, 
                i.price, 
                i.ebay_price,
                i.ebay_sku,                
                pl.unit_cost,
                c.label AS category_label  
            FROM inventory_items i
            LEFT JOIN po_lines pl ON i.po_line_id = pl.id
            LEFT JOIN categories c ON i.category_id = c.id
            WHERE i.synergy_code = %s
        """, (synergy_id,))
        
        row = cur.fetchone()
        
        if not row:
            cur.execute("""
                SELECT 
                    pl.synergy_id as synergy_code, 
                    pl.product_name_raw, 
                    'B' as grade, 
                    '' as tester_comment, 
                    '{}'::jsonb as specs, 
                    0 as price, 
                    0 as ebay_price,
                    NULL as ebay_sku,
                    pl.unit_cost,
                    c.label as category_label
                FROM po_lines pl
                LEFT JOIN categories c ON pl.category_guess = c.id
                WHERE pl.synergy_id = %s
            """, (synergy_id,))
            row = cur.fetchone()

        if not row:
            raise HTTPException(404, "Item not found")
            
        item = dict(row)
        item['condition'] = get_condition_label(item.get('grade'))

        generated_sku = item.get('ebay_sku')

        if not generated_sku and x_user_id:
            cur.execute("SELECT initials, sku_next_number FROM app_users WHERE id = %s", (x_user_id,))
            user = cur.fetchone()
            
            if user:
                initials = (user['initials'] or "XX").strip().upper()
                seq = user['sku_next_number'] or 1
                raw_cat = (item.get('category_label') or "GENERIC").strip()
                import re
                smart_cat = re.sub(r'[^A-Z0-9]', '', raw_cat.split(' ')[0].upper())
                generated_sku = f"{initials} {seq} {smart_cat} - STOCK SHELF"

        if not generated_sku:
            generated_sku = item.get('synergy_code')

        content = generate_ebay_listing_content(item)
        
        price = (item.get('ebay_price') or item.get('price') or 0)
        if price == 0:
            cost = item.get('unit_cost') or 0
            price = float(cost) * 1.3

        return {
            "ok": True,
            "synergy_id": synergy_id,
            "title": content.get("title"),
            "description_html": content.get("html"),
            "price": round(float(price), 2),
            "qty": 1,
            "sku": generated_sku, 
            "photos": []
        }

@router.post("/rows/{synergy_id}/auto-link-photos")
def auto_link_photos(synergy_id: str):
    with db() as (con, cur):
        cur.execute("SELECT * FROM inventory_items WHERE synergy_code = %s", (synergy_id,))
        item = cur.fetchone()
        if not item: raise HTTPException(404, "Item not found")

        p_name = item['product_name_raw'] or ""
        grade = item['grade'] or ""
        comment = (item['tester_comment'] or "").lower()
        
        search_terms = " | ".join(p_name.split()[:3]) 
        
        cur.execute("""
            SELECT id, urls, product_name, grade, tags
            FROM stock_photos
            WHERE to_tsvector('english', product_name) @@ to_tsquery('english', %s)
            ORDER BY 
                (grade = %s) DESC, 
                (grade = 'A') DESC, 
                created_at DESC
            LIMIT 1
        """, (search_terms.replace(" ", " & "), grade))
        
        match = cur.fetchone()
        
        if match:
            photo_objs = [{"url": u, "is_stock": True, "stock_id": str(match['id'])} for u in match['urls']]
            
            cur.execute("""
                UPDATE inventory_items 
                SET stock_photo_id = %s, 
                    photos = %s::jsonb 
                WHERE synergy_code = %s
            """, (match['id'], json.dumps(photo_objs), synergy_id))
            
            return {
                "ok": True, 
                "linked_to": match['product_name'], 
                "photo_count": len(match['urls'])
            }
        
        return {"ok": False, "message": "No confident match found"}

@router.post("/rows/smart-match")
def smart_match_inventory(body: SmartMatchRequest):
    STOP_WORDS = {"and", "or", "the", "with", "for", "new", "used", "open", "box", "grade", "condition", "excellent", "good", "fair", "mint", "black", "white", "silver", "gray", "grey", "blue", "red", "gold", "tablet", "phone", "laptop"}
    
    raw_tokens = re.findall(r'\w+', body.product_name.lower())
    search_tokens = {t for t in raw_tokens if len(t) > 2 and t not in STOP_WORDS}
    
    if not search_tokens:
        return {"candidates": []}

    case_statements = []
    params = []
    
    for token in search_tokens:
        case_statements.append("CASE WHEN pl.product_name_raw ILIKE %s THEN 10 ELSE 0 END")
        params.append(f"%{token}%")
    
    if not case_statements:
        return {"candidates": []}

    score_sql = " + ".join(case_statements)
    min_score = 20 if len(search_tokens) > 2 else 10

    with db() as (con, cur):
        cur.execute(f"""
            SELECT 
                i.synergy_code AS "synergy_id", 
                COALESCE(pl.product_name_raw, '') AS "product_name_raw",
                i.grade, 
                COALESCE(i.cost_unit, 0) AS "unit_cost",
                COALESCE(pl.qty, 1) AS "qty",
                i.tester_comment,
                ({score_sql}) as score
            FROM inventory_items i
            LEFT JOIN po_lines pl ON pl.id = i.po_line_id
            WHERE i.status = 'TESTED'
            ORDER BY score DESC, i.synergy_code DESC
            LIMIT 10
        """, params)
        
        rows = cur.fetchall()
        candidates = [dict(r) for r in rows if r['score'] >= min_score]
        
        return {"candidates": candidates}