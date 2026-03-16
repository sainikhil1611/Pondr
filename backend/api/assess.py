from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from database.models import User, ConceptNode, KnowledgeEdge, NodeState
from services.gemini_service import (
    generate_adaptive_quiz,
    generate_node_quiz,
    grade_open_answer,
)
from api.deps import get_current_user
from beanie import PydanticObjectId
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


class QuizGenerateRequest(BaseModel):
    concept_ids: list[str] = []
    difficulty: str = "mixed"


class GradeAnswerRequest(BaseModel):
    concept: str
    question: str
    user_answer: str
    correct_answer: str


class QuizCompleteRequest(BaseModel):
    total_questions: int
    correct_answers: int
    time_seconds: int
    concepts_tested: list[str] = []


async def _get_user_concepts(user_id, concept_ids: list[str] = None, filter_weak: bool = False):
    """Fetch concept nodes for the user, optionally filtered."""
    if concept_ids:
        from beanie import PydanticObjectId
        nodes = []
        for cid in concept_ids:
            try:
                node = await ConceptNode.get(PydanticObjectId(cid))
                if node and node.user_id == user_id:
                    nodes.append(node)
            except Exception:
                continue
        return nodes

    query = ConceptNode.find(ConceptNode.user_id == user_id)
    if filter_weak:
        nodes = await query.to_list()
        return [n for n in nodes if n.state in (NodeState.RED, NodeState.YELLOW, NodeState.FADING)]
    return await query.to_list()


def _serialize_concepts(nodes) -> list[dict]:
    return [
        {
            "concept": n.concept,
            "domain": n.domain,
            "state": n.state.value,
            "mastery_score": n.mastery_score,
            "retention_rt": n.retention_rt,
            "complexity_tier": n.complexity_tier,
        }
        for n in nodes
    ]


@router.post("/quiz/generate")
async def generate_quiz(req: QuizGenerateRequest, current_user: User = Depends(get_current_user)):
    """Generate a NotebookLM-style adaptive quiz from the user's knowledge graph."""
    nodes = await _get_user_concepts(current_user.id, req.concept_ids)
    if not nodes:
        raise HTTPException(status_code=400, detail="No concepts found. Complete onboarding first.")

    concepts = _serialize_concepts(nodes)
    result = generate_adaptive_quiz(concepts, current_user.background, req.difficulty)

    if result.get("_fallback"):
        raise HTTPException(status_code=503, detail="Quiz generation temporarily unavailable")

    return result


@router.post("/quiz/grade")
async def grade_answer(req: GradeAnswerRequest, current_user: User = Depends(get_current_user)):
    """Grade a fill-in-the-blank or open-ended answer via Gemini."""
    result = grade_open_answer(
        concept=req.concept,
        question=req.question,
        user_answer=req.user_answer,
        correct_answer=req.correct_answer,
    )
    return result


@router.post("/quiz/complete")
async def quiz_complete(req: QuizCompleteRequest, current_user: User = Depends(get_current_user)):
    """Record quiz completion. 80% (4/5) required to pass and unlock next nodes."""
    if req.total_questions == 0:
        return {"score_pct": 0, "passed": False}

    score_pct = round((req.correct_answers / req.total_questions) * 100)
    passed = score_pct >= 80
    nodes_unlocked = []

    if passed and req.concepts_tested:
        for concept_name in req.concepts_tested:
            node = await ConceptNode.find_one(
                ConceptNode.user_id == current_user.id,
                ConceptNode.concept == concept_name,
            )
            if node:
                node.mastery_score = max(node.mastery_score, score_pct / 100.0)
                node.state = NodeState.GREEN
                await node.save()

                # Unlock dependent nodes (change from red to yellow)
                edges = await KnowledgeEdge.find(
                    KnowledgeEdge.from_node_id == node.id,
                    KnowledgeEdge.user_id == current_user.id,
                ).to_list()
                for edge in edges:
                    dep_node = await ConceptNode.get(edge.to_node_id)
                    if dep_node and dep_node.state == NodeState.RED:
                        dep_node.state = NodeState.YELLOW
                        await dep_node.save()
                        nodes_unlocked.append({
                            "id": str(dep_node.id),
                            "concept": dep_node.concept,
                        })

    # On failure, recommend prerequisite concepts to revisit
    review_recommendations = []
    if not passed and req.concepts_tested:
        for concept_name in req.concepts_tested:
            node = await ConceptNode.find_one(
                ConceptNode.user_id == current_user.id,
                ConceptNode.concept == concept_name,
            )
            if node:
                # Find prerequisites for this node
                prereq_edges = await KnowledgeEdge.find(
                    KnowledgeEdge.to_node_id == node.id,
                    KnowledgeEdge.user_id == current_user.id,
                ).to_list()
                for edge in prereq_edges:
                    prereq = await ConceptNode.get(edge.from_node_id)
                    if prereq and prereq.state != NodeState.GREEN:
                        review_recommendations.append({
                            "id": str(prereq.id),
                            "concept": prereq.concept,
                            "state": prereq.state.value,
                            "reason": f"Prerequisite for {concept_name}",
                        })
                # Also recommend the failed concept itself
                review_recommendations.append({
                    "id": str(node.id),
                    "concept": node.concept,
                    "state": node.state.value,
                    "reason": "Review this concept before retrying",
                })

    return {
        "score_pct": score_pct,
        "correct": req.correct_answers,
        "total": req.total_questions,
        "passed": passed,
        "nodes_unlocked": nodes_unlocked,
        "review_recommendations": review_recommendations,
    }


class NodeQuizRequest(BaseModel):
    node_id: str


@router.post("/quiz/node")
async def generate_quiz_for_node(req: NodeQuizRequest, current_user: User = Depends(get_current_user)):
    """Generate a 5-question quiz for a specific concept node."""
    node = await ConceptNode.get(PydanticObjectId(req.node_id))
    if not node or node.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Node not found")

    result = generate_node_quiz(
        concept=node.concept,
        user_background=current_user.background or "",
    )

    if result.get("_fallback") and not result.get("questions"):
        raise HTTPException(status_code=503, detail="Quiz generation temporarily unavailable")

    return result
