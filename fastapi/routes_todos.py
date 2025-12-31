import os
from typing import List, Optional, Dict, Any
from datetime import datetime
from fastapi import APIRouter, HTTPException, Header, Body
from pydantic import BaseModel
from db_utils import db
from pubsub_utils import _broadcast

router = APIRouter(prefix="/todos", tags=["To-Do"])

# --- Models ---
class TodoCreate(BaseModel):
    title: str
    priority: str = "MEDIUM"

class TodoUpdate(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None

# --- Endpoints ---

@router.get("")
def get_todos():
    with db() as (con, cur):
        cur.execute("""
            SELECT 
                t.id, t.title, t.priority, t.status, t.created_at, t.completed_at,
                u.name as created_by_name, u.avatar_url as created_by_avatar
            FROM feature_requests t
            LEFT JOIN app_users u ON t.created_by_id = u.id
            ORDER BY 
                CASE WHEN t.status = 'PENDING' THEN 0 ELSE 1 END,
                t.created_at DESC
        """)
        return [dict(r) for r in cur.fetchall()]

@router.post("")
def create_todo(
    payload: TodoCreate, 
    # Explicitly set default=None to make it optional
    x_user_id: Optional[int] = Header(default=None, alias="X-User-ID")
):
    with db() as (con, cur):
        cur.execute("""
            INSERT INTO feature_requests (title, priority, created_by_id, status)
            VALUES (%s, %s, %s, 'PENDING')
            RETURNING id, title, priority, status, created_at, created_by_id
        """, (payload.title, payload.priority, x_user_id))
        row = cur.fetchone()
        
        # Default anonymous user info
        user_info: Dict[str, Any] = {"name": "Anonymous", "avatar_url": None}
        
        # If a user ID was actually provided, fetch their details
        if x_user_id:
            cur.execute("SELECT name, avatar_url FROM app_users WHERE id = %s", (x_user_id,))
            found = cur.fetchone()
            if found:
                user_info = found
        
        con.commit()
    
    data = dict(row)
    data['created_by_name'] = user_info['name']
    data['created_by_avatar'] = user_info['avatar_url']
    
    _broadcast("todo.created", data)
    return data

@router.patch("/{todo_id}")
def update_todo(
    todo_id: int, 
    payload: TodoUpdate, 
    # Explicitly set default=None here too
    x_user_id: Optional[int] = Header(default=None, alias="X-User-ID")
):
    updates = []
    params = []
    
    if payload.status:
        updates.append("status = %s")
        params.append(payload.status)
        if payload.status == 'COMPLETED':
            updates.append("completed_at = NOW()")
            if x_user_id:
                updates.append("completed_by_id = %s")
                params.append(x_user_id)
        else:
            updates.append("completed_at = NULL")
            
    if payload.priority:
        updates.append("priority = %s")
        params.append(payload.priority)

    if not updates:
        return {"ok": True}

    params.append(todo_id)
    
    with db() as (con, cur):
        cur.execute(f"UPDATE feature_requests SET {', '.join(updates)} WHERE id = %s RETURNING *", tuple(params))
        row = cur.fetchone()
        con.commit()

    if row:
        _broadcast("todo.updated", dict(row))
    
    return {"ok": True}

@router.delete("/{todo_id}")
def delete_todo(todo_id: int):
    with db() as (con, cur):
        cur.execute("DELETE FROM feature_requests WHERE id = %s", (todo_id,))
        con.commit()
    
    _broadcast("todo.deleted", {"id": todo_id})
    return {"ok": True}