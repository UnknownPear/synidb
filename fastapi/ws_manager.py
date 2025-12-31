# ws_manager.py
from typing import List, Dict
from fastapi import WebSocket

class ConnectionManager:
    def __init__(self):
        # user_id -> list[WebSocket]
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: int):
        await websocket.accept()
        uid = str(user_id)
        if uid not in self.active_connections:
            self.active_connections[uid] = []
        self.active_connections[uid].append(websocket)
        print(f"✅ WS Manager: User {uid} connected. Active tabs: {len(self.active_connections[uid])}")

    def disconnect(self, websocket: WebSocket, user_id: int):
        uid = str(user_id)
        if uid in self.active_connections:
            if websocket in self.active_connections[uid]:
                self.active_connections[uid].remove(websocket)
            if not self.active_connections[uid]:
                del self.active_connections[uid]
                print(f"⚠️ WS Manager: User {uid} fully disconnected.")

    async def send_personal_message(self, message: dict, user_id: int):
        uid = str(user_id)
        if uid in self.active_connections:
            for connection in self.active_connections[uid][:]:
                try:
                    await connection.send_json(message)
                except Exception:
                    print(f"❌ Dead socket for {uid}, removing...")
                    self.disconnect(connection, user_id)
        else:
            print(f"📭 WS Manager: User {uid} is NOT connected. Message skipped.")

    async def broadcast_to_thread(self, thread_participants: List[int], message: dict):
        for user_id in thread_participants:
            await self.send_personal_message(message, user_id)

manager = ConnectionManager()
