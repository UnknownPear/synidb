#!/usr/bin/env python3
"""
browse_avg.py — Query eBay Browse API (active listings) and compute an average price.

- Fetches a fresh OAuth "application" token (client-credentials) automatically
- Searches active listings (optionally filtered: condition, fixed price, currency, price range)
- Computes an average of item prices (optionally includes shipping cost)
- Works as a CLI and can be imported as a module

Usage (CLI):
    python3 browse_avg.py --client-id YOUR_ID --client-secret YOUR_SECRET \
        --q "iphone 13" --limit 100 --fixed-price --condition USED --currency USD --include-shipping

You can also set env vars EBAY_CLIENT_ID / EBAY_CLIENT_SECRET and omit the flags.
"""

import os
import sys
import math
import json
import time
import argparse
from typing import Dict, Any, List, Optional, Tuple
import requests

OAUTH_URL = "https://api.ebay.com/identity/v1/oauth2/token"
BROWSE_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search"

CONNECT_TIMEOUT = float(os.getenv("CONNECT_TIMEOUT", "5"))
READ_TIMEOUT = float(os.getenv("READ_TIMEOUT", "45"))
TIMEOUT = (CONNECT_TIMEOUT, READ_TIMEOUT)

def get_app_token(client_id: str, client_secret: str) -> str:
    """Get an application OAuth token (client credentials). Returns the access token string."""
    auth = requests.auth.HTTPBasicAuth(client_id, client_secret)
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    data = {
        "grant_type": "client_credentials",
        "scope": "https://api.ebay.com/oauth/api_scope"
    }
    r = requests.post(OAUTH_URL, headers=headers, data=data, auth=auth, timeout=TIMEOUT)
    if r.status_code != 200:
        raise RuntimeError(f"OAuth failed ({r.status_code}): {r.text}")
    return r.json()["access_token"]

def build_filter(fixed_price: bool, condition: Optional[str], min_price: Optional[float], max_price: Optional[float]) -> Optional[str]:
    """
    Build eBay Browse 'filter' parameter.
    condition: e.g., NEW, USED, CERTIFIED_REFURBISHED (comma-separated allowed via conditions:{A|B})
    price range is applied separately with priceCurrency param, but Browse also supports price:[min..max]
    """
    parts = []
    if fixed_price:
        parts.append("buyingOptions:{FIXED_PRICE}")
    if condition:
        # Allow multiple (comma or pipe separated); normalize to {A|B}
        conds = [c.strip().upper() for c in condition.replace(",", "|").split("|") if c.strip()]
        if conds:
            parts.append(f"conditions:{{{ '|'.join(conds) }}}")
    if min_price is not None or max_price is not None:
        lo = "" if min_price is None else str(min_price)
        hi = "" if max_price is None else str(max_price)
        parts.append(f"price:[{lo}..{hi}]")
    return ",".join(parts) if parts else None

def browse_search(
    token: str,
    q: str,
    limit: int = 50,
    price_currency: Optional[str] = None,
    filter_expr: Optional[str] = None,
    category_ids: Optional[str] = None,
    offset: int = 0,
) -> Dict[str, Any]:
    """Call eBay Browse search and return parsed JSON."""
    headers = {"Authorization": f"Bearer {token}"}
    params = {
        "q": q,
        "limit": max(1, min(200, int(limit))),
        "offset": max(0, int(offset)),
    }
    if price_currency:
        params["priceCurrency"] = price_currency
    if filter_expr:
        params["filter"] = filter_expr
    if category_ids:
        params["category_ids"] = category_ids

    r = requests.get(BROWSE_URL, headers=headers, params=params, timeout=TIMEOUT)
    if r.status_code != 200:
        raise RuntimeError(f"Browse failed ({r.status_code}): {r.text}")
    return r.json()

def collect_prices(data: Dict[str, Any], currency: Optional[str], include_shipping: bool) -> List[float]:
    """
    Extract numeric prices from itemSummaries.
    If include_shipping=True and a shipping cost exists in the same currency, add it to item price.
    If currency is None, use whatever is in each item (you’ll average mixed currencies—usually not desired).
    """
    out = []
    for it in data.get("itemSummaries", []):
        p = it.get("price") or {}
        cur = p.get("currency")
        val = p.get("value")
        if val is None:
            continue
        try:
            price = float(val)
        except Exception:
            continue

        ship_add = 0.0
        if include_shipping:
            # shippingOptions is an array; pick the first total or shippingCost if present
            for opt in it.get("shippingOptions", []):
                sc = (opt.get("shippingCost") or {})  # { value, currency }
                if sc.get("value") is not None and (currency is None or sc.get("currency") == currency):
                    try:
                        ship_add = float(sc["value"])
                        break
                    except Exception:
                        pass

        if currency is None or cur == currency:
            out.append(price + ship_add)
    return out

def average(nums: List[float]) -> float:
    return round(sum(nums) / len(nums), 2) if nums else 0.0

def compute_average_active(
    client_id: str,
    client_secret: str,
    q: str,
    limit: int = 100,
    fixed_price: bool = True,
    condition: Optional[str] = "USED",
    currency: Optional[str] = "USD",
    category_ids: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    include_shipping: bool = False,
    pages: int = 1,
) -> Dict[str, Any]:
    """
    End-to-end: token -> browse (optionally multiple pages) -> collect prices -> average.
    Returns payload with stats and a small sample of items.
    """
    token = get_app_token(client_id, client_secret)
    filter_expr = build_filter(fixed_price=fixed_price, condition=condition, min_price=min_price, max_price=max_price)

    all_prices: List[float] = []
    sampled_rows: List[Dict[str, Any]] = []

    per_page = max(1, min(200, limit))
    for i in range(max(1, pages)):
        offset = i * per_page
        data = browse_search(
            token=token,
            q=q,
            limit=per_page,
            price_currency=currency,
            filter_expr=filter_expr,
            category_ids=category_ids,
            offset=offset,
        )
        # capture a small sample of items for inspection
        for it in data.get("itemSummaries", [])[:10]:
            sampled_rows.append({
                "title": it.get("title"),
                "url": it.get("itemWebUrl"),
                "price": (it.get("price") or {}),
                "buyingOptions": it.get("buyingOptions"),
                "condition": it.get("condition"),
            })
        all_prices += collect_prices(data, currency=currency, include_shipping=include_shipping)

        # stop if fewer than requested items returned (no more pages)
        if len(data.get("itemSummaries", [])) < per_page:
            break

    return {
        "ok": True,
        "query": q,
        "filters": {
            "fixed_price": fixed_price,
            "condition": condition,
            "currency": currency,
            "category_ids": category_ids,
            "min_price": min_price,
            "max_price": max_price,
            "include_shipping": include_shipping,
        },
        "sampled_items": sampled_rows,
        "count": len(all_prices),
        "avg": average(all_prices),
    }

def main():
    ap = argparse.ArgumentParser(description="Average active listing prices from eBay Browse API")
    ap.add_argument("--client-id", default=os.getenv("EBAY_CLIENT_ID"), help="eBay Production Client ID")
    ap.add_argument("--client-secret", default=os.getenv("EBAY_CLIENT_SECRET"), help="eBay Production Client Secret")
    ap.add_argument("--q", required=True, help="Search query (e.g., 'iphone 13')")
    ap.add_argument("--limit", type=int, default=100, help="Items per page (1..200)")
    ap.add_argument("--pages", type=int, default=1, help="Number of pages to fetch (offset-based)")
    ap.add_argument("--fixed-price", action="store_true", help="Restrict to Buy-It-Now")
    ap.add_argument("--condition", default="USED", help="Condition filter (e.g., NEW, USED, CERTIFIED_REFURBISHED). Multiple with comma.")
    ap.add_argument("--currency", default="USD", help="Price currency (USD, GBP, EUR, ...)")
    ap.add_argument("--category-ids", default=None, help="Optional eBay category id(s), comma-separated")
    ap.add_argument("--min-price", type=float, default=None, help="Minimum item price (filter)")
    ap.add_argument("--max-price", type=float, default=None, help="Maximum item price (filter)")
    ap.add_argument("--include-shipping", action="store_true", help="Add shipping cost to item price when available")
    args = ap.parse_args()

    if not args.client_id or not args.client_secret:
        print("ERROR: Provide credentials via --client-id/--client-secret or EBAY_CLIENT_ID/EBAY_CLIENT_SECRET env vars.", file=sys.stderr)
        sys.exit(1)

    try:
        result = compute_average_active(
            client_id=args.client_id,
            client_secret=args.client_secret,
            q=args.q,
            limit=args.limit,
            fixed_price=args.fixed_price,
            condition=args.condition,
            currency=args.currency,
            category_ids=args.category_ids,
            min_price=args.min_price,
            max_price=args.max_price,
            include_shipping=args.include_shipping,
            pages=args.pages,
        )
        print(json.dumps(result, indent=2))
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}), file=sys.stderr)
        sys.exit(2)

if __name__ == "__main__":
    main()
