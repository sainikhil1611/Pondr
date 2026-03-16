from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from database.models import (
    User, Hub, ConceptNode, KnowledgeEdge, LearningEvent,
    Recommendation, NodeState, CanvasSnapshot, NodeSnapshot,
)
from services.gemini_service import generate_topic_nodes, generate_concept_explanation
from services.graph_service import get_learning_path_progress
from api.deps import get_current_user
from beanie import PydanticObjectId
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


def _state_to_difficulty(state) -> str:
    """Map node state to difficulty label for display."""
    if state == NodeState.GREEN:
        return "easy"
    if state == NodeState.YELLOW:
        return "intermediate"
    return "hard"


class EventRequest(BaseModel):
    node_id: str
    event_type: str
    duration_seconds: int = 0
    success: Optional[bool] = None
    confidence_before: Optional[float] = None
    confidence_after: Optional[float] = None
    source: str = "inapp"
    metadata: Optional[dict] = None


class PositionUpdate(BaseModel):
    x: float
    y: float


@router.get("/canvas")
async def get_canvas_state(
    hub_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    uid = current_user.id
    hub_oid = PydanticObjectId(hub_id) if hub_id else None

    if hub_oid is not None:
        # Return nodes/edges for this hub only
        nodes = await ConceptNode.find(
            ConceptNode.user_id == uid,
            ConceptNode.hub_id == hub_oid,
        ).to_list()
        edges = await KnowledgeEdge.find(
            KnowledgeEdge.user_id == uid,
            KnowledgeEdge.hub_id == hub_oid,
        ).to_list()
        # Update last_accessed_at for this hub
        hub = await Hub.get(hub_oid)
        if hub and hub.user_id == uid:
            hub.last_accessed_at = datetime.utcnow()
            await hub.save()
    else:
        # Default: most recently accessed hub, or legacy nodes (hub_id is null)
        hubs = await Hub.find(Hub.user_id == uid).sort("-last_accessed_at").limit(1).to_list()
        if hubs:
            hub_oid = hubs[0].id
            nodes = await ConceptNode.find(
                ConceptNode.user_id == uid,
                ConceptNode.hub_id == hub_oid,
            ).to_list()
            edges = await KnowledgeEdge.find(
                KnowledgeEdge.user_id == uid,
                KnowledgeEdge.hub_id == hub_oid,
            ).to_list()
        else:
            # Legacy: nodes/edges without hub_id
            nodes = await ConceptNode.find(
                ConceptNode.user_id == uid,
                ConceptNode.hub_id == None,
            ).to_list()
            edges = await KnowledgeEdge.find(
                KnowledgeEdge.user_id == uid,
                KnowledgeEdge.hub_id == None,
            ).to_list()

    node_recs = {}
    for node in nodes:
        if node.state in (NodeState.FADING, NodeState.GLOW):
            rec = await Recommendation.find_one(
                Recommendation.node_id == node.id,
                Recommendation.dismissed == False,
            )
            if rec:
                node_recs[str(node.id)] = {
                    "id": str(rec.id),
                    "gemini_reasoning": rec.gemini_reasoning,
                    "practice_scenario": rec.practice_scenario,
                    "youtube_video_id": rec.youtube_video_id,
                    "youtube_title": rec.youtube_title,
                    "timestamp_start": rec.timestamp_start,
                    "timestamp_end": rec.timestamp_end,
                    "snippet_reason": rec.snippet_reason,
                    "learning_mode": rec.learning_mode.value if rec.learning_mode else None,
                }

    return {
        "nodes": [
            {
                "id": str(n.id),
                "concept": n.concept,
                "domain": n.domain,
                "state": n.state.value,
                "mode": n.mode.value if n.mode else None,
                "complexity_tier": n.complexity_tier,
                "dependency_depth": n.dependency_depth,
                "mastery_score": n.mastery_score,
                "retention_rt": n.retention_rt,
                "review_count": n.review_count,
                "canvas_x": n.canvas_x,
                "canvas_y": n.canvas_y,
                "difficulty_label": getattr(n, "difficulty_label", None) or _state_to_difficulty(n.state),
                "active_recommendation": node_recs.get(str(n.id)),
            }
            for n in nodes
        ],
        "edges": [
            {
                "from_node_id": str(e.from_node_id),
                "to_node_id": str(e.to_node_id),
                "edge_type": e.edge_type,
            }
            for e in edges
        ],
    }


@router.post("/event")
async def log_learning_event(req: EventRequest, current_user: User = Depends(get_current_user)):
    uid = current_user.id
    nid = PydanticObjectId(req.node_id)

    node = await ConceptNode.get(nid)
    if not node or node.user_id != uid:
        raise HTTPException(status_code=404, detail="Node not found")

    event = LearningEvent(
        user_id=uid,
        node_id=nid,
        event_type=req.event_type,
        duration_seconds=req.duration_seconds,
        success=req.success,
        confidence_before=req.confidence_before,
        confidence_after=req.confidence_after,
        source=req.source,
        metadata=req.metadata,
        xp_earned=0,
        created_at=datetime.utcnow(),
    )
    await event.insert()

    node.review_count += 1
    node.last_reviewed = datetime.utcnow()
    if req.event_type in ("view", "practice", "feynman") and node.state == NodeState.RED:
        node.state = NodeState.YELLOW
    await node.save()

    return {
        "event_id": str(event.id),
    }


@router.patch("/node/{node_id}/position")
async def update_node_position(node_id: str, pos: PositionUpdate, current_user: User = Depends(get_current_user)):
    node = await ConceptNode.get(PydanticObjectId(node_id))
    if not node or node.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Node not found")

    node.canvas_x = pos.x
    node.canvas_y = pos.y
    await node.save()
    return {"ok": True}


class SearchTopicRequest(BaseModel):
    topic: str
    background: str = ""


def _difficulty_label_from_nodes(nodes: list) -> str:
    """Compute aggregate difficulty for a hub from its nodes (state: green=easy, yellow=intermediate, red=hard)."""
    if not nodes:
        return "intermediate"
    green = sum(1 for n in nodes if n.state.value == "green")
    yellow = sum(1 for n in nodes if n.state.value == "yellow")
    red = sum(1 for n in nodes if n.state.value == "red")
    total = len(nodes)
    if green >= total * 0.6:
        return "easy"
    if red >= total * 0.6:
        return "hard"
    return "intermediate"


@router.get("/hubs")
async def list_hubs(current_user: User = Depends(get_current_user)):
    """List all hubs for the current user with optional mastery and difficulty."""
    uid = current_user.id
    hubs = await Hub.find(Hub.user_id == uid).sort("-last_accessed_at").to_list()
    result = []
    for hub in hubs:
        nodes = await ConceptNode.find(
            ConceptNode.user_id == uid,
            ConceptNode.hub_id == hub.id,
        ).to_list()
        total = len(nodes)
        mastery = 0
        if total > 0:
            mastery = round(sum(n.retention_rt for n in nodes) / total * 100)
        difficulty = _difficulty_label_from_nodes(nodes)
        result.append({
            "id": str(hub.id),
            "topic": hub.topic,
            "title": hub.title or hub.topic,
            "created_at": hub.created_at.isoformat() if hub.created_at else None,
            "last_accessed_at": hub.last_accessed_at.isoformat() if hub.last_accessed_at else None,
            "mastery": mastery,
            "difficulty_label": difficulty,
        })
    return {"hubs": result}


@router.get("/progress")
async def get_progress(current_user: User = Depends(get_current_user)):
    """Overall learning path progress across all hubs (total, mastered, in_progress, not_started, mastery_pct)."""
    data = await get_learning_path_progress(current_user.id)
    return data


@router.post("/search")
async def search_topic(req: SearchTopicRequest, current_user: User = Depends(get_current_user)):
    """Create a new hub and generate its knowledge graph. Uses user's prior_history and past hubs for personalization."""
    uid = current_user.id

    # Past hub topics (so the model can set easy/intermediate/hard based on what they've already studied)
    existing_hubs = await Hub.find(Hub.user_id == uid).to_list()
    past_hub_topics = [h.topic for h in existing_hubs if h.topic]

    # Create hub first
    hub = Hub(
        user_id=uid,
        topic=req.topic,
        title=req.topic,
        created_at=datetime.utcnow(),
    )
    await hub.insert()

    # Update user goal to the searched topic (for context in other APIs)
    current_user.goal = req.topic
    if req.background:
        current_user.background = req.background
    await current_user.save()

    # Generate graph using user's prior_history and past hub topics
    from api.users import _generate_graph_with_research
    graph_data = await _generate_graph_with_research(
        goal=req.topic,
        background=current_user.background or "",
        prior_history=current_user.prior_history or "",
        past_hub_topics=past_hub_topics,
    )

    if not graph_data or "nodes" not in graph_data or len(graph_data["nodes"]) == 0:
        await hub.delete()
        raise HTTPException(status_code=502, detail="Failed to generate knowledge graph")

    nodes_created = []
    concept_to_id = {}

    for n in graph_data["nodes"]:
        state_str = n.get("state", "red")
        try:
            state = NodeState(state_str)
        except ValueError:
            state = NodeState.RED

        diff_label = (n.get("difficulty_label") or "").strip().lower()
        if diff_label not in ("easy", "intermediate", "hard"):
            diff_label = _state_to_difficulty(state)
        node = ConceptNode(
            user_id=uid,
            hub_id=hub.id,
            concept=n["concept"],
            domain=n.get("domain", "general"),
            complexity_tier=n.get("complexity_tier", 1),
            dependency_depth=n.get("dependency_depth", 0),
            state=state,
            mastery_score=1.0 if state == NodeState.GREEN else (0.5 if state == NodeState.YELLOW else 0.0),
            retention_rt=1.0 if state == NodeState.GREEN else (0.7 if state == NodeState.YELLOW else 0.0),
            canvas_x=n.get("canvas_x", 0),
            canvas_y=n.get("canvas_y", 0),
            difficulty_label=diff_label or None,
            created_at=datetime.utcnow(),
        )
        await node.insert()
        nodes_created.append(node)
        concept_to_id[n["concept"].lower()] = node.id

    edges_created = 0
    for e in graph_data.get("edges", []):
        from_id = concept_to_id.get(e["from"].lower())
        to_id = concept_to_id.get(e["to"].lower())
        if from_id and to_id:
            edge = KnowledgeEdge(
                user_id=uid,
                hub_id=hub.id,
                from_node_id=from_id,
                to_node_id=to_id,
                edge_type=e.get("type", "prerequisite"),
            )
            await edge.insert()
            edges_created += 1

    logger.info("Created hub '%s': %d nodes, %d edges", req.topic, len(nodes_created), edges_created)

    return {
        "hub_id": str(hub.id),
        "topic": req.topic,
        "nodes_created": len(nodes_created),
    }


@router.get("/history")
async def get_canvas_history(current_user: User = Depends(get_current_user)):
    """
    Return node state snapshots grouped by date for the timeline scrubber.
    Aggregates from learning events to reconstruct historical states.
    """
    uid = current_user.id
    events = (
        await LearningEvent.find(LearningEvent.user_id == uid)
        .sort("created_at")
        .to_list()
    )

    nodes = await ConceptNode.find(ConceptNode.user_id == uid).to_list()
    node_map = {str(n.id): n for n in nodes}

    snapshots_by_date = {}
    for event in events:
        date_key = event.created_at.strftime("%Y-%m-%d")
        if date_key not in snapshots_by_date:
            snapshots_by_date[date_key] = {}

        nid = str(event.node_id)
        if nid in node_map:
            n = node_map[nid]
            snapshots_by_date[date_key][nid] = NodeSnapshot(
                node_id=nid,
                concept=n.concept,
                state=n.state,
                retention_rt=n.retention_rt,
                canvas_x=n.canvas_x,
                canvas_y=n.canvas_y,
            )

    result = []
    for date_str in sorted(snapshots_by_date.keys()):
        snap_nodes = list(snapshots_by_date[date_str].values())
        result.append(
            CanvasSnapshot(
                date=datetime.strptime(date_str, "%Y-%m-%d"),
                nodes=snap_nodes,
            )
        )

    return {"history": [s.model_dump() for s in result]}


@router.get("/node/{node_id}/detail")
async def get_node_detail(node_id: str, current_user: User = Depends(get_current_user)):
    """Get AI explanation for a concept node. Used when clicking a node on the canvas."""
    node = await ConceptNode.get(PydanticObjectId(node_id))
    if not node or node.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Node not found")

    # Get AI explanation
    explanation = generate_concept_explanation(
        concept=node.concept,
        user_background=current_user.background or "",
        user_goal=current_user.goal or "",
    )

    # Get prerequisite/dependent nodes for context
    edges = await KnowledgeEdge.find(KnowledgeEdge.user_id == current_user.id).to_list()
    prereq_ids = [e.from_node_id for e in edges if e.to_node_id == node.id]
    dependent_ids = [e.to_node_id for e in edges if e.from_node_id == node.id]

    prereqs = []
    for pid in prereq_ids:
        pnode = await ConceptNode.get(pid)
        if pnode:
            prereqs.append({"id": str(pnode.id), "concept": pnode.concept, "state": pnode.state.value})

    dependents = []
    for did in dependent_ids:
        dnode = await ConceptNode.get(did)
        if dnode:
            dependents.append({"id": str(dnode.id), "concept": dnode.concept, "state": dnode.state.value})

    # Check if all prerequisites are green (mastered)
    all_prereqs_met = all(p["state"] == "green" for p in prereqs) if prereqs else True

    return {
        "node": {
            "id": str(node.id),
            "concept": node.concept,
            "domain": node.domain,
            "state": node.state.value,
            "mastery_score": node.mastery_score,
            "complexity_tier": node.complexity_tier,
        },
        "explanation": explanation,
        "prerequisites": prereqs,
        "dependents": dependents,
        "all_prereqs_met": all_prereqs_met,
    }
