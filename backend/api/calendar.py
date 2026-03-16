import asyncio
import json
import logging
import os
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.deps import get_current_user
from beanie import PydanticObjectId
from beanie.operators import In
from database.models import User, ConceptNode
from services.calendar_service import (
    create_calendar_event,
    find_free_slots,
    get_events,
    get_free_busy,
)
from services.gemini_service import generate_study_schedule

router = APIRouter()
logger = logging.getLogger(__name__)

# #region agent log
def _debug_log(location: str, message: str, data: dict, hypothesis_id: str):
    try:
        # backend/api/calendar.py -> 3 levels up = project root
        _dir = os.path.dirname(os.path.abspath(__file__))
        _root = os.path.normpath(os.path.join(_dir, "..", "..", ".."))
        log_dir = os.path.join(_root, ".cursor")
        os.makedirs(log_dir, exist_ok=True)
        log_path = os.path.join(log_dir, "debug.log")
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps({"location": location, "message": message, "data": data, "hypothesisId": hypothesis_id, "timestamp": datetime.utcnow().isoformat()}) + "\n")
    except Exception as ex:
        logger.warning("Debug log write failed: %s", ex)
# #endregion


@router.get("/events")
async def list_calendar_events(
    start: Optional[str] = None,
    end: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    """Fetch real Google Calendar events for display."""
    if not current_user.google_calendar_connected:
        raise HTTPException(status_code=400, detail="Google Calendar not connected")

    now = datetime.utcnow()
    # Default to current week (Monday to Sunday)
    if start:
        start_dt = datetime.fromisoformat(start.replace("Z", "+00:00")).replace(tzinfo=None)
    else:
        start_dt = now - timedelta(days=now.weekday())
        start_dt = start_dt.replace(hour=0, minute=0, second=0, microsecond=0)

    if end:
        end_dt = datetime.fromisoformat(end.replace("Z", "+00:00")).replace(tzinfo=None)
    else:
        end_dt = start_dt + timedelta(days=7)

    try:
        events = await get_events(current_user, start_dt, end_dt)
    except Exception as e:
        logger.error("Calendar events fetch failed: %s", e)
        raise HTTPException(status_code=502, detail=f"Failed to fetch calendar: {e}")
    return {"events": events}


class ScheduleRequest(BaseModel):
    hours_per_week: float = 2.0
    hub_ids: list[str] = []
    week_start: Optional[str] = None  # ISO date string


@router.post("/schedule")
async def generate_schedule(
    req: ScheduleRequest,
    current_user: User = Depends(get_current_user),
):
    """Step 1: Generate study schedule with Gemini + user preferences. Step 2 (push to Google Calendar) is optional/later."""
    # #region agent log
    _debug_log("calendar.py:generate_schedule", "POST /schedule entry", {"hours_per_week": req.hours_per_week, "hub_ids_len": len(req.hub_ids or [])}, "H0")
    # #endregion
    try:
        return await _generate_schedule_impl(req, current_user)
    except HTTPException:
        raise
    except Exception as e:
        # #region agent log
        _debug_log("calendar.py:generate_schedule", "uncaught exception", {"error": str(e), "type": type(e).__name__}, "H5")
        # #endregion
        raise


async def _generate_schedule_impl(req: ScheduleRequest, current_user: User):
    uid = current_user.id
    now = datetime.utcnow()

    try:
        week_start = datetime.fromisoformat(req.week_start.replace("Z", "+00:00")) if req.week_start else None
    except (ValueError, AttributeError, TypeError):
        week_start = None
    if not week_start:
        week_start = now - timedelta(days=now.weekday())
        week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)
    else:
        # Strip tz so find_free_slots (naive datetime.combine) doesn't raise
        if week_start.tzinfo is not None:
            week_start = week_start.replace(tzinfo=None)
    week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)
    week_end = week_start + timedelta(days=7)

    # Only generate from tomorrow onward (no past sessions)
    tomorrow = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    effective_start = max(week_start, tomorrow)
    if effective_start >= week_end:
        effective_start = week_end
        effective_end = week_end + timedelta(days=7)
    else:
        effective_end = week_end

    async def fetch_slots():
        if current_user.google_calendar_connected:
            busy_blocks = await get_free_busy(current_user, effective_start, effective_end)
            return find_free_slots(busy_blocks, effective_start, effective_end, min_duration_minutes=30)
        free_slots = []
        day = effective_start.replace(hour=0, minute=0, second=0, microsecond=0)
        while day < effective_end:
            for start_h, end_h in [(8, 10), (14, 16), (19, 21)]:
                free_slots.append({
                    "start": datetime(day.year, day.month, day.day, start_h, 0, 0).isoformat(),
                    "end": datetime(day.year, day.month, day.day, end_h, 0, 0).isoformat(),
                    "duration_minutes": (end_h - start_h) * 60,
                })
            day += timedelta(days=1)
        return free_slots

    async def fetch_concepts():
        if req.hub_ids:
            hub_oids = [PydanticObjectId(hid) for hid in req.hub_ids]
            nodes = await ConceptNode.find(
                ConceptNode.user_id == uid,
                In(ConceptNode.hub_id, hub_oids),
            ).to_list()
        else:
            nodes = await ConceptNode.find(ConceptNode.user_id == uid).to_list()
        out = []
        for n in nodes:
            out.append({
                "concept": n.concept,
                "hub_id": str(n.hub_id) if n.hub_id else None,
                "node_id": str(n.id),
                "state": n.state.value,
                "retention": n.retention_rt or 0,
                "mastery": n.mastery_score or 0,
            })
        out.sort(key=lambda x: x["retention"])
        return out

    free_slots, hub_concepts = await asyncio.gather(fetch_slots(), fetch_concepts())
    # #region agent log
    _debug_log("calendar.py:generate_schedule", "after gather", {"free_slots_count": len(free_slots), "concepts_count": len(hub_concepts)}, "H1")
    # #endregion

    if not hub_concepts:
        raise HTTPException(
            status_code=400,
            detail="No topics to schedule. Create a hub and add concepts first.",
        )

    # Run blocking Gemini call in thread so we don't block the event loop
    result = await asyncio.to_thread(
        generate_study_schedule, free_slots, hub_concepts, req.hours_per_week
    )
    # #region agent log
    _debug_log("calendar.py:generate_schedule", "after generate_study_schedule", {"has_result": result is not None, "has_sessions": bool(result and "sessions" in result), "sessions_count": len(result.get("sessions", [])) if result else 0}, "H3")
    # #endregion

    if not result or "sessions" not in result:
        raise HTTPException(
            status_code=502,
            detail="Schedule generator returned no sessions. Check that GEMINI_API_KEY is set and try again.",
        )

    # Build response from Gemini sessions only (step 1). Step 2 = push to Google Calendar later.
    sessions_response = []
    for s in result["sessions"]:
        try:
            start_str = (s.get("start_iso") or "").replace("Z", "+00:00")
            end_str = (s.get("end_iso") or "").replace("Z", "+00:00")
            start_time = datetime.fromisoformat(start_str)
            end_time = datetime.fromisoformat(end_str)
        except (ValueError, TypeError) as e:
            logger.warning("Skip invalid session time: %s", e)
            continue
        sessions_response.append({
            "concept": s["concept"],
            "hub_id": s.get("hub_id"),
            "node_id": s.get("node_id"),
            "start_time": start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "activity_type": s.get("activity_type", "review"),
            "reason": s.get("reason", ""),
            "google_event_id": None,
        })
    # #region agent log
    _debug_log("calendar.py:generate_schedule", "before return", {"sessions_response_count": len(sessions_response)}, "H4")
    # #endregion

    logger.info("Generated schedule for user %s: %d sessions (Gemini only)", uid, len(sessions_response))

    return {
        "plan_id": f"gc-{effective_start.date().isoformat()}",
        "sessions": sessions_response,
    }


@router.get("/plan")
async def get_plan(
    week_start: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    """Get study plan from Google Calendar (MCP) for the given week. No MongoDB."""
    if not current_user.google_calendar_connected:
        return {"plan": None}

    now = datetime.utcnow()
    try:
        ws = datetime.fromisoformat(week_start.replace("Z", "+00:00")) if week_start else None
    except (ValueError, AttributeError, TypeError):
        ws = None
    if not ws:
        ws = now - timedelta(days=now.weekday())
        ws = ws.replace(hour=0, minute=0, second=0, microsecond=0)
    week_end = ws + timedelta(days=7)

    events = await get_events(current_user, ws, week_end)
    # Study events we create have summary "[Pondr] Study: <concept>"
    prefix = "[Pondr] Study: "
    sessions = []
    for ev in events:
        summary = ev.get("summary") or ""
        if not summary.startswith(prefix):
            continue
        concept = summary[len(prefix):].strip() or "Study"
        start_s = ev.get("start") or ""
        end_s = ev.get("end") or ""
        if not start_s or not end_s:
            continue
        desc = ev.get("description") or ""
        activity_type = "review"
        if "Activity:" in desc:
            line = desc.split("\n")[0]
            for at in ("quiz", "feynman", "video", "review"):
                if at in line.lower():
                    activity_type = at
                    break

        sessions.append({
            "concept": concept,
            "hub_id": None,
            "start_time": start_s,
            "end_time": end_s,
            "activity_type": activity_type,
            "reason": "",
            "google_event_id": ev.get("id"),
            "completed": False,
        })

    sessions.sort(key=lambda x: x["start_time"])

    return {
        "plan": {
            "id": f"gc-{ws.date().isoformat()}",
            "week_start": ws.isoformat(),
            "hours_per_week": 0,
            "hub_ids": [],
            "sessions": sessions,
        },
    }


@router.delete("/disconnect")
async def disconnect_calendar(current_user: User = Depends(get_current_user)):
    """Remove Google Calendar tokens (keeps Google auth for login)."""
    current_user.google_access_token = None
    current_user.google_refresh_token = None
    current_user.google_token_expiry = None
    current_user.google_calendar_connected = False
    await current_user.save()
    return {"status": "ok", "message": "Google Calendar disconnected"}
