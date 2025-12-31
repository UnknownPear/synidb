import re
import json
from uuid import UUID
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Query, Body, Response
import psycopg2.extras
from pydantic import BaseModel
from datetime import datetime
from db_utils import db, _uuid_list, _row_val, to_num
from pubsub_utils import _broadcast

router = APIRouter()

def fmt_synergy(prefix: str, seq: int) -> str:
    return f"{prefix}-{str(int(seq)).zfill(5)}"

class SynergyIdEvent(BaseModel):
    id: UUID
    created_at: datetime
    actor_name: Optional[str]
    po_id: Optional[UUID]
    po_line_id: Optional[UUID]
    inventory_id: Optional[UUID]
    prefix: str
    code: str
    seq: int
    event_type: str
    meta: Dict[str, Any]


def log_synergy_event(
    cur,
    *,
    event_type: str,
    prefix: str,
    seq: int,
    code: str,
    actor_name: Optional[str] = None,
    po_id: Optional[str] = None,
    po_line_id: Optional[str] = None,
    inventory_id: Optional[str] = None,
    meta: Optional[Dict[str, Any]] = None,
) -> None:
    """
    Insert a row into synergy_id_events using the existing DB cursor.
    Must be called inside the same db() context/transaction as the change.
    """
    cur.execute(
        """
        INSERT INTO synergy_id_events (
          actor_name, po_id, po_line_id, inventory_id,
          prefix, code, seq, event_type, meta
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
        """,
        (
            actor_name,
            str(po_id) if po_id else None,
            str(po_line_id) if po_line_id else None,
            str(inventory_id) if inventory_id else None,
            prefix,
            code,
            int(seq),
            event_type,
            json.dumps(meta or {}),
        ),
    )

# --- START OF DEFINITIVE FIX: Atomic and Race-Condition-Safe ID Generation ---
def _get_next_synergy_code(
    cur,
    prefix: str,
    *,
    actor_name: Optional[str] = None,
    po_id: Optional[str] = None,
    po_line_id: Optional[str] = None,
    inventory_id: Optional[str] = None,
) -> str:
    """
    Robustly gets the next available synergy code for a prefix using a database-level lock.
    This is the single source of truth for generating a new, unique ID and is safe from race conditions.

    - Locks the counter row in id_prefix_counters for this prefix.
    - If no counter exists, scans existing data (inventory_items + po_lines) to find the true max seq.
    - Reserves the next sequence number by bumping next_seq.
    - Optionally logs an audit event to synergy_id_events.
    """

    # 1) Lock the counter table row for this prefix to ensure this transaction
    #    is the only one that can read/modify it.
    cur.execute(
        "SELECT next_seq FROM id_prefix_counters WHERE prefix = %s FOR UPDATE",
        (prefix,),
    )

    row = cur.fetchone()
    if row and row.get("next_seq") is not None:
        # If it exists, use its value as the next sequence number.
        next_seq = int(row["next_seq"])
    else:
        # If no counter exists, determine the starting value from the data.
        true_max_seq = 0
        for table in ["inventory_items", "po_lines"]:
            cur.execute(
                f"""
                SELECT COALESCE(
                    MAX(
                        CAST(
                            NULLIF(SPLIT_PART(synergy_id, '-', 2), '') AS INTEGER
                        )
                    ),
                    0
                ) AS max_seq
                FROM {table}
                WHERE synergy_id LIKE %s
                """,
                (prefix + "-%",),
            )
            max_row = cur.fetchone() or {}
            max_seq = max_row.get("max_seq")
            if max_seq is not None:
                true_max_seq = max(true_max_seq, int(max_seq))

        next_seq = true_max_seq + 1

    # 2) Generate the new code (e.g. 29202-00045)
    new_code = fmt_synergy(prefix, next_seq)

    # 3) Update the counter to reserve the *next* number for the next call.
    cur.execute(
        """
        INSERT INTO id_prefix_counters(prefix, next_seq)
        VALUES (%s, %s)
        ON CONFLICT (prefix)
        DO UPDATE SET next_seq = EXCLUDED.next_seq
        """,
        (prefix, next_seq + 1),
    )

    # 4) Audit log: don't let logging failures break ID generation
    try:
        log_synergy_event(
            cur,
            event_type="mint",  # or "reserve" if you want a different semantics
            prefix=prefix,
            seq=next_seq,
            code=new_code,
            actor_name=actor_name,
            po_id=po_id,
            po_line_id=po_line_id,
            inventory_id=inventory_id,
            meta={"source": "_get_next_synergy_code"},
        )
    except Exception:
        # Intentionally swallow logging errors so they don't affect business logic
        pass

    return new_code

def _get_true_max_seq(cur, prefix: str) -> int:
    """
    Look through existing data and find the highest sequence we have
    for this prefix, across inventory_items and po_lines.
    """
    true_max_seq = 0
    for table in ["inventory_items", "po_lines"]:
        cur.execute(
            f"""
            SELECT COALESCE(
                MAX(
                    CAST(
                        NULLIF(SPLIT_PART(synergy_id, '-', 2), '') AS INTEGER
                    )
                ),
                0
            ) AS max_seq
            FROM {table}
            WHERE synergy_id LIKE %s
            """,
            (prefix + "-%",),
        )
        row = cur.fetchone() or {}
        max_seq = row.get("max_seq")
        if max_seq is not None:
            true_max_seq = max(true_max_seq, int(max_seq))

    return true_max_seq

# --- Synergy: preview (no DB writes) ---
@router.post("/pos/{po_id}/synergy_preview")
def synergy_preview(po_id: str, payload: Dict[str, Any] = Body(...)):
    line_ids = _uuid_list(payload.get("line_ids") or [])
    if not line_ids:
        return {"previews": [], "ai_notes": "No line_ids provided."}

    with db() as (con, cur):
        cur.execute(
            """
            SELECT pl.id, pl.qty, pl.product_name_raw, c.prefix
            FROM po_lines pl
            LEFT JOIN categories c ON c.id = pl.category_guess
            WHERE pl.purchase_order_id = %s AND pl.id = ANY(%s::uuid[])
            ORDER BY COALESCE(pl.created_at, NOW()) ASC, pl.id ASC
            """, (po_id, line_ids)
        )
        rows = list(cur.fetchall())
        seq_by_prefix: Dict[str, int] = {}

        def max_seq_for_prefix(prefix: str) -> int:
            if not prefix or prefix in seq_by_prefix: return seq_by_prefix.get(prefix, 0)
            
            max_seq = 0
            for table in ["inventory_items", "po_lines"]:
                cur.execute(
                    f"""
                    SELECT COALESCE(MAX(CAST(NULLIF(SPLIT_PART(synergy_id, '-', 2), '') AS INTEGER)), 0) AS max_seq
                    FROM {table} WHERE synergy_id LIKE %s
                    """, (prefix + "-%",)
                )
                max_seq = max(max_seq, int(_row_val(cur.fetchone(), "max_seq", 0, 0) or 0))

            seq_by_prefix[prefix] = max_seq
            return max_seq

        previews = []
        for r in rows:
            line_id = r.get("id")
            qty = int(r.get("qty") or 1) or 1
            name_raw = r.get("product_name_raw")
            prefix = (r.get("prefix") or "").strip()

            if not prefix:
                previews.append({"line_id": str(line_id), "product_name_raw": name_raw, "prefix": "", "qty": qty, "codes": [], "note": "No category prefix; cannot preview."})
                continue

            start = max_seq_for_prefix(prefix) + 1
            codes = [f"{prefix}-{str(start + i).zfill(5)}" for i in range(qty)]
            seq_by_prefix[prefix] = start + qty - 1

            previews.append({"line_id": str(line_id), "product_name_raw": name_raw, "prefix": prefix, "qty": qty, "codes": codes})

        return {"previews": previews, "ai_notes": "Local preview generated."}


# --- Synergy: mint (DB writes, one code per line) ---
@router.post("/pos/{po_id}/mint_synergy")
def mint_synergy(po_id: str, payload: dict = Body(default={})):
    line_ids  = _uuid_list(payload.get("line_ids") or [])
    overwrite = bool(payload.get("overwrite", False))

    with db() as (con, cur):
        if overwrite:
            update_sql = "UPDATE po_lines SET synergy_id = NULL WHERE "
            params = []
            if line_ids:
                update_sql += "id = ANY(%s::uuid[]);"
                params.append(line_ids)
            else:
                update_sql += "purchase_order_id = %s;"
                params.append(po_id)
            cur.execute(update_sql, tuple(params))

        cur.execute(
            """
            SELECT pl.id, c.prefix
            FROM po_lines pl
            LEFT JOIN categories c ON c.id = pl.category_guess
            WHERE pl.purchase_order_id = %s
              AND (%s::uuid[] IS NULL OR pl.id = ANY(%s::uuid[]))
              AND pl.synergy_id IS NULL
            ORDER BY COALESCE(pl.created_at, NOW()) ASC, pl.id ASC
            """,
            (po_id, line_ids if line_ids else None, line_ids if line_ids else None),
        )
        rows_to_mint = list(cur.fetchall())
        updated = 0

        for r in rows_to_mint:
            line_id, prefix = r.get("id"), (r.get("prefix") or "").strip()

            if not prefix:
                continue
            
            code = _get_next_synergy_code(cur, prefix)
            cur.execute("UPDATE po_lines SET synergy_id = %s WHERE id = %s", (code, line_id))
            
            updated += 1

        return {"updated": updated, "ai_notes": "Synergy IDs minted for PO lines."}

# --- Explode (by-line + group) ---
@router.get("/pos/{po_id}/mint-stats")
def mint_stats(po_id: str):
    """
    Return how many units are left to mint for this PO, based on po_lines vs inventory_items.

    We do the math per-line so things stay correct even if:
    - qty was changed after some items were already minted
    - lines were added/removed/split
    """
    with db() as (con, cur):
        cur.execute(
            """
            WITH line_totals AS (
              SELECT
                pl.id AS line_id,
                COALESCE(pl.qty, 1) AS qty
              FROM public.po_lines pl
              WHERE pl.purchase_order_id = %s
                AND COALESCE(pl.qty, 1) > 0
                AND pl.category_guess IS NOT NULL
            ),
            minted AS (
              SELECT
                ii.po_line_id AS line_id,
                COUNT(*) AS minted
              FROM public.inventory_items ii
              WHERE ii.purchase_order_id = %s
              GROUP BY ii.po_line_id
            )
            SELECT
              COALESCE(SUM(lt.qty), 0) AS total_qty,
              COALESCE(SUM(COALESCE(m.minted, 0)), 0) AS minted_from_lines,
              COALESCE(
                SUM(
                  GREATEST(
                    lt.qty - COALESCE(m.minted, 0),
                    0
                  )
                ),
                0
              ) AS pending
            FROM line_totals lt
            LEFT JOIN minted m ON m.line_id = lt.line_id
            """,
            (po_id, po_id),
        )
        row = cur.fetchone() or {}

        total_qty = int(row.get("total_qty") or 0)
        minted = int(row.get("minted_from_lines") or 0)
        pending = int(row.get("pending") or 0)

        return {
            "total_qty": total_qty,
            "minted": minted,
            "pending": pending,
        }


@router.post("/imports/{po_id}/explode-by-line")
def explode_by_line(po_id: str):
    with db() as (con, cur):
        # 1. Get counts of existing items per line
        cur.execute(
            "SELECT po_line_id, COUNT(*) AS n FROM public.inventory_items WHERE purchase_order_id = %s GROUP BY po_line_id",
            (po_id,)
        )
        existing_counts = {str(r["po_line_id"]): int(r["n"]) for r in cur.fetchall()}

        # 2. Get set of active Synergy IDs
        cur.execute(
            "SELECT synergy_code FROM public.inventory_items WHERE purchase_order_id = %s",
            (po_id,)
        )
        existing_codes = {r["synergy_code"] for r in cur.fetchall()}

        # 3. Fetch the lines (Include raw_json!)
        cur.execute(
         """
         SELECT pl.id, COALESCE(pl.qty, 1) AS qty, pl.unit_cost, pl.msrp,
           pl.category_guess AS category_id, COALESCE(c.prefix, '') AS prefix,
           pl.synergy_id, pl.raw_json
         FROM public.po_lines pl
         LEFT JOIN public.categories c ON c.id = pl.category_guess
         WHERE pl.purchase_order_id = %s ORDER BY pl.id
         """, (po_id,)
        )
        rows = cur.fetchall()

        from routes_synergy import _get_next_synergy_code # Ensure imported

        created, skipped = 0, 0

        for ln in rows:
            line_id = str(ln["id"])
            qty = int(ln["qty"] or 1)
            prefix = (ln["prefix"] or "").strip()
            cat_id = ln["category_id"]
            pre_minted = ln["synergy_id"]

            # --- PARSE SPECS AND NOTES ---
            raw = ln.get("raw_json")
            specs = {}
            tester_comment = None
            
            if raw:
                if isinstance(raw, str):
                    try: raw = json.loads(raw)
                    except: raw = {}
                # Specs logic
                specs = raw.get("specs") or {}
                # Notes logic: map 'item_notes' to 'tester_comment'
                tester_comment = raw.get("item_notes")
            # -----------------------------

            if not cat_id or not prefix:
                skipped += qty; continue
            
            have = existing_counts.get(line_id, 0)
            need = max(0, qty - have)

            if need <= 0:
                skipped += qty
                continue

            for i in range(need):
                if pre_minted and pre_minted not in existing_codes:
                    code = pre_minted
                    existing_codes.add(pre_minted) 
                else:
                    code = _get_next_synergy_code(cur, prefix)

                # Insert with Specs and Comment
                cur.execute(
                    """
                    INSERT INTO public.inventory_items
                      (synergy_code, purchase_order_id, po_line_id, category_id, 
                       cost_unit, msrp, status, specs, tester_comment)
                    VALUES (%s, %s, %s, %s, %s, %s, 'INTAKE', %s, %s)
                    """, (
                        code, po_id, line_id, cat_id, 
                        ln["unit_cost"] or 0, ln["msrp"] or 0, 
                        json.dumps(specs), tester_comment
                    )
                )
                created += 1
        
        state = "done" if created > 0 and skipped == 0 else ("partial" if created > 0 else "already")
        return {"ok": True, "created": created, "skipped": skipped, "state": state}

class ExplodeGroupBody(BaseModel):
    categoryId: Optional[str] = None
    prefix: Optional[str] = None

@router.post("/imports/{po_id}/explode_group")
def explode_group(po_id: str, body: ExplodeGroupBody):
    with db() as (con, cur):
        default_prefix = body.prefix or "GEN"
        if body.categoryId:
            cur.execute("SELECT prefix FROM categories WHERE id=%s", (body.categoryId,))
            row = cur.fetchone()
            if row and row["prefix"]: default_prefix = row["prefix"]

        if body.categoryId:
            cur.execute("""
                SELECT id, purchase_order_id, msrp, unit_cost, qty, category_guess AS category_id
                FROM po_lines WHERE purchase_order_id=%s AND category_guess=%s
            """, (po_id, body.categoryId))
        else:
            cur.execute("""
                SELECT id, purchase_order_id, msrp, unit_cost, qty, category_guess AS category_id
                FROM po_lines WHERE purchase_order_id=%s AND category_guess IS NULL
            """, (po_id,))
        lines = cur.fetchall()
        if not lines: return {"ok": True, "created": 0}

        created = 0
        try:
            for ln in lines:
                prefix = default_prefix
                qty = int(ln["qty"] or 1)
                for _ in range(qty):
                    code = _get_next_synergy_code(cur, prefix)
                    cur.execute("""
                        INSERT INTO public.inventory_items
                          (synergy_code, purchase_order_id, po_line_id, category_id, cost_unit, msrp, status)
                        VALUES (%s,%s,%s,%s,%s,%s,'INTAKE')
                    """, (
                        code, ln["purchase_order_id"], ln["id"],
                        ln["category_id"], ln["unit_cost"] or 0, ln["msrp"] or 0
                    ))
                    created += 1
        except Exception as e:
            con.rollback(); raise HTTPException(500, str(e))
        return {"ok": True, "created": created}

# --- Prefix counters ---
@router.get("/prefix/{prefix}/peek")
def prefix_peek(prefix: str):
    with db() as (con, cur):
        next_seq = _get_starting_seq_for_prefix(cur, prefix) + 1
        return Response(content=fmt_synergy(prefix, next_seq), media_type="text/plain")
@router.post("/synergy-id/prefix/{prefix}/reset")
def prefix_reset(prefix: str, body: Dict[str, Any] = Body(default_factory=dict)):
    """
    Reset a prefix's next_seq to the safe default:
    one after the highest sequence used in data.
    """
    actor = body.get("actor") or body.get("actor_name")

    with db() as (con, cur):
        true_max_seq = _get_true_max_seq(cur, prefix)
        safe_next = true_max_seq + 1

        cur.execute(
            """
            INSERT INTO id_prefix_counters(prefix, next_seq)
            VALUES (%s, %s)
            ON CONFLICT (prefix)
            DO UPDATE SET next_seq = EXCLUDED.next_seq
            """,
            (prefix, safe_next),
        )

        log_synergy_event(
            cur,
            event_type="reset_to_default",
            prefix=prefix,
            seq=safe_next,
            code=fmt_synergy(prefix, safe_next),
            actor_name=actor,
            meta={"safe_next": safe_next},
        )

        return {"ok": True, "next": safe_next}

@router.post("/prefix/{prefix}/take")
def prefix_take(prefix: str):
    with db() as (con, cur):
        code = _get_next_synergy_code(cur, prefix)
        return Response(content=code, media_type="text/plain")

@router.post("/prefix/{prefix}/set")
def prefix_set(prefix: str, body: Dict[str, Any] = Body(...)):
    """
    Manually set the next sequence number for a prefix, and log it.

    body = {
      "next": 123,
      "actor": "Becki",
      "reason": "printed labels offline"
    }

    If "next" is below the minimum safe value, we reject it with a 400 so we
    don't ever create duplicate Synergy IDs.
    """
    raw_next = body.get("next", 1)
    try:
        nxt = int(raw_next)
    except Exception:
        raise HTTPException(400, "next must be an integer")

    if nxt < 1:
        raise HTTPException(400, "next must be >= 1")

    actor = body.get("actor") or body.get("actor_name")
    reason = body.get("reason")

    with db() as (con, cur):
        # 1) Current counter (if any)
        cur.execute(
            "SELECT next_seq FROM id_prefix_counters WHERE prefix = %s",
            (prefix,),
        )
        row = cur.fetchone() or {}
        old_next = int(row.get("next_seq") or 0)

        # 2) True max used in data
        true_max_seq = _get_true_max_seq(cur, prefix)

        # 3) Minimum safe next number: one after whatever is already used,
        #    and also not less than the current counter (if any).
        safe_min_next = max(true_max_seq + 1, old_next or 1)

        if nxt < safe_min_next:
            # Reject so we never create duplicates
            # Include safe_min_next so the UI can reset to that.
            raise HTTPException(
                status_code=400,
                detail={
                    "message": (
                        f"Cannot set next sequence for prefix {prefix} to {nxt} "
                        f"because IDs up to {safe_min_next - 1} may already exist. "
                        f"The minimum safe value is {safe_min_next}."
                    ),
                    "safe_next": safe_min_next,
                },
            )

        # 4) Update counter
        cur.execute(
            """
            INSERT INTO id_prefix_counters(prefix, next_seq)
            VALUES (%s, %s)
            ON CONFLICT (prefix)
            DO UPDATE SET next_seq = EXCLUDED.next_seq
            """,
            (prefix, nxt),
        )

        # 5) Audit log
        code_preview = fmt_synergy(prefix, nxt)
        log_synergy_event(
            cur,
            event_type="manual_set_next",
            prefix=prefix,
            seq=nxt,
            code=code_preview,
            actor_name=actor,
            meta={"old_next": old_next, "new_next": nxt, "reason": reason},
        )

        return {"ok": True, "next": nxt}
    
@router.get("/synergy-id/overview")
def synergy_id_overview():
    """
    High-level view of each prefix and its pointer + stats.
    Used by the Synergy ID Settings modal.
    """
    with db() as (con, cur):
        # 1) Current pointers from id_prefix_counters
        cur.execute(
            """
            SELECT prefix, next_seq
            FROM id_prefix_counters
            ORDER BY prefix
            """
        )
        prefix_rows = cur.fetchall() or []
        by_prefix = {row["prefix"]: row for row in prefix_rows}

        # 2) Aggregated mint stats from the audit log
        cur.execute(
            """
            SELECT
              prefix,
              COUNT(*) FILTER (WHERE event_type = 'mint') AS minted_count,
              MAX(seq)  FILTER (WHERE event_type = 'mint') AS max_minted_seq,
              MAX(created_at) FILTER (WHERE event_type = 'mint') AS last_minted_at
            FROM synergy_id_events
            GROUP BY prefix
            """
        )
        stats_rows = cur.fetchall() or []
        stats_by_prefix = {row["prefix"]: row for row in stats_rows}

        items: List[Dict[str, Any]] = []

        for prefix, row in by_prefix.items():
            stats = stats_by_prefix.get(prefix, {})

            next_seq = int(_row_val(row, "next_seq", 0, 0) or 0)

            minted_count = int(_row_val(stats, "minted_count", 0, 0) or 0)
            max_minted_seq = _row_val(stats, "max_minted_seq", None, None)
            max_minted_seq = int(max_minted_seq) if max_minted_seq is not None else None
            last_minted_at = _row_val(stats, "last_minted_at", None, None)

            # Fallback: if we have no mint events yet for this prefix,
            # derive stats from existing data so "0 minted" isn't misleading.
            if minted_count == 0 and (max_minted_seq is None or max_minted_seq == 0):
                true_max_seq = _get_true_max_seq(cur, prefix)
                if true_max_seq > 0:
                    minted_count = true_max_seq
                    max_minted_seq = true_max_seq

            items.append(
                {
                    "prefix": prefix,
                    "next_seq": next_seq,
                    "next_code": fmt_synergy(prefix, next_seq) if next_seq > 0 else None,
                    "minted_count": minted_count,
                    "max_minted_seq": max_minted_seq,
                    "last_minted_at": last_minted_at,
                }
            )

        return {"items": items}

@router.get("/synergy-id/events")
def synergy_id_events(
    prefix: Optional[str] = Query(None),
    po_id: Optional[UUID] = Query(None),
    code: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """
    Paginated audit log of Synergy ID events.
    Can be filtered by prefix, PO, or code.
    """
    where_clauses = []
    params: List[Any] = []

    if prefix:
        where_clauses.append("e.prefix = %s")
        params.append(prefix)

    if po_id:
        where_clauses.append("e.po_id = %s")
        params.append(str(po_id))

    if code:
        where_clauses.append("e.code = %s")
        params.append(code)

    where_sql = "WHERE " + " AND ".join(where_clauses) if where_clauses else ""

    with db() as (con, cur):
        cur.execute(
            f"""
            SELECT
              e.id,
              e.created_at,
              e.actor_name,
              e.po_id,
              e.po_line_id,
              e.inventory_id,
              e.prefix,
              e.code,
              e.seq,
              e.event_type,
              e.meta,
              po.po_number
            FROM synergy_id_events e
            LEFT JOIN purchase_orders po ON po.id = e.po_id
            {where_sql}
            ORDER BY e.created_at DESC
            LIMIT %s OFFSET %s
            """,
            (*params, limit, offset),
        )
        rows = cur.fetchall() or []

    events: List[Dict[str, Any]] = []
    for r in rows:
        events.append(
            {
                "id": str(r["id"]),
                "created_at": r["created_at"],
                "actor_name": r.get("actor_name"),
                "po_id": str(r["po_id"]) if r.get("po_id") else None,
                "po_line_id": str(r["po_line_id"]) if r.get("po_line_id") else None,
                "inventory_id": str(r["inventory_id"]) if r.get("inventory_id") else None,
                "prefix": r["prefix"],
                "code": r["code"],
                "seq": int(r["seq"]),
                "event_type": r["event_type"],
                "meta": r.get("meta") or {},
                "po_number": r.get("po_number"),
            }
        )

    return {"items": events}