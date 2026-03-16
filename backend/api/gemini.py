from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta
from database.models import (
    User, ConceptNode, LearningEvent,
    Recommendation, GeminiRateLimit, NodeState, LearningMode,
)
from services.gemini_service import (
    build_recommendation,
    evaluate_feynman,
    socratic_open,
    socratic_reply,
    generate_quick_snapshot,
)
from api.deps import get_current_user
from beanie import PydanticObjectId

router = APIRouter()

RATE_LIMIT_HOURS = 6


class RecommendRequest(BaseModel):
    node_ids: list[str] = []


class FeynmanRequest(BaseModel):
    node_id: str
    concept: str
    explanation: str


class SocraticStartRequest(BaseModel):
    node_id: str
    concept: str


class SocraticReplyRequest(BaseModel):
    concept: str
    position: str
    history: list[dict]
    reply: str


class QuickSnapshotRequest(BaseModel):
    concept: str


async def _check_rate_limit(user_id: PydanticObjectId, node_id: PydanticObjectId) -> bool:
    """Return True if rate limited (should NOT call Gemini)."""
    rl = await GeminiRateLimit.find_one(
        GeminiRateLimit.user_id == user_id,
        GeminiRateLimit.node_id == node_id,
    )
    if rl and rl.last_called > datetime.utcnow() - timedelta(hours=RATE_LIMIT_HOURS):
        return True
    return False


async def _update_rate_limit(user_id: PydanticObjectId, node_id: PydanticObjectId):
    rl = await GeminiRateLimit.find_one(
        GeminiRateLimit.user_id == user_id,
        GeminiRateLimit.node_id == node_id,
    )
    if rl:
        rl.last_called = datetime.utcnow()
        await rl.save()
    else:
        rl = GeminiRateLimit(
            user_id=user_id,
            node_id=node_id,
            last_called=datetime.utcnow(),
        )
        await rl.insert()


@router.post("/recommend")
async def get_recommendation(req: RecommendRequest, current_user: User = Depends(get_current_user)):
    uid = current_user.id

    if req.node_ids:
        nodes = []
        for nid in req.node_ids:
            try:
                node = await ConceptNode.get(PydanticObjectId(nid))
                if node:
                    nodes.append(node)
            except Exception:
                continue
    else:
        nodes = await ConceptNode.find(
            ConceptNode.user_id == uid,
            ConceptNode.state == NodeState.FADING,
        ).to_list()

    if not nodes:
        return {"recommendation": None, "message": "No fading nodes found"}

    if await _check_rate_limit(uid, nodes[0].id):
        existing = await Recommendation.find_one(
            Recommendation.node_id == nodes[0].id,
            Recommendation.dismissed == False,
        )
        if existing:
            return {"recommendation": existing.model_dump(mode="json"), "cached": True}

    decaying = [
        {
            "concept": n.concept,
            "retention": n.retention_rt,
            "state": n.state.value,
            "complexity_tier": n.complexity_tier,
        }
        for n in nodes
    ]

    recent_events = (
        await LearningEvent.find(LearningEvent.user_id == uid)
        .sort("-created_at")
        .limit(20)
        .to_list()
    )
    signals = [
        {
            "event_type": e.event_type,
            "duration": e.duration_seconds,
            "success": e.success,
        }
        for e in recent_events
    ]

    result = build_recommendation(
        user_profile={
            "goal": current_user.goal,
            "background": current_user.background,
            "learner_type": current_user.learner_type,
        },
        decaying_nodes=decaying,
        recent_signals=signals,
    )

    target_node = nodes[0]

    # Safely convert learning_mode string to enum (Gemini may return unexpected values)
    raw_mode = result.get("learning_mode")
    safe_mode = None
    if raw_mode:
        try:
            safe_mode = LearningMode(raw_mode.lower().strip())
        except (ValueError, AttributeError):
            safe_mode = None

    rec = Recommendation(
        node_id=target_node.id,
        user_id=uid,
        gemini_reasoning=result.get("reasoning", ""),
        practice_scenario=result.get("practice_scenario", ""),
        learning_mode=safe_mode,
        created_at=datetime.utcnow(),
    )
    await rec.insert()

    target_node.state = NodeState.GLOW
    await target_node.save()

    await _update_rate_limit(uid, target_node.id)

    return {"recommendation": rec.model_dump(mode="json"), "gemini_result": result}


@router.post("/feynman")
async def feynman_evaluate(req: FeynmanRequest, current_user: User = Depends(get_current_user)):
    if not req.explanation or not req.explanation.strip():
        return {"error": "Empty explanation. Score 0.0 — node state not updated."}

    result = evaluate_feynman(
        concept=req.concept,
        user_explanation=req.explanation,
        user_background=current_user.background,
    )

    score = result.get("score", 0)
    if score > 0:
        node = await ConceptNode.get(PydanticObjectId(req.node_id))
        if node:
            node.mastery_score = max(node.mastery_score, score)
            if score >= 0.85:
                node.state = NodeState.GREEN
            elif score >= 0.5:
                node.state = NodeState.YELLOW
            await node.save()

    return result


@router.post("/socratic")
async def start_socratic(req: SocraticStartRequest, current_user: User = Depends(get_current_user)):
    result = socratic_open(concept=req.concept, user_background=current_user.background)
    return result


@router.post("/socratic/reply")
async def continue_socratic(req: SocraticReplyRequest, current_user: User = Depends(get_current_user)):
    result = socratic_reply(
        concept=req.concept,
        position=req.position,
        history=req.history,
        user_reply=req.reply,
    )
    return result


@router.post("/quick-snapshot")
async def quick_snapshot(req: QuickSnapshotRequest, current_user: User = Depends(get_current_user)):
    result = generate_quick_snapshot(
        concept=req.concept, user_background=current_user.background
    )
    return result


class ChatRequest(BaseModel):
    concept: str
    question: str
    history: list[dict] = []


@router.post("/chat")
async def concept_chat(req: ChatRequest, current_user: User = Depends(get_current_user)):
    """Answer a clarifying question about a concept."""
    from services.gemini_service import _call_gemini

    history_text = ""
    if req.history:
        history_text = "\n".join(f"{m['role']}: {m['content']}" for m in req.history[-6:])

    conv_block = f"CONVERSATION SO FAR:\n{history_text}\n\n" if history_text else ""

    prompt = f"""You are a helpful tutor on pondr. The learner is studying "{req.concept}".
LEARNER BACKGROUND: {current_user.background or 'Not specified'}
LEARNER GOAL: {current_user.goal or 'Not specified'}

{conv_block}
LEARNER ASKS: {req.question}

Answer clearly and concisely. If relevant, give a concrete example. Keep it under 200 words.

Respond ONLY with valid JSON:
{{
  "answer": "<your answer>",
  "follow_up_suggestion": "<optional follow-up question they could ask>"
}}"""

    result = _call_gemini(prompt)
    if result is None:
        return {"answer": "I'm having trouble answering right now. Please try again.", "follow_up_suggestion": None}
    return result
