from datetime import datetime, timedelta, timezone
import os
import json
import re
import time
import base64
import jwt

from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Query, Body, Depends, Header, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
import requests
import xml.etree.ElementTree as ET

from db_utils import db
from ebay_utils import get_ebay_token
from config import EBAY_MARKETPLACE_ID, CURRENT_GENAI_MODEL, HAVE_GENAI, GEMINI_API_KEY, AI_FIRST
from pubsub_utils import _broadcast

router = APIRouter()

JWT_SECRET = os.getenv("JWT_SECRET", "unsafe_default_secret")
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 43200))

security = HTTPBearer(auto_error=False)

class NewUser(BaseModel):
    name: str
    initials: str | None = None
    roles: List[str] = ["Tester"]
    active: bool = True
    password: str | None = None

class PasswordUpdate(BaseModel):
    password: str | None

class LoginPayload(BaseModel):
    userId: int
    password: str
    
class AvatarUpdate(BaseModel):
    avatar_url: str

class AdminPasswordReset(BaseModel):
    password: str

class AdminDeletePayload(BaseModel):
    manager_id: int
    manager_password: str

class UserUpdatePayload(BaseModel):
    name: str | None = None
    roles: List[str] | None = None
    
class SkuNumberUpdate(BaseModel):
    next_number: int

class EbayLinkPayload(BaseModel):
    ebay_item_id: str
    ebay_item_url: str
    ebay_price: float
    synergy_ids: List[str]
    posted_by_user_id: int
    increment_sku: bool = False

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(token: str):
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

def get_current_user_id(
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
    token_auth: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> int:
    # 1. Try JWT Token (Highest Priority)
    if token_auth:
        payload = verify_token(token_auth.credentials)
        if payload:
            return int(payload["sub"])

    # 2. Try Legacy Header (Fallback)
    if x_user_id and str(x_user_id).isdigit():
        return int(x_user_id)

    # 3. Return 0 (Guest) instead of crashing
    return 0

def require_manager_auth(user_id: int = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(status_code=401, detail="Not Authenticated")

    with db() as (con, cur):
        cur.execute("SELECT roles FROM app_users WHERE id = %s AND active = TRUE", (user_id,))
        user = cur.fetchone()
        
        if not user:
            raise HTTPException(status_code=403, detail="Forbidden: User not found or inactive")

        user_roles = [r.lower() for r in (user['roles'] if user['roles'] else [])]
        
        if 'manager' not in user_roles and 'admin' not in user_roles:
            raise HTTPException(status_code=403, detail="Forbidden: Not authorized (Manager access required)")
            
    return user_id

@router.put("/admin/users/{user_id}/reset-password", dependencies=[Depends(require_manager_auth)])
def admin_reset_user_password(user_id: int, payload: AdminPasswordReset):
    if not payload.password or not payload.password.strip():
        raise HTTPException(status_code=400, detail="Password cannot be empty.")

    with db() as (con, cur):
        cur.execute("SELECT id FROM app_users WHERE id = %s", (user_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Target user not found")

        cur.execute(
            "UPDATE app_users SET password_hash = crypt(%s, gen_salt('bf')) WHERE id = %s",
            (payload.password.strip(), user_id)
        )
        con.commit()
    
    return {"success": True, "message": "Password has been updated successfully."}

@router.patch("/admin/users/{user_id}")
def admin_update_user_details(
    user_id: int, 
    payload: UserUpdatePayload,
    requester_id: int = Depends(require_manager_auth) 
):
    updates = []
    params = []

    if payload.name is not None and payload.name.strip():
        updates.append("name = %s")
        params.append(payload.name.strip())
        initials = "".join([p[:1] for p in payload.name.split()])[:4].upper()
        updates.append("initials = %s")
        params.append(initials)

    if payload.roles is not None:
        if int(user_id) == int(requester_id):
             raise HTTPException(status_code=400, detail="You cannot change your own roles.")
        
        clean_roles = list(set([r.strip() for r in payload.roles if r.strip()]))
        if not clean_roles:
             raise HTTPException(status_code=400, detail="User must have at least one role.")
             
        updates.append("roles = %s::jsonb")
        params.append(json.dumps(clean_roles))
        
        updates.append("role = %s")
        params.append(clean_roles[0])

    if not updates:
        return {"success": True, "message": "No changes detected."}

    params.append(user_id)
    
    with db() as (con, cur):
        cur.execute("SELECT id FROM app_users WHERE id = %s", (user_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="User not found")

        sql = f"UPDATE app_users SET {', '.join(updates)} WHERE id = %s"
        cur.execute(sql, params)
        con.commit()

    return {"success": True, "message": "User details updated successfully."}

@router.delete("/admin/users/{user_id}")
def admin_delete_user(user_id: int, payload: AdminDeletePayload):
    with db() as (con, cur):
        cur.execute(
            """
            SELECT roles 
            FROM app_users 
            WHERE id = %s AND active = TRUE AND password_hash = crypt(%s, password_hash)
            """, 
            (payload.manager_id, payload.manager_password)
        )
        manager = cur.fetchone()
        
        if not manager:
            raise HTTPException(status_code=401, detail="Invalid manager password or account.")

        roles = [r.lower() for r in (manager['roles'] if manager['roles'] else [])]
        if 'manager' not in roles and 'admin' not in roles:
             raise HTTPException(status_code=403, detail="Only managers can delete users.")

        if int(user_id) == int(payload.manager_id):
            raise HTTPException(status_code=400, detail="You cannot delete your own account.")

        cur.execute(
            "UPDATE app_users SET active = FALSE WHERE id = %s RETURNING id, name", 
            (user_id,)
        )
        deactivated = cur.fetchone()
        
        if not deactivated:
             raise HTTPException(status_code=404, detail="Target user not found.")

        con.commit()

    return {"success": True, "message": f"User {deactivated['name']} has been deactivated."}

@router.get("/auth/users")
def list_users(
    role: Optional[str] = Query(None), 
    active: bool = Query(True), 
    requester_id: int = Depends(get_current_user_id)
):
    sql = [
        """
        SELECT 
            id, 
            name, 
            initials, 
            role,         
            roles,        
            active, 
            avatar_url, 
            (password_hash IS NOT NULL) AS has_password,
            COALESCE(sku_next_number, 1) AS sku_next_number
        FROM app_users
        WHERE 1=1
        """
    ]
    params: List[Any] = []

    is_manager = False
    
    with db() as (con, cur):
        if requester_id:
            cur.execute("SELECT roles FROM app_users WHERE id = %s", (requester_id,))
            requesting_user = cur.fetchone()
            if requesting_user:
                r_roles = [r.lower() for r in (requesting_user.get('roles') or [])]
                if 'manager' in r_roles or 'admin' in r_roles:
                    is_manager = True

        # VISIBILITY LOGIC:
        # 1. If Manager: See Everyone.
        # 2. If Guest (requester_id=0): See Everyone (Redacted) so they can pick a profile.
        # 3. If Logged in Non-Manager: Only see Self (Privacy).
        if not is_manager and requester_id != 0:
            sql.append("AND id = %s")
            params.append(requester_id)

        if role:
            if role.lower() == "all":
                pass
            else:
                sql.append("AND roles @> %s::jsonb")
                params.append(json.dumps([role]))

        if active:
            sql.append("AND active = TRUE")

        sql.append("ORDER BY name ASC")

        cur.execute(" ".join(sql), params)
        users = [dict(r) for r in cur.fetchall()]
        
        # --- FIXED REDACTION ---
        # We only remove 'sku_next_number'. 
        # We KEEP 'has_password' because the frontend needs it to show the lock icon.
        if not is_manager:
            for u in users:
                if 'sku_next_number' in u: del u['sku_next_number']
                # if 'has_password' in u: del u['has_password']  <-- REMOVED THIS LINE

        return users

@router.get("/auth/users/{user_id}")
def get_single_user(user_id: int):
    with db() as (con, cur):
        cur.execute("""
            SELECT 
                id, 
                name, 
                initials, 
                role,
                roles,
                active, 
                avatar_url, 
                COALESCE(sku_next_number, 1) AS sku_next_number
            FROM app_users
            WHERE id = %s
        """, (user_id,))
        user = cur.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return dict(user)

@router.post("/auth/users")
def create_user(body: NewUser):
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")

    initials = (body.initials or "").strip().upper() or "".join([part[:1] for part in name.split()])[:4].upper()
    
    clean_roles = list(set([r.strip() for r in body.roles if r.strip()]))
    if not clean_roles: clean_roles = ["Tester"]
    
    primary_role = clean_roles[0]

    with db() as (con, cur):
        # Allow setting password on creation
        password_hash_clause = ""
        password_value = None
        if body.password:
            password_hash_clause = ", password_hash"
            password_value = (body.password.strip(),)
        else:
            password_value = ()

        columns = ["name", "initials", "role", "roles", "active", "sku_next_number"]
        values = [name, initials, primary_role, json.dumps(clean_roles), True, 1]
        
        if password_value:
            columns.append("password_hash")
            values.extend(password_value)

        sql_cols = ", ".join(columns)
        sql_placeholders = ", ".join(["%s"] * len(values))

        cur.execute(
            f"""
            INSERT INTO app_users({sql_cols})
            VALUES({sql_placeholders})
            RETURNING id, name, initials, role, roles, active, avatar_url, (password_hash IS NOT NULL) AS has_password
            """,
            tuple(values),
        )
        
        row = cur.fetchone()
        con.commit()

    return dict(row)

@router.post("/auth/login")
def user_login(payload: LoginPayload):
    with db() as (con, cur):
        cur.execute(
            """
            SELECT 
              id, 
              name, 
              initials, 
              role,
              roles,
              active, 
              avatar_url, 
              (password_hash IS NOT NULL) as has_password,
              COALESCE(sku_next_number, 1) AS sku_next_number
            FROM app_users
            WHERE id = %s 
              AND active = TRUE 
              AND password_hash = crypt(%s, password_hash)
            """,
            (payload.userId, payload.password),
        )
        row = cur.fetchone()
    
    if not row:
        raise HTTPException(status_code=401, detail="Invalid user ID or password")

    user_data = dict(row)

    token_payload = {
        "sub": str(user_data["id"]),
        "roles": user_data.get("roles", []),
        "name": user_data.get("name")
    }
    access_token = create_access_token(token_payload)

    return {
        "user": user_data,
        "access_token": access_token,
        "token_type": "bearer"
    }

@router.put("/auth/users/{user_id}/password")
def set_user_password(user_id: int, payload: PasswordUpdate):
    with db() as (con, cur):
        cur.execute("SELECT roles FROM app_users WHERE id = %s", (user_id,))
        user_row = cur.fetchone()

        if not user_row:
            raise HTTPException(status_code=404, detail="User not found")

        roles = [r.lower() for r in (user_row['roles'] or [])]
        is_manager = 'manager' in roles

        if is_manager and (payload.password is None or not payload.password.strip()):
            raise HTTPException(status_code=400, detail="Manager accounts require a password.")

        if payload.password and payload.password.strip():
            cur.execute(
                "UPDATE app_users SET password_hash = crypt(%s, gen_salt('bf')) WHERE id = %s",
                (payload.password.strip(), user_id)
            )
        else:
            cur.execute(
                "UPDATE app_users SET password_hash = NULL WHERE id = %s",
                (user_id,)
            )
        con.commit()
    return {"success": True, "message": "Password updated successfully"}

@router.put("/auth/users/{user_id}/avatar")
def update_user_avatar(user_id: int, payload: AvatarUpdate):
    with db() as (con, cur):
        cur.execute(
            "UPDATE app_users SET avatar_url = %s WHERE id = %s RETURNING id",
            (payload.avatar_url, user_id)
        )
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="User not found")
        con.commit()
    return {"success": True, "avatar_url": payload.avatar_url}

@router.put("/auth/users/{user_id}/sku-number")
def set_user_sku_number(user_id: int, payload: SkuNumberUpdate):
    if payload.next_number < 1:
        raise HTTPException(status_code=400, detail="Next SKU number must be >= 1")

    with db() as (con, cur):
        cur.execute("SELECT id FROM app_users WHERE id = %s AND active = TRUE", (user_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="User not found")

        cur.execute(
            "UPDATE app_users SET sku_next_number = %s WHERE id = %s",
            (payload.next_number, user_id),
        )
        con.commit()

    return {"success": True, "next_number": payload.next_number}

@router.get("/admin/ebay/token")
def admin_ebay_token():
    tok = get_ebay_token(force=True)
    if not tok:
        raise HTTPException(status_code=500, detail="no_token")
    from ebay_utils import EBAY_TOKEN_CACHE
    exp = EBAY_TOKEN_CACHE.get("exp", time.time())
    return {"ok": True, "prefix": tok[:12], "expires_in": max(0, int(exp - time.time())), "marketplace": EBAY_MARKETPLACE_ID}

@router.get("/ai/health")
def ai_health():
    return {"genai_imported": HAVE_GENAI, "has_key": bool(GEMINI_API_KEY), "ai_first": AI_FIRST, "configured": bool(HAVE_GENAI and GEMINI_API_KEY)}

@router.get("/admin/ebay/unlinked")
def get_unlinked_ebay_listings():
    print("--- Starting eBay Sync (Unlinked) ---")
    token = get_ebay_token()
    if not token:
        print("ERROR: No eBay token found.")
        raise HTTPException(status_code=500, detail="No eBay token")
    
    headers = {
        "X-EBAY-API-SITEID": "0",
        "X-EBAY-API-COMPATIBILITY-LEVEL": "967",
        "X-EBAY-API-CALL-NAME": "GetMyeBaySelling",
        "X-EBAY-API-IAF-TOKEN": token,
        "Content-Type": "text/xml"
    }

    xml_body = """
    <?xml version="1.0" encoding="utf-8"?>
    <GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
      <ActiveList>
        <Include>true</Include>
        <Sort>StartTimeDescending</Sort>
        <Pagination>
          <EntriesPerPage>200</EntriesPerPage>
          <PageNumber>1</PageNumber>
        </Pagination>
      </ActiveList>
      <DetailLevel>ReturnAll</DetailLevel>
    </GetMyeBaySellingRequest>
    """
    
    try:
        r = requests.post("https://api.ebay.com/ws/api.dll", data=xml_body, headers=headers, timeout=30)
    except Exception as e:
        print(f"HTTP Request failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to connect to eBay")

    if not r.ok:
        print(f"eBay API HTTP Error: {r.status_code} - {r.text[:200]}")
        raise HTTPException(status_code=500, detail=f"eBay API Error: {r.status_code}")

    try:
        xml_text = r.text
        xml_text = re.sub(r'xmlns\s*=\s*["\'][^"\']+["\']', '', xml_text)
        xml_text = re.sub(r'<([a-zA-Z0-9]+):', '<', xml_text)
        xml_text = re.sub(r'</([a-zA-Z0-9]+):', '</', xml_text)
        
        root = ET.fromstring(xml_text)
        
        ack = root.find(".//Ack")
        if ack is not None and ack.text == 'Failure':
            errors = root.findall(".//Errors")
            error_msg = "Unknown eBay Error"
            if errors:
                short = errors[0].find("ShortMessage")
                long = errors[0].find("LongMessage")
                error_msg = long.text if long is not None else (short.text if short is not None else "Error")
            
            print(f"eBay API Failure response: {error_msg}")
            raise HTTPException(status_code=500, detail=f"eBay Error: {error_msg}")

        active_listings = []
        items_node = root.findall(".//ActiveList/ItemArray/Item")
        
        print(f"Found {len(items_node)} active items in XML response.")

        for item in items_node:
            try:
                def get_text(elem, tag, default=""):
                    node = elem.find(tag)
                    return node.text if node is not None else default

                item_id = get_text(item, "ItemID")
                title = get_text(item, "Title")
                
                selling_status = item.find("SellingStatus")
                current_price = selling_status.find("CurrentPrice") if selling_status is not None else None
                
                if current_price is not None:
                    price_val = float(current_price.text)
                    currency = current_price.attrib.get("currencyID", "USD")
                else:
                    price_val = 0.0
                    currency = "USD"

                qty = int(get_text(item, "Quantity", "1"))

                listing_details = item.find("ListingDetails")
                url = get_text(listing_details, "ViewItemURL") if listing_details is not None else ""

                sku = get_text(item, "SKU")

                pic_details = item.find("PictureDetails")
                image = get_text(pic_details, "GalleryURL") if pic_details is not None else ""

                if item_id:
                    active_listings.append({
                        "id": item_id,
                        "title": title,
                        "price": price_val,
                        "currency": currency,
                        "qty": qty,
                        "url": url,
                        "sku": sku,
                        "image": image
                    })
            except Exception as e:
                print(f"Skipping individual item due to data error: {e}")
                continue

        with db() as (con, cur):
            cur.execute("SELECT DISTINCT ebay_item_id FROM inventory_items WHERE ebay_item_id IS NOT NULL")
            db_rows = cur.fetchall()
            known_ids = {str(row['ebay_item_id']) for row in db_rows}
        
        unlinked = [x for x in active_listings if str(x['id']) not in known_ids]
        
        print(f"Total Active: {len(active_listings)}, Already Linked: {len(active_listings) - len(unlinked)}, Returning Unlinked: {len(unlinked)}")
        
        return {"items": unlinked}

    except ET.ParseError:
        print(f"XML PARSE ERROR. Response snippet: {r.text[:500]}...")
        raise HTTPException(status_code=500, detail="Failed to parse eBay response (Invalid XML)")
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Fatal Error in get_unlinked_ebay_listings: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to parse eBay response")

@router.post("/admin/ebay/link")
def link_ebay_items(payload: EbayLinkPayload):
    if not payload.synergy_ids:
        raise HTTPException(status_code=400, detail="No items selected")

    final_url = payload.ebay_item_url.strip()
    if final_url and not final_url.startswith("http"):
        final_url = f"https://{final_url}"
    if "ebay.com" not in final_url: 
         final_url = f"https://www.ebay.com/itm/{payload.ebay_item_id}"

    with db() as (con, cur):
        sku_to_save = None

        cur.execute(
            "SELECT ebay_sku FROM inventory_items WHERE ebay_item_id = %s AND ebay_sku IS NOT NULL LIMIT 1", 
            (payload.ebay_item_id,)
        )
        existing = cur.fetchone()

        if existing:
            sku_to_save = existing['ebay_sku']
        elif payload.increment_sku:
            cur.execute("SELECT initials, sku_next_number FROM app_users WHERE id = %s FOR UPDATE", (payload.posted_by_user_id,))
            user = cur.fetchone()
            
            if user:
                cur.execute("""
                    SELECT c.label 
                    FROM inventory_items i 
                    LEFT JOIN categories c ON c.id = i.category_id 
                    WHERE i.synergy_code = %s
                """, (payload.synergy_ids[0],))
                cat_row = cur.fetchone()
                
                initials = (user['initials'] or "XX").upper()
                seq = user['sku_next_number'] or 1
                cat_label = (cat_row['label'] if cat_row else "GENERIC").strip()
                
                import re
                smart_cat = re.sub(r'[^A-Z0-9]', '', cat_label.split(' ')[0].upper())

                sku_to_save = f"{initials} {seq} {smart_cat} - STOCK SHELF"

                cur.execute("UPDATE app_users SET sku_next_number = sku_next_number + 1 WHERE id = %s", (payload.posted_by_user_id,))

        cur.execute(
            """
            UPDATE inventory_items
            SET 
                status = 'POSTED',
                ebay_item_id = %s,
                ebay_item_url = %s,
                ebay_price = %s,
                posted_at = NOW(),
                posted_by = (SELECT name FROM app_users WHERE id = %s),
                ebay_sku = COALESCE(%s, ebay_sku)
            WHERE synergy_code = ANY(%s)
            RETURNING synergy_code
            """,
            (
                payload.ebay_item_id,
                final_url,
                payload.ebay_price,
                payload.posted_by_user_id,
                sku_to_save,
                payload.synergy_ids
            )
        )
        updated_rows = cur.fetchall()
        updated_codes = [r['synergy_code'] for r in updated_rows]
        
        if updated_codes:
            cur.execute(
                """
                SELECT 
                    i.synergy_code AS "synergyId", 
                    COALESCE(pl.product_name_raw, '') AS "productName",
                    i.category_id AS "categoryId", 
                    i.status AS "status",
                    COALESCE(i.cost_unit, 0) AS "purchaseCost", 
                    COALESCE(pl.qty, 1) AS "qty",
                    COALESCE(i.msrp, pl.msrp, 0) AS "msrp",
                    i.purchase_order_id AS "poId", 
                    i.po_line_id AS "lineId",
                    i.grade AS "grade", 
                    i.tested_by AS "testedBy", 
                    i.tested_date AS "testedDate",
                    i.tester_comment AS "testerComment", 
                    i.posted_at AS "postedAt",
                    i.posted_by::text AS "postedBy", 
                    i.ebay_item_url AS "ebayItemUrl",
                    COALESCE(i.specs, '{}'::jsonb) AS "specs",
                    COALESCE(i.price, 0) AS "price", 
                    COALESCE(i.ebay_price, 0) AS "ebayPrice",
                    c.label AS "categoryLabel", 
                    c.prefix AS "categoryPrefix",
                    i.ebay_sku AS "ebaySku"
                FROM inventory_items i
                LEFT JOIN po_lines pl ON pl.id = i.po_line_id
                LEFT JOIN categories c ON c.id = i.category_id
                WHERE i.synergy_code = ANY(%s)
                """,
                (updated_codes,)
            )
            rows = cur.fetchall()
            
            cur.execute("SELECT sku_next_number FROM app_users WHERE id = %s", (payload.posted_by_user_id,))
            user_res = cur.fetchone()
            next_sku = user_res['sku_next_number'] if user_res else None

            con.commit()
            
            for r in rows:
                _broadcast("row.upserted", dict(r))
                
            return {"success": True, "updated": len(updated_codes), "nextSku": next_sku}

    return {"success": True, "updated": len(updated_codes)}