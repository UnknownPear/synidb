# routes_system.py
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Dict, Any
from pubsub_utils import _broadcast

router = APIRouter()

class EventPayload(BaseModel):
    type: str
    data: Dict[str, Any]

@router.post("/system/broadcast-event")
def broadcast_system_event(payload: EventPayload):
    """
    An internal endpoint for services like the backup container
    to broadcast real-time events to all connected clients.
    """
    _broadcast(payload.type, payload.data)
    return {"ok": True, "event_sent": payload.type}