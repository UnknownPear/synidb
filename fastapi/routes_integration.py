import ipaddress
import os
import re
import json
import time
import hashlib
from urllib.parse import urlparse
from uuid import UUID
from typing import Optional, List, Dict, Any, Tuple
from fastapi import APIRouter, HTTPException, Query, Body, Path
from fastapi.responses import JSONResponse
import psycopg2.extras
import requests
import xml.etree.ElementTree as ET
from datetime import datetime, date, timedelta, timezone
from pydantic import BaseModel
from ai_utils import ai_find_upc

from db_utils import db, to_num
from config import session, CONNECT_TIMEOUT, READ_TIMEOUT, DIRECTUS_URL, DIRECTUS_TOKEN, AVG_CACHE_TTL_MS, COOKIE_STORE
from ebay_utils import (
    get_ebay_token, _ebay_app_access_token, _parse_ebay_legacy_id,
    _trading_get_item, _trading_get_last_sold, _fetch_price_via_trading,
    _summarize_sales_for_legacy_id, _get_item_quantities
)
from routes_inventory import AssocBody, EbaySyncBody
EBAY_TRADING_ENDPOINT = globals().get("EBAY_TRADING_ENDPOINT") or "https://api.ebay.com/ws/api.dll"
EBAY_NS = globals().get("EBAY_NS") or {"e": "urn:ebay:apis:eBLBaseComponents"}
EBAY_MARKETPLACE_ID = globals().get("EBAY_MARKETPLACE_ID") or "EBAY_US"


def is_safe_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ('http', 'https'): return False
        
        hostname = parsed.hostname
        # Resolve to IP
        try:
            ip = ipaddress.ip_address(hostname)
        except ValueError:
            import socket
            ip = ipaddress.ip_address(socket.gethostbyname(hostname))
            
        if ip.is_private or ip.is_loopback:
            return False
        return True
    except:
        return False


router = APIRouter()

# --- Shared Models (from core logic) ---
class BulkRefreshBody(BaseModel):
    synergyIds: List[str]
    days: int = 365



class UpcRequest(BaseModel):
    product_name: str

@router.post("/ai/find-upc")
def find_upc_endpoint(body: UpcRequest):
    if not body.product_name:
        raise HTTPException(status_code=400, detail="Product name required")
    
    try:
        result = ai_find_upc(body.product_name)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Scraping / Pricing Helpers ---
def soup_from_html(html: str):
    from bs4 import BeautifulSoup, FeatureNotFound
    try: return BeautifulSoup(html or "", "lxml")
    except FeatureNotFound: return BeautifulSoup(html or "", "html.parser")

SPEC_KEYS = ("brand", "model", "processor", "cpu", "ram", "storage", "screen", "size")

def build_query_from_row(row: dict) -> str:
    toks = []
    name = (row.get("productName") or row.get("product_name") or "").strip()
    if name:
        toks.append(name)
    
    specs = row.get("specs") or {}
    flat = {k: row.get(k) for k in SPEC_KEYS if row.get(k)}
    merged = {**specs, **{k: v for k, v in flat.items() if v}}
    
    cpu = merged.get("processor") or merged.get("cpu")
    if cpu:
        toks.append(str(cpu))

    ram = merged.get("ram")
    if ram:
        toks.append(str(ram).replace(" GB", "GB"))

    storage = merged.get("storage")
    if storage:
        toks.append(str(storage).replace(" GB", "GB"))

    size = merged.get("screen") or merged.get("size")
    if size:
        toks.append(str(size).replace(' "', '').replace('"', "").replace(" inch", "").strip() + '"')
        
    brand = merged.get("brand")
    model = merged.get("model")
    
    if brand and (brand not in name):
        toks.insert(0, str(brand))
    if model and (model not in name):
        toks.append(str(model))
        
    return " ".join(t for t in toks if t).strip()

def parse_price(text: str) -> Tuple[str, Optional[float], str]:
    if not text: return ("", None, "")
    t = re.sub(r"\s+", " ", text).strip()
    m = re.search(r"(?:(US|C|CA)\s*)?([$£€])\s?(\d[\d,]*\.?\d*)", t, re.I)
    if not m: return ("", None, t)
    region = (m.group(1) or "").upper()
    sym, val = m.group(2), m.group(3)
    try: num = float(val.replace(",", ""))
    except ValueError: num = None
    if sym == "$": cur = "CA" if region in ("C", "CA") else "US"
    elif sym == "£": cur = "GB"
    elif sym == "€": cur = "EU"
    else: cur = ""
    return (cur, num, (region + " " if region else "") + sym + val)

def shape_rows_from_items(items, hits: int) -> List[Dict[str, Any]]:
    rows = []
    for li in items[:hits]:
        a = li.select_one("a.s-item__link")
        title_el = li.select_one(".s-item__title") or li.select_one("h3")
        price_el = li.select_one(".s-item__price")
        if not a or not a.get("href") or not title_el: continue
        title = re.sub(r"\s+", " ", title_el.get_text(strip=True))
        price_text = re.sub(r"\s+", " ", price_el.get_text(strip=True)) if price_el else ""
        cur, num, pretty = parse_price(price_text)
        rows.append({"url": a["href"], "title": title, "priceText": pretty or price_text, "currency": cur, "priceNum": num})
    return rows

def summarize_rows(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    usd = [r for r in rows if r["currency"] == "US" and isinstance(r.get("priceNum"), (int, float))]
    valid = len(usd)
    avg = round(sum(r["priceNum"] for r in usd) / valid, 2) if valid else 0.0
    return {"sampled": len(rows), "valid": valid, "avg": avg}

def scrape_via_playwright(url: str, hits: int = 20) -> Dict[str, Any]:
    # Placeholder for Playwright (requires installation) - original function preserved
    return {"ok": False, "error": f"playwright_not_available: module not found"}

# --- Add these imports at the top of routes_integration.py ---
import socket
import ipaddress
from urllib.parse import urlparse
from fastapi import APIRouter, HTTPException, Query, Body, Path, Depends # Ensure Depends is imported

# --- Add this Helper Function ---
def validate_url_safety(url: str):
    """
    In Production (DEBUG=False), prevents the server from accessing 
    internal/private IP addresses (SSRF Protection).
    In Local (DEBUG=True), allows everything so you can test freely.
    """
    # 1. DEBUG BYPASS (Local Network Safety Valve)
    if os.getenv("DEBUG", "False").lower() in ("true", "1", "t"):
        return True

    try:
        parsed = urlparse(url)
        if parsed.scheme not in ('http', 'https'):
            raise ValueError("Invalid scheme")

        hostname = parsed.hostname
        if not hostname:
            raise ValueError("No hostname")

        # Resolve hostname to IP
        ip_str = socket.gethostbyname(hostname)
        ip = ipaddress.ip_address(ip_str)

        # 2. PRODUCTION CHECK
        if ip.is_private or ip.is_loopback or ip.is_link_local:
            print(f"[Security] Blocked SSRF attempt to {url} (resolved to {ip_str})")
            raise HTTPException(status_code=400, detail="Restricted URL")
            
    except Exception as e:
        # If we can't resolve it or it's invalid, block it in prod
        if isinstance(e, HTTPException): raise e
        print(f"[Security] URL Validation failed: {e}")
        raise HTTPException(status_code=400, detail="Invalid URL")

# --- Replace the existing scrape function ---
@router.get("/scrape")
def scrape(url: str, hits: int = 15):
    # Apply the security check
    validate_url_safety(url)

    from requests.utils import dict_from_cookiejar
    started = time.time()
    hits = max(1, min(200, hits))
    cookie = COOKIE_STORE.get("local", "")
    
    try: 
        r = session.get(url, headers={"Cookie": cookie}, timeout=(CONNECT_TIMEOUT, READ_TIMEOUT), allow_redirects=True)
    except Exception as e: 
        raise HTTPException(502, str(e))
    
    soup = soup_from_html(r.text)
    items = soup.select(".srp-results .s-item") or soup.select("li.s-item") or soup.select("[data-testid='item-cell']")
    
    should_retry = (not items) or (r is not None and r.status_code >= 500)
    if should_retry:
        try:
            warm = session.get("https://www.ebay.com/", timeout=(CONNECT_TIMEOUT, READ_TIMEOUT))
            warm_jar = dict_from_cookiejar(session.cookies)
            if warm_jar: COOKIE_STORE["local"] = "; ".join(f"{k}={v}" for k, v in warm_jar.items())
        except Exception: pass
        
        time.sleep(0.8)
        try:
            r = session.get(url, headers={"Cookie": COOKIE_STORE.get("local", "")}, timeout=(CONNECT_TIMEOUT, READ_TIMEOUT), allow_redirects=True)
            soup = soup_from_html(r.text)
            items = soup.select(".srp-results .s-item") or soup.select("li.s-item") or soup.select("[data-testid='item-cell']")
        except Exception: items = None

        if not items:
            pw = scrape_via_playwright(url, hits)
            if pw.get("ok"):
                return {"ok": True, "endpoint": url, "status": r.status_code if isinstance(r, requests.Response) else None,
                        "durationMs": int((time.time() - started) * 1000), **pw, "via": "playwright"}
            title_snippet = (soup.title.string if soup and soup.title else "")[:160] if isinstance(soup, type(soup)) else ""
            raise HTTPException(502, f"no_results_from_index; snippet={title_snippet}")

    rows = shape_rows_from_items(items, hits)
    summary = summarize_rows(rows)
    return {"ok": True, "endpoint": url, "status": r.status_code, "durationMs": int((time.time() - started) * 1000),
            "sampled": summary["sampled"], "valid": summary["valid"], "avg": summary["avg"], "rows": rows, "via": "requests"}

@router.get("/sold_avg")
def sold_avg(q: Optional[str] = None, row: Optional[str] = None, limit: int = 60):
    if not q and row:
        try: q = build_query_from_row(json.loads(row))
        except Exception: pass
    if not q: raise HTTPException(400, "q or row required")

    hits = max(1, min(200, limit))
    site = "https://www.ebay.com/sch/i.html"
    url = f"{site}?_nkw={requests.utils.quote(q)}&LH_Complete=1&LH_Sold=1&_sop=13"

    started = time.time()
    cookie = COOKIE_STORE.get("local", "")
    
    try: r = session.get(url, headers={"Cookie": cookie}, timeout=(CONNECT_TIMEOUT, READ_TIMEOUT), allow_redirects=True)
    except Exception: r = None

    if r and r.status_code < 400:
        soup = soup_from_html(r.text)
        items = soup.select(".srp-results .s-item") or soup.select("li.s-item") or soup.select("[data-testid='item-cell']")
    else: items = None

    if not items:
        pw = scrape_via_playwright(url, hits)
        if pw.get("ok"):
            return {"ok": True, "endpoint": url, "status": r.status_code if isinstance(r, requests.Response) else None,
                    "durationMs": int((time.time() - started) * 1000), **pw, "via": "playwright"}
        raise HTTPException(502, "no_results_from_index")

    rows = shape_rows_from_items(items, hits)
    summary = summarize_rows(rows)
    return {"ok": True, "endpoint": url, "status": (r.status_code if isinstance(r, requests.Response) else None),
            "durationMs": int((time.time() - started) * 1000), "sampled": summary["sampled"], "valid": summary["valid"],
            "avg": summary["avg"], "rows": rows[:10], "via": "requests"}

@router.get("/browse_avg")
def browse_avg(
    q: str,
    limit: int = 100,
    filter_raw: Optional[str] = Query(None, alias="filter"),
    priceCurrency: str = "USD",
):
    from collections import Counter
    if not q: raise HTTPException(400, "q required")

    currency = (priceCurrency or "USD").upper()
    fixed_price = "buyingOptions:{FIXED_PRICE}" in (filter_raw or "")
    condition = "USED"
    if filter_raw and "conditions:{" in filter_raw:
        try: condition = filter_raw.split("conditions:{", 1)[1].split("}", 1)[0].split("|")[0].strip().upper()
        except Exception: pass

    def _avg_key(q, fixed_price, condition, currency, limit, min_price, max_price, category_ids):
        payload = {"q": (q or "").strip().lower(), "fixed": bool(fixed_price), "condition": (condition or "").upper(),
                   "currency": (currency or "").upper(), "limit": int(limit or 100), "min_price": min_price,
                   "max_price": max_price, "category_ids": category_ids or ""}
        s = json.dumps(payload, sort_keys=True)
        return hashlib.sha1(s.encode()).hexdigest()

    key = _avg_key(q, fixed_price, condition, currency, limit, None, None, None)
    now_ms = int(time.time() * 1000)

    # Directus Cache Lookup (Stub)
    def _directus_get(key: str):
        if not (DIRECTUS_URL and DIRECTUS_TOKEN): return None
        r = session.get(f"{DIRECTUS_URL}/items/market_avg", headers={"Authorization": f"Bearer {DIRECTUS_TOKEN}"},
                        params={"filter[key][_eq]": key, "limit": 1}, timeout=(CONNECT_TIMEOUT, READ_TIMEOUT))
        data = r.json().get("data") or []
        return data if data else None

    cached = _directus_get(key)
    if cached:
        age = now_ms - int(cached.get("created_at_ms", 0))
        ttl = int(cached.get("ttl_ms", AVG_CACHE_TTL_MS))
        if 0 <= age < ttl:
            return {"ok": True, "source": "cache", "currency": cached.get("currency"), "sampled": cached.get("sampled", 0),
                    "valid": cached.get("valid", 0), "avg": cached.get("avg", 0.0), "rows": cached.get("rows") or []}

    # eBay API Call
    if not (os.getenv("EBAY_CLIENT_ID") and os.getenv("EBAY_CLIENT_SECRET")):
        raise HTTPException(500, "EBAY_CLIENT_ID / EBAY_CLIENT_SECRET required")

    try:
        access = _ebay_app_access_token()
    except Exception as e:
        raise HTTPException(502, f"oauth_failed: {e}")

    params = {"q": q, "limit": max(1, min(200, int(limit))), "priceCurrency": currency}
    params["filter"] = filter_raw or "buyingOptions:{FIXED_PRICE},conditions:{USED}"

    r = session.get("https://api.ebay.com/buy/browse/v1/item_summary/search", params=params, headers={"Authorization": f"Bearer {access}"}, timeout=(CONNECT_TIMEOUT, READ_TIMEOUT))
    if r.status_code != 200: raise HTTPException(502, f"browse_failed: {r.status_code} {r.text[:200]}")

    data = r.json()
    rows: List[Dict[str, Any]] = []
    for it in data.get("itemSummaries", []):
        p = it.get("price") or {}
        price_num = to_num(p.get("value"))
        rows.append({"title": it.get("title"), "url": it.get("itemWebUrl"), "priceText": f"{p.get('currency','')} {p.get('value')}",
                     "priceNum": price_num, "currency": p.get("currency", "")})

    currs = [r["currency"] for r in rows if r.get("currency")]
    dominant = "USD" if "USD" in currs else (Counter(currs).most_common(1)[0][0] if currs else "")
    prices = [r["priceNum"] for r in rows if isinstance(r.get("priceNum"), (int, float)) and r["currency"] == dominant]
    avg = round(sum(prices) / len(prices), 2) if prices else 0.0

    payload = {
        "ok": True,
        "source": "browse_api",
        "currency": dominant,
        "sampled": len(rows),
        "valid": len(prices),
        "avg": avg,
        "rows": rows[:10],
    }

    # Directus Cache Save (Stub)
    def _directus_save(record: dict):
        if not (DIRECTUS_URL and DIRECTUS_TOKEN): return
        session.post(f"{DIRECTUS_URL}/items/market_avg", headers={"Authorization": f"Bearer {DIRECTUS_TOKEN}", "Content-Type": "application/json"},
                     json=record, timeout=(CONNECT_TIMEOUT, READ_TIMEOUT))

    try:
        _directus_save({
            "key": key, "q": q, "filters": params.get("filter", ""), "currency": dominant, "sampled": len(rows),
            "valid": len(prices), "avg": avg, "rows": rows[:10], "created_at_ms": now_ms, "ttl_ms": AVG_CACHE_TTL_MS,
        })
    except Exception: pass

    return payload

def _parse_int(v, default=0):
    try:
        return int(str(v).strip())
    except Exception:
        return default

def _txt(el):
    return (el.text or "").strip() if el is not None else ""

@router.get("/api/browse_avg")
def browse_avg_alias(q: str, limit: int = 100, filter_raw: Optional[str] = Query(None, alias="filter"), priceCurrency: str = "USD"):
    return browse_avg(q=q, limit=limit, filter_raw=filter_raw, priceCurrency=priceCurrency)

@router.get("/api/sold_avg")
def sold_avg_alias(q: Optional[str] = None, row: Optional[str] = None, limit: int = 60):
    return sold_avg(q=q, row=row, limit=limit)

# --- Config Endpoints ---
@router.get("/pricing-config")
def get_pricing_config():
    with db() as (_, cur):
        cur.execute("SELECT data FROM public.pricing_config WHERE id = 1;")
        row = cur.fetchone()
        return {"data": (row["data"] if row and "data" in row else None)}

@router.put("/pricing-config")
def put_pricing_config(body: dict = Body(...)):
    data = body.get("data")
    if data is None or not isinstance(data, dict):
        return JSONResponse({"ok": False, "error": "Body must be { data: { ... } }"}, status_code=400)
    with db() as (con, cur):
        cur.execute(
            """
            INSERT INTO public.pricing_config (id, data, updated_at)
            VALUES (1, %s::jsonb, now())
            ON CONFLICT (id) DO UPDATE
            SET data = EXCLUDED.data, updated_at = now()
            """, (json.dumps(data),)
        )
        con.commit()
    return {"ok": True}

@router.get("/msrp")
def get_msrp(model_key: str = Query(...), year: int = Query(...)):
    with db() as (_, cur):
        cur.execute("SELECT msrp_usd FROM public.msrp_reference WHERE model_key = %s AND year = %s;", (model_key, year))
        row = cur.fetchone()
    msrp = float(row["msrp_usd"]) if row and row.get("msrp_usd") is not None else 999.00
    return {"model_key": model_key, "year": year, "msrp": round(msrp, 2)}

# --- eBay Integration Status/Refresh ---
@router.post("/integrations/ebay/associate-url")
def ebay_associate_url(body: AssocBody):
    legacy = _parse_ebay_legacy_id(body.ebayUrl)
    if not legacy: raise HTTPException(status_code=400, detail="Could not parse legacy item id from URL")
    with db() as (con, cur):
        cur.execute("""
            INSERT INTO ebay_links (synergy_id, ebay_url, legacy_item_id, updated_at)
            VALUES (%s, %s, %s, now())
            ON CONFLICT (synergy_id)
            DO UPDATE SET ebay_url = EXCLUDED.ebay_url, legacy_item_id = EXCLUDED.legacy_item_id, updated_at = now();
        """, (body.synergyId, body.ebayUrl, legacy))
        con.commit()
    return {"ok": True, "synergyId": body.synergyId, "legacyItemId": legacy}

# In routes_integration.py

@router.post("/integrations/ebay/refresh-sold-when/{synergy_id}")
def ebay_refresh_sold_when(synergy_id: str, days: int = 730):
    try:
        # 1. Resolve Legacy ID
        with db() as (con, cur):
            cur.execute("SELECT synergy_id, ebay_url, legacy_item_id FROM ebay_links WHERE synergy_id=%s", (synergy_id,))
            link = cur.fetchone()

            # Self-healing: if no link table entry, try to find URL in inventory items
            if not link:
                cur.execute("SELECT ebay_item_url FROM inventory_items WHERE synergy_code=%s", (synergy_id,))
                inv_row = cur.fetchone()
                if inv_row and inv_row.get("ebay_item_url"):
                    found_url = inv_row["ebay_item_url"]
                    from ebay_utils import _parse_ebay_legacy_id
                    found_legacy = _parse_ebay_legacy_id(found_url)
                    if found_legacy:
                        cur.execute("""
                            INSERT INTO ebay_links (synergy_id, ebay_url, legacy_item_id, updated_at)
                            VALUES (%s, %s, %s, now())
                            ON CONFLICT (synergy_id) 
                            DO UPDATE SET ebay_url = EXCLUDED.ebay_url, legacy_item_id = EXCLUDED.legacy_item_id, updated_at = now()
                            RETURNING synergy_id, ebay_url, legacy_item_id
                        """, (synergy_id, found_url, found_legacy))
                        link = cur.fetchone()
                        con.commit()

            if not link: 
                return JSONResponse(status_code=400, content={"ok": False, "error": "no_link_for_synergy"})

            ebay_url = link["ebay_url"]
            legacy = (link["legacy_item_id"] or "")
            if not legacy:
                from ebay_utils import _parse_ebay_legacy_id
                legacy = _parse_ebay_legacy_id(ebay_url or "")
                if not legacy: 
                    return JSONResponse(status_code=400, content={"ok": False, "error": "no_legacy_item_for_synergy"})
                cur.execute("UPDATE ebay_links SET legacy_item_id=%s, updated_at=now() WHERE synergy_id=%s RETURNING *", (legacy, synergy_id))
                con.commit()

        # Refresh User Token
        from ebay_utils import get_ebay_token, _get_item_quantities, _fetch_price_via_trading, _summarize_sales_for_legacy_id, _ebay_app_access_token
        from config import EBAY_MARKETPLACE_ID
        
        access = get_ebay_token()
        if not access: 
            raise HTTPException(status_code=502, detail="Could not get eBay token")
        
        # --- 2. Get Listing Basics (Trading API) ---
        qty_info = _get_item_quantities(access, legacy) or {}
        seller = qty_info.get("seller")
        status = qty_info.get("status")
        thumbnail = qty_info.get("mainImage")
        ebay_sku = qty_info.get("sku")
        title = qty_info.get("title") 
        
        price, currency, price_src = None, None, None
        try: 
            price, currency, price_src = _fetch_price_via_trading(access, legacy)
        except Exception: 
            pass

        # --- 3. Get Sales History (Fulfillment API) ---
        sales_data = _summarize_sales_for_legacy_id(legacy, days_back=days)
        sold_lifetime = sales_data.get("soldCount", 0) # Total units sold on eBay for this listing
        last_sold = sales_data.get("lastSoldAt")
        sales_list = sales_data.get("sales", [])

        # Extract Actual Sold Price
        actual_sold_price = None
        if sales_list:
            sales_list.sort(key=lambda x: x.get('creationDate', ''), reverse=True)
            recent_sale = sales_list[0]
            raw_sale_price = recent_sale.get("totalPrice")
            if raw_sale_price:
                try: actual_sold_price = float(str(raw_sale_price).replace(',', ''))
                except: pass

        # --- 4. Fallback / Enrichment: Browse API ---
        if not title or not price or not status or not thumbnail:
            try:
                app_token = _ebay_app_access_token()
                r_browse = session.get(
                    "https://api.ebay.com/buy/browse/v1/item/get_item_by_legacy_id",
                    params={"legacy_item_id": legacy},
                    headers={ "Authorization": f"Bearer {app_token}", "Accept": "application/json", "X-EBAY-C-MARKETPLACE-ID": EBAY_MARKETPLACE_ID },
                    timeout=(6, 10)
                )
                if r_browse.status_code == 200:
                    b_data = r_browse.json()
                    if not title: title = b_data.get("title")
                    if not status: status = ((b_data.get("availability") or {}).get("status") or "").upper()
                    if not price:
                         p_obj = b_data.get("price") or {}
                         if p_obj.get("value"):
                            price = to_num(p_obj.get("value"))
                            currency = p_obj.get("currency")
                    if not thumbnail: thumbnail = (b_data.get("image") or {}).get("imageUrl")
            except Exception: pass

        # --- 5. SMART SOLD LOGIC (Updated) ---
        should_mark_sold = False
        
        # Scenario A: Listing Ended Completely
        if status in ("Ended", "Completed", "Sold", "OUT_OF_STOCK"):
            should_mark_sold = True
        else:
            # Scenario B: Multi-Quantity Listing (Active, but units sold)
            # We compare Total eBay Sales vs. Items already marked SOLD in our DB
            with db() as (con, cur):
                # Count how many of OUR items linked to this specific eBay Legacy ID are already SOLD
                # We EXCLUDE the current synergy_id from the count to check "are the other slots taken?"
                cur.execute("""
                    SELECT COUNT(*) as c FROM inventory_items 
                    WHERE ebay_item_id = %s 
                      AND status = 'SOLD' 
                      AND synergy_code != %s
                """, (legacy, synergy_id))
                already_marked_sold = cur.fetchone()['c']
                
                # If eBay says 5 sold total, and we only have 4 marked sold in DB...
                # Then THIS item (being the 5th checked) must be one of the sold ones.
                if sold_lifetime > already_marked_sold:
                    should_mark_sold = True

        # 6. Final Database Update
        with db() as (con, cur):
            cur.execute("""
                UPDATE ebay_links SET sold_count = %s, last_sold_at = %s, updated_at = now()
                WHERE synergy_id = %s RETURNING synergy_id, ebay_url, legacy_item_id, last_sold_at, sold_count
            """, (sold_lifetime, last_sold, synergy_id))
            saved = cur.fetchone()
            
            update_parts = []
            update_vals = []

            if price is not None:
                update_parts.append("ebay_price = %s"); update_vals.append(price)
            
            # Always ensure ID is saved
            update_parts.append("ebay_item_id = %s"); update_vals.append(legacy)
            update_parts.append("ebay_item_url = %s"); update_vals.append(ebay_url)

            if thumbnail: update_parts.append("ebay_thumbnail = %s"); update_vals.append(thumbnail)
            if ebay_sku: update_parts.append("ebay_sku = %s"); update_vals.append(ebay_sku)

            # APPLY SMART SOLD LOGIC
            if should_mark_sold:
                update_parts.append("status = 'SOLD'")
                # If we have a recent sale price, use it. Otherwise use list price.
                final_sale_price = actual_sold_price if actual_sold_price else price
                if final_sale_price:
                    update_parts.append("sold_price = %s"); update_vals.append(final_sale_price)
                if last_sold:
                    update_parts.append("sold_at = %s"); update_vals.append(last_sold)
                else:
                    update_parts.append("sold_at = NOW()")

            if update_parts:
                sql = f"UPDATE inventory_items SET {', '.join(update_parts)} WHERE synergy_code = %s"
                update_vals.append(synergy_id)
                cur.execute(sql, tuple(update_vals))
            
            con.commit()

        return {
            "ok": True, "synergyId": synergy_id, "legacyItemId": legacy, "soldCount": sold_lifetime,
            "lastSoldAt": last_sold, "link": saved, "seller": seller, "listingStatus": status,
            "price": price, "currency": currency or "USD", "thumbnail": thumbnail, "sku": ebay_sku, 
            "title": title, "sales": sales_data.get("sales", []) 
        }

    except Exception as e:
        return JSONResponse(status_code=500, content={"ok": False, "error": "server_error", "detail": str(e)})
    
@router.post("/integrations/ebay/refresh-sold-when/bulk")
def ebay_refresh_bulk(body: BulkRefreshBody):
    out = {}
    for sid in body.synergyIds:
        try:
            # Directly call the function, which now returns a JSONResponse on error
            response = ebay_refresh_sold_when(sid, days=body.days)
            # Handle both dictionary and JSONResponse return types
            if isinstance(response, JSONResponse):
                 content = json.loads(response.body.decode())
                 out[sid] = {"ok": False, "error": content.get("detail") or content.get("error")}
            else:
                 out[sid] = {"ok": True, "lastSoldAt": response.get("lastSoldAt"), "soldCount": response.get("soldCount")}
        except HTTPException as e:
            out[sid] = {"ok": False, "error": e.detail}
    return out

@router.get("/integrations/ebay/status/{synergy_id}")
def ebay_status_one(synergy_id: str):
    with db() as (con, cur):
        cur.execute("""
          SELECT synergy_id, ebay_url, legacy_item_id, last_sold_at, sold_count, updated_at
            FROM ebay_links WHERE synergy_id = %s
        """, (synergy_id,))
        return cur.fetchone() or {}

@router.get("/integrations/ebay/status")
def ebay_status_bulk(ids: str = Query(..., description="comma-separated synergyIds")):
    wanted = [s.strip() for s in ids.split(",") if s.strip()]
    with db() as (con, cur):
        cur.execute("""
          SELECT synergy_id, ebay_url, legacy_item_id, last_sold_at, sold_count, updated_at
            FROM ebay_links WHERE synergy_id = ANY(%s)
        """, (wanted,))
        rows = {r["synergy_id"]: r for r in cur.fetchall()}
    return {sid: rows.get(sid) for sid in wanted}