import json
import requests
from decimal import Decimal
from datetime import datetime, date
from fastapi import APIRouter, Body, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from db_utils import db

router = APIRouter()

# --- Models ---
class ChatMessage(BaseModel):
    message: str
    history: List[Dict[str, str]] = []

class InsightAction(BaseModel):
    label: str
    link: str

class SyniInsight(BaseModel):
    id: str
    title: str
    message: str
    severity: str
    count: int
    icon: str
    action: Optional[InsightAction] = None

# --- Helpers ---
def json_serializer(obj):
    if isinstance(obj, Decimal): return float(obj)
    if isinstance(obj, (datetime, date)): return obj.isoformat()
    raise TypeError(f"Type {type(obj)} not serializable")

def compress_list_to_csv(data_list: List[Dict], fields: List[str]) -> str:
    if not data_list: return ""
    lines = ["|".join(fields)]
    for row in data_list:
        vals = []
        for field in fields:
            val = row.get(field, "")
            val_str = str(val).replace("|", "/")
            if len(val_str) > 30: val_str = val_str[:29] + "…"
            vals.append(val_str)
        lines.append("|".join(vals))
    return "\n".join(lines)

def ask_pollinations(system_prompt: str, user_prompt: str, json_mode: bool = False):
    url = "https://text.pollinations.ai/"
    if len(user_prompt) > 12000: user_prompt = user_prompt[:12000] + "...[TRUNCATED]"
    payload = {
        "messages": [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}],
        "model": "openai", "jsonMode": json_mode
    }
    try:
        r = requests.post(url, json=payload, timeout=60)
        if r.status_code != 200: return None
        if json_mode:
            raw = r.text.replace("```json", "").replace("```", "").strip()
            s, e = raw.find('['), raw.rfind(']') + 1
            if s != -1 and e != -1: return json.loads(raw[s:e])
        return r.text
    except Exception as e:
        return None

def gather_omniscient_context():
    context = {}
    with db() as (con, cur):
        # 1. BROKEN LINKS (Posted but no URL)
        cur.execute("""
            SELECT LEFT(pl.product_name_raw, 40) as n, i.synergy_code as s, i.cost_unit as c, COALESCE(u.name, 'Unknown') as poster
            FROM inventory_items i
            JOIN po_lines pl ON i.po_line_id = pl.id
            LEFT JOIN app_users u ON i.posted_by = CAST(u.id AS TEXT)
            WHERE i.status = 'POSTED' 
              AND (i.ebay_item_url IS NULL OR i.ebay_item_url = '')
            ORDER BY i.cost_unit DESC NULLS LAST
            LIMIT 100
        """)
        context['broken_links_sample'] = [dict(r) for r in cur.fetchall()]

        cur.execute("SELECT COUNT(*) as count FROM inventory_items WHERE status = 'POSTED' AND (ebay_item_url IS NULL OR ebay_item_url = '')")
        context['broken_links_count'] = cur.fetchone()['count']

        cur.execute("""
            SELECT LEFT(pl.product_name_raw, 30) as p, COUNT(*) as n, SUM(i.sold_price) as rev
            FROM inventory_items i JOIN po_lines pl ON i.po_line_id = pl.id
            WHERE i.status = 'SOLD' AND i.sold_at > NOW() - INTERVAL '30 days'
            GROUP BY pl.product_name_raw ORDER BY rev DESC LIMIT 5
        """)
        context['sales'] = [dict(r) for r in cur.fetchall()]

        cur.execute("""
            SELECT u.name, COUNT(*) as posts
            FROM app_users u JOIN inventory_items i ON i.posted_by = CAST(u.id AS TEXT)
            WHERE u.active = true GROUP BY u.name ORDER BY posts DESC LIMIT 5
        """)
        context['team'] = [dict(r) for r in cur.fetchall()]
    return context

@router.get("/assistant/insights", response_model=List[SyniInsight])
def get_ai_insights():
    stats = gather_omniscient_context()
    insights = []

    # --- 1. FORCE CRITICAL CARD (Python Logic, Not AI) ---
    # This guarantees the alert shows up if data exists.
    broken_count = stats.get('broken_links_count', 0)
    
    if broken_count > 0:
        insights.append({
            "id": "critical_unlinked",
            "title": "Unlinked Listings",
            "message": f"Alert: {broken_count} items are marked POSTED but have no eBay link. They cannot be tracked.",
            "severity": "critical",
            "count": broken_count,
            "icon": "🚨",
            "action": {"label": "Fix Now", "link": ""} # Link string is empty to trigger chat
        })

    # --- 2. AI GENERATES THE REST (Optional Info) ---
    summary_ctx = {
        "top_sale": stats['sales'][0] if stats['sales'] else None,
        "top_user": stats['team'][0] if stats['team'] else None
    }
    
    # We ask AI for 'success' or 'info' cards only
    system_prompt = """
    You are Syni. Generate 2 'success' or 'info' Insight Cards based on the data.
    Output JSON: [{ "id": "...", "title": "...", "message": "...", "severity": "success"|"info", "count": 0, "icon": "emoji", "action": null }]
    """
    
    try:
        ai_insights = ask_pollinations(system_prompt, f"Data: {json.dumps(summary_ctx, default=json_serializer)}", json_mode=True)
        if ai_insights and isinstance(ai_insights, list):
            insights.extend(ai_insights)
    except Exception:
        pass # If AI fails, we still have the critical card!

    return insights

@router.post("/assistant/chat")
def chat_with_syni(body: ChatMessage):
    raw_stats = gather_omniscient_context()
    
    # --- GROUPING LOGIC ---
    # Group identical product names to save space and reduce clutter.
    grouped_broken = {}
    for item in raw_stats['broken_links_sample']:
        name = item['n'].replace("|", "/").strip()
        sid = item['s']
        if name not in grouped_broken:
            grouped_broken[name] = []
        grouped_broken[name].append(sid)
    
    formatted_lines = []
    for name, ids in grouped_broken.items():
        # "Product Name (x3): 🆔[ID1] 🆔[ID2] 🆔[ID3]"
        id_str = " ".join([f"🆔[{x}]" for x in ids])
        formatted_lines.append(f"• {name} (x{len(ids)})\n   {id_str}")
    
    broken_list_str = "\n".join(formatted_lines)
    
    context_str = f"""
    [CRITICAL ERRORS: POSTED BUT UNLINKED]
    Total Count: {raw_stats['broken_links_count']}
    
    PRE-GROUPED LIST:
    {broken_list_str}
    
    [TOP SALES]
    {compress_list_to_csv(raw_stats['sales'], ['p', 'n', 'rev'])}
    """
    
    system_prompt = f"""
    You are Syni.
    DATA:
    {context_str}
    
    RULES:
    1. **Copy Paste:** If asked for unlinked items, output the "PRE-GROUPED LIST" EXACTLY as written above.
       - Keep the newlines and the 🆔 formatting.
       - DO NOT remove brackets `[]`.
    2. **Tone:** Helpful.
    """
    
    convo = ""
    for msg in body.history[-2:]: convo += f"{msg['role']}: {msg['content']}\n"
    convo += f"user: {body.message}\n"
    
    return {"reply": ask_pollinations(system_prompt, convo, json_mode=False) or "Data error."}