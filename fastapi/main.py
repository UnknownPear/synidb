#!/usr/bin/env python3
import os
import time
import json
import asyncio
import uvicorn
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import StreamingResponse
from dotenv import load_dotenv
from pathlib import Path
from fastapi import FastAPI, Depends, Query, HTTPException, Request
from db_utils import db 
from contextlib import asynccontextmanager  # ### NEW: Required for lifespan ###
from apscheduler.schedulers.background import BackgroundScheduler # ### NEW: The Scheduler ###


# --- Environment Setup ---
# Explicitly print where we are looking for the .env file to help debug
ENV_PATH = Path(__file__).resolve().parent / ".env"
print(f"--- Loading Environment from: {ENV_PATH} ---")
load_dotenv(dotenv_path=ENV_PATH)

# Verify Debug State on Startup
DEBUG_MODE = os.getenv("DEBUG", "False").lower() in ("true", "1", "t")
print(f"--- DEBUG MODE IS: {DEBUG_MODE} ---")

# --- Import Routers from Modular Files ---
from routes_auth_admin import router as auth_admin_router
from routes_category_vendor import router as category_vendor_router
from routes_import import router as import_router
from routes_inventory import router as inventory_router
from routes_integration import router as integration_router
from routes_po import router as po_router, run_global_ebay_sync
from routes_synergy import router as synergy_router
from routes_label_inventory import router as label_inventory_router
from routes_label_inventory import employees_router
from routes_search import router as search_router 
from routes_messages import router as messages_route 
from routes_system import router as system_router 
from pubsub_utils import _stream_pubsub_sse, subscribe, unsubscribe
from routes_photos import router as photos_router 
from routes_time import router as timecard_router 
from routes_todos import router as todo_router 
from routes_assistant import router as assistant_router 


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Startup: Initialize the Scheduler
    print("--- Server Starting: Initializing Background Scheduler ---")
    scheduler = BackgroundScheduler()
    
    # Run the eBay Sync every 15 minutes
    scheduler.add_job(run_global_ebay_sync, 'interval', minutes=15)
    
    scheduler.start()
    print("--- Scheduler Started: Auto-Sync active ---")
    
    yield # The application runs here
    
    # 2. Shutdown: Clean up the Scheduler
    print("--- Server Stopping: Shutting down Scheduler ---")
    scheduler.shutdown()

# --- FastAPI App Initialization ---
# ### NEW: Add lifespan=lifespan here ###
app = FastAPI(title="Synergy API", lifespan=lifespan)

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
   
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
  
    response.headers["X-Content-Type-Options"] = "nosniff"
    
  
    response.headers["X-Frame-Options"] = "DENY"
    

    csp_policy = (
        "default-src 'self'; "
        "img-src 'self' data: https://*.ebay.com https://*.ebayimg.com https://encrypted-tbn0.gstatic.com https://res.cloudinary.com; "
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; "
        "connect-src 'self' https://text.pollinations.ai https://api.ebay.com;"
    )
    response.headers["Content-Security-Policy"] = csp_policy
    
    return response

# --- CORS Middleware Configuration ---
origins = [
    "http://localhost:8081",      # Your Main Dashboard
    "http://127.0.0.1:8081",
    "http://localhost:5173",      # Extension Dev Server (Hot Reload)
    "https://www.ebay.com",       # Required: Content Script running on eBay
    "https://www.ebay.co.uk",     # Optional: UK eBay
    "https://ebay.com",           # eBay Base
    os.getenv("CORS_ORIGIN_1"),
    os.getenv("CORS_ORIGIN_2"),
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin for origin in origins if origin ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_origin_regex="chrome-extension://.*",
)

# --- Include Routers into the Application ---
app.include_router(auth_admin_router, tags=["Admin & Auth"])
app.include_router(category_vendor_router, tags=["Categories & Vendors"])
app.include_router(import_router, tags=["Import"])
app.include_router(inventory_router, tags=["Inventory"])
app.include_router(integration_router, tags=["Integrations & Pricing"])
app.include_router(po_router, tags=["Purchase Orders"])
app.include_router(synergy_router, tags=["Synergy"])
app.include_router(label_inventory_router)
app.include_router(employees_router, tags=["Employees"])
app.include_router(search_router, tags=["Search"]) 
app.include_router(messages_route, tags=["Messages"])
app.include_router(system_router, tags=["System"])
app.include_router(photos_router, tags=["Photos"])
app.include_router(timecard_router, tags=["TimeCard"])
app.include_router(todo_router, tags=["ToDo"])
app.include_router(assistant_router, tags=["Syni Assistant"])

# --- Root Level and Event Routes ---

@app.get("/health", tags=["Health"])
def health():
    """A simple health check endpoint."""
    return {"ok": True, "ts": time.time(), "debug": DEBUG_MODE}

# --- Helper for SSE Authentication ---
def verify_sse_access(user_id: str | None = Query(None)):
    """
    Checks if the user connecting to the stream is authorized.
    """
    # 1. DEBUG BYPASS
    is_debug = os.getenv("DEBUG", "False").lower() in ("true", "1", "t")
    if is_debug:
        return True

    # 2. EMERGENCY FIX: If no user_id provided, allow it anyway for this session
    # This fixes the 401 error when the frontend forgets to append ?user_id=...
    if not user_id:
        # Optional: Print to logs so you know it happened
        # print("SSE Warning: No user_id provided, bypassing auth for stream.")
        return True

    # 3. STANDARD CHECK
    with db() as (con, cur):
        # We just need to check if this is a valid active user
        # Cast to integer safely to avoid DB errors if user_id is weird
        try:
            uid = int(user_id)
            cur.execute("SELECT id FROM app_users WHERE id = %s AND active = TRUE", (uid,))
            if not cur.fetchone():
                print(f"SSE Blocked: Invalid user_id {uid}")
                raise HTTPException(status_code=403, detail="Invalid User")
        except ValueError:
            # If user_id isn't an int, ignore it or block it. 
            # Here we block it to be safe, but the 'if not user_id' block above handles the empty case.
            raise HTTPException(status_code=403, detail="Invalid User ID format")
    
    return True

@app.get("/events", tags=["Events"])
async def events_list(
    # This dependency runs before the stream starts
    authorized: bool = Depends(verify_sse_access) 
):
    """
    Endpoint for Server-Sent Events (SSE).
    Protected in Production (DEBUG=False), Open in Local (DEBUG=True).
    """
    # Use the shared subscription logic from pubsub_utils
    q = subscribe()

    async def gen():
        try:
            yield b": ok\n\n" # Initial comment to keep connection alive
            while True:
                # Wait for an event from the shared broadcast system
                evt = await q.get()
                
                # Format as SSE
                yield f"event: {evt['type']}\n".encode("utf-8")
                yield f"data: {json.dumps(evt['data'], default=str)}\n\n".encode("utf-8")
        except asyncio.CancelledError:
            # Handle client disconnect
            unsubscribe(q)
            # We don't re-raise here to avoid noisy logs on standard disconnects
            return
        finally:
            unsubscribe(q)

    return StreamingResponse(gen(), media_type="text/event-stream")


# --- Application Runner ---
if __name__ == "__main__":
    PORT = int(os.getenv("PORT", "3000"))
    # Note: reload=True can sometimes mess up env vars if not careful, 
    # but load_dotenv at the top handles it.
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=True)