import os
import re
import json
import time
import base64
import requests
import xml.etree.ElementTree as ET
from datetime import datetime, date, timedelta, timezone
from typing import Optional, List, Dict, Any, Tuple
from urllib.parse import quote
from fastapi import HTTPException
from requests.utils import dict_from_cookiejar

from config import (
    EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_OAUTH_TOKEN_URL, EBAY_TRADING_ENDPOINT,
    EBAY_BROWSE_ENDPOINT, EBAY_NS, EBAY_MARKETPLACE_ID, CONNECT_TIMEOUT, READ_TIMEOUT, session
)
from db_utils import _row_val, to_num
from config import COOKIE_STORE as EBAY_TOKEN_CACHE

# In-memory cache for the APP token (Client Credentials)
_APP_TOKEN_CACHE = {
    "token": None,
    "exp": 0
}

EBAY_ITEM_RE = re.compile(
    r"(?:/itm/(?:[^/?#]*/)?(?P<itm>\d{9,14}))|"
    r"(?:[?&#](?:item|nid|iid|itemId)=(?P<q>\d{9,14}))",
    re.IGNORECASE,
)

def _collapse_scopes(s: str) -> str:
    return " ".join((s or "").split())

def get_ebay_token(force: bool = False) -> str | None:
    """Get a cached or refreshed USER access token (Authorization Code Flow)."""
    now = time.time()
    if not force and EBAY_TOKEN_CACHE.get("token") and EBAY_TOKEN_CACHE.get("exp", 0) - 60 > now:
        return EBAY_TOKEN_CACHE.get("token")

    cid = os.getenv("EBAY_CLIENT_ID")
    cs  = os.getenv("EBAY_CLIENT_SECRET")
    rt  = os.getenv("EBAY_REFRESH_TOKEN")
    scopes = _collapse_scopes(os.getenv("EBAY_USER_SCOPES", ""))

    if not (cid and cs and rt):
        print("[eBay Utils] Missing User Token Credentials (CLIENT_ID/SECRET/REFRESH_TOKEN)")
        return None

    auth = base64.b64encode(f"{cid}:{cs}".encode()).decode()
    try:
        resp = session.post(
            EBAY_OAUTH_TOKEN_URL,
            headers={
                "Authorization": f"Basic {auth}",
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/json",
            },
            data={
                "grant_type": "refresh_token",
                "refresh_token": rt,
                "scope": scopes,
            },
            timeout=(CONNECT_TIMEOUT, READ_TIMEOUT),
        )
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"[eBay Utils] Failed to refresh eBay user token: {e}")
        if isinstance(e, requests.HTTPError):
             print(f"[eBay Utils] Response: {e.response.text}")
        return None

    data = resp.json()
    tok = data.get("access_token")
    ttl = int(data.get("expires_in", 7200))
    if not tok:
        print("[eBay Utils] No access_token in response")
        return None

    EBAY_TOKEN_CACHE["token"] = tok
    EBAY_TOKEN_CACHE["exp"]   = now + ttl
    return tok

def _ebay_user_access_token_from_refresh() -> str:
    tok = get_ebay_token(force=True)
    if not tok:
        raise HTTPException(status_code=502, detail="eBay token error: no_token")
    return tok

def _ebay_app_access_token(scopes: list[str] | None = None) -> str:
    """
    Get an APPLICATION access token (Client Credentials Flow) for Buy/Browse.
    Uses caching to avoid hitting rate limits.
    """
    # 1. Check Cache
    now = time.time()
    if _APP_TOKEN_CACHE["token"] and _APP_TOKEN_CACHE["exp"] > now + 60:
        return _APP_TOKEN_CACHE["token"]

    if not EBAY_CLIENT_ID or not EBAY_CLIENT_SECRET:
        print("[eBay Utils] Missing App Credentials (EBAY_CLIENT_ID / EBAY_CLIENT_SECRET)")
        raise RuntimeError("EBAY_CLIENT_ID / EBAY_CLIENT_SECRET not set")

    # 2. Request New Token
    # FIX: Use the generic API scope to avoid "invalid_scope" errors.
    # Most Client Credential keys have this by default.
    scope_str = "https://api.ebay.com/oauth/api_scope" 
    
    auth_str = f"{EBAY_CLIENT_ID}:{EBAY_CLIENT_SECRET}"
    auth_b64 = base64.b64encode(auth_str.encode()).decode()
    
    headers = {
        "Authorization": f"Basic {auth_b64}",
        "Content-Type": "application/x-www-form-urlencoded",
    }
    data = {
        "grant_type": "client_credentials",
        "scope": scope_str,
    }
    
    try:
        r = requests.post(EBAY_OAUTH_TOKEN_URL, headers=headers, data=data, timeout=20)
        r.raise_for_status()
        j = r.json()
        token = j.get("access_token")
        if not token:
             raise ValueError("No access_token returned from eBay")
             
        expires_in = int(j.get("expires_in", 7200))
        
        # 3. Update Cache
        _APP_TOKEN_CACHE["token"] = token
        _APP_TOKEN_CACHE["exp"] = now + expires_in
        
        return token
    except Exception as e:
        print(f"[eBay Utils] Failed to get App Access Token: {e}")
        if isinstance(e, requests.HTTPError):
             print(f"[eBay Utils] App Token Response Body: {e.response.text}")
        raise e


def _parse_ebay_legacy_id(url: str) -> str | None:
    if not url:
        return None
    m = EBAY_ITEM_RE.search(url)
    return (m.group("itm") or m.group("q")) if m else None

def _el_text(el):
    if el is None: return None
    t = el.text
    return t.strip() if isinstance(t, str) else t

def _price_from_el(el):
    if el is None: return (None, None)
    cur = el.attrib.get("currencyID")
    raw = _el_text(el)
    try: return (float(raw), cur)
    except (TypeError, ValueError): return (None, cur)

def _first_non_null(*vals):
    for v in vals:
        if v is not None: return v
    return None

def _trading_get_item(access_token: str, legacy_item_id: str) -> dict:
    xml = f"""<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ItemID>{legacy_item_id}</ItemID>
  <DetailLevel>ReturnAll</DetailLevel>
</GetItemRequest>"""
    r = requests.post(
        EBAY_TRADING_ENDPOINT,
        headers={
            "X-EBAY-API-CALL-NAME": "GetItem",
            "X-EBAY-API-SITEID": "0",
            "X-EBAY-API-COMPATIBILITY-LEVEL": "1193",
            "X-EBAY-API-IAF-TOKEN": access_token,
            "Content-Type": "text/xml",
        },
        data=xml.encode("utf-8"), timeout=30
    )
    r.raise_for_status()
    
    root = ET.fromstring(r.text)
    item = root.find('.//e:Item', EBAY_NS)
    if item is None:
        # Check for Errors
        errs = root.findall('.//e:Errors', EBAY_NS)
        if errs:
            code = _el_text(errs[0].find('./e:ErrorCode', EBAY_NS))
            msg = _el_text(errs[0].find('./e:LongMessage', EBAY_NS))
            print(f"[Trading API] Error {code}: {msg}")
        raise RuntimeError("Trading.GetItem: <Item> not found in XML response")

    seller = _el_text(item.find('./e:Seller/e:UserID', EBAY_NS))
    status = _first_non_null(
        _el_text(item.find('./e:SellingStatus/e:ListingStatus', EBAY_NS)),
        _el_text(item.find('./e:ListingStatus', EBAY_NS))
    )
    qty_sold_txt = _first_non_null(
        _el_text(item.find('./e:QuantitySold', EBAY_NS)),
        _el_text(item.find('./e:SellingStatus/e:QuantitySold', EBAY_NS)),
        "0",
    )
    try:
        sold_lifetime = int(qty_sold_txt or "0")
    except ValueError:
        sold_lifetime = 0
        
    return {
        "seller": seller,
        "status": status,
        "item_id": legacy_item_id,
        "sold_lifetime": sold_lifetime,
    }


def _trading_get_last_sold(access_token: str, legacy_item_id: str, months_back: int = 24) -> str | None:
    end = datetime.now(timezone.utc).replace(microsecond=0)
    start = end - timedelta(days=months_back * 30)
    newest = None
    cur = start
    while cur < end:
        nxt = min(cur + timedelta(days=30), end)
        xml = f"""<?xml version="1.0" encoding="utf-8"?>
<GetItemTransactionsRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ItemID>{legacy_item_id}</ItemID>
  <DetailLevel>ReturnAll</DetailLevel>
  <ModTimeFrom>{cur.strftime('%Y-%m-%dT%H:%M:%SZ')}</ModTimeFrom>
  <ModTimeTo>{nxt.strftime('%Y-%m-%dT%H:%M:%SZ')}</ModTimeTo>
</GetItemTransactionsRequest>"""
        r = requests.post(
            EBAY_TRADING_ENDPOINT,
            headers={
                "X-EBAY-API-CALL-NAME": "GetItemTransactions",
                "X-EBAY-API-SITEID": "0",
                "X-EBAY-API-COMPATIBILITY-LEVEL": "1193",
                "X-EBAY-API-IAF-TOKEN": access_token,
                "Content-Type": "text/xml",
            },
            data=xml.encode("utf-8"), timeout=30
        )
        r.raise_for_status()
        for m in re.finditer(r"<CreatedDate>(.*?)</CreatedDate>", r.text):
            cd = m.group(1)
            if not newest or cd > newest:
                newest = cd
        cur = nxt + timedelta(seconds=1)
    return newest

def _fetch_price_via_trading(access_token: str, legacy_item_id: str) -> tuple[float | None, str | None, str | None]:
    xml = f"""<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ItemID>{legacy_item_id}</ItemID>
  <DetailLevel>ReturnAll</DetailLevel>
</GetItemRequest>"""

    r = requests.post(
        EBAY_TRADING_ENDPOINT,
        headers={
            "X-EBAY-API-CALL-NAME": "GetItem",
            "X-EBAY-API-SITEID": "0",
            "X-EBAY-API-COMPATIBILITY-LEVEL": "1193",
            "X-EBAY-API-IAF-TOKEN": access_token,
            "Content-Type": "text/xml",
        },
        data=xml.encode("utf-8"),
        timeout=25,
    )
    r.raise_for_status()
    root = ET.fromstring(r.text)

    var_prices: list[tuple[float, str | None]] = []
    for sp in root.findall(".//e:Variations/e:Variation/e:StartPrice", EBAY_NS):
        txt = (_el_text(sp) or "").strip()
        if not txt: continue
        try: var_prices.append((float(txt), sp.attrib.get("currencyID")))
        except Exception: pass
    if var_prices:
        price, currency = sorted(var_prices, key=lambda t: t[0])[0]
        return price, currency, "trading.getItem.variations.startPrice"

    listing_type_el = root.find(".//e:ListingType", EBAY_NS)
    listing_type = (_el_text(listing_type_el) or "").strip()

    if listing_type == "FixedPriceItem":
        sp = root.find(".//e:StartPrice", EBAY_NS)
        p, c = _price_from_el(sp)
        if p is not None: return p, c, "trading.getItem.startPrice"

    cp = root.find(".//e:SellingStatus/e:CurrentPrice", EBAY_NS)
    p, c = _price_from_el(cp)
    if p is not None: return p, c, "trading.getItem.sellingStatus.currentPrice"

    return None, None, None

def _safe_float(v):
    if v is None: return None
    try:
        return float(str(v).replace(",", ""))
    except Exception:
        return None

def _browse_get_price_app_safe(legacy_item_id: str) -> tuple[float | None, str | None, str]:
    """
    Safe wrapper around Buy/Browse with APP token — NEVER raises; returns (price, currency, source).
    """
    if not EBAY_CLIENT_ID or not EBAY_CLIENT_SECRET:
        return (None, None, "browse.app.unset")
    try:
        token = _ebay_app_access_token() # uses default scope
        url = f"{EBAY_BROWSE_ENDPOINT}/item/get_item_by_legacy_id"
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "X-EBAY-C-MARKETPLACE-ID": EBAY_MARKETPLACE_ID,
        }
        r = requests.get(url, params={"legacy_item_id": legacy_item_id}, headers=headers, timeout=12)
        if r.status_code in (403, 404):
            return (None, None, f"browse.{r.status_code}")
        if r.status_code >= 400:
            return (None, None, f"browse.{r.status_code}")
        j = r.json()
        pr = (j or {}).get("price") or {}
        val, cur = pr.get("value"), pr.get("currency")
        val = _safe_float(val)
        if val is not None:
            return (val, cur, "browse.item.price")
        return (None, cur, "browse.item.missing")
    except Exception:
        return (None, None, "browse.app.error")

def _summarize_sales_for_legacy_id(legacy_item_id: str, days_back: int = 365) -> dict:
    """
    Look up orders in Sell Fulfillment and summarize sales for a legacy item id.
    This relies on the Seller having the right scopes.
    """
    token = get_ebay_token()
    if not token:
        print("[eBay Utils] No User Token for Fulfillment API")
        return {}

    # ISO Format with 'Z' (e.g. 2023-01-01T00:00:00.000Z)
    start = (datetime.now(timezone.utc) - timedelta(days=days_back)).strftime('%Y-%m-%dT%H:%M:%S.000Z')
    
    base = "https://api.ebay.com/sell/fulfillment/v1/order"
    # filter format: creationdate:[..]
    url = f"{base}?filter=creationdate:[{start}..]&limit=200"

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "X-EBAY-C-MARKETPLACE-ID": EBAY_MARKETPLACE_ID,
    }

    sales = []
    
    while url:
        try:
            r = session.get(url, headers=headers, timeout=30)
            if r.status_code != 200:
                print(f"[Fulfillment API] Error {r.status_code}: {r.text[:200]}")
                break

            data = r.json() or {}
            for order in data.get("orders", []):
                pay_date = (order.get("paymentSummary") or {}).get("payments", [{}])[0].get("paymentDate")
                order_date = order.get("creationDate")
                
                for li in order.get("lineItems", []):
                    # Match by Legacy ID
                    if str(li.get("legacyItemId") or "") == str(legacy_item_id):
                        sales.append({
                            "orderId": order.get("orderId"),
                            "creationDate": order_date,
                            "paymentDate": pay_date,
                            "quantity": int(li.get("quantity") or 0),
                            "totalPrice": li.get("total", {}).get("value") # Capture sale price
                        })

            next_href = next((link["href"] for link in data.get("links", []) if link.get("rel") == "next" and link.get("href")), None)
            url = next_href
        except Exception as e:
            print(f"[Fulfillment API] Exception: {e}")
            break

    def _pick_dt(sale): return sale.get("paymentDate") or sale.get("creationDate")
    last_sold_at = max((_pick_dt(s) for s in sales if _pick_dt(s)), default=None) if sales else None
    sold_count = sum(s["quantity"] for s in sales)

    return {
        "ok": True,
        "legacyItemId": str(legacy_item_id),
        "soldCount": sold_count,
        "lastSoldAt": last_sold_at,
        "sales": sales,
    }

def _get_item_quantities(access_token: str, legacy_item_id: str) -> dict:
    """
    Fetches total quantity, quantity sold, variation totals, main image AND SKU via Trading.GetItem.
    """
    xml = f"""<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ItemID>{legacy_item_id}</ItemID>
  <DetailLevel>ReturnAll</DetailLevel>
  <IncludeItemSpecifics>false</IncludeItemSpecifics> 
</GetItemRequest>"""

    try:
        r = session.post(
            EBAY_TRADING_ENDPOINT,
            headers={
                "X-EBAY-API-CALL-NAME": "GetItem",
                "X-EBAY-API-SITEID": "0",
                "X-EBAY-API-COMPATIBILITY-LEVEL": "1193",
                "X-EBAY-API-IAF-TOKEN": access_token,
                "Content-Type": "text/xml",
            },
            data=xml.encode("utf-8"),
            timeout=(CONNECT_TIMEOUT, READ_TIMEOUT),
        )
        r.raise_for_status()

        root = ET.fromstring(r.text)
        item = root.find(".//e:Item", EBAY_NS)
        if item is None:
            return {}
        
        def _txt(el):
            return (el.text or "").strip() if el is not None else ""
        
        def _parse_int(v):
            try: return int(str(v).strip())
            except: return 0

        seller = _txt(item.find("./e:Seller/e:UserID", EBAY_NS))
        status = _txt(item.find("./e:SellingStatus/e:ListingStatus", EBAY_NS))
        
        # --- CAPTURE SKU (Custom Label) ---
        sku = _txt(item.find("./e:SKU", EBAY_NS))
        # ----------------------------------

        # --- Capture Image ---
        main_image = _txt(item.find("./e:PictureDetails/e:GalleryURL", EBAY_NS))
        if not main_image:
            # Fallback to the first PictureURL if GalleryURL is missing/empty
            main_image = _txt(item.find("./e:PictureDetails/e:PictureURL", EBAY_NS))
        # --------------------------

        qty_item = _parse_int(_txt(item.find("./e:Quantity", EBAY_NS)))
        qty_sold_item = _parse_int(
            _txt(item.find("./e:SellingStatus/e:QuantitySold", EBAY_NS))
            or _txt(item.find("./e:QuantitySold", EBAY_NS))
        )

        variations_el = item.find("./e:Variations", EBAY_NS)
        var_qty_total = 0
        var_sold_total = 0
        vars_list = []

        if variations_el is not None:
            for var in variations_el.findall("./e:Variation", EBAY_NS):
                v_qty = _parse_int(_txt(var.find("./e:Quantity", EBAY_NS)))
                v_sold = _parse_int(_txt(var.find("./e:SellingStatus/e:QuantitySold", EBAY_NS)))

                specifics = {}
                for nvl in var.findall("./e:VariationSpecifics/e:NameValueList", EBAY_NS):
                    name = _txt(nvl.find("./e:Name", EBAY_NS))
                    val = _txt(nvl.find("./e:Value", EBAY_NS))
                    if name:
                        specifics[name] = val

                var_qty_total += v_qty
                var_sold_total += v_sold
                vars_list.append({
                    "specifics": specifics,
                    "quantity": v_qty,
                    "sold": v_sold,
                    "available": max(v_qty - v_sold, 0),
                })

        if variations_el is not None:
            total_qty = var_qty_total
            total_sold = var_sold_total
        else:
            total_qty = qty_item
            total_sold = qty_sold_item

        return {
            "seller": seller,
            "status": status,
            "sku": sku,           # <--- Added SKU to return
            "mainImage": main_image, 
            "quantity": total_qty,
            "quantitySold": total_sold,
            "quantityAvailable": max((total_qty or 0) - (total_sold or 0), 0),
            "hasVariations": variations_el is not None,
            "variationTotals": (
                {
                    "quantity": var_qty_total,
                    "sold": var_sold_total,
                    "available": max(var_qty_total - var_sold_total, 0),
                } if variations_el is not None else None
            ),
            "variations": vars_list if variations_el is not None else None,
        }
    except Exception as e:
        print(f"[Trading API] _get_item_quantities failed: {e}")
        return {}