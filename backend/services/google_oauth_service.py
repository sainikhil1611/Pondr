"""Google OAuth2 service — token exchange, user info, token refresh."""
import os
import logging
from datetime import datetime, timedelta

import httpx

logger = logging.getLogger(__name__)

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo"
GSI_TOKEN_REDIRECT_URI = "postmessage"


async def exchange_auth_code(code: str) -> dict:
    """Exchange an authorization code from GSI for access/refresh tokens."""
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise ValueError("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env")
    async with httpx.AsyncClient() as client:
        resp = await client.post(TOKEN_ENDPOINT, data={
            "code": code,
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uri": GSI_TOKEN_REDIRECT_URI,
            "grant_type": "authorization_code",
        })
        if resp.status_code >= 400:
            msg = resp.text
            try:
                err = resp.json()
                msg = err.get("error_description") or err.get("error") or msg
            except Exception:
                pass
            logger.error("Google token exchange error %s: %s", resp.status_code, msg)
            raise ValueError(f"Google token exchange failed: {msg}")
        return resp.json()


async def get_google_user_info(access_token: str) -> dict:
    """Fetch user profile from Google using the access token."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(USERINFO_ENDPOINT, headers={
            "Authorization": f"Bearer {access_token}",
        })
        resp.raise_for_status()
        return resp.json()


async def refresh_access_token(refresh_token: str) -> dict:
    """Refresh an expired Google access token."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(TOKEN_ENDPOINT, data={
            "refresh_token": refresh_token,
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "grant_type": "refresh_token",
        })
        if resp.status_code >= 400:
            msg = resp.text
            try:
                err = resp.json()
                msg = err.get("error_description") or err.get("error") or msg
            except Exception:
                pass
            raise ValueError(f"Token refresh failed: {msg}")
        return resp.json()


async def get_valid_access_token(user) -> str | None:
    """Return a valid Google access token, refreshing if expired. Updates user in DB."""
    if not user.google_access_token:
        return None

    # If not expired, return as-is
    if not user.google_token_expiry or datetime.utcnow() < user.google_token_expiry:
        return user.google_access_token

    # Try to refresh
    if not user.google_refresh_token:
        logger.warning("Token expired and no refresh_token for user %s", user.id)
        return None

    try:
        token_data = await refresh_access_token(user.google_refresh_token)
        user.google_access_token = token_data["access_token"]
        user.google_token_expiry = datetime.utcnow() + timedelta(seconds=token_data.get("expires_in", 3600))
        await user.save()
        return user.google_access_token
    except Exception as e:
        logger.error("Failed to refresh token for user %s: %s", user.id, e)
        return None
