import re
from typing import List, Dict, Any
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from db_utils import db
from pubsub_utils import _broadcast

router = APIRouter(prefix="/messages", tags=["Messages"])
SYNERGY_RE = re.compile(r"([A-Z0-9]{3,10}-\d{5})", re.IGNORECASE)

# ============================================================
# MODELS
# ============================================================
class MessageCreateBody(BaseModel):
    sender_id: int
    recipient_id: int
    body: str

class ThreadMessageCreateBody(BaseModel):
    body: str

class GroupUpdateBody(BaseModel):
    subject: str
    avatar_url: str | None = None

# ============================================================
# HELPERS
# ============================================================
def _ensure_user(cur, user_id: int) -> str:
    cur.execute("SELECT name FROM app_users WHERE id=%s", (user_id,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, f"user {user_id} not found")
    return row["name"] or ""

def _get_or_create_dm_thread(cur, me_id: int, other_id: int) -> str:
    if me_id == other_id:
        raise HTTPException(400, "Cannot chat with yourself")
    cur.execute(
        """
        WITH pair AS (
            SELECT t.id FROM message_threads t
            JOIN message_thread_participants p1 ON p1.thread_id=t.id AND p1.user_id=%s
            JOIN message_thread_participants p2 ON p2.thread_id=t.id AND p2.user_id=%s
            WHERE COALESCE(t.is_group,false)=false
        ), valid AS (
            SELECT mtp.thread_id FROM message_thread_participants mtp
            WHERE mtp.thread_id IN (SELECT id FROM pair)
            GROUP BY mtp.thread_id HAVING COUNT(*)=2
        )
        SELECT thread_id AS id FROM valid LIMIT 1
        """,
        (me_id, other_id)
    )
    row = cur.fetchone()
    if row:
        return row["id"]
    cur.execute(
        "INSERT INTO message_threads (subject, is_group, created_by_id) VALUES (NULL, false, %s) RETURNING id",
        (me_id,)
    )
    thread_id = cur.fetchone()["id"]
    cur.execute("INSERT INTO message_thread_participants (thread_id, user_id) VALUES (%s,%s) ON CONFLICT DO NOTHING", (thread_id, me_id))
    cur.execute("INSERT INTO message_thread_participants (thread_id, user_id) VALUES (%s,%s) ON CONFLICT DO NOTHING", (thread_id, other_id))
    return thread_id

def _serialize_message_row(r: Dict[str, Any]) -> Dict[str, Any]:
    created = r.get("created_at")
    if isinstance(created, datetime):
        created = created.isoformat()
    return {"id": str(r.get("id")), "sender_id": r.get("sender_id"), "sender_name": r.get("sender_name") or "", "body": r.get("body") or "", "created_at": created, "read_at": r.get("read_at")}

def _serialize_thread_row(r: Dict[str, Any]) -> Dict[str, Any]:
    created = r.get("created_at")
    if isinstance(created, datetime):
        created = created.isoformat()
    return {"id": str(r.get("thread_id")), "sender_id": r.get("sender_id"), "recipient_id": r.get("recipient_id"), "body": r.get("body") or "", "created_at": created, "other_id": r.get("other_id"), "other_name": r.get("other_name"), "unread_count": r.get("unread_count") or 0, "is_group": bool(r.get("is_group", False)), "subject": r.get("subject"), "created_by_id": r.get("created_by_id"), "avatar_url": r.get("avatar_url"), "participants": r.get("participants", [])}

# ============================================================
# ENDPOINTS
# ============================================================
@router.get("/with/{other_id}")
def get_conversation(other_id: int, employee_id: int = Query(...)):
    me = employee_id
    if me == other_id:
        raise HTTPException(400, "Cannot self-DM")
    with db() as (con, cur):
        _ensure_user(cur, me)
        _ensure_user(cur, other_id)
        thread_id = _get_or_create_dm_thread(cur, me, other_id)
        cur.execute("UPDATE messages SET read_at=NOW() WHERE thread_id=%s AND sender_id=%s AND read_at IS NULL", (thread_id, other_id))
        cur.execute("SELECT m.id, m.sender_id, m.body, m.created_at, m.read_at, u.name AS sender_name FROM messages m JOIN app_users u ON u.id=m.sender_id WHERE m.thread_id=%s ORDER BY m.created_at ASC, m.id ASC", (thread_id,))
        rows = cur.fetchall() or []
    return {"messages": [_serialize_message_row(r) for r in rows]}

@router.post("")
def send_message(payload: MessageCreateBody):
    text = (payload.body or "").strip()
    if not text:
        raise HTTPException(400, "Empty message")
    s = payload.sender_id
    r = payload.recipient_id
    if s == r:
        raise HTTPException(400, "Cannot send to yourself")
    with db() as (con, cur):
        sender_name = _ensure_user(cur, s)
        _ensure_user(cur, r)
        thread_id = _get_or_create_dm_thread(cur, s, r)
        cur.execute("INSERT INTO messages (thread_id, sender_id, body) VALUES (%s,%s,%s) RETURNING id, sender_id, body, created_at", (thread_id, s, text))
        row = cur.fetchone()
        created = row["created_at"].isoformat() if isinstance(row["created_at"], datetime) else str(row["created_at"])
        msg = {"id": str(row["id"]), "sender_id": row["sender_id"], "sender_name": sender_name, "recipient_id": r, "body": row["body"], "created_at": created}
        m = SYNERGY_RE.search(text)
        if m:
            msg["synergy_code"] = m.group(1).upper()
        _broadcast("message.new", msg)
        return msg

@router.post("/groups")
def create_group(data: dict):
    name = (data.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "Group name is required")
    member_ids_raw = data.get("member_ids") or []
    initial = (data.get("initial_message") or "").strip()
    try:
        member_ids = [int(uid) for uid in member_ids_raw]
    except:
        raise HTTPException(400, "member_ids must be integers")
    seen = set()
    uniq = [uid for uid in member_ids if uid not in seen and not seen.add(uid)]
    if len(uniq) < 2:
        raise HTTPException(400, "Group must include at least 2 people")
    creator = uniq[0]
    with db() as (con, cur):
        for uid in uniq: _ensure_user(cur, uid)
        cur.execute("INSERT INTO message_threads (subject, is_group, created_by_id) VALUES (%s,true,%s) RETURNING id", (name, creator))
        thread_id = cur.fetchone()["id"]
        for uid in uniq:
            cur.execute("INSERT INTO message_thread_participants (thread_id,user_id) VALUES (%s,%s) ON CONFLICT DO NOTHING", (thread_id, uid))
        if initial:
            cur.execute("INSERT INTO messages (thread_id,sender_id,body) VALUES (%s,%s,%s)", (thread_id, creator, initial))
        con.commit()
    _broadcast("thread.created", {"thread_id": thread_id, "name": name})
    return {"success": True, "thread_id": str(thread_id)}

@router.get("/threads/{thread_id}/messages")
def get_thread_messages(thread_id: str, employee_id: int = Query(...)):
    with db() as (con, cur):
        cur.execute("SELECT 1 FROM message_thread_participants WHERE thread_id=%s AND user_id=%s", (thread_id, employee_id))
        if not cur.fetchone():
            raise HTTPException(403, "Not in this thread")
        cur.execute("UPDATE messages SET read_at=NOW() WHERE thread_id=%s AND sender_id <> %s AND read_at IS NULL", (thread_id, employee_id))
        cur.execute("SELECT m.id, m.sender_id, m.body, m.created_at, m.read_at, u.name AS sender_name FROM messages m JOIN app_users u ON u.id=m.sender_id WHERE m.thread_id=%s ORDER BY m.created_at ASC, m.id ASC", (thread_id,))
        rows = cur.fetchall() or []
    return {"messages": [_serialize_message_row(r) for r in rows]}

@router.post("/threads/{thread_id}/messages")
def send_thread_message(thread_id: str, payload: ThreadMessageCreateBody, employee_id: int = Query(...)):
    text = (payload.body or "").strip()
    if not text:
        raise HTTPException(400, "Empty message")
    with db() as (con, cur):
        sender_name = _ensure_user(cur, employee_id)
        cur.execute("SELECT 1 FROM message_thread_participants WHERE thread_id=%s AND user_id=%s", (thread_id, employee_id))
        if not cur.fetchone():
            raise HTTPException(403, "Not in this thread")
        cur.execute("INSERT INTO messages (thread_id, sender_id, body) VALUES (%s,%s,%s) RETURNING id, sender_id, body, created_at", (thread_id, employee_id, text))
        row = cur.fetchone()
        con.commit()
    msg = _serialize_message_row({**row, "sender_name": sender_name})
    _broadcast("message.created", {"thread_id": thread_id, "message": msg})
    return msg

@router.put("/threads/{thread_id}")
def update_group_info(thread_id: str, payload: GroupUpdateBody, employee_id: int = Query(...)):
    subject = payload.subject.strip()
    if not subject:
        raise HTTPException(400, "Group name cannot be empty")
    with db() as (con, cur):
        cur.execute("UPDATE message_threads SET subject = %s, avatar_url = %s WHERE id = %s AND created_by_id = %s RETURNING id", (subject, payload.avatar_url, thread_id, employee_id))
        if not cur.fetchone():
            raise HTTPException(403, "Only the group admin can edit this thread")
        con.commit()
    update_data = {"thread_id": thread_id, "subject": subject, "avatar_url": payload.avatar_url}
    _broadcast("thread.updated", update_data)
    return {"success": True, **update_data}

@router.post("/threads/{thread_id}/participants")
def add_participant(thread_id: str, data: dict, employee_id: int = Query(...)):
    new_member_id = data.get("user_id")
    if not new_member_id:
        raise HTTPException(400, "user_id is required")
    with db() as (con, cur):
        cur.execute("SELECT 1 FROM message_threads WHERE id = %s AND created_by_id = %s", (thread_id, employee_id))
        if not cur.fetchone():
            raise HTTPException(403, "Only the group admin can add members")
        _ensure_user(cur, new_member_id)
        cur.execute("INSERT INTO message_thread_participants (thread_id, user_id) VALUES (%s, %s) ON CONFLICT DO NOTHING", (thread_id, new_member_id))
        con.commit()
    return {"success": True}

@router.delete("/threads/{thread_id}/participants/{user_id}")
def remove_participant(thread_id: str, user_id: int, employee_id: int = Query(...)):
    with db() as (con, cur):
        cur.execute("SELECT created_by_id FROM message_threads WHERE id = %s", (thread_id,))
        thread_info = cur.fetchone()
        if not thread_info:
            raise HTTPException(404, "Thread not found")
        if thread_info['created_by_id'] != employee_id:
            raise HTTPException(403, "Only the group admin can remove members")
        if thread_info['created_by_id'] == user_id:
            raise HTTPException(400, "Admin cannot be removed from the group")
        cur.execute("DELETE FROM message_thread_participants WHERE thread_id = %s AND user_id = %s", (thread_id, user_id))
        con.commit()
    return {"success": True}

@router.delete("/threads/{thread_id}/participants/me")
def leave_group(thread_id: str, employee_id: int = Query(...)):
    with db() as (con, cur):
        cur.execute("DELETE FROM message_thread_participants WHERE thread_id = %s AND user_id = %s", (thread_id, employee_id))
        cur.execute("SELECT COUNT(*) as count FROM message_thread_participants WHERE thread_id = %s", (thread_id,))
        if cur.fetchone()['count'] == 0:
            cur.execute("DELETE FROM messages WHERE thread_id=%s", (thread_id,))
            cur.execute("DELETE FROM message_threads WHERE id = %s", (thread_id,))
        con.commit()
    return {"success": True}

@router.get("/threads/all")
def list_all_threads(employee_id: int = Query(...)):
    with db() as (con, cur):
        cur.execute(
            """
            WITH my_threads AS (
                SELECT t.id, t.is_group, t.subject, t.created_by_id, t.avatar_url FROM message_threads t
                JOIN message_thread_participants p ON p.thread_id = t.id WHERE p.user_id = %(me)s
            ), last_messages AS (
                SELECT DISTINCT ON (m.thread_id) m.thread_id, m.sender_id, m.body, m.created_at FROM messages m
                WHERE m.thread_id IN (SELECT id FROM my_threads)
                ORDER BY m.thread_id, m.created_at DESC, m.id DESC
            ), dm_other_user AS (
                SELECT p.thread_id, u.id AS other_id, u.name AS other_name FROM message_thread_participants p
                JOIN app_users u ON u.id = p.user_id JOIN message_threads t ON t.id = p.thread_id
                WHERE p.thread_id IN (SELECT id FROM my_threads) AND COALESCE(t.is_group, FALSE) = FALSE AND p.user_id <> %(me)s
            )
            SELECT
                lm.thread_id, lm.sender_id, lm.body, lm.created_at,
                mt.is_group, mt.subject, mt.created_by_id, mt.avatar_url,
                dou.other_id, dou.other_name, dou.other_id as recipient_id,
                (SELECT COUNT(*) FROM messages m2 WHERE m2.thread_id = lm.thread_id AND m2.sender_id <> %(me)s AND m2.read_at IS NULL) AS unread_count
            FROM last_messages lm
            JOIN my_threads mt ON mt.id = lm.thread_id
            LEFT JOIN dm_other_user dou ON dou.thread_id = lm.thread_id
            ORDER BY lm.created_at DESC
            """,
            {"me": employee_id},
        )
        rows = cur.fetchall() or []
        if not rows: return {"threads": []}
        thread_ids = [row["thread_id"] for row in rows]
        cur.execute("SELECT p.thread_id, u.id, u.name FROM message_thread_participants p JOIN app_users u ON u.id = p.user_id WHERE p.thread_id = ANY(%s) ORDER BY p.thread_id, u.name", (thread_ids,))
        participants_rows = cur.fetchall() or []
        participants_map = {}
        for p_row in participants_rows:
            tid = p_row['thread_id']
            if tid not in participants_map: participants_map[tid] = []
            participants_map[tid].append({"id": int(p_row["id"]), "name": p_row["name"]})
        threads = []
        for row in rows:
            row_data = dict(row)
            row_data["participants"] = participants_map.get(row["thread_id"], [])
            threads.append(_serialize_thread_row(row_data))
    return {"threads": threads}

@router.delete("/threads/{thread_id}")
def delete_thread(thread_id: str, employee_id: int = Query(...)):
    with db() as (con, cur):
        cur.execute("SELECT is_group, created_by_id FROM message_threads WHERE id = %s", (thread_id,))
        thread_info = cur.fetchone()
        if not thread_info:
            raise HTTPException(404, "Thread not found")
        is_participant_in_dm = False
        if not thread_info['is_group']:
            cur.execute("SELECT 1 FROM message_thread_participants WHERE thread_id = %s AND user_id = %s", (thread_id, employee_id))
            if cur.fetchone():
                is_participant_in_dm = True
        if thread_info['is_group'] and thread_info['created_by_id'] != employee_id:
            raise HTTPException(403, "Only the group admin can delete this group")
        if not thread_info['is_group'] and not is_participant_in_dm:
             raise HTTPException(403, "You cannot delete a DM you are not a part of")
        cur.execute("DELETE FROM messages WHERE thread_id=%s", (thread_id,))
        cur.execute("DELETE FROM message_thread_participants WHERE thread_id=%s", (thread_id,))
        cur.execute("DELETE FROM message_threads WHERE id=%s", (thread_id,))
        con.commit()
    _broadcast("thread.deleted", {"thread_id": thread_id})
    return {"success": True}