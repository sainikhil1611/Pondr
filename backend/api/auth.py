from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel
from datetime import datetime, timedelta
from database.models import User
from services.auth_service import hash_password, create_access_token, authenticate_user
from services.google_oauth_service import exchange_auth_code, get_google_user_info, GOOGLE_CLIENT_ID
from api.deps import get_current_user
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


def _user_response(user: User) -> dict:
    return {
        "id": str(user.id),
        "name": user.name,
        "email": user.email,
        "level": user.level,
        "level_title": user.level_title,
        "goal": user.goal,
        "background": user.background,
        "has_onboarded": user.has_onboarded or bool(user.goal),
        "google_calendar_connected": user.google_calendar_connected,
    }


@router.post("/register")
async def register(req: RegisterRequest):
    existing = await User.find_one(User.email == req.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email already exists",
        )

    user = User(
        name=req.name,
        email=req.email,
        hashed_password=hash_password(req.password),
        goal="",
        background="",
        created_at=datetime.utcnow(),
    )
    await user.insert()

    token = create_access_token(str(user.id), user.email)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": _user_response(user),
    }


@router.post("/login")
async def login(req: LoginRequest):
    user = await authenticate_user(req.email, req.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    token = create_access_token(str(user.id), user.email)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": _user_response(user),
    }


@router.post("/guest")
async def guest_login():
    """Create an anonymous guest user and return a token. No credentials needed."""
    import uuid

    guest_id = uuid.uuid4().hex[:8]
    user = User(
        name=f"Learner",
        email=f"guest_{guest_id}@pondr.local",
        hashed_password="",
        goal="",
        background="",
        created_at=datetime.utcnow(),
    )
    await user.insert()

    token = create_access_token(str(user.id), user.email)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": _user_response(user),
    }


class GoogleAuthRequest(BaseModel):
    code: str


@router.post("/google")
async def google_auth(req: GoogleAuthRequest):
    """Exchange Google auth code for tokens, find or create user, return JWT."""
    try:
        token_data = await exchange_auth_code(req.code)
    except ValueError as e:
        logger.error("Google token exchange failed: %s", e)
        raise HTTPException(status_code=401, detail=str(e))
    except Exception as e:
        logger.error("Google token exchange failed: %s", e)
        raise HTTPException(status_code=401, detail="Failed to authenticate with Google")

    access_token = token_data.get("access_token")
    refresh_token = token_data.get("refresh_token")
    expires_in = token_data.get("expires_in", 3600)

    try:
        user_info = await get_google_user_info(access_token)
    except Exception as e:
        logger.error("Failed to get Google user info: %s", e)
        raise HTTPException(status_code=401, detail="Failed to get Google user info")

    google_id = user_info.get("sub")
    email = user_info.get("email", "")
    name = user_info.get("name", "Learner")

    # Find existing user by google_id or email
    user = await User.find_one(User.google_id == google_id)
    if not user and email:
        user = await User.find_one(User.email == email)

    if user:
        # Link Google account if not already linked
        user.google_id = google_id
        user.google_access_token = access_token
        if refresh_token:
            user.google_refresh_token = refresh_token
        user.google_token_expiry = datetime.utcnow() + timedelta(seconds=expires_in)
        user.google_calendar_connected = True
        await user.save()
    else:
        # Create new user
        user = User(
            name=name,
            email=email,
            google_id=google_id,
            google_access_token=access_token,
            google_refresh_token=refresh_token,
            google_token_expiry=datetime.utcnow() + timedelta(seconds=expires_in),
            google_calendar_connected=True,
            goal="",
            background="",
            created_at=datetime.utcnow(),
        )
        await user.insert()

    token = create_access_token(str(user.id), user.email)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": _user_response(user),
    }


@router.get("/google-client-id")
async def get_google_client_id():
    """Return the Google OAuth client ID for the frontend."""
    return {"client_id": GOOGLE_CLIENT_ID}


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    """Rehydrate the current user from their JWT token."""
    return _user_response(current_user)
