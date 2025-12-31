# config.py

# ───────────────────────── stdlib
import os
import io
import re
import csv
import json
import time
import base64
import hashlib
from datetime import datetime, date, timedelta, timezone
from pathlib import Path
from typing import Optional, List, Dict, Any, Tuple
import requests
from urllib.parse import quote
from urllib3.util.retry import Retry
from requests.adapters import HTTPAdapter
from pydantic import BaseModel, HttpUrl
import random

# ───────────────────────── third-party
try:
    import redis as redis_lib
    import rq
    HAVE_RQ = True
except Exception:
    redis_lib = None
    rq = None
    HAVE_RQ = False
try:
    import google.generativeai as genai
    _genai_loaded = True
except Exception as e:
    _genai_loaded = False


# --- ENV Setup ---
ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
from dotenv import load_dotenv
load_dotenv(dotenv_path=ENV_PATH)

CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME")
CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY")
CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET")

try:
    import cloudinary
    import cloudinary.uploader
    import cloudinary.api
    
    if CLOUDINARY_CLOUD_NAME and CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET:
        cloudinary.config(
            cloud_name=CLOUDINARY_CLOUD_NAME,
            api_key=CLOUDINARY_API_KEY,
            api_secret=CLOUDINARY_API_SECRET,
            secure=True
        )
        print("[Cloudinary] Configured ✔")
        HAVE_CLOUDINARY = True
    else:
        HAVE_CLOUDINARY = False
except ImportError:
    HAVE_CLOUDINARY = False
    print("[Cloudinary] Library not installed.")

# --- API Constants ---
EBAY_TRADING_ENDPOINT = os.getenv("EBAY_TRADING_ENDPOINT", "https://api.ebay.com/ws/api.dll")
EBAY_BROWSE_ENDPOINT  = os.getenv("EBAY_BROWSE_ENDPOINT",  "https://api.ebay.com/buy/browse/v1")
EBAY_OAUTH_TOKEN_URL = os.getenv("EBAY_OAUTH_TOKEN_URL", "https://api.ebay.com/identity/v1/oauth2/token")
EBAY_CLIENT_ID = os.getenv("EBAY_CLIENT_ID")
EBAY_CLIENT_SECRET = os.getenv("EBAY_CLIENT_SECRET")
EBAY_NS = {"e": "urn:ebay:apis:eBLBaseComponents"}
EBAY_MARKETPLACE_ID = os.getenv("EBAY_MARKETPLACE_ID") or os.getenv("VITE_EBAY_MARKETPLACE_ID") or "EBAY_US"

assert "e" in EBAY_NS and EBAY_NS["e"].endswith("eBLBaseComponents"), "EBAY_NS malformed"


# --- DB / Redis Config ---
PORT                = int(os.getenv("PORT", "3000"))
CONNECT_TIMEOUT     = float(os.getenv("CONNECT_TIMEOUT", "5"))
READ_TIMEOUT        = float(os.getenv("READ_TIMEOUT", "45"))
DATABASE_URL        = os.getenv("DATABASE_URL")
# IMPORTANT: Ensure your .env file sets this to 'redis://redis:6379/0' for Docker
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# --- Directus/Scraping Config ---
DIRECTUS_URL        = (os.getenv("DIRECTUS_URL") or "").rstrip("/")
DIRECTUS_TOKEN      = os.getenv("DIRECTUS_TOKEN", "")
AVG_CACHE_TTL_MS    = int(os.getenv("AVG_CACHE_TTL_MS", str(6 * 60 * 60 * 1000)))  # 6h default

# --- AI Config ---
_raw_keys = (os.getenv("GEMINI_API_KEY", "") or os.getenv("VITE_GEMINI_API_KEY", "")).split(",")
GEMINI_API_KEYS = [k.strip() for k in _raw_keys if k.strip()]

GEMINI_API_KEY = GEMINI_API_KEYS[0] if GEMINI_API_KEYS else ""

AI_FIRST = (os.getenv("AI_FIRST", "0") == "1")

def configure_genai_with_key(specific_key: str = None):
    if not _genai_loaded: return False
    
    key_to_use = specific_key or (random.choice(GEMINI_API_KEYS) if GEMINI_API_KEYS else "")
    
    if key_to_use:
        try:
            genai.configure(api_key=key_to_use)
            return True
        except Exception as e:
            print(f"[AI] configure failed for key {key_to_use[:10]}...: {e}")
            return False
    return False

if GEMINI_API_KEYS and _genai_loaded:
    configure_genai_with_key()
    print(f"[AI] Gemini configured with {len(GEMINI_API_KEYS)} available keys ✔")
    HAVE_GENAI = True
    CURRENT_GENAI_MODEL = "gemini-2.5-flash"
else:
    HAVE_GENAI = False
    CURRENT_GENAI_MODEL = ""

# --- HTTP session with retries ---
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome Safari"
)
session = requests.Session()
session.headers.update({
    "User-Agent":      UA,
    "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
})
retry = Retry(
    total=3,
    backoff_factor=0.7,
    status_forcelist=(429, 500, 502, 503, 504),
    allowed_methods=frozenset({"GET", "POST", "PUT", "DELETE"}),
    raise_on_status=False,
)
session.mount("https://", HTTPAdapter(max_retries=retry))
session.mount("http://",  HTTPAdapter(max_retries=retry))

def http_get(
    url: str,
    cookie: str = "",
    timeout: Tuple[float, float] = (CONNECT_TIMEOUT, READ_TIMEOUT),
) -> requests.Response:
    headers = {}
    if cookie:
        headers["Cookie"] = cookie
    return session.get(url, headers=headers, timeout=timeout, allow_redirects=True)

# --- Global Redis & RQ (lazy connection) ---
_rconn: Optional[redis_lib.Redis] = None
_q: Optional[rq.Queue] = None

def get_redis() -> redis_lib.Redis:
    """Return a connected Redis client or raise."""
    global _rconn
    if _rconn is None:
        if not REDIS_URL or redis_lib is None:
            raise RuntimeError("Redis not available or REDIS_URL not set")
        # decode_responses=False so we get bytes from Pub/Sub (safer)
        _rconn = redis_lib.from_url(REDIS_URL, decode_responses=False)
        _rconn.ping()
    return _rconn

def get_queue() -> Optional[rq.Queue]:
    """Return an RQ queue if Redis is available, else None."""
    global _q
    if _q is not None:
        return _q
    if not HAVE_RQ:
        return None
    try:
        conn = get_redis()
        _q = rq.Queue("aiq", connection=conn, default_timeout=1800)
        return _q
    except Exception as e:
        print(f"[WARN] Redis unavailable during get_queue(): {e} (REDIS_URL={REDIS_URL})")
        return None

# Global access points. These are initialized as None and will be populated on first use.
rconn: Optional[redis_lib.Redis] = None
q: Optional[rq.Queue] = None

# Wrap the initial connection attempt in a try...except block.
# This makes the app resilient if Redis isn't ready at startup.
try:
    if HAVE_RQ:
        # This will attempt to connect. If it fails, the globals remain None.
        rconn = get_redis()
        q = get_queue()
except Exception as e:
    print(f"[WARN] Could not connect to Redis on initial module load: {e}")
    # Globals `rconn` and `q` will remain None, which is the desired fallback.

# --- Mime Type Map ---
_EXT_TO_MIME = {
    "csv": "text/csv",
    "tsv": "text/tab-separated-values",
    "xls": "application/vnd.ms-excel",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "pdf": "application/pdf",
}

def guess_mime(filename: str | None, ext: str | None) -> str:
    import mimetypes
    ext = (ext or "").lower().lstrip(".")
    if ext in _EXT_TO_MIME:
        return _EXT_TO_MIME[ext]
    mt, _ = mimetypes.guess_type(filename or "")
    return mt or "application/octet-stream"


# --- Cookie Store (for scraping) ---
COOKIE_STORE: Dict[str, str] = {}


# --- Base Models ---
class HintedPreviewHints(BaseModel):
    header_row: int
    column_roles: Dict[int, str]
    selection_rows: Optional[List[int]] = None
    selection_cols: Optional[List[int]] = None
    examples: Optional[List[Dict[str, Any]]] = None
    expand_units: Optional[bool] = False
    vendor_id: Optional[str] = None
    vendor_name: Optional[str] = None

class UploadPreviewResponse(BaseModel):
    ok: bool
    vendor_id: str
    file_name: str
    new_po_lines: List[Dict[str, Any]]
    existing_pos_summary: List[Dict[str, Any]] = []
    ai_notes: Optional[str] = None
    ai_model: Optional[str] = None