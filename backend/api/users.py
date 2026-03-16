from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from database.models import User, Hub, ConceptNode, KnowledgeEdge, NodeState
from services.gemini_service import generate_onboarding_graph, _call_gemini
from api.deps import get_current_user
from beanie import PydanticObjectId
import logging
import json

router = APIRouter()
logger = logging.getLogger(__name__)


class OnboardRequest(BaseModel):
    """History-only onboarding: only prior_history is required (or send empty to skip)."""
    prior_history: Optional[str] = None
    goal: Optional[str] = None
    background: Optional[str] = None
    learner_type: str = "gradual"


async def _research_learning_path(goal: str, background: str) -> str:
    """Use Tavily web search to find real learning roadmaps for the user's goal."""
    try:
        from services.search_service import search_web
        results = await search_web(f"learning roadmap path to learn {goal}", max_results=2)
        if results:
            snippets = []
            for r in results:
                content = r.get("raw_content", "") or ""
                snippets.append(f"Source: {r['title']}\n{content[:2000]}")
            return "\n\n---\n\n".join(snippets)
    except Exception as e:
        logger.warning("Web search for learning path failed: %s", e)
    return ""


async def _generate_graph_with_research(
    goal: str, background: str, prior_history: str, past_hub_topics: Optional[list] = None
) -> dict | None:
    """Enhanced graph generation: web search for real roadmaps, then Gemini builds graph from that context. Uses prior_history and past_hub_topics to set difficulty per node."""
    past_hub_topics = past_hub_topics or []
    past_hubs_str = ", ".join(past_hub_topics[:30]) if past_hub_topics else "None yet"

    # Step 1: Research real learning paths via web search
    web_context = await _research_learning_path(goal, background)

    if web_context:
        logger.info("Got web research context (%d chars), using it for graph generation", len(web_context))
        prompt = f"""You are initializing a personalized knowledge graph for a new learner on pondr.

LEARNER GOAL: {goal}
LEARNER BACKGROUND: {background}
PRIOR LEARNING HISTORY: {prior_history or 'None provided'}
PAST HUBS (topics this learner has already studied): {past_hubs_str}

REAL-WORLD LEARNING ROADMAP RESEARCH (from web search):
{web_context[:4000]}

Using the real-world roadmap above as reference, generate a knowledge graph of 15-25 concepts
that maps the SPECIFIC journey from the learner's current knowledge to their goal.

Rules:
- If PRIOR LEARNING HISTORY is empty or 'None' AND PAST HUBS is empty or 'None yet', treat the learner as a complete beginner: set EVERY node to state 'red' and difficulty_label 'hard'. Do not include green or yellow nodes.
- Otherwise use PRIOR LEARNING HISTORY and PAST HUBS to decide, for THIS learner, whether each concept is easy / intermediate / hard. Set difficulty_label accordingly: "easy" (they likely know or have seen it), "intermediate" (partial exposure or related to past hubs), "hard" (new to them).
- Concepts the learner already knows based on background/history -> state: 'green', difficulty_label: 'easy'
- Concepts they partially know or have some exposure to -> state: 'yellow', difficulty_label: 'intermediate'
- Concepts they need to learn to reach their goal -> state: 'red', difficulty_label: 'hard'
- complexity_tier: 1=fundamental, 2=intermediate, 3=advanced
- dependency_depth: how many prerequisite hops from the root concept
- Position nodes left-to-right by difficulty: beginner (easy) concepts at canvas_x 100-500, intermediate at canvas_x 500-1000, advanced (hard) at canvas_x 1000-1600. Use the learner's prior history and past hubs to decide each concept's difficulty and place it in the correct band.
- canvas_y: centered around 0 with +/-200 spread within each band
- edges: prerequisite edges from simpler to harder concepts
- Include at least 3-4 green nodes (things they already know) as foundation
- Include 3-5 yellow nodes (partially known)
- Fill the rest with red nodes (need to learn) building toward the goal
- Every concept name should be specific and descriptive (e.g., "Gradient Descent" not "Math")
- Use REAL topic names from the roadmap research, not generic placeholders
- Every node MUST include difficulty_label: "easy" | "intermediate" | "hard"

Return ONLY valid JSON (no markdown fences, no extra text):
{{
  "nodes": [
    {{
      "concept": "string",
      "domain": "string",
      "state": "red|yellow|green",
      "difficulty_label": "easy|intermediate|hard",
      "complexity_tier": 1,
      "dependency_depth": 0,
      "canvas_x": 0.0,
      "canvas_y": 0.0
    }}
  ],
  "edges": [
    {{ "from": "concept_name", "to": "concept_name", "type": "prerequisite" }}
  ]
}}"""
        result = _call_gemini(prompt)
        if result and "nodes" in result and len(result["nodes"]) >= 5:
            logger.info("Research-enhanced graph: %d nodes, %d edges",
                        len(result["nodes"]), len(result.get("edges", [])))
            return result

    # Fallback to standard Gemini-only generation
    logger.info("Falling back to standard Gemini graph generation")
    return generate_onboarding_graph(goal=goal, background=background, prior_history=prior_history, past_hub_topics=past_hub_topics)


@router.post("/onboard")
async def onboard_user(req: OnboardRequest, current_user: User = Depends(get_current_user)):
    """History-only onboarding: save the user's learning history. No graph is generated; first graph is created when they search a topic on the Hubs page."""
    if current_user.has_onboarded:
        return {
            "user": {
                "id": str(current_user.id),
                "name": current_user.name,
                "email": current_user.email,
                "level": current_user.level,
                "level_title": current_user.level_title,
                "has_onboarded": True,
                "goal": current_user.goal,
                "background": current_user.background,
            },
        }

    current_user.prior_history = (req.prior_history or "").strip() or None
    current_user.learner_type = req.learner_type
    if req.goal is not None:
        current_user.goal = req.goal
    if req.background is not None:
        current_user.background = req.background
    current_user.has_onboarded = True
    await current_user.save()

    logger.info("Onboarding complete for user %s (history-only, %d chars)",
                current_user.id, len(current_user.prior_history or ""))

    return {
        "user": {
            "id": str(current_user.id),
            "name": current_user.name,
            "email": current_user.email,
            "level": current_user.level,
            "level_title": current_user.level_title,
            "has_onboarded": True,
            "goal": current_user.goal,
            "background": current_user.background,
        },
    }


@router.post("/reset-onboarding")
async def reset_onboarding(current_user: User = Depends(get_current_user)):
    """DEV ONLY: Clear the user's goal and delete all their nodes/edges so onboarding can be re-run."""
    # Delete all hubs, nodes and edges for this user
    await Hub.find(Hub.user_id == current_user.id).delete()
    await ConceptNode.find(ConceptNode.user_id == current_user.id).delete()
    await KnowledgeEdge.find(KnowledgeEdge.user_id == current_user.id).delete()

    current_user.goal = ""
    current_user.background = ""
    current_user.prior_history = None
    current_user.has_onboarded = False
    await current_user.save()

    logger.info("Reset onboarding for user %s", current_user.id)
    return {"status": "ok", "message": "Onboarding reset. You can now re-onboard."}


@router.get("/me")
async def get_user_profile(current_user: User = Depends(get_current_user)):
    """Get the authenticated user's profile."""
    return {
        "id": str(current_user.id),
        "name": current_user.name,
        "email": current_user.email,
        "goal": current_user.goal,
        "background": current_user.background,
        "prior_history": current_user.prior_history,
        "learner_type": current_user.learner_type,
        "has_onboarded": current_user.has_onboarded or bool(current_user.goal),
        "created_at": current_user.created_at.isoformat(),
    }


@router.get("/{user_id}")
async def get_user(user_id: str, current_user: User = Depends(get_current_user)):
    """Get a user by ID — only allowed if it's the current user."""
    if str(current_user.id) != user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    return {
        "id": str(current_user.id),
        "name": current_user.name,
        "email": current_user.email,
        "goal": current_user.goal,
        "background": current_user.background,
        "learner_type": current_user.learner_type,
        "created_at": current_user.created_at.isoformat(),
    }
