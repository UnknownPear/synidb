from datetime import datetime
from fastapi import APIRouter, HTTPException, Body, Header
from pydantic import BaseModel
from typing import Optional, List
from db_utils import db

router = APIRouter()

class TimeEntryIn(BaseModel):
    clock_in: datetime
    clock_out: Optional[datetime] = None
    notes: Optional[str] = None

class TimeEntryNotesUpdate(BaseModel):
    notes: Optional[str] = None

class TimeEntryUpdate(BaseModel):
    clock_in: Optional[datetime] = None
    clock_out: Optional[datetime] = None
    notes: Optional[str] = None

@router.get("/time/status")
def get_current_status(x_user_id: int = Header(..., alias="X-User-ID")):
    """Checks if the user is currently clocked in."""
    with db() as (con, cur):
        cur.execute("""
            SELECT * FROM time_entries 
            WHERE user_id = %s AND clock_out IS NULL 
            ORDER BY clock_in DESC LIMIT 1
        """, (x_user_id,))
        active = cur.fetchone()
        
        # Get today's total seconds
        cur.execute("""
            SELECT SUM(EXTRACT(EPOCH FROM (clock_out - clock_in))) as total
            FROM time_entries
            WHERE user_id = %s 
              AND clock_out IS NOT NULL 
              AND clock_in::date = CURRENT_DATE
        """, (x_user_id,))
        today_seconds = cur.fetchone()['total'] or 0

        return {
            "active_session": dict(active) if active else None,
            "today_seconds": int(today_seconds)
        }

@router.post("/time/clock-in")
def clock_in(x_user_id: int = Header(..., alias="X-User-ID")):
    with db() as (con, cur):
        # Ensure not already clocked in
        cur.execute(
            "SELECT 1 FROM time_entries WHERE user_id = %s AND clock_out IS NULL",
            (x_user_id,),
        )
        if cur.fetchone():
            raise HTTPException(400, "Already clocked in")

        cur.execute("""
            INSERT INTO time_entries (user_id, clock_in, is_manual)
            VALUES (%s, NOW(), FALSE)
            RETURNING id, clock_in
        """, (x_user_id,))
        return dict(cur.fetchone())

@router.post("/time/clock-out")
def clock_out(x_user_id: int = Header(..., alias="X-User-ID"), body: dict = Body(default={})):
    notes = body.get("notes")
    with db() as (con, cur):
        cur.execute("""
            UPDATE time_entries 
            SET clock_out = NOW(), 
                duration_seconds = EXTRACT(EPOCH FROM (NOW() - clock_in)),
                notes = %s
            WHERE user_id = %s AND clock_out IS NULL
            RETURNING id, clock_out, duration_seconds
        """, (notes, x_user_id))
        row = cur.fetchone()
        if not row:
            raise HTTPException(400, "No active session to clock out from")
        return dict(row)

@router.post("/time/manual")
def manual_entry(payload: TimeEntryIn, x_user_id: int = Header(..., alias="X-User-ID")):
    """Add a completed block of time manually."""
    if not payload.clock_out:
        raise HTTPException(400, "Manual entries require a clock out time.")
    
    duration = (payload.clock_out - payload.clock_in).total_seconds()
    if duration < 0:
        raise HTTPException(400, "Clock out cannot be before Clock in.")

    with db() as (con, cur):
        cur.execute("""
            INSERT INTO time_entries (user_id, clock_in, clock_out, duration_seconds, is_manual, notes)
            VALUES (%s, %s, %s, %s, TRUE, %s)
            RETURNING id
        """, (x_user_id, payload.clock_in, payload.clock_out, duration, payload.notes))
        return dict(cur.fetchone())

@router.get("/time/history")
def get_history(x_user_id: int = Header(..., alias="X-User-ID"), limit: int = 20):
    with db() as (con, cur):
        cur.execute("""
            SELECT id, clock_in, clock_out, duration_seconds, is_manual, notes 
            FROM time_entries 
            WHERE user_id = %s 
            ORDER BY clock_in DESC 
            LIMIT %s
        """, (x_user_id, limit))
        return [dict(r) for r in cur.fetchall()]

@router.post("/time/manual/bulk")
def manual_entry_bulk(payload: List[TimeEntryIn], x_user_id: int = Header(..., alias="X-User-ID")):
    """
    Allows submitting multiple time blocks at once.
    """
    if not payload:
        raise HTTPException(400, "No entries provided")

    inserted_ids = []
    
    with db() as (con, cur):
        for entry in payload:
            if not entry.clock_out:
                raise HTTPException(400, "All manual entries must have a clock-out time.")
            
            # Calculate duration
            duration = (entry.clock_out - entry.clock_in).total_seconds()
            
            if duration < 0:
                raise HTTPException(
                    400,
                    f"End time cannot be before start time for entry starting at {entry.clock_in}",
                )

            cur.execute("""
                INSERT INTO time_entries (user_id, clock_in, clock_out, duration_seconds, is_manual, notes)
                VALUES (%s, %s, %s, %s, TRUE, %s)
                RETURNING id
            """, (x_user_id, entry.clock_in, entry.clock_out, duration, entry.notes))
            inserted_ids.append(str(cur.fetchone()['id']))
            
    return {"ok": True, "count": len(inserted_ids), "ids": inserted_ids}

@router.patch("/time/entry/{entry_id}/notes")
def update_time_entry_notes(
    entry_id: str,  # <-- CHANGED from int to str to support UUID-like IDs
    payload: TimeEntryNotesUpdate,
    x_user_id: int = Header(..., alias="X-User-ID"),
):
    """
    Update notes for a specific time entry that already exists.
    Limits update to entries owned by the authenticated user.
    """
    with db() as (con, cur):
        cur.execute(
            """
            UPDATE time_entries
            SET notes = %s
            WHERE id = %s AND user_id = %s
            RETURNING id, clock_in, clock_out, duration_seconds, is_manual, notes
            """,
            (payload.notes, entry_id, x_user_id),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Time entry not found")
        return dict(row)


@router.patch("/time/entry/{entry_id}")
def update_time_entry(
    entry_id: str,
    payload: TimeEntryUpdate,
    x_user_id: int = Header(..., alias="X-User-ID"),
):
    """
    Update any field of a time entry. 
    Recalculates duration if times are changed.
    """
    with db() as (con, cur):
        # 1. Fetch existing entry to handle partial updates and duration calc
        cur.execute(
            "SELECT clock_in, clock_out FROM time_entries WHERE id = %s AND user_id = %s",
            (entry_id, x_user_id)
        )
        existing = cur.fetchone()
        if not existing:
            raise HTTPException(404, "Time entry not found")

        # Use new values if provided, otherwise stick to existing
        new_in = payload.clock_in or existing['clock_in']
        new_out = payload.clock_out or existing['clock_out']
        
        # Validation
        duration = None
        if new_in and new_out:
            duration = (new_out - new_in).total_seconds()
            if duration < 0:
                raise HTTPException(400, "Clock out cannot be before Clock in.")

        # 2. Update the record
        # Note: We use COALESCE or explicit mapping to handle the notes update
        cur.execute(
            """
            UPDATE time_entries
            SET clock_in = %s,
                clock_out = %s,
                duration_seconds = %s,
                notes = COALESCE(%s, notes)
            WHERE id = %s AND user_id = %s
            RETURNING id, clock_in, clock_out, duration_seconds, is_manual, notes
            """,
            (new_in, new_out, duration, payload.notes, entry_id, x_user_id),
        )
        return dict(cur.fetchone())