"""Google Calendar via REST API (httpx). No googleapiclient needed."""
import logging
from datetime import datetime, timedelta

import httpx
from services.google_oauth_service import get_valid_access_token

logger = logging.getLogger(__name__)

CALENDAR_API = "https://www.googleapis.com/calendar/v3"


async def _authed_client(user) -> httpx.AsyncClient | None:
    """Return an httpx client with a valid Google access token, or None."""
    token = await get_valid_access_token(user)
    if not token:
        return None
    return httpx.AsyncClient(headers={"Authorization": f"Bearer {token}"}, timeout=15)


async def get_events(user, start: datetime, end: datetime) -> list[dict]:
    """Fetch events from user's primary Google Calendar."""
    client = await _authed_client(user)
    if not client:
        return []

    try:
        async with client:
            resp = await client.get(f"{CALENDAR_API}/calendars/primary/events", params={
                "timeMin": start.isoformat() + "Z",
                "timeMax": end.isoformat() + "Z",
                "singleEvents": "true",
                "orderBy": "startTime",
                "maxResults": 250,
            })
            if resp.status_code >= 400:
                logger.error("Google Calendar list events error %s: %s", resp.status_code, resp.text[:300])
                return []
            data = resp.json()

        events = []
        for item in data.get("items", []):
            s = item.get("start", {})
            e = item.get("end", {})
            events.append({
                "id": item.get("id"),
                "summary": item.get("summary", "(No title)"),
                "start": s.get("dateTime") or s.get("date"),
                "end": e.get("dateTime") or e.get("date"),
                "all_day": "date" in s and "dateTime" not in s,
                "description": item.get("description", ""),
            })
        logger.info("Fetched %d events for user %s", len(events), user.id)
        return events
    except Exception as e:
        logger.error("Calendar fetch failed for user %s: %s", user.id, e)
        return []


async def get_free_busy(user, start: datetime, end: datetime) -> list[dict]:
    """Get busy blocks from Google Calendar freeBusy API."""
    client = await _authed_client(user)
    if not client:
        return []

    try:
        async with client:
            resp = await client.post(f"{CALENDAR_API}/freeBusy", json={
                "timeMin": start.isoformat() + "Z",
                "timeMax": end.isoformat() + "Z",
                "items": [{"id": "primary"}],
            })
            if resp.status_code >= 400:
                logger.error("Google freeBusy error %s: %s", resp.status_code, resp.text[:300])
                return []
            data = resp.json()

        busy = data.get("calendars", {}).get("primary", {}).get("busy", [])
        logger.info("Got %d busy blocks for user %s", len(busy), user.id)
        return [{"start": b["start"], "end": b["end"]} for b in busy]
    except Exception as e:
        logger.error("FreeBusy failed for user %s: %s", user.id, e)
        return []


def _naive_utc(dt: datetime) -> datetime:
    """Return naive datetime (strip tz so we can compare with datetime.combine)."""
    if dt.tzinfo is None:
        return dt
    return dt.replace(tzinfo=None)


def find_free_slots(busy_blocks, start, end, min_duration_minutes=30):
    """Find free time windows between busy blocks, 8am-10pm only."""
    busy = []
    for b in busy_blocks:
        bs = b["start"] if isinstance(b["start"], datetime) else datetime.fromisoformat(b["start"].replace("Z", "+00:00")).replace(tzinfo=None)
        be = b["end"] if isinstance(b["end"], datetime) else datetime.fromisoformat(b["end"].replace("Z", "+00:00")).replace(tzinfo=None)
        busy.append((bs, be))
    busy.sort()

    start = _naive_utc(start)
    end = _naive_utc(end)
    slots = []
    current = start
    for bs, be in busy:
        if current < bs:
            _clip_slots(slots, current, bs, min_duration_minutes)
        current = max(current, be)
    if current < end:
        _clip_slots(slots, current, end, min_duration_minutes)
    return slots


def _clip_slots(slots, gap_start, gap_end, min_dur):
    """Clip a gap to 8am-10pm per day and emit slots. All datetimes must be naive."""
    gap_start = _naive_utc(gap_start)
    gap_end = _naive_utc(gap_end)
    day = gap_start.date()
    while day <= gap_end.date():
        day_start = datetime.combine(day, datetime.min.time().replace(hour=8))
        day_end = datetime.combine(day, datetime.min.time().replace(hour=22))
        ds = max(gap_start, day_start)
        de = min(gap_end, day_end)
        if de > ds and (de - ds).total_seconds() >= min_dur * 60:
            slots.append({"start": ds.isoformat(), "end": de.isoformat(), "duration_minutes": int((de - ds).total_seconds() / 60)})
        day += timedelta(days=1)


async def create_calendar_event(user, title, start, end, description="") -> str | None:
    """Create an event on Google Calendar. Returns event ID or None."""
    client = await _authed_client(user)
    if not client:
        return None

    try:
        async with client:
            resp = await client.post(f"{CALENDAR_API}/calendars/primary/events", json={
                "summary": f"[Pondr] {title}",
                "description": description,
                "start": {"dateTime": start.isoformat() + "Z", "timeZone": "UTC"},
                "end": {"dateTime": end.isoformat() + "Z", "timeZone": "UTC"},
                "colorId": "1",
            })
            if resp.status_code >= 400:
                logger.error("Create event error %s: %s", resp.status_code, resp.text[:300])
                return None
            eid = resp.json().get("id")
            logger.info("Created Google Calendar event '%s' id=%s", title, eid)
            return eid
    except Exception as e:
        logger.error("Create event failed: %s", e)
        return None
