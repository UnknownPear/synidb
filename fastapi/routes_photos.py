
import time
import json
import re
from typing import List, Optional, Dict, Any
from uuid import UUID
from fastapi import APIRouter, HTTPException, Query, Body, Depends
from pydantic import BaseModel
import psycopg2.extras

from config import HAVE_CLOUDINARY, CLOUDINARY_API_SECRET, CLOUDINARY_API_KEY, CLOUDINARY_CLOUD_NAME
from db_utils import db, _uuid_list

router = APIRouter(prefix="/photos", tags=["Photo Gallery"])

# --- Models ---

class PhotoCreate(BaseModel):
    product_name: str
    category_id: Optional[str] = None
    grade: str = "A"
    tags: List[str] = []
    cloudinary_ids: List[str] 
    urls: List[str]
    created_by: Optional[int] = None

class PhotoAssignBody(BaseModel):
    stock_photo_id: str
    synergy_ids: List[str]
    mode: str = "replace" 

class PhotoSearchBody(BaseModel):
    q: Optional[str] = None
    grade: Optional[str] = None
    category_id: Optional[str] = None
    tags: Optional[List[str]] = None
    limit: int = 50
    offset: int = 0

class SmartMatchRequest(BaseModel):
    product_name: str
    grade: Optional[str] = None
    tester_comment: Optional[str] = None
    category_id: Optional[str] = None

# --- Maintenance ---
@router.post("/maintenance/normalize-tags")
def normalize_tags():
    """Helper to convert all existing tags in DB to lowercase."""
    with db() as (con, cur):
        cur.execute("""
            UPDATE stock_photos 
            SET tags = ARRAY(
                SELECT DISTINCT LOWER(TRIM(tag)) 
                FROM unnest(tags) AS tag 
                WHERE TRIM(tag) <> ''
            )
        """)
        count = cur.rowcount
    return {"ok": True, "updated_rows": count}

# --- Cloudinary Signature ---
@router.get("/signature")
def get_upload_signature():
    if not HAVE_CLOUDINARY:
        raise HTTPException(503, "Cloudinary not configured on server.")
    import cloudinary.utils
    timestamp = int(time.time())
    params_to_sign = {"timestamp": timestamp, "folder": "synergy_stock"}
    signature = cloudinary.utils.api_sign_request(params_to_sign, CLOUDINARY_API_SECRET)
    return {
        "signature": signature, "timestamp": timestamp,
        "cloud_name": CLOUDINARY_CLOUD_NAME, "api_key": CLOUDINARY_API_KEY, "folder": "synergy_stock"
    }

# --- CRUD ---

@router.post("")
def create_stock_photo(body: PhotoCreate):
    if not body.urls: raise HTTPException(400, "At least one URL required")
    
    # NORMALIZE TAGS: Lowercase + Strip + Unique
    clean_tags = list({t.strip().lower() for t in body.tags if t.strip()})

    with db() as (con, cur):
        cat_id = body.category_id
        if not cat_id:
            cur.execute("SELECT id, label FROM categories")
            cats = cur.fetchall()
            for c in cats:
                if c['label'] and c['label'].lower() in body.product_name.lower():
                    cat_id = str(c['id']); break

        cur.execute("""
            INSERT INTO stock_photos (product_name, category_id, grade, tags, cloudinary_ids, urls, created_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id
        """, (body.product_name.strip(), cat_id, body.grade.upper(), clean_tags, body.cloudinary_ids, body.urls, body.created_by))
        new_id = cur.fetchone()['id']
    return {"ok": True, "id": str(new_id)}

@router.put("/{photo_id}")
def update_stock_photo(photo_id: str, body: PhotoCreate):
    """Updates an existing stock photo entry including reordering photos or changing tags."""
    if not body.urls: raise HTTPException(400, "At least one URL required")

    clean_tags = list({t.strip().lower() for t in body.tags if t.strip()})

    with db() as (con, cur):
        # 1. Verify existence
        cur.execute("SELECT id FROM stock_photos WHERE id = %s", (photo_id,))
        if not cur.fetchone():
            raise HTTPException(404, "Stock photo entry not found")

        # 2. Auto-detect category if missing
        cat_id = body.category_id
        if not cat_id:
            cur.execute("SELECT id, label FROM categories")
            cats = cur.fetchall()
            for c in cats:
                if c['label'] and c['label'].lower() in body.product_name.lower():
                    cat_id = str(c['id']); break

        # 3. Update
        cur.execute("""
            UPDATE stock_photos 
            SET product_name = %s,
                category_id = %s,
                grade = %s,
                tags = %s,
                cloudinary_ids = %s,
                urls = %s
            WHERE id = %s
        """, (
            body.product_name.strip(), 
            cat_id, 
            body.grade.upper(), 
            clean_tags, 
            body.cloudinary_ids, 
            body.urls, 
            photo_id
        ))
        
    return {"ok": True, "id": photo_id}

@router.post("/search")
def search_photos(body: PhotoSearchBody):
    where_clauses = ["1=1"]
    params = []

    if body.q:
        tokens = [t.strip() for t in body.q.split() if len(t) > 1]
        if tokens:
            text_parts = []
            for t in tokens:
                # Search product name OR tags text
                text_parts.append("(product_name ILIKE %s OR array_to_string(tags, ' ') ILIKE %s)")
                params.append(f"%{t}%")
                params.append(f"%{t}%")
            where_clauses.append(f"({' AND '.join(text_parts)})")

    if body.grade:
        where_clauses.append("grade = %s")
        params.append(body.grade.upper())

    if body.category_id:
        where_clauses.append("category_id = %s")
        params.append(body.category_id)

    if body.tags and len(body.tags) > 0:
        # NORMALIZE SEARCH: Convert input tags to lowercase before querying
        search_tags = [t.strip().lower() for t in body.tags if t.strip()]
        if search_tags:
            where_clauses.append("tags @> %s::text[]")
            params.append(search_tags)

    sql = f"""
        SELECT sp.id, sp.product_name, sp.grade, sp.tags, sp.urls, sp.cloudinary_ids, sp.created_at,
            sp.category_id, c.label as category_label, u.name as uploader_name
        FROM stock_photos sp
        LEFT JOIN categories c ON c.id = sp.category_id
        LEFT JOIN app_users u ON u.id = sp.created_by
        WHERE {' AND '.join(where_clauses)}
        ORDER BY sp.created_at DESC LIMIT %s OFFSET %s
    """
    params.append(body.limit)
    params.append(body.offset)

    with db() as (con, cur):
        cur.execute(sql, params)
        rows = [dict(r) for r in cur.fetchall()]
        cur.execute(f"SELECT COUNT(*) as total FROM stock_photos sp WHERE {' AND '.join(where_clauses)}", params[:-2]) 
        total = cur.fetchone()['total']

    return {"items": rows, "total": total}

@router.delete("/{photo_id}")
def delete_photo(photo_id: str):
    if not HAVE_CLOUDINARY: raise HTTPException(503, "Cloudinary not configured")
    import cloudinary.uploader
    with db() as (con, cur):
        cur.execute("SELECT cloudinary_ids FROM stock_photos WHERE id = %s", (photo_id,))
        row = cur.fetchone()
        if not row: raise HTTPException(404, "Photo not found")
        cur.execute("DELETE FROM stock_photos WHERE id = %s", (photo_id,))
        c_ids = row.get('cloudinary_ids') or []
        if c_ids:
            try:
                for cid in c_ids: cloudinary.uploader.destroy(cid)
            except Exception: pass
    return {"ok": True}

# --- Tags & Categories Helpers ---

@router.get("/tags/suggest")
def suggest_tags():
    """Returns all unique tags used in the system (lowercase)."""
    with db() as (con, cur):
        # Return distinct lowercase tags to ensure clean suggestions
        cur.execute("SELECT DISTINCT LOWER(unnest(tags)) as tag FROM stock_photos ORDER BY tag")
        rows = cur.fetchall()
        return [r['tag'] for r in rows if r['tag']]

@router.get("/categories/counts")
def get_category_counts():
    with db() as (con, cur):
        cur.execute("SELECT category_id, COUNT(*) as count FROM stock_photos WHERE category_id IS NOT NULL GROUP BY category_id")
        return {str(r['category_id']): r['count'] for r in cur.fetchall()}

@router.post("/assign")
def assign_photo_to_inventory(body: PhotoAssignBody):
    if not body.synergy_ids: return {"ok": True, "updated": 0}
    with db() as (con, cur):
        cur.execute("SELECT id, urls, cloudinary_ids FROM stock_photos WHERE id = %s", (body.stock_photo_id,))
        photo = cur.fetchone()
        if not photo: raise HTTPException(404, "Stock photo not found")
        
        urls = photo.get("urls") or []
        cids = photo.get("cloudinary_ids") or []
        photo_objs = [{"url": u, "id": cids[i] if i < len(cids) else "", "is_stock": True, "stock_id": str(photo['id'])} for i, u in enumerate(urls)]
        
        where_clause = "synergy_id = ANY(%s)" if all(len(x) > 20 for x in body.synergy_ids) else "synergy_code = ANY(%s)"
        sql = f"UPDATE inventory_items SET photos = %s::jsonb, stock_photo_id = %s WHERE {where_clause}"
        if body.mode != 'replace':
             sql = f"UPDATE inventory_items SET photos = COALESCE(photos, '[]'::jsonb) || %s::jsonb, stock_photo_id = %s WHERE {where_clause}"
        
        cur.execute(sql, (json.dumps(photo_objs), body.stock_photo_id, body.synergy_ids))
        updated = cur.rowcount
    return {"ok": True, "updated": updated}

@router.post("/smart-match")
def smart_match_photos(body: SmartMatchRequest):
    """
    Finds the best stock photos for a specific inventory item based on:
    1. Name Similarity (Token overlap)
    2. Grade Matching (Bonus for exact grade match)
    3. Issue/Tag Matching (Extracts keywords from comments)
    """
    
    # 1. Normalize Inputs
    search_tokens = set(re.findall(r'\w+', body.product_name.lower()))
    
    # Extract potential tags from tester comments (e.g., "Silver", "Space Gray", "Scratches")
    # You can expand this "Issue Dictionary" over time
    issue_keywords = []
    if body.tester_comment:
        comment_lower = body.tester_comment.lower()
        common_tags = ["silver", "gray", "grey", "black", "white", "gold", "rose", "scratch", "dent", "cracked"]
        issue_keywords = [t for t in common_tags if t in comment_lower]

    with db() as (con, cur):
        # 2. Fetch Candidates (Broad Search)
        # We fetch anything that shares the Category OR looks somewhat similar
        sql = """
            SELECT id, product_name, grade, tags, urls, category_id
            FROM stock_photos
            WHERE category_id = %s 
               OR product_name ILIKE %s
        """
        # Create a loose search term (first 2 words of product name)
        loose_name = " ".join(body.product_name.split()[:2]) + "%"
        
        cur.execute(sql, (body.category_id, loose_name))
        candidates = cur.fetchall()

        scored_results = []

        for photo in candidates:
            score = 0
            p_name_tokens = set(re.findall(r'\w+', photo['product_name'].lower()))
            
            # A. Name Similarity Score (Jaccard-ish)
            intersection = search_tokens.intersection(p_name_tokens)
            score += len(intersection) * 10  # 10 points per matching word
            
            # B. Grade Score
            # Perfect match = big bonus. 
            # "A" photos are okay for "B" items, but not vice versa usually.
            p_grade = (photo['grade'] or "").upper()
            i_grade = (body.grade or "").upper()
            
            if p_grade == i_grade:
                score += 20
            elif p_grade == 'A' and i_grade == 'B':
                score += 10 # Allow using Grade A photos for Grade B items
            
            # C. Tag/Comment Matching
            # If stock photo has tags that match keywords found in tester comments (e.g. "Silver")
            p_tags = set(t.lower() for t in (photo['tags'] or []))
            for k in issue_keywords:
                if k in p_tags:
                    score += 15 # Bonus for matching color/condition tags
            
            # D. Penalties
            # If photo is "Rose Gold" but item text says "Silver", massive penalty
            for tag in p_tags:
                if tag in ["silver", "gray", "grey", "gold", "rose"] and tag not in issue_keywords and len(issue_keywords) > 0:
                     # Only penalize if we actually FOUND a color in the tester notes to contradict it
                     pass 

            scored_results.append({
                **dict(photo),
                "score": score,
                "match_reason": f"Matched {len(intersection)} words" + (", Grade Match" if p_grade == i_grade else "")
            })

        # 3. Sort by Score
        scored_results.sort(key=lambda x: x['score'], reverse=True)
        
        return {
            "best_match": scored_results[0] if scored_results else None,
            "candidates": scored_results[:5] # Return top 5
        }