import os
import re
import io
import json
import uuid
import base64
import tempfile
import asyncio
import psycopg2.extras
import requests
from typing import Optional, List, Dict, Any, Tuple
from fastapi import APIRouter, HTTPException, Query, Body, File, Form, UploadFile
from fastapi.responses import JSONResponse
from starlette.responses import StreamingResponse
import json as _json

from config import get_queue, rconn, HAVE_RQ, EBAY_OAUTH_TOKEN_URL, EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_MARKETPLACE_ID, session
from db_utils import db, db_conn, to_num, map_header, resolve_category_id
from ai_utils import (
    make_gemini_model, make_ai_parser_prompt, _gemini_parse_inline, normalize_spreadsheet_upload,
    _postprocess_lines, _local_preview_lines_from_bytes, _rows_to_lines, _parse_locally_from_file,
    _rows_to_csv_text, _merge_ai_with_local, parse_gemini_json, _call_pollinations
)
from pubsub_utils import _stream_pubsub_sse, _sse, _heartbeat
from config import HintedPreviewHints, UploadPreviewResponse

router = APIRouter()
q = get_queue()

# --- Async Job Endpoints ---
@router.post("/imports/ai-preview-jobs")
async def start_ai_preview_job(
    vendor_id: str = Form(...),
    file: UploadFile = File(...),
    expand_units: bool = Form(False),
    require_ai: bool = Form(False),
    limit_rows: int = Form(500),
):
    if not vendor_id: raise HTTPException(400, "vendor_id is required")
    if q is None: raise HTTPException(503, "Redis/RQ queue unavailable")

    raw = await file.read()
    filename = file.filename or "upload"
    ext = (filename.rsplit(".", 1)[-1] or "").lower()

    raw_b64 = base64.b64encode(raw).decode("ascii")

    job_id = str(uuid.uuid4())
    q.enqueue(
        "jobs.ai_preview_job",
        job_id,
        vendor_id,
        raw_b64,
        filename,
        ext,
        expand_units,
        limit_rows,
        require_ai,
        os.getenv("DATABASE_URL"),
        os.getenv("REDIS_URL"),
        job_id=job_id,
        description=f"AI preview for vendor {vendor_id}",
    )
    return {"ok": True, "job_id": job_id}

@router.post("/imports/ai-commit-jobs")
async def start_ai_commit_job(
    po_number: str = Form(...),
    file: UploadFile = File(...),
    vendor_id: str | None = Form(None),
    vendor_name: str | None = Form(None),
    category_id: str | None = Form(None),
    expand_units: bool = Form(False),
    allow_append: bool = Form(False),
):
    if q is None: raise HTTPException(503, "Redis/RQ queue unavailable")
    raw = await file.read()
    filename = file.filename or "upload"
    ext = (filename.rsplit(".", 1)[-1] or "").lower()
    raw_b64 = base64.b64encode(raw).decode("ascii")

    job_id = str(uuid.uuid4())
    q.enqueue(
        "jobs.ai_commit_job",
        job_id,
        po_number,
        vendor_id,
        vendor_name,
        category_id,
        expand_units,
        allow_append,
        raw_b64,
        filename,
        ext,
        os.getenv("DATABASE_URL"),
        os.getenv("REDIS_URL"),
        job_id=job_id,
        description=f"AI commit for PO {po_number}",
    )
    return {"ok": True, "job_id": job_id}

# --- Streaming Job Events ---
@router.get("/imports/ai-preview-jobs/{job_id}/events")
async def stream_ai_preview_events(job_id: str):
    return _stream_pubsub_sse(f"ai:preview:{job_id}")

@router.get("/imports/ai-commit-jobs/{job_id}/events")
async def stream_ai_commit_events(job_id: str):
    return _stream_pubsub_sse(f"ai:commit:{job_id}")

# In routes_import.py

@router.post("/imports/ai-preview-stream/{vendor_id}")
async def ai_preview_stream(
    vendor_id: str,
    po_file: UploadFile = File(...),
    require_ai: bool = Form(False), # This acts as our "Use AI" toggle
    ai_model: str = Form("openai"), # New parameter
    expand_units: bool = Form(False),
    limit_rows: int = Form(8000), 
):
    try:
        raw = await po_file.read()
    except Exception as e:
        return StreamingResponse(
            iter([_sse({"type": "error", "message": str(e)})]),
            media_type="text/event-stream",
        )

    filename_in = po_file.filename or "upload"
    ext_in = (filename_in.rsplit(".", 1)[-1] or "").lower()

    async def run_generator():
        tmp_path: str | None = None
        try:
            yield _sse({"type": "progress", "pct": 5, "label": "Normalizing spreadsheet..."})
            await asyncio.sleep(0.05)

            filename, ext, content = await asyncio.to_thread(
                normalize_spreadsheet_upload, filename_in, ext_in, raw
            )

            def write_temp_file():
                with tempfile.NamedTemporaryFile(delete=False, suffix=("." + ext)) as tmp:
                    tmp.write(content)
                    return tmp.name

            tmp_path = await asyncio.to_thread(write_temp_file)
            
            yield _sse({"type": "progress", "pct": 10, "label": "Performing local analysis..."})
            
            # Local parsing (CPU bound)
            local_rows = await asyncio.to_thread(_parse_locally_from_file, tmp_path, "." + ext)
            all_sample_rows = local_rows[:limit_rows]
            
            # --- PATH 1: LOCAL ONLY (Fast) ---
            if not require_ai:
                yield _sse({"type": "progress", "pct": 50, "label": "Mapping columns locally..."})
                await asyncio.sleep(0.2)
                
                # Use the robust _rows_to_lines we fixed earlier
                final_merged_lines = _rows_to_lines(all_sample_rows)
                detected_headers = list(all_sample_rows[0].keys()) if all_sample_rows else []
                final_ai_notes = ["AI Disabled. Used local keyword matching."]
                
                yield _sse({"type": "progress", "pct": 90, "label": "Formatting..."})

            # --- PATH 2: AI PROCESSING (Slower, Smarter) ---
            else:
                yield _sse({"type": "progress", "pct": 15, "label": f"Connecting to AI ({ai_model})..."})
                
                # FIX: Reduced Chunk Size to 10 to prevent timeouts
                CHUNK_SIZE = 10 
                total_rows = len(all_sample_rows)
                batches = [all_sample_rows[i : i + CHUNK_SIZE] for i in range(0, total_rows, CHUNK_SIZE)]
                total_batches = len(batches)
                
                detected_headers = []
                final_ai_notes = []
                
                # Semaphore to limit concurrent requests
                sem = asyncio.Semaphore(3) # Reduced concurrency slightly for stability
                abort_ai = False
                consecutive_failures = 0
                success_count = 0

                async def process_batch(batch_idx, chunk):
                    nonlocal abort_ai, consecutive_failures, detected_headers, success_count
                    
                    if abort_ai: return None

                    async with sem:
                        if abort_ai: return None 

                        chunk_csv_text = _rows_to_csv_text(chunk, limit=CHUNK_SIZE)
                        prompt = make_ai_parser_prompt(expand_units=False)
                        
                        # Add instruction to maintain order
                        full_prompt = prompt + "\n\nAnalyze this CSV chunk. Return JSON only. Maintain original order."

                        try:
                            # Pass the specific model selected by user
                            data = await asyncio.to_thread(_call_pollinations, full_prompt, chunk_csv_text, model=ai_model)
                            
                            consecutive_failures = 0
                            success_count += 1
                            
                            lines = (data or {}).get("lines") or []
                            
                            if not detected_headers:
                                detected_headers = (data or {}).get("detected_headers") or []
                                
                            return lines
                        except Exception as e:
                            print(f"Batch {batch_idx} failed: {e}")
                            consecutive_failures += 1
                            if consecutive_failures >= 3:
                                if not abort_ai:
                                    final_ai_notes.append("Aborted AI after multiple failures; switching to local parser.")
                                abort_ai = True
                            return None

                tasks = []
                for i, batch in enumerate(batches):
                    tasks.append(process_batch(i, batch))

                completed_count = 0
                for future in asyncio.as_completed(tasks):
                    try: await future
                    except: pass
                    
                    completed_count += 1
                    current_pct = 15 + int((completed_count / total_batches) * 75)
                    label_text = f"AI Parsing... ({completed_count}/{total_batches})"
                    if abort_ai: label_text = "AI Unstable. Completing with local data..."
                    
                    yield _sse({"type": "progress", "pct": current_pct, "label": label_text})

                results = await asyncio.gather(*tasks, return_exceptions=True)
                
                final_merged_lines = []
                for i, res in enumerate(results):
                    if isinstance(res, list):
                        final_merged_lines.extend(res)
                    else:
                        # Fallback for failed chunks
                        fallback_chunk = _rows_to_lines(batches[i])
                        final_merged_lines.extend(fallback_chunk)

                if success_count > 0:
                    final_ai_notes.append(f"AI parsed {success_count}/{total_batches} batches.")
                else:
                    final_ai_notes.append("AI unavailable, used local parser.")

            # --- FINALIZE ---
            yield _sse({"type": "progress", "pct": 98, "label": "Finalizing..."})
            
            # Post-process (casting types, normalizing fields)
            lines = await asyncio.to_thread(_postprocess_lines, final_merged_lines, expand_units=bool(expand_units))
            
            existing = [] # DB query removed for speed

            payload = {
                "new_po_lines": lines, 
                "existing_pos_summary": existing, 
                "headers_seen": detected_headers,
                "ai_notes": (" | ".join(final_ai_notes)).strip(),
                "ai_model": ai_model if require_ai else "local-parser",
            }
            yield _sse({"type": "complete", "payload": payload})

        except Exception as e:
            import traceback
            traceback.print_exc()
            yield _sse({"type": "error", "message": f"{type(e).__name__}: {str(e)}"})
        finally:
            # Security Fix: Safe delete
            if tmp_path and os.path.exists(tmp_path):
                try:
                    abs_tmp = os.path.abspath(tmp_path)
                    abs_tempdir = os.path.abspath(tempfile.gettempdir())
                    if abs_tmp.startswith(abs_tempdir):
                        os.remove(abs_tmp)
                except Exception: pass

    headers = { "Cache-Control": "no-cache, no-transform", "Connection": "keep-alive", "X-Accel-Buffering": "no" }
    return StreamingResponse(run_generator(), media_type="text/event-stream", headers=headers)

@router.post("/imports/ai-upload")
async def ai_upload(
    po_file: UploadFile | None = File(None),
    file: UploadFile | None = File(None),
    parsed_lines: Optional[str] = Form(None),
    po_number: str = Form(...),
    vendor_id: Optional[str] = Form(None),
    vendor_name: Optional[str] = Form(None),
    expand_units: bool = Form(False),
    category_id: Optional[str] = Form(None),
    allow_append: bool = Form(False),
):
    if not os.getenv("DATABASE_URL"): raise HTTPException(500, "DATABASE_URL not set")

    client_lines: list[dict] = []
    if parsed_lines:
        try: client_lines = json.loads(parsed_lines)
        except Exception as e: raise HTTPException(400, f"parsed_lines invalid JSON: {e}")

    f = po_file or file
    if not client_lines and f is None:
        raise HTTPException(400, "Upload a file or supply parsed_lines JSON from preview")

    # 1) Resolve vendor & PO
    with db_conn() as con, con.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("BEGIN")
        if not vendor_id:
            vname = (vendor_name or "").strip()
            if not vname: con.rollback(); raise HTTPException(400, "vendor_id or vendor_name is required")
            cur.execute("SELECT id FROM vendors WHERE name=%s LIMIT 1", (vname,))
            v = cur.fetchone()
            vendor_id = v["id"] if v else cur.execute("INSERT INTO vendors(name) VALUES (%s) RETURNING id", (vname,)) and cur.fetchone()["id"]
        
        cur.execute("SELECT id FROM purchase_orders WHERE vendor_id=%s AND po_number=%s LIMIT 1", (vendor_id, po_number))
        p = cur.fetchone()

        if p and not allow_append: con.rollback(); raise HTTPException(status_code=409, detail={"error": "DuplicatePO", "id": str(p["id"])})
        po_id = p["id"] if p and allow_append else (cur.execute("INSERT INTO purchase_orders (po_number, vendor_id, created_at) VALUES (%s,%s,NOW()) RETURNING id", (po_number, vendor_id)) or True) and cur.fetchone()["id"]
        con.commit()

    # 2) Build final lines
    used_ai, ai_model, ai_notes = False, "", ""
    lines: list[dict] = []

    if client_lines:
        lines = _postprocess_lines(client_lines, expand_units=expand_units)
        ai_notes = "Used preview lines; AI skipped."
    else:
        filename, ext_in = f.filename or "upload", (f.filename.rsplit(".", 1)[-1] or "").lower()
        raw = await f.read()
        filename, ext, content = normalize_spreadsheet_upload(filename, ext_in, raw)
        
        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=("." + ext)) as tmp:
                tmp.write(content)
                tmp_path = tmp.name

            local_rows = _parse_locally_from_file(tmp_path, "." + ext)
            local_lines = _rows_to_lines(local_rows)

            try:
                # model is ignored by _gemini_parse_inline when using Pollinations
                model, ai_model, _ = make_gemini_model()
                data = _gemini_parse_inline(file_bytes=content, filename=filename, ext=ext, expand_units=False, model=model)
                ai_lines = (data or {}).get("lines") or []
                merged = _merge_ai_with_local(ai_lines, local_lines)
                lines = _postprocess_lines(merged, expand_units=expand_units)
                ai_notes = (data or {}).get("notes") or "Parsed via Gemini (inline file)."
                used_ai = True
            except Exception as e:
                lines = _postprocess_lines(local_lines, expand_units=expand_units)
                ai_notes = f"AI unavailable; used local parser. ({type(e).__name__})"
        finally:
            # Security Fix: Safe delete
            if tmp_path and os.path.exists(tmp_path):
                try:
                    abs_tmp = os.path.abspath(tmp_path)
                    abs_tempdir = os.path.abspath(tempfile.gettempdir())
                    if abs_tmp.startswith(abs_tempdir):
                        os.remove(abs_tmp)
                except Exception: pass

    if not lines: raise HTTPException(400, "No item lines were parsed or provided.")

    # 3) Insert lines
    created = 0
    with db_conn() as con:
        cur = con.cursor(cursor_factory=psycopg2.extras.DictCursor)
        cur.execute("BEGIN")
        params = []
        for ln in lines:
            name = (ln.get("product_name_raw") or "").strip()
            if not name: continue
            qty = int(ln.get("qty") or 1)
            unit_cost = to_num(ln.get("unit_cost"))
            msrp = to_num(ln.get("msrp"))
            upc = ln.get("upc")
            asin = ln.get("asin")
            resolved_cat_id = category_id or resolve_category_id(cur, ln.get("category_id") or ln.get("category_guess"))
            params.append((po_id, name, upc, asin, qty, unit_cost, msrp, resolved_cat_id, _json.dumps(ln, default=str)))

        if params:
            psycopg2.extras.execute_values(
                cur,
                """
                INSERT INTO po_lines
                  (purchase_order_id, product_name_raw, upc, asin, qty, unit_cost, msrp, category_guess, raw_json)
                VALUES %s
                """, params, page_size=len(params),
            )
        con.commit()
        created = len(params)

    # 4) Return a compat job-shaped response
    job_id = f"inline-{uuid.uuid4().hex}"
    final_notes = (ai_notes + f" | expand_units={expand_units}").strip()

    return {
        "job_id": job_id,
        "status": "completed",
        "ok": True,
        "po_id": str(po_id),
        "created_lines": created,
        "ai_model": ai_model,
        "ai_notes": final_notes,
        "used_ai": used_ai,
    }
# --- START OF NEW ENDPOINT: Manual Commit from Preview Data ---
@router.post("/imports/manual-commit")
async def manual_commit(payload: Dict[str, Any] = Body(...)):
    po_number = (payload.get("po_number") or "").strip()
    vendor_id = payload.get("vendor_id")
    vendor_name = (payload.get("vendor_name") or "").strip()
    allow_append = bool(payload.get("allow_append", False))
    expand_units = bool(payload.get("expand_units", False))
    category_id = payload.get("category_id")
    client_lines = payload.get("lines") or []

    if not po_number: raise HTTPException(400, "po_number is required")
    if not vendor_id and not vendor_name: raise HTTPException(400, "vendor_id or vendor_name is required")
    if not isinstance(client_lines, list) or not client_lines: raise HTTPException(400, "lines array is required")
    
    with db_conn() as con, con.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        # Step 1: Resolve Vendor ID
        if not vendor_id:
            cur.execute("SELECT id FROM vendors WHERE name=%s LIMIT 1", (vendor_name,))
            v = cur.fetchone()
            if v:
                vendor_id = v["id"]
            else:
                cur.execute("INSERT INTO vendors(name) VALUES (%s) RETURNING id", (vendor_name,))
                vendor_id = cur.fetchone()["id"]
                con.commit()
        
        # Step 2: Resolve PO ID (handle duplicates/append)
        cur.execute("SELECT id FROM purchase_orders WHERE vendor_id=%s AND po_number=%s LIMIT 1", (vendor_id, po_number))
        p = cur.fetchone()
        if p and not allow_append:
            raise HTTPException(status_code=409, detail={"error": "DuplicatePO", "id": str(p["id"])})
        
        po_id = p["id"] if p else None
        if not po_id:
            cur.execute("INSERT INTO purchase_orders (po_number, vendor_id, created_at) VALUES (%s,%s,NOW()) RETURNING id", (po_number, vendor_id))
            po_id = cur.fetchone()["id"]
            con.commit()

        # Step 3: Process and insert lines
        lines_to_insert = _postprocess_lines(client_lines, expand_units=expand_units)
        if not lines_to_insert:
            raise HTTPException(400, "No valid lines were processed from the provided data.")

        params = []
        for ln in lines_to_insert:
            name = ln.get("product_name_raw")
            if not name: continue
            resolved_cat_id = category_id or resolve_category_id(cur, ln.get("category_id") or ln.get("category_guess"))
            params.append((
                po_id, name, ln.get("upc"), ln.get("asin"), ln.get("qty", 1),
                ln.get("unit_cost"), ln.get("msrp"), resolved_cat_id, _json.dumps(ln, default=str)
            ))

        if params:
            psycopg2.extras.execute_values(
                cur,
                """
                INSERT INTO po_lines
                  (purchase_order_id, product_name_raw, upc, asin, qty, unit_cost, msrp, category_guess, raw_json)
                VALUES %s
                """, params, page_size=len(params),
            )
        con.commit()
        
    return {
        "ok": True,
        "po_id": str(po_id),
        "created_lines": len(params),
        "ai_notes": "Committed from preview data.",
    }




# --- Legacy/Deprecated Preview endpoints (kept for compatibility) ---
@router.post("/imports/ai-preview/{vendor_id}")
async def ai_preview(
    vendor_id: str,
    po_file: UploadFile = File(...),
    expand_units: bool = Form(False),
):
    if po_file is None: raise HTTPException(400, "form field 'po_file' (file) is required")

    filename, ext = po_file.filename or "upload", (po_file.filename.rsplit(".", 1)[-1] or "").lower()
    content = await po_file.read()

    used_ai, model_name, ai_notes, headers_seen, lines = False, "", "", [], []

    try:
        model, model_name, _structured = make_gemini_model()
        filename, ext, content = normalize_spreadsheet_upload(filename, ext, content)
        data = _gemini_parse_inline(file_bytes=content, filename=filename, ext=ext, expand_units=False, model=model)
        used_ai = True
        headers_seen = (data or {}).get("detected_headers") or []
        ai_notes = (data or {}).get("notes") or "Parsed directly by Gemini (inline file)."
        raw_lines = (data or {}).get("lines") or []
        lines = _postprocess_lines(raw_lines, expand_units=expand_units)
    except Exception as e:
        raw_lines = _local_preview_lines_from_bytes(content, ext)
        lines = _postprocess_lines(raw_lines, expand_units=expand_units)
        ai_notes = f"AI unavailable or failed; used local preview. ({type(e).__name__})"

    with db_conn() as con, con.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT p.id, p.po_number, COALESCE(p.created_at, NOW()) AS created_at, COALESCE(SUM(pl.qty), 0)::int AS total_units,
                   COALESCE(SUM(COALESCE(pl.qty,0) * COALESCE(pl.unit_cost,0)), 0)::numeric(12,2) AS estimated_total_cost
            FROM purchase_orders p LEFT JOIN po_lines pl ON pl.purchase_order_id = p.id
            WHERE p.vendor_id = %s GROUP BY p.id, p.po_number, p.created_at
            ORDER BY COALESCE(p.created_at, NOW()) DESC, p.id DESC LIMIT 6;
        """, (vendor_id,))
        existing = []
        for r in cur.fetchall():
            d = dict(r)
            if d.get("id"):
                d["id"] = str(d["id"])
            if d.get("created_at"):
                d["created_at"] = d["created_at"].isoformat()
            try: d["estimated_total_cost"] = float(d.get("estimated_total_cost") or 0)
            except Exception: pass
            existing.append(d)

    payload = {
        "ok": True, "vendor_id": vendor_id, "file_name": filename, "new_po_lines": lines,
        "existing_pos_summary": existing, "ai_notes": (ai_notes + (f" | merged_with_local | expand_units={expand_units}" if ai_notes else f"merged_with_local | expand_units={expand_units}")).strip(),
        "headers_seen": headers_seen, "via": "gemini" if used_ai else ("xlsx" if ext.startswith("xl") else "csv"),
        "model": model_name,
    }
    return JSONResponse(
        content=payload,
        headers={"X-AI-Used": "1" if used_ai else "0", "X-AI-Model": model_name or ""},
    )

@router.post("/imports/preview/{vendor_id}")
async def imports_preview(vendor_id: str, po_file: UploadFile = File(...)):
    if po_file is None: raise HTTPException(400, "form field 'po_file' (file) is required")

    filename, ext = po_file.filename or "upload", (po_file.filename.rsplit(".", 1)[-1] or "").lower()
    content = await po_file.read()

    try:
        raw_lines = _local_preview_lines_from_bytes(content, ext)
    except HTTPException: raise
    except Exception as e: raise HTTPException(400, f"parse failed: {e}")

    with db_conn() as con, con.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT p.id, p.po_number, COALESCE(p.created_at, NOW()) AS created_at, COALESCE(SUM(pl.qty), 0)::int AS total_units,
                   COALESCE(SUM(COALESCE(pl.qty,0) * COALESCE(pl.unit_cost,0)), 0)::numeric(12,2) AS estimated_total_cost
            FROM purchase_orders p LEFT JOIN po_lines pl ON pl.purchase_order_id = p.id
            WHERE p.vendor_id = %s GROUP BY p.id, p.po_number, p.created_at
            ORDER BY COALESCE(p.created_at, NOW()) DESC, p.id DESC LIMIT 6;
        """, (vendor_id,))
        existing = []
        for r in cur.fetchall():
            d = dict(r)
            if d.get("id"):
                d["id"] = str(d["id"])
            if d.get("created_at"):
                d["created_at"] = d["created_at"].isoformat()
            existing.append(d)

    return {
        "ok": True, "vendor_id": vendor_id, "file_name": filename, "new_po_lines": raw_lines,
        "existing_pos_summary": existing, "via": "xlsx" if ext.startswith("xl") else "csv",
    }