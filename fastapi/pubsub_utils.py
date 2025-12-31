import asyncio
import json
import time
from typing import Dict, Any, List

from fastapi.responses import StreamingResponse
from config import get_redis

# Shared list of subscribers for direct broadcast
_subscribers: list[asyncio.Queue] = []

def _decode_bytes(x):
    if isinstance(x, (bytes, bytearray)):
        return x.decode("utf-8", "ignore")
    return x if isinstance(x, str) else str(x)

def _sse(data: dict) -> str:
    return f"data: {json.dumps(data, default=str)}\n\n"

def _heartbeat() -> str:
    return ": keep-alive\n\n"

def _broadcast(evt_type: str, data: dict | None = None):
    """
    Pushes an event to all connected SSE clients (Posters/Testers).
    """
    payload = {"type": evt_type, "data": data or {}}
    # Iterate over a copy so we don't crash if a client disconnects during iteration
    for q in list(_subscribers):
        try:
            q.put_nowait(payload)
        except Exception:
            pass

# --- NEW HELPER FUNCTIONS FOR MAIN.PY ---
def subscribe() -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue()
    _subscribers.append(q)
    return q

def unsubscribe(q: asyncio.Queue):
    try:
        _subscribers.remove(q)
    except ValueError:
        pass

def _stream_pubsub_sse(channel: str) -> StreamingResponse:
    """
    Subscribes to Redis Pub/Sub `channel` and streams JSON events as SSE.
    (Used for specific job progress like imports)
    """
    r = get_redis()
    pubsub = r.pubsub(ignore_subscribe_messages=True)
    pubsub.subscribe(channel)

    async def gen():
        yield _sse({"type": "progress", "pct": 1, "label": "Queued"})
        last_beat = time.monotonic()
        try:
            while True:
                msg = pubsub.get_message(timeout=1.0) 
                if msg and msg.get("type") == "message":
                    raw = msg.get("data")
                    try:
                        event = json.loads(_decode_bytes(raw))
                    except Exception:
                        event = {"type": "error", "message": "invalid_event_payload"}
                    
                    yield _sse(event)

                    if event.get("type") in ("complete", "error"):
                        break

                now = time.monotonic()
                if now - last_beat > 10:
                    yield _heartbeat()
                    last_beat = now

                await asyncio.sleep(0.1)
        finally:
            try:
                pubsub.unsubscribe(channel)
                pubsub.close()
            except Exception:
                pass

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(gen(), media_type="text/event-stream", headers=headers)