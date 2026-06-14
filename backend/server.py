from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Literal
import uuid
import io
import base64
from datetime import datetime, timezone, timedelta
from collections import defaultdict
import pyotp
import qrcode
import requests as http_requests
import bcrypt
import secrets as py_secrets
import asyncio
import resend


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"

# ---------------------- Password helpers ----------------------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES = 15

resend.api_key = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")


async def send_otp_email(to_email: str, otp: str, name: str):
    if not resend.api_key:
        logging.warning("RESEND_API_KEY missing; OTP not sent (dev mode)")
        return
    html = f"""<div style='font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#F4F3EF;color:#1C1C1A'>
    <h2 style='font-weight:900;letter-spacing:-0.02em;margin:0 0 16px'>Verify your Ledger account</h2>
    <p>Hi {name}, your verification code is:</p>
    <div style='font-family:monospace;font-size:36px;letter-spacing:.4em;padding:16px;background:#FFF;border:1px solid #E6E5E0;text-align:center;font-weight:600'>{otp}</div>
    <p style='color:#5A5955;font-size:13px;margin-top:16px'>This code expires in 10 minutes. If you didn't request this, ignore this email.</p>
    </div>"""
    try:
        await asyncio.to_thread(resend.Emails.send, {
            "from": SENDER_EMAIL, "to": [to_email],
            "subject": f"Ledger code: {otp}", "html": html,
        })
    except Exception as e:
        logging.error(f"Email send failed: {e}")


async def send_whatsapp_reminder(phone: str, message: str):
    """Stub - Meta WhatsApp Cloud API. Activates when WHATSAPP_ACCESS_TOKEN is set to a real value."""
    token = os.environ.get("WHATSAPP_ACCESS_TOKEN", "")
    phone_id = os.environ.get("WHATSAPP_PHONE_NUMBER_ID", "")
    if not token or token == "PLACEHOLDER" or not phone_id or phone_id == "PLACEHOLDER":
        logging.info(f"[WhatsApp STUB] to={phone}: {message}")
        return
    try:
        await asyncio.to_thread(http_requests.post,
            f"https://graph.facebook.com/v17.0/{phone_id}/messages",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"messaging_product": "whatsapp", "to": phone, "type": "text", "text": {"body": message}},
            timeout=10,
        )
    except Exception as e:
        logging.error(f"WhatsApp send failed: {e}")

# ---------------------- Models ----------------------
class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    role: Literal["owner", "editor", "viewer"] = "editor"
    mfa_enabled: bool = False
    mfa_secret: Optional[str] = None
    password_hash: Optional[str] = None
    has_password: bool = False
    has_google: bool = False
    preferred_currency: str = "INR"
    theme: Literal["light", "dark"] = "light"
    whatsapp_number: Optional[str] = None
    whatsapp_enabled: bool = False
    disabled: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class OTPVerifyPayload(BaseModel):
    email: str
    otp: str


class ThemePayload(BaseModel):
    theme: Literal["light", "dark"]


class WhatsAppPayload(BaseModel):
    whatsapp_number: Optional[str] = None
    whatsapp_enabled: bool = False


class RegisterPayload(BaseModel):
    email: str
    password: str
    name: str


class LoginPayload(BaseModel):
    email: str
    password: str


class UserPublic(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    role: str
    mfa_enabled: bool
    has_password: bool = False
    has_google: bool = False
    preferred_currency: str
    theme: str = "light"
    whatsapp_number: Optional[str] = None
    whatsapp_enabled: bool = False
    disabled: bool = False
    mfa_verified: bool = True


class Account(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    name: str
    type: Literal["bank", "wallet", "cash"]
    currency: str = "INR"
    opening_balance: float = 0.0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AccountCreate(BaseModel):
    name: str
    type: Literal["bank", "wallet", "cash"]
    currency: str = "INR"
    opening_balance: float = 0.0


class Category(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    name: str
    kind: Literal["expense", "income"] = "expense"
    color: str = "#2C3E2D"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CategoryCreate(BaseModel):
    name: str
    kind: Literal["expense", "income"] = "expense"
    color: str = "#2C3E2D"


class Transaction(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    type: Literal["expense", "income", "transfer"]
    name: str
    date: str  # ISO date string
    unit_price: float
    quantity: float = 1.0
    billed_amount: float
    currency: str = "INR"
    fx_rate: float = 1.0  # converts billed_amount to user's preferred currency
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    account_id: str
    to_account_id: Optional[str] = None  # for transfers: destination
    transfer_group_id: Optional[str] = None
    is_recurrent: bool = False
    recurrence_period: Optional[Literal["weekly", "monthly", "yearly"]] = None
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TransactionCreate(BaseModel):
    type: Literal["expense", "income", "transfer"]
    name: str
    date: str
    unit_price: float = 0.0
    quantity: float = 1.0
    billed_amount: float
    currency: str = "INR"
    fx_rate: float = 1.0
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    account_id: str
    to_account_id: Optional[str] = None
    is_recurrent: bool = False
    recurrence_period: Optional[Literal["weekly", "monthly", "yearly"]] = None
    notes: Optional[str] = None


class Budget(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    category_id: str
    category_name: Optional[str] = None
    monthly_limit: float
    currency: str = "INR"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class BudgetCreate(BaseModel):
    category_id: str
    monthly_limit: float
    currency: str = "INR"


class MFAVerify(BaseModel):
    code: str


class RoleUpdate(BaseModel):
    role: Literal["owner", "editor", "viewer"]


class CurrencyUpdate(BaseModel):
    currency: str


# ---------------------- Auth helpers ----------------------
async def get_session_token(request: Request) -> Optional[str]:
    token = request.cookies.get("session_token")
    if token:
        return token
    auth = request.headers.get("Authorization")
    if auth and auth.startswith("Bearer "):
        return auth[7:]
    return None


async def get_current_user(request: Request, require_mfa: bool = True):
    token = await get_session_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    expires_at = session["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    user_doc = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=401, detail="User not found")
    # Enforce MFA gate
    if require_mfa and user_doc.get("mfa_enabled") and not session.get("mfa_verified", False):
        raise HTTPException(status_code=403, detail="MFA verification required")
    user_doc["mfa_verified"] = session.get("mfa_verified", True)
    return user_doc


async def require_user(request: Request):
    return await get_current_user(request, require_mfa=True)


async def require_user_pre_mfa(request: Request):
    return await get_current_user(request, require_mfa=False)


def require_role(roles: List[str]):
    async def checker(user=Depends(require_user)):
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Forbidden: insufficient role")
        return user
    return checker


# ---------------------- Auth Routes ----------------------
async def _seed_default_categories(user_id: str):
    default_cats = [
        ("Groceries", "expense", "#2D5A27"),
        ("Rent", "expense", "#9B3922"),
        ("Utilities", "expense", "#C28A2B"),
        ("Transport", "expense", "#1C1C1A"),
        ("Dining", "expense", "#6E6D68"),
        ("Salary", "income", "#2D5A27"),
        ("Freelance", "income", "#2C3E2D"),
    ]
    for n, k, c in default_cats:
        await db.categories.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "name": n,
            "kind": k,
            "color": c,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })


async def _issue_session(user_doc: dict, response: Response) -> str:
    session_token = py_secrets.token_urlsafe(48)
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    mfa_verified = not user_doc.get("mfa_enabled", False)
    await db.user_sessions.insert_one({
        "user_id": user_doc["user_id"],
        "session_token": session_token,
        "mfa_verified": mfa_verified,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    response.set_cookie(
        key="session_token", value=session_token,
        httponly=True, secure=True, samesite="none", path="/",
        max_age=7 * 24 * 60 * 60,
    )
    return session_token


def _user_response(user_doc: dict, mfa_verified: bool) -> dict:
    return {
        "user_id": user_doc["user_id"],
        "email": user_doc["email"],
        "name": user_doc["name"],
        "picture": user_doc.get("picture"),
        "role": user_doc["role"],
        "mfa_enabled": user_doc.get("mfa_enabled", False),
        "has_password": bool(user_doc.get("password_hash")),
        "has_google": bool(user_doc.get("has_google")),
        "mfa_verified": mfa_verified,
        "preferred_currency": user_doc.get("preferred_currency", "INR"),
    }


@api_router.post("/auth/register")
async def auth_register(payload: RegisterPayload):
    email = payload.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Invalid email")
    if len(payload.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    if len(payload.name.strip()) < 1:
        raise HTTPException(status_code=400, detail="Name required")
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing and existing.get("password_hash"):
        raise HTTPException(status_code=409, detail="Email already registered. Please sign in.")
    otp = f"{py_secrets.randbelow(900000) + 100000}"
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
    await db.pending_registrations.delete_many({"email": email})
    await db.pending_registrations.insert_one({
        "email": email,
        "password_hash": hash_password(payload.password),
        "name": payload.name.strip(),
        "otp": otp,
        "link_to_existing": bool(existing),  # link password to Google account
        "expires_at": expires_at,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await send_otp_email(email, otp, payload.name.strip())
    return {"ok": True, "email": email, "message": "OTP sent to email"}


@api_router.post("/auth/verify-otp")
async def auth_verify_otp(payload: OTPVerifyPayload, response: Response):
    email = payload.email.strip().lower()
    pending = await db.pending_registrations.find_one({"email": email}, {"_id": 0})
    if not pending:
        raise HTTPException(status_code=400, detail="No pending registration. Please sign up again.")
    expires_at = datetime.fromisoformat(pending["expires_at"])
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires_at:
        await db.pending_registrations.delete_one({"email": email})
        raise HTTPException(status_code=400, detail="OTP expired. Please sign up again.")
    if pending["otp"] != payload.otp.strip():
        raise HTTPException(status_code=400, detail="Invalid OTP")
    # Create or link account
    if pending.get("link_to_existing"):
        existing = await db.users.find_one({"email": email}, {"_id": 0})
        await db.users.update_one(
            {"user_id": existing["user_id"]},
            {"$set": {"password_hash": pending["password_hash"], "has_password": True}}
        )
        user_doc = await db.users.find_one({"user_id": existing["user_id"]}, {"_id": 0})
    else:
        total = await db.users.count_documents({})
        role = "owner" if total == 0 else "editor"
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user_doc = {
            "user_id": user_id, "email": email, "name": pending["name"],
            "picture": None, "role": role, "mfa_enabled": False, "mfa_secret": None,
            "password_hash": pending["password_hash"], "has_password": True, "has_google": False,
            "preferred_currency": "INR", "theme": "light", "whatsapp_number": None,
            "whatsapp_enabled": False, "disabled": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.users.insert_one(user_doc)
        await _seed_default_categories(user_id)
    await db.pending_registrations.delete_one({"email": email})
    await _issue_session(user_doc, response)
    return _user_response(user_doc, mfa_verified=not user_doc.get("mfa_enabled", False))


@api_router.post("/auth/resend-otp")
async def auth_resend_otp(payload: dict):
    email = (payload.get("email") or "").strip().lower()
    pending = await db.pending_registrations.find_one({"email": email}, {"_id": 0})
    if not pending:
        raise HTTPException(status_code=404, detail="No pending registration")
    otp = f"{py_secrets.randbelow(900000) + 100000}"
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
    await db.pending_registrations.update_one({"email": email},
        {"$set": {"otp": otp, "expires_at": expires_at}})
    await send_otp_email(email, otp, pending["name"])
    return {"ok": True}


@api_router.post("/auth/login")
async def auth_login(payload: LoginPayload, request: Request, response: Response):
    email = payload.email.strip().lower()
    ip = request.client.host if request.client else "unknown"
    identifier = f"{ip}:{email}"
    # Brute force check
    attempt = await db.login_attempts.find_one({"identifier": identifier}, {"_id": 0})
    now = datetime.now(timezone.utc)
    if attempt and attempt.get("count", 0) >= MAX_FAILED_ATTEMPTS:
        locked_until = datetime.fromisoformat(attempt["locked_until"])
        if locked_until.tzinfo is None:
            locked_until = locked_until.replace(tzinfo=timezone.utc)
        if now < locked_until:
            raise HTTPException(status_code=429, detail="Too many failed attempts. Try again later.")
        # lockout expired - reset
        await db.login_attempts.delete_one({"identifier": identifier})
    user_doc = await db.users.find_one({"email": email}, {"_id": 0})
    user_doc = await db.users.find_one({"email": email}, {"_id": 0})
    if user_doc and user_doc.get("disabled"):
        raise HTTPException(status_code=403, detail="Account disabled. Contact your administrator.")
    if not user_doc or not user_doc.get("password_hash") or not verify_password(payload.password, user_doc["password_hash"]):
        # increment failures
        new_count = (attempt.get("count", 0) + 1) if attempt else 1
        locked_until = (now + timedelta(minutes=LOCKOUT_MINUTES)).isoformat() if new_count >= MAX_FAILED_ATTEMPTS else None
        await db.login_attempts.update_one(
            {"identifier": identifier},
            {"$set": {"identifier": identifier, "count": new_count, "locked_until": locked_until, "updated_at": now.isoformat()}},
            upsert=True,
        )
        raise HTTPException(status_code=401, detail="Invalid email or password")
    # success - clear failures
    await db.login_attempts.delete_one({"identifier": identifier})
    await _issue_session(user_doc, response)
    return _user_response(user_doc, mfa_verified=not user_doc.get("mfa_enabled", False))


@api_router.post("/auth/session")
async def auth_session(request: Request, response: Response):
    body = await request.json()
    session_id = body.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")

    # Exchange session_id for user data
    try:
        r = http_requests.get(EMERGENT_SESSION_URL, headers={"X-Session-ID": session_id}, timeout=10)
        if r.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session_id")
        data = r.json()
    except http_requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Auth provider error: {e}")

    email = data["email"]
    # Find or create user
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": data.get("name", existing["name"]),
                       "picture": data.get("picture", existing.get("picture")),
                       "has_google": True}}
        )
        user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    else:
        # First user becomes owner
        total = await db.users.count_documents({})
        role = "owner" if total == 0 else "editor"
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user_doc = {
            "user_id": user_id,
            "email": email,
            "name": data.get("name", email),
            "picture": data.get("picture"),
            "role": role,
            "mfa_enabled": False,
            "mfa_secret": None,
            "password_hash": None,
            "has_password": False,
            "has_google": True,
            "preferred_currency": "INR",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.users.insert_one(user_doc)
        await _seed_default_categories(user_id)

    session_token = data["session_token"]
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    # If MFA is enabled, mark session not yet verified
    mfa_verified = not user_doc.get("mfa_enabled", False)
    await db.user_sessions.insert_one({
        "user_id": user_doc["user_id"],
        "session_token": session_token,
        "mfa_verified": mfa_verified,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7 * 24 * 60 * 60,
    )
    return {
        "user_id": user_doc["user_id"],
        "email": user_doc["email"],
        "name": user_doc["name"],
        "picture": user_doc.get("picture"),
        "role": user_doc["role"],
        "mfa_enabled": user_doc.get("mfa_enabled", False),
        "mfa_verified": mfa_verified,
        "preferred_currency": user_doc.get("preferred_currency", "INR"),
    }


@api_router.get("/auth/me", response_model=UserPublic)
async def auth_me(user=Depends(require_user_pre_mfa)):
    return UserPublic(
        user_id=user["user_id"],
        email=user["email"],
        name=user["name"],
        picture=user.get("picture"),
        role=user["role"],
        mfa_enabled=user.get("mfa_enabled", False),
        has_password=bool(user.get("password_hash")),
        has_google=bool(user.get("has_google")),
        preferred_currency=user.get("preferred_currency", "INR"),
        theme=user.get("theme", "light"),
        whatsapp_number=user.get("whatsapp_number"),
        whatsapp_enabled=user.get("whatsapp_enabled", False),
        disabled=user.get("disabled", False),
        mfa_verified=user.get("mfa_verified", True),
    )


@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = await get_session_token(request)
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}


# ---------------------- MFA Routes ----------------------
@api_router.post("/mfa/setup")
async def mfa_setup(user=Depends(require_user_pre_mfa)):
    """Generate a new TOTP secret + QR code for the user."""
    secret = pyotp.random_base32()
    # Store secret temporarily (not enabled yet)
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"mfa_secret": secret, "mfa_enabled": False}}
    )
    totp = pyotp.TOTP(secret)
    uri = totp.provisioning_uri(name=user["email"], issuer_name="Ledger")
    img = qrcode.make(uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return {"secret": secret, "qr_code_data_uri": f"data:image/png;base64,{b64}", "otpauth_url": uri}


@api_router.post("/mfa/enable")
async def mfa_enable(payload: MFAVerify, request: Request, user=Depends(require_user_pre_mfa)):
    """Verify the first code and enable MFA."""
    if not user.get("mfa_secret"):
        raise HTTPException(status_code=400, detail="MFA not initialized")
    totp = pyotp.TOTP(user["mfa_secret"])
    if not totp.verify(payload.code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid code")
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"mfa_enabled": True}}
    )
    # Mark current session as verified
    token = await get_session_token(request)
    if token:
        await db.user_sessions.update_one({"session_token": token}, {"$set": {"mfa_verified": True}})
    return {"ok": True}


@api_router.post("/mfa/verify")
async def mfa_verify(payload: MFAVerify, request: Request, user=Depends(require_user_pre_mfa)):
    """Verify TOTP for current session (after Google login)."""
    if not user.get("mfa_enabled") or not user.get("mfa_secret"):
        raise HTTPException(status_code=400, detail="MFA not enabled")
    totp = pyotp.TOTP(user["mfa_secret"])
    if not totp.verify(payload.code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid code")
    token = await get_session_token(request)
    await db.user_sessions.update_one({"session_token": token}, {"$set": {"mfa_verified": True}})
    return {"ok": True}


@api_router.post("/mfa/disable")
async def mfa_disable(payload: MFAVerify, user=Depends(require_user)):
    if not user.get("mfa_enabled"):
        raise HTTPException(status_code=400, detail="MFA not enabled")
    totp = pyotp.TOTP(user["mfa_secret"])
    if not totp.verify(payload.code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid code")
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"mfa_enabled": False, "mfa_secret": None}}
    )
    return {"ok": True}


# ---------------------- Settings ----------------------
@api_router.put("/me/currency")
async def update_currency(payload: CurrencyUpdate, user=Depends(require_user)):
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"preferred_currency": payload.currency}})
    return {"ok": True, "preferred_currency": payload.currency}


@api_router.get("/users")
async def list_users(user=Depends(require_role(["owner"]))):
    users = await db.users.find({}, {"_id": 0, "mfa_secret": 0}).to_list(1000)
    return users


@api_router.put("/users/{target_user_id}/role")
async def update_role(target_user_id: str, payload: RoleUpdate, user=Depends(require_role(["owner"]))):
    if target_user_id == user["user_id"] and payload.role != "owner":
        raise HTTPException(status_code=400, detail="Cannot demote yourself")
    res = await db.users.update_one({"user_id": target_user_id}, {"$set": {"role": payload.role}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True}


@api_router.put("/users/{target_user_id}/disable")
async def disable_user(target_user_id: str, body: dict, user=Depends(require_role(["owner"]))):
    if target_user_id == user["user_id"]:
        raise HTTPException(status_code=400, detail="Cannot disable yourself")
    disabled = bool(body.get("disabled", True))
    res = await db.users.update_one({"user_id": target_user_id}, {"$set": {"disabled": disabled}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    # invalidate sessions
    if disabled:
        await db.user_sessions.delete_many({"user_id": target_user_id})
    return {"ok": True, "disabled": disabled}


@api_router.delete("/users/{target_user_id}")
async def delete_user_hard(target_user_id: str, user=Depends(require_role(["owner"]))):
    if target_user_id == user["user_id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    # purge all related data
    await db.user_sessions.delete_many({"user_id": target_user_id})
    await db.accounts.delete_many({"user_id": target_user_id})
    await db.transactions.delete_many({"user_id": target_user_id})
    await db.categories.delete_many({"user_id": target_user_id})
    await db.budgets.delete_many({"user_id": target_user_id})
    res = await db.users.delete_one({"user_id": target_user_id})
    return {"ok": True, "deleted": res.deleted_count}


@api_router.put("/me/theme")
async def update_theme(payload: ThemePayload, user=Depends(require_user)):
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"theme": payload.theme}})
    return {"ok": True, "theme": payload.theme}


@api_router.put("/me/whatsapp")
async def update_whatsapp(payload: WhatsAppPayload, user=Depends(require_user)):
    update = {"whatsapp_enabled": payload.whatsapp_enabled}
    if payload.whatsapp_number is not None:
        update["whatsapp_number"] = payload.whatsapp_number.strip() or None
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": update})
    return {"ok": True, **update}


# ---------------------- Accounts ----------------------
@api_router.get("/accounts")
async def list_accounts(user=Depends(require_user)):
    accounts = await db.accounts.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(1000)
    for acc in accounts:
        # incomes & expenses on this account
        agg = await db.transactions.aggregate([
            {"$match": {"user_id": user["user_id"], "account_id": acc["id"]}},
            {"$group": {"_id": "$type", "total": {"$sum": "$billed_amount"}}}
        ]).to_list(10)
        income = sum(x["total"] for x in agg if x["_id"] == "income")
        expense = sum(x["total"] for x in agg if x["_id"] == "expense")
        transfer_out = sum(x["total"] for x in agg if x["_id"] == "transfer")
        # transfers into this account
        ti_agg = await db.transactions.aggregate([
            {"$match": {"user_id": user["user_id"], "type": "transfer", "to_account_id": acc["id"]}},
            {"$group": {"_id": None, "total": {"$sum": "$billed_amount"}}}
        ]).to_list(2)
        transfer_in = ti_agg[0]["total"] if ti_agg else 0
        acc["current_balance"] = acc.get("opening_balance", 0) + income - expense + transfer_in - transfer_out
    return accounts


@api_router.post("/accounts")
async def create_account(payload: AccountCreate, user=Depends(require_role(["owner", "editor"]))):
    acc = Account(user_id=user["user_id"], **payload.model_dump())
    doc = acc.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.accounts.insert_one(doc)
    return acc.model_dump()


@api_router.put("/accounts/{account_id}")
async def update_account(account_id: str, payload: AccountCreate, user=Depends(require_role(["owner", "editor"]))):
    res = await db.accounts.update_one(
        {"id": account_id, "user_id": user["user_id"]},
        {"$set": payload.model_dump()}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


@api_router.delete("/accounts/{account_id}")
async def delete_account(account_id: str, user=Depends(require_role(["owner", "editor"]))):
    await db.accounts.delete_one({"id": account_id, "user_id": user["user_id"]})
    return {"ok": True}


# ---------------------- Categories ----------------------
@api_router.get("/categories")
async def list_categories(user=Depends(require_user)):
    cats = await db.categories.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(1000)
    return cats


@api_router.post("/categories")
async def create_category(payload: CategoryCreate, user=Depends(require_role(["owner", "editor"]))):
    cat = Category(user_id=user["user_id"], **payload.model_dump())
    doc = cat.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.categories.insert_one(doc)
    return cat.model_dump()


@api_router.delete("/categories/{category_id}")
async def delete_category(category_id: str, user=Depends(require_role(["owner", "editor"]))):
    await db.categories.delete_one({"id": category_id, "user_id": user["user_id"]})
    return {"ok": True}


# ---------------------- Transactions ----------------------
@api_router.get("/transactions")
async def list_transactions(
    user=Depends(require_user),
    type: Optional[str] = None,
    account_id: Optional[str] = None,
    category_id: Optional[str] = None,
    is_recurrent: Optional[bool] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = 500,
):
    query = {"user_id": user["user_id"]}
    if type:
        query["type"] = type
    if account_id:
        query["$or"] = [{"account_id": account_id}, {"to_account_id": account_id}]
    if category_id:
        query["category_id"] = category_id
    if is_recurrent is not None:
        query["is_recurrent"] = is_recurrent
    if start_date or end_date:
        query["date"] = {}
        if start_date:
            query["date"]["$gte"] = start_date
        if end_date:
            query["date"]["$lte"] = end_date
    if q:
        # search by name or notes (case-insensitive)
        regex = {"$regex": q, "$options": "i"}
        query["$and"] = [{"$or": [{"name": regex}, {"notes": regex}]}]
    txns = await db.transactions.find(query, {"_id": 0}).sort("date", -1).to_list(limit)
    return txns


@api_router.post("/transactions")
async def create_transaction(payload: TransactionCreate, user=Depends(require_role(["owner", "editor"]))):
    # Validate transfer
    if payload.type == "transfer":
        if not payload.to_account_id or payload.to_account_id == payload.account_id:
            raise HTTPException(status_code=400, detail="Transfer needs distinct from/to account")
    # Resolve category name if id provided
    cat_name = payload.category_name
    if payload.category_id and not cat_name:
        c = await db.categories.find_one({"id": payload.category_id, "user_id": user["user_id"]}, {"_id": 0})
        if c:
            cat_name = c["name"]
    txn = Transaction(user_id=user["user_id"], **{**payload.model_dump(), "category_name": cat_name})
    doc = txn.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.transactions.insert_one(doc)
    return txn.model_dump()


@api_router.post("/transactions/import")
async def import_transactions(payload: dict, user=Depends(require_role(["owner", "editor"]))):
    """Bulk import. payload = { account_id: str, rows: [ { date, name, unit_price, quantity, billed_amount, type, category_name?, is_recurrent?, recurrence_period?, notes? } ] }"""
    account_id = payload.get("account_id")
    rows = payload.get("rows", [])
    if not account_id or not isinstance(rows, list):
        raise HTTPException(status_code=400, detail="account_id and rows required")
    # validate account belongs to user
    acc = await db.accounts.find_one({"id": account_id, "user_id": user["user_id"]}, {"_id": 0})
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")
    # category lookup
    cats = await db.categories.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(500)
    cat_by_name = {c["name"].lower(): c for c in cats}
    inserted = 0
    errors = []
    for i, r in enumerate(rows):
        try:
            ttype = (r.get("type") or "expense").lower()
            if ttype not in ("expense", "income"):
                errors.append({"row": i + 1, "error": "invalid type"}); continue
            cat_name = r.get("category_name") or r.get("category")
            cat = cat_by_name.get((cat_name or "").lower())
            unit = float(r.get("unit_price") or 0)
            qty = float(r.get("quantity") or 1)
            billed = float(r.get("billed_amount") if r.get("billed_amount") not in (None, "") else (unit * qty))
            txn_doc = {
                "id": str(uuid.uuid4()),
                "user_id": user["user_id"],
                "type": ttype,
                "name": str(r.get("name") or "Imported").strip(),
                "date": str(r.get("date") or datetime.now(timezone.utc).strftime("%Y-%m-%d")),
                "unit_price": unit,
                "quantity": qty,
                "billed_amount": billed,
                "currency": r.get("currency") or acc.get("currency", "INR"),
                "fx_rate": float(r.get("fx_rate") or 1.0),
                "category_id": cat["id"] if cat else None,
                "category_name": cat["name"] if cat else cat_name,
                "account_id": account_id,
                "to_account_id": None,
                "transfer_group_id": None,
                "is_recurrent": bool(r.get("is_recurrent") in (True, "true", "True", "1", 1)),
                "recurrence_period": r.get("recurrence_period") or None,
                "notes": r.get("notes") or None,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.transactions.insert_one(txn_doc)
            inserted += 1
        except Exception as e:
            errors.append({"row": i + 1, "error": str(e)})
    return {"inserted": inserted, "errors": errors, "total": len(rows)}


@api_router.put("/transactions/{txn_id}")
async def update_transaction(txn_id: str, payload: TransactionCreate, user=Depends(require_role(["owner", "editor"]))):
    cat_name = payload.category_name
    if payload.category_id and not cat_name:
        c = await db.categories.find_one({"id": payload.category_id, "user_id": user["user_id"]}, {"_id": 0})
        if c:
            cat_name = c["name"]
    update = payload.model_dump()
    update["category_name"] = cat_name
    res = await db.transactions.update_one(
        {"id": txn_id, "user_id": user["user_id"]},
        {"$set": update}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


@api_router.delete("/transactions/{txn_id}")
async def delete_transaction(txn_id: str, user=Depends(require_role(["owner", "editor"]))):
    await db.transactions.delete_one({"id": txn_id, "user_id": user["user_id"]})
    return {"ok": True}


# ---------------------- Budgets ----------------------
@api_router.get("/budgets")
async def list_budgets(user=Depends(require_user)):
    budgets = await db.budgets.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(500)
    # Compute current-month spent per budget
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1).strftime("%Y-%m-%d")
    for b in budgets:
        txns = await db.transactions.find(
            {"user_id": user["user_id"], "type": "expense",
             "category_id": b["category_id"], "date": {"$gte": month_start}},
            {"_id": 0}
        ).to_list(2000)
        spent = sum(t["billed_amount"] for t in txns)
        b["spent_this_month"] = spent
        b["remaining"] = max(0.0, b["monthly_limit"] - spent)
        b["progress_pct"] = (spent / b["monthly_limit"] * 100) if b["monthly_limit"] else 0
        b["over_budget"] = spent > b["monthly_limit"]
    return budgets


@api_router.post("/budgets")
async def create_budget(payload: BudgetCreate, user=Depends(require_role(["owner", "editor"]))):
    cat = await db.categories.find_one({"id": payload.category_id, "user_id": user["user_id"]}, {"_id": 0})
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    # Replace existing budget for the same category
    await db.budgets.delete_many({"user_id": user["user_id"], "category_id": payload.category_id})
    b = Budget(user_id=user["user_id"], category_name=cat["name"], **payload.model_dump())
    doc = b.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.budgets.insert_one(doc)
    return b.model_dump()


@api_router.delete("/budgets/{budget_id}")
async def delete_budget(budget_id: str, user=Depends(require_role(["owner", "editor"]))):
    await db.budgets.delete_one({"id": budget_id, "user_id": user["user_id"]})
    return {"ok": True}


# ---------------------- Analytics ----------------------
@api_router.get("/analytics/summary")
async def analytics_summary(user=Depends(require_user)):
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1).strftime("%Y-%m-%d")
    txns = await db.transactions.find(
        {"user_id": user["user_id"], "date": {"$gte": month_start}}, {"_id": 0}
    ).to_list(2000)
    income = sum(t["billed_amount"] for t in txns if t["type"] == "income")
    expense = sum(t["billed_amount"] for t in txns if t["type"] == "expense")
    # accounts total
    accounts = await db.accounts.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(1000)
    total_balance = 0.0
    for acc in accounts:
        agg = await db.transactions.aggregate([
            {"$match": {"user_id": user["user_id"], "account_id": acc["id"]}},
            {"$group": {"_id": "$type", "total": {"$sum": "$billed_amount"}}}
        ]).to_list(10)
        inc = sum(x["total"] for x in agg if x["_id"] == "income")
        exp = sum(x["total"] for x in agg if x["_id"] == "expense")
        tout = sum(x["total"] for x in agg if x["_id"] == "transfer")
        ti_agg = await db.transactions.aggregate([
            {"$match": {"user_id": user["user_id"], "type": "transfer", "to_account_id": acc["id"]}},
            {"$group": {"_id": None, "total": {"$sum": "$billed_amount"}}}
        ]).to_list(2)
        tin = ti_agg[0]["total"] if ti_agg else 0
        total_balance += acc.get("opening_balance", 0) + inc - exp + tin - tout
    # recurring total (monthly normalized)
    rec_txns = await db.transactions.find(
        {"user_id": user["user_id"], "is_recurrent": True, "type": "expense"}, {"_id": 0}
    ).to_list(1000)
    rec_monthly = 0.0
    for t in rec_txns:
        p = t.get("recurrence_period") or "monthly"
        amt = t["billed_amount"]
        if p == "weekly":
            rec_monthly += amt * 4.345
        elif p == "yearly":
            rec_monthly += amt / 12.0
        else:
            rec_monthly += amt
    return {
        "month_income": income,
        "month_expense": expense,
        "month_net": income - expense,
        "total_balance": total_balance,
        "recurring_monthly": rec_monthly,
        "transactions_count": len(txns),
    }


@api_router.get("/analytics/trends")
async def analytics_trends(user=Depends(require_user), months: int = 6):
    now = datetime.now(timezone.utc)
    start = (now.replace(day=1) - timedelta(days=months * 31)).replace(day=1).strftime("%Y-%m-%d")
    txns = await db.transactions.find(
        {"user_id": user["user_id"], "date": {"$gte": start}}, {"_id": 0}
    ).to_list(5000)
    buckets = defaultdict(lambda: {"income": 0.0, "expense": 0.0})
    for t in txns:
        if t["type"] not in ("income", "expense"):
            continue  # ignore transfers in income/expense trends
        key = t["date"][:7]  # YYYY-MM
        buckets[key][t["type"]] += t["billed_amount"]
    series = [{"month": k, "income": v["income"], "expense": v["expense"], "net": v["income"] - v["expense"]}
              for k, v in sorted(buckets.items())]
    return series


@api_router.get("/analytics/category-breakdown")
async def category_breakdown(user=Depends(require_user), type: str = "expense", start_date: Optional[str] = None):
    q = {"user_id": user["user_id"], "type": type}
    if start_date:
        q["date"] = {"$gte": start_date}
    txns = await db.transactions.find(q, {"_id": 0}).to_list(5000)
    buckets = defaultdict(float)
    for t in txns:
        key = t.get("category_name") or "Uncategorized"
        buckets[key] += t["billed_amount"]
    return [{"category": k, "total": v} for k, v in sorted(buckets.items(), key=lambda x: -x[1])]


@api_router.get("/analytics/unit-prices")
async def unit_prices(user=Depends(require_user), name: Optional[str] = None):
    """Returns unit price over time grouped by item name."""
    q = {"user_id": user["user_id"], "type": "expense"}
    if name:
        q["name"] = name
    txns = await db.transactions.find(q, {"_id": 0}).sort("date", 1).to_list(5000)
    groups = defaultdict(list)
    for t in txns:
        groups[t["name"]].append({"date": t["date"], "unit_price": t.get("unit_price", 0)})
    # only return items with at least 2 data points
    result = [{"name": k, "points": v} for k, v in groups.items() if len(v) >= 2]
    return result


@api_router.get("/analytics/recurring")
async def recurring_items(user=Depends(require_user)):
    txns = await db.transactions.find(
        {"user_id": user["user_id"], "is_recurrent": True}, {"_id": 0}
    ).sort("date", -1).to_list(1000)
    # Group by name + take latest
    seen = {}
    for t in txns:
        if t["name"] not in seen:
            seen[t["name"]] = t
    return list(seen.values())


# ---------------------- Health ----------------------
@api_router.get("/")
async def root():
    return {"message": "Ledger API", "status": "ok"}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    scheduler.shutdown(wait=False)
    client.close()


from apscheduler.schedulers.asyncio import AsyncIOScheduler

scheduler = AsyncIOScheduler()


async def whatsapp_reminder_job():
    """Hourly: send WhatsApp reminder to users 24h before recurring payment due date."""
    try:
        users = await db.users.find({"whatsapp_enabled": True, "whatsapp_number": {"$ne": None}}, {"_id": 0}).to_list(1000)
        now = datetime.now(timezone.utc)
        for u in users:
            txns = await db.transactions.find(
                {"user_id": u["user_id"], "is_recurrent": True, "type": "expense"}, {"_id": 0}
            ).to_list(1000)
            for t in txns:
                period = t.get("recurrence_period") or "monthly"
                try:
                    last = datetime.fromisoformat(t["date"])
                except Exception:
                    continue
                if last.tzinfo is None:
                    last = last.replace(tzinfo=timezone.utc)
                if period == "weekly":
                    nxt = last + timedelta(weeks=1)
                elif period == "yearly":
                    nxt = last + timedelta(days=365)
                else:
                    nxt = last + timedelta(days=30)
                delta_hours = (nxt - now).total_seconds() / 3600
                if 23 <= delta_hours <= 25:
                    msg = f"Reminder: {t['name']} ({t['billed_amount']} {t.get('currency','INR')}) is due tomorrow."
                    await send_whatsapp_reminder(u["whatsapp_number"], msg)
    except Exception as e:
        logging.error(f"whatsapp_reminder_job error: {e}")


@app.on_event("startup")
async def start_scheduler():
    scheduler.add_job(whatsapp_reminder_job, "interval", hours=1, id="whatsapp_reminders", replace_existing=True)
    scheduler.start()
