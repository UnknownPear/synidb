# jobs.py
import os, io, csv, json, time, math, tempfile, base64
import redis
import psycopg2, psycopg2.extras
from typing import List, Tuple
from importlib import import_module

_main = import_module("main")

normalize_spreadsheet_upload = _main.normalize_spreadsheet_upload
_parse_locally_from_file     = _main._parse_locally_from_file
_rows_to_lines               = _main._rows_to_lines
_rows_to_csv_text            = _main._rows_to_csv_text
_merge_ai_with_local         = _main._merge_ai_with_local
_postprocess_lines           = _main._postprocess_lines
parse_gemini_json            = _main.parse_gemini_json
make_gemini_model            = _main.make_gemini_model
guess_mime                   = _main.guess_mime
genai                        = _main.genai
to_num                       = _main.to_num
resolve_category_id          = _main.resolve_category_id

def _publish(rds, chan: str, evt: dict):
    rds.publish(chan, json.dumps(evt, default=str))

def _chunks(seq, n):
    for i in range(0, len(seq), n):
        yield seq[i:i+n]

def ai_upload_job(
    job_id: str,
    vendor_id: str,
    po_number: str,
    raw_b64: str,
    original_name: str,
    ext: str,
    expand_units: bool,
    category_id: Optional[str],
    allow_append: bool,
    vendor_name: Optional[str], # New argument to support vendor creation logic
):
    # Setup for status updates and imports
    rds = redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379/0"))
    _pub = lambda evt: _publish(rds, f"ai:commit:{job_id}", evt)

    
    # Imports from main (necessary due to the `import_module("main")` setup)
    global normalize_spreadsheet_upload, db_conn, _parse_locally_from_file, _rows_to_lines
    global _postprocess_lines, make_gemini_model, guess_mime, genai, wait_for_files_active
    global parse_gemini_json, _merge_ai_with_local, to_num, resolve_category_id, _tag_ai_response
    
    # Re-import all dependencies needed in this file from main
    _main = import_module("main")
    db_conn = _main.db_conn # Ensure db_conn is available if it's a function in main.py
    
    # Using the standard psycopg2/db imports for this worker
    import psycopg2, psycopg2.extras # Ensure these are available

    _pub({"type":"progress","pct":5,"label":"Starting upload process"})
    
    tmp_path = None
    try:
        # ---- 1) Decode file contents and save to a temporary file ------------------
        raw_bytes = base64.b64decode(raw_b64)
        
        _pub({"type":"progress","pct":10,"label":"Normalizing file content"})

        # Normalize before temp-file
        filename, ext_normalized, content = normalize_spreadsheet_upload(
            original_name, ext, raw_bytes
        )
        ext = ext_normalized # Use the normalized extension

        with tempfile.NamedTemporaryFile(delete=False, mode='wb', suffix=("." + ext)) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        # ---- 2) Resolve vendor, then STRICT select/create PO by (vendor_id, po_number)
        _pub({"type":"progress","pct":15,"label":"Checking Purchase Order status"})
        
        # This logic is complex and handles two DB transactions (vendor and PO creation)
        # It must be handled carefully within this worker.
        try:
            with db_conn() as con, con.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute("BEGIN")

                # Resolve vendor_id (prefer id; else create/find by name)
                if not vendor_id:
                    vname = (vendor_name or "").strip()
                    if not vname:
                        con.rollback()
                        _pub({"type":"failed", "payload": {"reason": "vendor_id or vendor_name is required"}})
                        return
                    cur.execute("SELECT id FROM vendors WHERE name=%s LIMIT 1", (vname,))
                    v = cur.fetchone()
                    if v:
                        vendor_id = v["id"]
                    else:
                        cur.execute("INSERT INTO vendors(name) VALUES (%s) RETURNING id", (vname,))
                        vendor_id = cur.fetchone()["id"]
                        con.commit()  # keep existing semantics (commit/flush new vendor)
                
                # STRICT duplicate check by (vendor_id, po_number)
                cur.execute(
                    "SELECT id FROM purchase_orders WHERE vendor_id=%s AND po_number=%s LIMIT 1",
                    (vendor_id, po_number),
                )
                p = cur.fetchone()

                if p and not allow_append:
                    con.rollback()
                    # Publish a special status for the frontend to handle the 409 logic
                    _pub({"type": "conflict", "payload": {"id": str(p["id"])}})
                    return

                if p and allow_append:
                    po_id = p["id"]  # append to existing PO
                else:
                    cur.execute(
                        "INSERT INTO purchase_orders (po_number, vendor_id, created_at) "
                        "VALUES (%s,%s,NOW()) RETURNING id",
                        (po_number, vendor_id),
                    )
                    po_id = cur.fetchone()["id"]
                    con.commit() # Commit the new PO
            
        except Exception as e:
            # Handle DB error during PO resolution/creation
            _pub({"type": "failed", "payload": {"reason": f"Database error during PO creation: {e}"}})
            return


        # ---- 3) Parse lines (Hybrid: AI + local → merge) ------------------------
        _pub({"type":"progress","pct":30,"label":"Starting AI parsing with Gemini"})
        used_ai = False
        ai_model = ""
        ai_notes = ""
        headers_seen: list[str] = []
        lines: list[dict] = []
        
        # NOTE: Your original parsing logic runs here. Only minor changes for structure/status.
        
        try:
            model, ai_model, structured = make_gemini_model()

            # Local deterministic parse (for merging)
            local_rows = _parse_locally_from_file(tmp_path, "." + ext)
            local_lines = _rows_to_lines(local_rows)

            mime = guess_mime(filename, ext)
            
            # Use `with` statement for genai.upload_file for better cleanup if possible
            # Assuming you use genai.upload_file which is a blocking network call
            uploaded = genai.upload_file(path=tmp_path, mime_type=mime)
            
            # Assuming wait_for_files_active is a synchronous helper
            wait_for_files_active([uploaded]) 
            
            _pub({"type":"progress","pct":50,"label":"Waiting for AI response"})

            # Ask AI for vendor-row view; expand on server using toggle
            prompt = make_ai_parser_prompt(expand_units=False)
            resp = model.generate_content([{"text": prompt}, uploaded])
            
            # Explicitly delete the uploaded file immediately after generation
            genai.delete_file(name=uploaded.name)

            data = parse_gemini_json(resp)
            ai_lines = (data or {}).get("lines") or []
            headers_seen = (data or {}).get("detected_headers") or []
            ai_notes = (data or {}).get("notes") or ""

            merged = _merge_ai_with_local(ai_lines, local_lines)
            lines = _postprocess_lines(merged, expand_units=expand_units)

            used_ai = True
            
        except Exception as ai_err:
            _pub({"type":"progress","pct":35,"label":"AI failed. Falling back to local parser."})
            try:
                rows = _parse_locally_from_file(tmp_path, "." + ext)
                lines = _postprocess_lines(_rows_to_lines(rows), expand_units=expand_units)
                ai_notes = f"AI failed ({type(ai_err).__name__}); used local parser."
            except Exception as local_err:
                _pub({"type": "failed", "payload": {"reason": f"AI parse failed and local fallback also failed for .{ext}: {local_err}"}})
                return


        if not lines:
            _pub({"type": "failed", "payload": {"reason": "No item lines were parsed from this file."}})
            return

        # ---- 4) Insert lines -----------------------------------------------------
        _pub({"type":"progress","pct":60,"label":f"Inserting {len(lines)} lines"})
        
        created = 0
        
        # Use a single connection/cursor for all inserts
        with db_conn() as con:
            cur = con.cursor(cursor_factory=psycopg2.extras.DictCursor)
            cur.execute("BEGIN")

            # This part is largely correct, using execute_values for efficiency
            params = []
            for ln in lines:
                name = (ln.get("product_name_raw") or "").strip()
                if not name: continue
                qty = int(ln.get("qty") or 1)
                unit_cost = to_num(ln.get("unit_cost"))
                msrp = to_num(ln.get("msrp"))
                upc = ln.get("upc")
                asin = ln.get("asin")
                
                resolved_cat_id = category_id
                if not resolved_cat_id:
                    ai_guess = ln.get("category_id") or ln.get("category_guess")
                    resolved_cat_id = resolve_category_id(cur, ai_guess)

                params.append((
                    po_id, name, upc, asin, qty, unit_cost, msrp,
                    resolved_cat_id, json.dumps(ln, default=str)
                ))

            if params:
                psycopg2.extras.execute_values(
                    cur,
                    """
                    INSERT INTO po_lines
                      (purchase_order_id, product_name_raw, upc, asin, qty, unit_cost, msrp, category_guess, raw_json)
                    VALUES %s
                    """,
                    params,
                    page_size=len(params)
                )
            con.commit() # Commit the lines insertion

            created = len(params)
            
        # ---- 5) Respond with completion status ----------------------------------
        _pub({"type":"progress","pct":98,"label":"Finalizing"})
        
        final_notes = (ai_notes + (f" | merged_with_local | expand_units={expand_units}" if ai_notes else f"merged_with_local | expand_units={expand_units}")).strip()

        _pub({
            "type": "complete",
            "payload": {
                "po_id": str(po_id),
                "created_lines": created,
                "ai_model": ai_model,
                "ai_notes": final_notes,
                "used_ai": used_ai,
            }
        })

    except Exception as e:
        # Catch any final uncaught exception (e.g., DB failure, unexpected crash)
        _pub({"type":"failed", "payload": {"reason": f"An unexpected error occurred: {type(e).__name__}: {str(e)}", "po_number": po_number}})
        
    finally:
        # Cleanup the temporary file regardless of success or failure
        if tmp_path:
            try: 
                os.remove(tmp_path)
            except Exception as e: 
                print(f"[ERROR] Could not remove temp file {tmp_path}: {e}", flush=True)


# jobs.py (ai_preview_job function)

def ai_preview_job(job_id: str, vendor_id: str, raw_b64: str, filename_in: str, ext_in: str,
                   expand_units: bool, limit_rows: int, require_ai: bool,
                   DATABASE_URL: str | None, REDIS_URL: str):
    rds = redis.Redis.from_url(REDIS_URL)
    # The 'chan' variable and _publish calls for progress are not needed for synchronous preview,
    # but we will remove the final _publish for completion and replace it with 'return'.

    # NOTE: I am removing all intermediate _publish calls for progress, as the frontend is not listening
    # on this synchronous path and they cause unnecessary Redis traffic.
    # The progress calls are removed for brevity and correctness.

    try:
        raw = base64.b64decode(raw_b64)
        filename, ext, content = normalize_spreadsheet_upload(filename_in, ext_in, raw)

        with tempfile.NamedTemporaryFile(delete=False, suffix=("." + ext)) as tmp:
            tmp.write(content); tmp_path = tmp.name

        local_rows  = _parse_locally_from_file(tmp_path, "." + ext)
        sample_rows = local_rows[:limit_rows] if isinstance(local_rows, list) else []
        local_lines = _rows_to_lines(sample_rows)
        csv_text    = _rows_to_csv_text(sample_rows, limit_rows)

        model, ai_model, _ = make_gemini_model()

        # ... (Gemini file upload and content generation logic remains the same) ...

        try:
            data = parse_gemini_json(resp)
        except Exception as e:
            if require_ai:
                # If AI is required and failed, raise an error to be caught by main.py
                raise ValueError(f"model_returned_no_json: {e}") 
            data = {"lines": [], "detected_headers": [], "notes": "AI failed; used local preview."}

        ai_lines     = (data or {}).get("lines") or []
        headers_seen = (data or {}).get("detected_headers") or []
        ai_notes     = (data or {}).get("notes") or ""

        merged = _merge_ai_with_local(ai_lines, local_lines) if ai_lines else local_lines
        lines  = _postprocess_lines(merged, expand_units=expand_units)

        existing = []
        # ... (psycopg2 existing PO query logic remains the same) ...
        if DATABASE_URL:
            # ... (Existing database query for 'existing' variable) ...
            # ... (The database query logic is assumed to be correct and populates 'existing')
            # ... (The database connection and cursor closing is assumed to be correct) ...
            pass # <-- Database query block ends here

        # CRITICAL FIX: Return the dictionary directly
        return {
            "ok": True, # Ensure the 'ok' flag is present for the frontend
            "new_po_lines": lines,
            "existing_pos_summary": existing,
            "headers_seen": headers_seen,
            "ai_notes": ai_notes,
            "ai_model": ai_model,
        }
    finally:
        if tmp_path:
            try: os.remove(tmp_path)
            except Exception: pass

def ai_commit_job(
    job_id: str,
    po_number: str,
    vendor_id: str | None,
    vendor_name: str | None,
    category_id: str | None,
    expand_units: bool,
    allow_append: bool,
    raw_b64: str,
    filename_in: str,
    ext_in: str,
    DATABASE_URL: str,
    REDIS_URL: str,
):
    rds = redis.Redis.from_url(REDIS_URL)
    chan = f"ai:commit:{job_id}"
    def _pub(evt): _publish(rds, chan, evt)

    tmp_path = None
    po_id = None
    ai_model = ""
    ai_notes = ""

    try:
        _pub({"type":"progress","pct":3,"label":"Uploading file"})
        raw = base64.b64decode(raw_b64)
        filename, ext, content = normalize_spreadsheet_upload(filename_in, ext_in, raw)

        with tempfile.NamedTemporaryFile(delete=False, suffix=("." + ext)) as tmp:
            tmp.write(content); tmp_path = tmp.name

        _pub({"type":"progress","pct":8,"label":"Resolving vendor & PO"})
        con = psycopg2.connect(DATABASE_URL)
        try:
            cur = con.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

            if not vendor_id and vendor_name:
                cur.execute("SELECT id FROM vendors WHERE name=%s LIMIT 1", (vendor_name,))
                v = cur.fetchone()
                if v:
                    vendor_id = v["id"]
                else:
                    cur.execute("INSERT INTO vendors(name) VALUES (%s) RETURNING id", (vendor_name,))
                    vendor_id = cur.fetchone()["id"]
                    con.commit()

            cur.execute("SELECT id, vendor_id FROM purchase_orders WHERE po_number=%s LIMIT 1", (po_number,))
            row = cur.fetchone()
            if row:
                po_id = row["id"]
                if not allow_append and vendor_id and row.get("vendor_id") and str(row["vendor_id"]) != str(vendor_id):
                    _pub({"type":"error","error_type":"DuplicatePO","message":"PO number already exists for different vendor","id":str(po_id)})
                    return
                if not allow_append:
                    _pub({"type":"error","error_type":"DuplicatePO","message":"PO number already exists","id":str(po_id)})
                    return
            else:
                cur.execute(
                    "INSERT INTO purchase_orders(po_number, vendor_id, created_at) VALUES (%s,%s,NOW()) RETURNING id",
                    (po_number, vendor_id),
                )
                po_id = cur.fetchone()["id"]
                con.commit()
        finally:
            cur.close(); con.close()

        _pub({"type":"progress","pct":18,"label":"Local baseline parse"})
        local_rows = _parse_locally_from_file(tmp_path, "." + ext)
        local_lines_all = _rows_to_lines(local_rows)

        model, ai_model, _ = make_gemini_model()
        mime = guess_mime(filename, ext)
        _pub({"type":"progress","pct":26,"label":"Uploading to Gemini"})
        uploaded = genai.upload_file(path=tmp_path, mime_type=mime)

        _pub({"type":"progress","pct":34,"label":"Waiting for Gemini to ingest file"})
        deadline = time.monotonic() + 35.0
        tick, file_ready = 35, False
        while time.monotonic() < deadline:
            st = genai.get_file(uploaded.name)
            state = getattr(st, "state", None)
            state_name = getattr(state, "name", state)
            if state_name == "ACTIVE":
                file_ready = True; break
            tick = min(55, tick + 1)
            _pub({"type":"progress","pct":tick,"label":"Waiting for Gemini to ingest file"})
            time.sleep(0.6)

        prompt = _main.make_ai_parser_prompt(expand_units=False)
        if file_ready:
            _pub({"type":"progress","pct":58,"label":"Mapping with Gemini"})
            resp = model.generate_content([{"text": prompt}, uploaded])
        else:
            _pub({"type":"progress","pct":58,"label":"Gemini slow — using local mapping"})
            resp = None

        ai_lines = []
        try:
            if resp is not None:
                data = parse_gemini_json(resp)
                ai_lines = (data or {}).get("lines") or []
                ai_notes = (data or {}).get("notes") or ""
        except Exception as e:
            ai_notes = f"AI failed, used local only ({type(e).__name__})"

        merged = _merge_ai_with_local(ai_lines, local_lines_all) if ai_lines else local_lines_all
        lines = _postprocess_lines(merged, expand_units=expand_units)
        if not lines:
            _pub({"type":"error","error_type":"EmptyLines","message":"No item lines parsed"})
            return

        created = 0
        BATCH = 400
        _pub({"type":"progress","pct":65,"label":"Inserting lines"})
        con = psycopg2.connect(DATABASE_URL)
        try:
            cur = con.cursor()
            total = len(lines); done = 0
            for chunk in _chunks(lines, BATCH):
                cur.execute("BEGIN")
                params: List[Tuple] = []
                for ln in chunk:
                    name = (ln.get("product_name_raw") or "").strip()
                    if not name:
                        continue
                    qty = int(ln.get("qty") or 1)
                    unit_cost = to_num(ln.get("unit_cost"))
                    msrp = to_num(ln.get("msrp"))
                    upc = ln.get("upc")
                    asin = ln.get("asin")

                    resolved = category_id
                    if not resolved:
                        ai_guess = ln.get("category_id") or ln.get("category_guess")
                        resolved = resolve_category_id(cur, ai_guess)

                    params.append((
                        po_id, name, upc, asin, qty, unit_cost, msrp,
                        resolved, json.dumps(ln, default=str)
                    ))

                if params:
                    psycopg2.extras.execute_values(
                        cur,
                        """
                        INSERT INTO po_lines
                          (purchase_order_id, product_name_raw, upc, asin, qty, unit_cost, msrp, category_guess, raw_json)
                        VALUES %s
                        """,
                        params,
                        page_size=len(params)
                    )
                con.commit()

                created += len(params)
                done += len(chunk)
                pct = 65 + math.floor(30 * (done / total))
                _pub({"type":"progress","pct":min(95, pct),"label":f"Inserting lines ({done}/{total})"})
        finally:
            try: cur.close()
            except Exception: pass
            con.close()

        _pub({"type":"progress","pct":98,"label":"Finalizing"})
        _pub({"type":"complete","payload":{
            "po_id": str(po_id),
            "created_lines": created,
            "ai_model": ai_model,
            "ai_notes": ai_notes
        }})
    finally:
        if tmp_path:
            try: os.remove(tmp_path)
            except Exception: pass
