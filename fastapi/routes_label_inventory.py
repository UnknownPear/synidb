# routes_label_inventory.py
from fastapi import APIRouter, Body, HTTPException, Query
from typing import Optional, Dict, Any, List, Tuple, Literal
from psycopg2.extras import RealDictCursor, Json as PGJson
from contextlib import contextmanager
from datetime import datetime
from pydantic import BaseModel, Field
from decimal import Decimal, InvalidOperation
from uuid import uuid4
from math import floor
import psycopg2, os, re, json

DATABASE_URL = os.getenv("DATABASE_URL")

# KEEP: labels endpoints under /labels
router = APIRouter(prefix="/labels", tags=["labels"])

# NEW: employees endpoints at root (no prefix)
employees_router = APIRouter(tags=["employees"])

# -------------------------- DB helpers --------------------------
@contextmanager
def db() -> Tuple[psycopg2.extensions.connection, psycopg2.extensions.cursor]:
    con = psycopg2.connect(DATABASE_URL, sslmode=os.getenv("PGSSLMODE", "prefer"))
    cur = con.cursor(cursor_factory=RealDictCursor)
    try:
        yield con, cur
        con.commit()
    except:
        try: con.rollback()
        except: pass
        raise
    finally:
        try: cur.close()
        finally:
            try: con.close()
            except: pass

# -------------------------- Money/format helpers --------------------------
def _num(x) -> Optional[Decimal]:
    if x is None or x == "":
        return None
    try:
        return Decimal(str(x))
    except (InvalidOperation, ValueError, TypeError):
        return None

def _prefix_from_name(name: str) -> str:
    s = re.sub(r"[^A-Z0-9]", "", (name or "").upper())[:5]
    return s or "99999"

def _to_cents(v: Optional[Decimal]) -> Optional[int]:
    if v is None:
        return None
    return int((v * 100).quantize(Decimal("1")))

def _fmt_money(cents: Optional[int]) -> str:
    if cents is None:
        return ""
    v = Decimal(cents) / Decimal(100)
    s = f"{v:.2f}"
    return s.rstrip("0").rstrip(".")

# -------------------------- Pydantic models --------------------------
class EnsureRequest(BaseModel):
    productName: str
    msrp: Optional[str | float | int] = None
    price: Optional[str | float | int] = None
    qty: int = 1
    synergyId: Optional[str] = None
    prefix: Optional[str] = None

# --- Categories schema ---
class CatCriterion(BaseModel):
    kind: Literal["prefix", "contains", "regex", "word"]
    value: str = Field(min_length=1)

class CatCriteria(BaseModel):
    prefixes: Optional[List[str]] = None
    words: Optional[List[str]] = None
    productWords: Optional[List[str]] = None
    regex: Optional[str] = None
    priority: Optional[int] = 0

class CategoryRuleModel(BaseModel):
    id: str = Field(min_length=1, pattern=r"^[A-Za-z0-9:_.-]+$")
    name: str = Field(min_length=1)   # internal name (key); alias maps name->display
    color: Optional[str] = None
    criteria: CatCriteria = CatCriteria()
    priority: Optional[int] = 0

class CategoryRulesSave(BaseModel):
    rules: List[CategoryRuleModel]

class CategoryOverrideBody(BaseModel):
    synergyId: str
    category: Optional[str] = None  # internal category "name"

class CategorySuggestRequest(BaseModel):
    synergyIds: List[str]

class CategoryAliasBody(BaseModel):
    name: str
    displayName: Optional[str] = None

# -------------------------- Category table bootstrap --------------------------
def _ensure_category_tables():
    with db() as (con, cur):
        cur.execute("""
        CREATE TABLE IF NOT EXISTS label_category_rules(
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            color TEXT,
            criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
            priority INTEGER NOT NULL DEFAULT 0
        );
        """)
        cur.execute("""
        CREATE TABLE IF NOT EXISTS label_category_overrides(
            synergy_id TEXT PRIMARY KEY,
            category TEXT
        );
        """)
        cur.execute("""
        CREATE TABLE IF NOT EXISTS label_category_aliases(
            name TEXT PRIMARY KEY,
            display_name TEXT NOT NULL
        );
        """)

# -------------------------- Category helpers --------------------------
def _auto_derive_rules(cur) -> List[Dict[str, Any]]:
    """
    Seed defaults from prefixes before the dash in synergy_id, e.g. MACBO-0001 -> 'MACBO'.
    Only used when there are no saved rules yet.
    """
    cur.execute("""
        SELECT split_part(synergy_id,'-',1) AS pref, COUNT(*) AS cnt
          FROM label_inventory
         GROUP BY pref
         ORDER BY cnt DESC
         LIMIT 100
    """)
    out = []
    for row in cur.fetchall() or []:
        pref = (row.get("pref") or "").strip()
        if not pref:
            continue
        out.append({
            "id": f"auto:{pref}",
            "name": pref,                 # this is the internal category "name"
            "color": None,
            "criteria": {"prefixes": [pref], "priority": 1},
            "priority": 1,
        })
    return out

def _norm_array(v):
    if v is None:
        return []
    if isinstance(v, list):
        return [str(x).strip() for x in v if str(x).strip()]
    if isinstance(v, str):
        return [s.strip() for s in v.split(",") if s.strip()]
    return []

def _norm_criteria(c: Any) -> Dict[str, Any]:
    c = c or {}
    return {
        "prefixes": _norm_array(c.get("prefixes")),
        "words": _norm_array(c.get("words")),
        "productWords": _norm_array(c.get("productWords")),
        "regex": c.get("regex") if isinstance(c.get("regex"), str) and c.get("regex").strip() else None,
        "priority": int(c.get("priority") or 0),
    }

def _load_rules(cur) -> List[Dict[str, Any]]:
    cur.execute("SELECT id, name, color, criteria, priority FROM label_category_rules")
    rows = cur.fetchall() or []
    if not rows:
        return _auto_derive_rules(cur)
    out = []
    for r in rows:
        out.append({
            "id": r["id"],
            "name": r["name"],
            "color": r.get("color"),
            "criteria": _norm_criteria(r.get("criteria")),
            "priority": int(r.get("priority") or 0),
        })
    return out

def _fetch_products_for(cur, sids: List[str]) -> Dict[str, str]:
    if not sids:
        return {}
    cur.execute("""
        SELECT synergy_id, product_name
          FROM label_inventory
         WHERE synergy_id = ANY(%s)
    """, (sids,))
    return { r["synergy_id"]: r["product_name"] for r in cur.fetchall() or [] }

def _compile_rule(rule: Dict[str, Any]):
    c = _norm_criteria(rule.get("criteria"))
    prefixes = [p.lower() for p in (c.get("prefixes") or [])]
    words    = [w.lower() for w in (c.get("words") or [])]
    pwords   = [w.lower() for w in (c.get("productWords") or [])]
    rx = None
    if c.get("regex"):
        try: rx = re.compile(c["regex"], re.I)
        except Exception: rx = None
    prio = int(c.get("priority") or rule.get("priority") or 0)
    name = rule.get("name") or ""
    def f(sid: str, pname: str):
        s = (sid or "").lower()
        n = (pname or "").lower()
        score = 0
        if prefixes and any(s.startswith(p) for p in prefixes): score += 5
        if words and any(w in s for w in words):                score += 2
        if pwords and any(w in n for w in pwords):              score += 2
        if rx and (rx.search(s) or rx.search(n)):               score += 3
        return (prio + score) if score > 0 else None
    return name, f

def _suggest_for_ids(cur, sids: List[str]) -> Dict[str, str]:
    rules = _load_rules(cur)
    compiled = [ _compile_rule(r) for r in rules ]
    names = _fetch_products_for(cur, sids)
    out: Dict[str, str] = {}
    for sid in sids:
        pname = names.get(sid, "")
        best = None; bestScore = -1
        for name, fn in compiled:
            sc = fn(sid, pname)
            if sc is not None and sc > bestScore:
                bestScore = sc; best = name
        if best:
            out[sid] = best
    return out

# -------------------------- Categories API --------------------------
@router.get("/categories/rules")
def get_category_rules():
    _ensure_category_tables()
    with db() as (con, cur):
        return _load_rules(cur)

@router.put("/categories/rules")
def put_category_rules(body: CategoryRulesSave):
    _ensure_category_tables()
    with db() as (con, cur):
        # wipe and replace (simple + predictable)
        cur.execute("DELETE FROM label_category_rules")
        for r in body.rules:
            crit = _norm_criteria(r.criteria.model_dump(exclude_none=True))
            cur.execute("""
                INSERT INTO label_category_rules(id, name, color, criteria, priority)
                VALUES (%s, %s, %s, %s::jsonb, %s)
            """, (r.id, r.name, r.color, json.dumps(crit), int(r.priority or 0)))
    return {"ok": True, "count": len(body.rules)}

@router.get("/categories/overrides")
def get_category_overrides():
    _ensure_category_tables()
    with db() as (con, cur):
        cur.execute("SELECT synergy_id, category FROM label_category_overrides")
        return { r["synergy_id"]: r["category"] for r in cur.fetchall() or [] if r.get("category") }

@router.put("/categories/override")
def put_category_override(body: CategoryOverrideBody):
    _ensure_category_tables()
    sid = (body.synergyId or "").strip()
    if not sid:
        raise HTTPException(400, "synergyId required")
    with db() as (con, cur):
        if not body.category or not body.category.strip():
            cur.execute("DELETE FROM label_category_overrides WHERE synergy_id = %s", (sid,))
        else:
            cur.execute("""
                INSERT INTO label_category_overrides(synergy_id, category)
                VALUES (%s, %s)
                ON CONFLICT (synergy_id) DO UPDATE SET category = EXCLUDED.category
            """, (sid, body.category.strip()))
    return {"ok": True}

@router.get("/categories/aliases")
def get_category_aliases():
    _ensure_category_tables()
    with db() as (con, cur):
        cur.execute("SELECT name, display_name FROM label_category_aliases")
        return { r["name"]: r["display_name"] for r in cur.fetchall() or [] }

@router.put("/categories/alias")
def put_category_alias(body: CategoryAliasBody):
    """
    Persist a display-name alias for a category NAME (e.g., 'MACBO' -> 'MacBook').
    DOES NOT change rule criteria or the prefix.
    To clear, send displayName = null/empty.
    """
    _ensure_category_tables()
    nm = (body.name or "").strip()
    if not nm:
        raise HTTPException(400, "name required")
    with db() as (con, cur):
        if not body.displayName or not body.displayName.strip():
            cur.execute("DELETE FROM label_category_aliases WHERE name = %s", (nm,))
        else:
            cur.execute("""
                INSERT INTO label_category_aliases(name, display_name)
                VALUES (%s, %s)
                ON CONFLICT (name) DO UPDATE SET display_name = EXCLUDED.display_name
            """, (nm, body.displayName.strip()))
    return {"ok": True}

@router.get("/categories/suggest")
def get_category_suggest(ids: str = Query(..., description="Comma separated synergy IDs")):
    _ensure_category_tables()
    sids = [s.strip() for s in ids.split(",") if s.strip()]
    with db() as (con, cur):
        return {"suggestions": _suggest_for_ids(cur, sids)}

@router.post("/categories/suggest")
def post_category_suggest(body: CategorySuggestRequest):
    _ensure_category_tables()
    sids = [s.strip() for s in (body.synergyIds or []) if s.strip()]
    with db() as (con, cur):
        return {"suggestions": _suggest_for_ids(cur, sids)}

# -------------------------- Employees API --------------------------
@employees_router.get("/employees")
def list_employees() -> List[str]:
    with db() as (con, cur):
        cur.execute("SELECT name FROM employees WHERE active=TRUE AND name <> '' ORDER BY name ASC;")
        rows = cur.fetchall() or []
    return [r["name"] for r in rows]

@employees_router.post("/employees")
def add_employee(payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "name required")
    with db() as (con, cur):
        cur.execute("""
            INSERT INTO employees (name, active)
            VALUES (%s, TRUE)
            ON CONFLICT (name) DO UPDATE SET active=EXCLUDED.active
            RETURNING id, name, active, created_at;
        """, (name,))
        row = cur.fetchone()
    return row

def _employee_id_by_name(cur, name: Optional[str]) -> Optional[int]:
    if not name:
        return None
    cur.execute("SELECT id FROM employees WHERE name=%s AND active=TRUE;", (name,))
    rec = cur.fetchone()
    return rec["id"] if rec else None

# -------------------------- Internal helpers (labels) --------------------------
def _find_existing_sid_by_product(cur, product_name: str) -> Optional[str]:
    cur.execute("""
        SELECT synergy_id
          FROM label_inventory
         WHERE product_name = %s
         ORDER BY updated_at DESC
         LIMIT 1
    """, (product_name,))
    row = cur.fetchone()
    return row["synergy_id"] if row else None

def _next_sid(cur, prefix: str) -> str:
    cur.execute("SELECT next_seq FROM id_prefix_counters WHERE prefix=%s FOR UPDATE", (prefix,))
    row = cur.fetchone()
    if row is None:
        cur.execute("INSERT INTO id_prefix_counters(prefix, next_seq) VALUES(%s, %s)", (prefix, 1))
        cur.execute("SELECT next_seq FROM id_prefix_counters WHERE prefix=%s FOR UPDATE", (prefix,))
        row = cur.fetchone()
    start = int(row["next_seq"] or 1)
    sid = f"{prefix}-{start:04d}"
    cur.execute("UPDATE id_prefix_counters SET next_seq=%s WHERE prefix=%s", (start + 1, prefix))
    return sid

# -------------------------- API: /labels/detail --------------------------
@router.get("/detail")
def get_detail(synergy_id: str = Query(..., min_length=3)):
    with db() as (con, cur):
        cur.execute("""
          SELECT synergy_id, product_name, msrp_cents, price_cents,
                 qty_on_hand, sold_count, updated_at, created_at
            FROM label_inventory
           WHERE synergy_id = %s
           LIMIT 1
        """, (synergy_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, f"{synergy_id} not found")

        cur.execute("""
          SELECT MAX(created_at) AS last_sold
            FROM label_sales
           WHERE synergy_id = %s
        """, (synergy_id,))
        last = cur.fetchone() or {}
        last_sold = last.get("last_sold")

    return {
        "synergy_id": row["synergy_id"],
        "product_name": row["product_name"],
        "msrpDisplay": _fmt_money(row.get("msrp_cents")),
        "ourPriceDisplay": _fmt_money(row.get("price_cents")),
        "qty_on_hand": row["qty_on_hand"],
        "sold_count": row["sold_count"],
        "updated_at": row["updated_at"],
        "first_added": row.get("created_at") or row["updated_at"],
        "last_sold": last_sold,
    }

# -------------------------- API: /labels/orders (list & detail) --------------------------
@router.get("/orders")
def list_orders(limit: int = Query(50, ge=1, le=500),
                employee: Optional[str] = Query(None),
                q: Optional[str] = Query(None)):
    clauses = []
    params: list[Any] = []
    if employee:
        clauses.append("employee = %s")
        params.append(employee)
    if q:
        clauses.append("order_id ILIKE %s")
        params.append(f"%{q}%")

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    sql = f"""
      SELECT order_id, employee, payment_type, tax_exempt, tax_rate,
             subtotal_cents, tax_cents, final_total_cents, created_at
        FROM pos_orders
        {where}
        ORDER BY created_at DESC
        LIMIT %s
    """
    params.append(limit)
    with db() as (con, cur):
        cur.execute(sql, params)
        rows = cur.fetchall() or []
    out = []
    for r in rows:
        out.append({
            "orderId": r["order_id"],
            "employee": r.get("employee"),
            "paymentType": r.get("payment_type"),
            "taxExempt": bool(r.get("tax_exempt")),
            "taxRate": float((r.get("tax_rate") or 0)),
            "subtotal": float((r.get("subtotal_cents") or 0)) / 100.0,
            "salesTax": float((r.get("tax_cents") or 0)) / 100.0,
            "finalTotal": float((r.get("final_total_cents") or 0)) / 100.0,
            "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
        })
    return {"items": out}

@router.get("/orders/{order_id}")
def get_order(order_id: str):
    with db() as (con, cur):
        cur.execute("""
          SELECT order_id, employee, payment_type, tax_exempt, tax_rate,
                 subtotal_cents, tax_cents, final_total_cents, created_at
            FROM pos_orders
           WHERE order_id = %s
           LIMIT 1
        """, (order_id,))
        head = cur.fetchone()
        if not head:
            raise HTTPException(404, f"{order_id} not found")

        cur.execute("""
          SELECT kind, synergy_id, product_name, qty, unit_price_cents, line_total_cents
            FROM pos_order_lines
           WHERE order_id = %s
           ORDER BY id
        """, (order_id,))
        lines = cur.fetchall() or []

    return {
        "orderId": head["order_id"],
        "employee": head.get("employee"),
        "paymentType": head.get("payment_type"),
        "taxExempt": bool(head.get("tax_exempt")),
        "taxRate": float((head.get("tax_rate") or 0)),
        "subtotal": float((head.get("subtotal_cents") or 0)) / 100.0,
        "salesTax": float((head.get("tax_cents") or 0)) / 100.0,
        "finalTotal": float((head.get("final_total_cents") or 0)) / 100.0,
        "created_at": head["created_at"].isoformat() if head.get("created_at") else None,
        "lines": [
            {
              "kind": r["kind"],
              "synergyId": r.get("synergy_id"),
              "productName": r.get("product_name"),
              "qty": int(r.get("qty") or 0),
              "unitPrice": float((r.get("unit_price_cents") or 0)) / 100.0,
              "lineTotal": float((r.get("line_total_cents") or 0)) / 100.0,
            }
            for r in lines
        ],
    }

# -------------------------- API: /labels/order (create) --------------------------
@router.post("/order")
def create_order(payload: Dict[str, Any] = Body(...)):
    """
    {
      "items": [{"synergyId":"ABC-0001","qty":2}, ...],  # qty < 0 means return
      "paymentType": "Cash" | "Card" | "Gift Card",
      "employee": "Name",
      "taxExempt": bool,
      "taxRate": 0.05
    }
    """
    items = payload.get("items") or []
    if not isinstance(items, list) or not items:
        raise HTTPException(400, "items required")

    tax_exempt  = bool(payload.get("taxExempt", False))
    tax_rate    = float(payload.get("taxRate", 0.05))
    payment_type = (payload.get("paymentType") or "").strip() or None
    employee     = (payload.get("employee") or "").strip() or None

    order_id   = f"POS-{uuid4().hex[:8].upper()}"
    created_at = datetime.utcnow()

    subtotal_cents = 0
    lines_out: List[Dict[str, Any]] = []

    with db() as (con, cur):
        cur.execute("""
          INSERT INTO pos_orders (
            order_id, employee, payment_type, tax_exempt, tax_rate,
            subtotal_cents, tax_cents, final_total_cents, created_at
          ) VALUES (%s, %s, %s, %s, %s, 0, 0, 0, NOW())
        """, (order_id, employee, payment_type, tax_exempt, tax_rate))

        for it in items:
            sid = (it.get("synergyId") or "").strip()
            try:
                qty = int(it.get("qty") or 0)
            except:
                qty = 0
            if not sid or qty == 0:
                raise HTTPException(400, f"Bad line: {it}")

            cur.execute(
                "SELECT product_name, price_cents FROM label_inventory WHERE synergy_id=%s",
                (sid,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(404, f"{sid} not found")

            product_name = row["product_name"]
            price_cents  = int(row.get("price_cents") or 0)

            subtotal_cents += price_cents * qty

            if qty > 0:
                cur.execute("""
                  UPDATE label_inventory
                     SET qty_on_hand = GREATEST(qty_on_hand - %s, 0),
                         sold_count  = sold_count + %s,
                         updated_at  = NOW()
                   WHERE synergy_id=%s
                """, (qty, qty, sid))
            else:
                back = abs(qty)
                cur.execute("""
                  UPDATE label_inventory
                     SET qty_on_hand = qty_on_hand + %s,
                         sold_count  = GREATEST(sold_count - %s, 0),
                         updated_at  = NOW()
                   WHERE synergy_id=%s
                """, (back, back, sid))

            cur.execute("""
              INSERT INTO label_sales (synergy_id, qty, unit_price_cents, source, created_at, order_id)
              VALUES (%s, %s, %s, 'pos', NOW(), %s)
            """, (sid, qty, price_cents, order_id))

            cur.execute("""
              INSERT INTO pos_order_lines (
                order_id, kind, synergy_id, product_name, qty, unit_price_cents, line_total_cents
              ) VALUES (%s, 'inv', %s, %s, %s, %s, %s)
            """, (order_id, sid, product_name, qty, price_cents, price_cents * qty))

            lines_out.append({
                "synergyId":  sid,
                "productName": product_name,
                "qty":        qty,
                "unitPrice":  float(price_cents) / 100.0,
                "lineTotal":  float(price_cents * qty) / 100.0,
            })

        tax_cents   = 0 if tax_exempt else floor(subtotal_cents * max(0.0, tax_rate))
        final_cents = subtotal_cents + tax_cents

        cur.execute("""
          UPDATE pos_orders
             SET subtotal_cents = %s,
                 tax_cents      = %s,
                 final_total_cents = %s
           WHERE order_id = %s
        """, (subtotal_cents, tax_cents, final_cents, order_id))

    return {
        "salesId":    order_id,
        "created_at": created_at.isoformat(),
        "subtotal":   float(subtotal_cents) / 100.0,
        "salesTax":   float(tax_cents) / 100.0,
        "finalTotal": float(final_cents) / 100.0,
        "paymentType": payment_type,
        "employee":    employee,
        "lines":       lines_out,
    }

# -------------------------- API: /labels/ensure --------------------------
@router.post("/ensure")
def ensure_label(req: EnsureRequest):
    """
    If synergyId provided -> upsert and add qty.
    Else: reuse existing SID by productName; if not found, generate one from prefix.
    """
    name = (req.productName or "").strip()
    if not name:
        raise HTTPException(400, "productName required")

    msrp  = _num(req.msrp)
    price = _num(req.price)
    qty   = int(req.qty or 1)
    if qty <= 0:
        qty = 1

    sid = (req.synergyId or "").strip()
    prefix = (req.prefix or "").strip().upper()
    if not sid and not prefix:
        prefix = _prefix_from_name(name)

    msrp_cents  = _to_cents(msrp)
    price_cents = _to_cents(price)

    with db() as (con, cur):
        if not sid:
            existing = _find_existing_sid_by_product(cur, name)
            sid = existing if existing else _next_sid(cur, prefix)

        cur.execute("""
        INSERT INTO label_inventory (synergy_id, product_name, msrp_cents, price_cents, qty_on_hand, last_printed_at, updated_at)
        VALUES (%s, %s, %s, %s, %s, NOW(), NOW())
        ON CONFLICT (synergy_id) DO UPDATE
           SET product_name    = EXCLUDED.product_name,
               msrp_cents      = COALESCE(EXCLUDED.msrp_cents, label_inventory.msrp_cents),
               price_cents     = COALESCE(EXCLUDED.price_cents, label_inventory.price_cents),
               qty_on_hand     = label_inventory.qty_on_hand + EXCLUDED.qty_on_hand,
               last_printed_at = NOW(),
               updated_at      = NOW();
        """, (sid, name, msrp_cents, price_cents, qty))

    msrp_disp  = _fmt_money(msrp_cents)
    price_disp = _fmt_money(price_cents)
    saved_val  = (msrp or Decimal(0)) - (price or Decimal(0))
    if saved_val < 0:
        saved_val = Decimal(0)
    saved_disp = f"{saved_val:.2f}".rstrip("0").rstrip(".")
    today = datetime.now().strftime("%m/%d/%y")

    return {
        "synergyId": sid,
        "productName": name,
        "msrpDisplay": msrp_disp,
        "ourPriceDisplay": price_disp,
        "savedDisplay": saved_disp,
        "date": today,
        "qty": qty,
    }

# -------------------------- API: /labels/stock --------------------------
@router.get("/stock")
def list_stock(
    q: Optional[str] = Query(None, description="search in product name or synergy id"),
    in_stock_only: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    offset = (page - 1) * page_size
    clauses = []
    params: List[Any] = []
    if q:
        clauses.append("(product_name ILIKE %s OR synergy_id ILIKE %s)")
        params += [f"%{q}%", f"%{q}%"]
    if in_stock_only:
        clauses.append("qty_on_hand > 0")
    where = "WHERE " + " AND ".join(clauses) if clauses else ""
    sql = f"""
      SELECT synergy_id, product_name, msrp_cents, price_cents, qty_on_hand, sold_count, updated_at
        FROM label_inventory
        {where}
        ORDER BY updated_at DESC
        LIMIT %s OFFSET %s
    """
    params += [page_size, offset]
    with db() as (con, cur):
        cur.execute(sql, params)
        rows = cur.fetchall() or []
    for r in rows:
        r["msrpDisplay"] = _fmt_money(r.get("msrp_cents"))
        r["ourPriceDisplay"] = _fmt_money(r.get("price_cents"))
    return {"items": rows, "page": page, "page_size": page_size}

# -------------------------- API: /labels/scan (legacy quick sale) --------------------------
@router.post("/scan")
def record_scan(payload: Dict[str, Any] = Body(...)):
    synergy_id = (payload.get("synergyId") or "").strip()
    qty = int(payload.get("qty") or 1)
    if not synergy_id:
        raise HTTPException(400, "synergyId required")
    if qty < 1:
        raise HTTPException(400, "qty must be >= 1")

    with db() as (con, cur):
        cur.execute("SELECT price_cents FROM label_inventory WHERE synergy_id=%s", (synergy_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, f"{synergy_id} not found in label_inventory")
        price_cents = row["price_cents"]

        cur.execute("""
          UPDATE label_inventory
             SET qty_on_hand = GREATEST(qty_on_hand - %s, 0),
                 sold_count  = sold_count + %s,
                 updated_at  = NOW()
           WHERE synergy_id = %s
        """, (qty, qty, synergy_id))

        cur.execute("""
          INSERT INTO label_sales (synergy_id, qty, unit_price_cents, source)
          VALUES (%s, %s, %s, 'scan')
        """, (synergy_id, qty, price_cents))

    return {"ok": True, "synergyId": synergy_id, "qty_sold": qty}

# -------------------------- API: /labels/adjust --------------------------
@router.put("/adjust")
def adjust_inventory(payload: Dict[str, Any] = Body(...)):
    synergy_id = (payload.get("synergyId") or "").strip()
    qty_on_hand = payload.get("qtyOnHand", None)
    if not synergy_id:
        raise HTTPException(400, "synergyId required")
    try:
        qty_on_hand = int(qty_on_hand)
    except:
        raise HTTPException(400, "qtyOnHand must be an integer")
    if qty_on_hand < 0:
        raise HTTPException(400, "qtyOnHand must be >= 0")
    with db() as (con, cur):
        cur.execute(
            "UPDATE label_inventory SET qty_on_hand=%s, updated_at=NOW() WHERE synergy_id=%s",
            (qty_on_hand, synergy_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(404, f"{synergy_id} not found")
    return {"ok": True}
