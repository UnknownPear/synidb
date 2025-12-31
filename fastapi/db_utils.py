import os
import re
import math
import psycopg2
from psycopg2.extras import RealDictCursor, register_uuid as _pg_register_uuid
from uuid import UUID
from contextlib import contextmanager
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime, date
import json
from psycopg2 import pool
from config import DATABASE_URL

try:
    _pg_register_uuid()
except Exception:
    pass

pg_pool = None
try:
    pg_pool = psycopg2.pool.ThreadedConnectionPool(
        1, 20, DATABASE_URL, sslmode=os.getenv("PGSSLMODE", "prefer")
    )
except Exception as e:
    print(f"Warning: Connection pool could not be created: {e}")

def db_conn():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL not set")
    return psycopg2.connect(DATABASE_URL, sslmode=os.getenv("PGSSLMODE", "prefer"))

@contextmanager
def db():
    """
    Context manager that gets a connection from the pool,
    yields (con, cur), and ensures the connection is returned to the pool.
    """
    con = None
    try:
        # Get connection from pool if available, else create new
        if pg_pool:
            con = pg_pool.getconn()
        else:
            con = psycopg2.connect(DATABASE_URL, sslmode=os.getenv("PGSSLMODE", "prefer"))
            
        cur = con.cursor(cursor_factory=RealDictCursor)
        try:
            yield con, cur
            con.commit()
        except Exception:
            if con:
                con.rollback()
            raise
        finally:
            if cur:
                cur.close()
            # Return to pool or close if no pool
            if pg_pool and con:
                pg_pool.putconn(con)
            elif con:
                con.close()
    except Exception as e:
        raise e



def to_num(v) -> Optional[float]:
    if v is None:
        return None
    try:
        # Remove all non-numeric characters except dot and minus sign
        return float(re.sub(r"[^0-9.\-]", "", str(v)))
    except Exception:
        return None

def _row_val(row, key, idx=0, default=0):
    """Safely get a column from a DB row that might be a dict or tuple."""
    if row is None:
        return default
    # dict-like
    if isinstance(row, dict):
        return row.get(key, default)
    # tuple-like
    try:
        return row[idx]
    except Exception:
        return default

def _uuid_list(ids: List[Any]) -> List[str]:
    """Validate & normalize incoming UUID strings for ANY(%s::uuid[])."""
    out = []
    for x in ids or []:
        try:
            out.append(str(UUID(str(x))))
        except Exception:
            pass
    return out

def is_uuid_like(s) -> bool:
    try:
        UUID(str(s))
        return True
    except Exception:
        return False

def to_ymd(v):
    if v in (None, ""): return None
    if isinstance(v, datetime): v = v.date()
    if isinstance(v, date):     return v.isoformat()
    try:
        return datetime.fromisoformat(str(v).replace("Z","+00:00")).date().isoformat()
    except Exception:
        s = str(v)[:10]
        return s if len(s) == 10 else None

def map_header(h: str) -> str:
    s = (h or "").strip().lower()
    # quantity
    if s == "qty" or "quantity" in s or re.search(r"\b(qty|quant)\b", s):
        return "qty"
    # prices
    if "stock image" in s or "price paid" in s or s == "cost" or "unit cost" in s or "our cost" in s:
        return "unit_cost"
    if "orig" in s and "retail" in s:
        return "msrp"
    if s == "msrp" or "list" in s:
        return "msrp"
    # identifiers
    if "upc" in s:
        return "upc"
    if "asin" in s:
        return "asin"
    # make / model / condition (for structured sheets like your camera template)
    if s == "make":
        return "make"
    if s == "model":
        return "model"
    if s == "condition":
        return "condition"
    # names / descriptions
    if "product" in s or "desc" in s or "name" in s or "listing title" in s or "title" in s:
        return "product_name_raw"
    # category
    if "category" in s:
        return "category_guess"
    # totals we explicitly ignore downstream
    if "total" in s and ("ret" in s or "ext" in s or "extended" in s):
        return "total_ignored"
    return h


def _resolve_po_id(cur: psycopg2.extras.DictCursor, po_ref: str) -> str:
    """
    Accepts either a UUID id or a human PO number.
    Returns the internal purchase_orders.id or raises HTTPException(404).
    """
    from fastapi import HTTPException # Local import to avoid circular dependency

    # Try UUID path first
    try:
        uuid_obj = UUID(po_ref)
        cur.execute("SELECT id FROM purchase_orders WHERE id = %s LIMIT 1", (str(uuid_obj),))
        row = cur.fetchone()
        if row:
            return row["id"]
    except Exception:
        pass  # not a uuid or not found

    # Fallback: treat as PO number (case/space-insensitive)
    cur.execute(
        """
        SELECT id
        FROM purchase_orders
        WHERE LOWER(TRIM(po_number)) = LOWER(TRIM(%s))
        LIMIT 1
        """,
        (po_ref,),
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"Purchase order '{po_ref}' not found")
    return row["id"]


# -------------------------------
# BM25 helpers for fuzzy category
# -------------------------------

_WORD_RE = re.compile(r"[a-z0-9]+")

def _bm25_tokenize(text: str) -> List[str]:
    text = (text or "").lower()
    return _WORD_RE.findall(text)


def _bm25_build_index(docs: List[str]) -> Tuple[List[List[str]], List[int], float, dict]:
    """
    Build a simple BM25 index over a list of doc strings.

    Returns:
        tokenized_docs: list of token lists
        doc_lens: list of lengths
        avgdl: average document length
        df: dict[token] -> document frequency
    """
    tokenized_docs: List[List[str]] = []
    doc_lens: List[int] = []
    df: dict = {}

    for doc in docs:
        tokens = _bm25_tokenize(doc)
        tokenized_docs.append(tokens)
        doc_lens.append(len(tokens))
        seen = set()
        for t in tokens:
            if t not in seen:
                df[t] = df.get(t, 0) + 1
                seen.add(t)

    avgdl = (sum(doc_lens) / len(doc_lens)) if doc_lens else 0.0
    return tokenized_docs, doc_lens, avgdl, df


def _bm25_scores(
    query: str,
    docs: List[str],
    k1: float = 1.5,
    b: float = 0.75,
) -> List[float]:
    """
    Compute BM25 scores for a query string against a list of doc strings.
    """
    q_tokens = _bm25_tokenize(query)
    if not q_tokens or not docs:
        return [0.0] * len(docs)

    tokenized_docs, doc_lens, avgdl, df = _bm25_build_index(docs)
    N = len(docs)
    scores: List[float] = [0.0] * N

    # precompute IDF for query tokens
    idf: dict = {}
    for t in set(q_tokens):
        n_q = df.get(t, 0)
        # BM25 IDF with small-sample smoothing
        idf[t] = max(0.0, math.log((N - n_q + 0.5) / (n_q + 0.5) + 1.0))

    for i, tokens in enumerate(tokenized_docs):
        score = 0.0
        if not tokens:
            scores[i] = 0.0
            continue

        dl = doc_lens[i]
        tf_counts: dict = {}
        for t in tokens:
            tf_counts[t] = tf_counts.get(t, 0) + 1

        for t in q_tokens:
            if t not in tf_counts:
                continue
            tf = tf_counts[t]
            denom = tf + k1 * (1.0 - b + b * dl / (avgdl or 1.0))
            score += idf.get(t, 0.0) * (tf * (k1 + 1.0) / denom)

        scores[i] = score

    return scores


def resolve_category_id(cur: psycopg2.extras.DictCursor, guess: str | None) -> Optional[str]:
    """Resolve a loose category guess string to categories.id.

    Matching strategy (in order):
    1. Exact match on label or prefix (case-insensitive).
    2. Label/prefix starting with the guess.
    3. Label containing the guess as a whole word.
    4. BM25 fuzzy match against all category labels (no hard-coded rules).
    """
    if not guess:
        return None
    q = (str(guess) or "").strip()
    if not q:
        return None

    try:
        # 1) Exact match on label or prefix
        cur.execute(
            """
            SELECT id
            FROM categories
            WHERE lower(label) = lower(%s) OR lower(prefix) = lower(%s)
            LIMIT 1
            """,
            (q, q),
        )
        row = cur.fetchone()
        if row and row.get("id"):
            return row["id"]

        # 2) Label/prefix starting with the guess
        cur.execute(
            """
            SELECT id
            FROM categories
            WHERE lower(label) LIKE lower(%s) || '%%'
               OR lower(prefix) LIKE lower(%s) || '%%'
            LIMIT 1
            """,
            (q, q),
        )
        row = cur.fetchone()
        if row and row.get("id"):
            return row["id"]

        # 3) Label containing the guess as a whole word
        q_lower = q.lower()
        like_middle = f"% {q_lower} %"
        like_start = f"{q_lower} %"
        like_end = f"% {q_lower}"

        cur.execute(
            """
            SELECT id
            FROM categories
            WHERE ' ' || lower(label) || ' ' LIKE %s
               OR ' ' || lower(label) || ' ' LIKE %s
               OR ' ' || lower(label) || ' ' LIKE %s
            LIMIT 1
            """,
            (like_start, like_middle, like_end),
        )
        row = cur.fetchone()
        if row and row.get("id"):
            return row["id"]

        # 4) BM25 fuzzy match as a generic fallback
        cur.execute("SELECT id, label FROM categories")
        rows = cur.fetchall() or []
        if not rows:
            return None

        ids: List[str] = []
        labels: List[str] = []
        for r in rows:
            cid = r.get("id")
            label = r.get("label")
            if cid and label:
                ids.append(str(cid))
                labels.append(str(label))

        if not labels:
            return None

        scores = _bm25_scores(q, labels)
        best_idx = max(range(len(scores)), key=lambda i: scores[i])
        best_score = scores[best_idx]
        best_id = ids[best_idx]

        # Small threshold so we don't map totally unrelated text
        if best_score <= 0.2:
            return None

        return best_id

    except Exception:
        return None
