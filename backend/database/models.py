from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List
from enum import Enum


class NodeState(str, Enum):
    RED = "red"
    YELLOW = "yellow"
    GREEN = "green"
    FADING = "fading"
    GLOW = "glow"


class LearningMode(str, Enum):
    TEACH = "teach"
    DEFEND = "defend"
    CONNECT = "connect"
    QUICK = "quick"
    STRUGGLE = "struggle"


class AchievementRarity(str, Enum):
    COMMON = "common"
    RARE = "rare"
    EPIC = "epic"
    LEGENDARY = "legendary"


# ── Embedded sub-models ──────────────────────────────────────────


class NodeSnapshot(BaseModel):
    """Point-in-time snapshot of a node for timeline history."""
    node_id: str
    concept: str
    state: NodeState
    retention_rt: float
    canvas_x: float
    canvas_y: float


class CanvasSnapshot(BaseModel):
    """Full canvas state at a point in time."""
    date: datetime
    nodes: List[NodeSnapshot]


# ── Documents ────────────────────────────────────────────────────


class User(Document):
    name: str
    email: str
    hashed_password: Optional[str] = None
    goal: str = ""
    background: str = ""
    prior_history: Optional[str] = None
    learner_type: str = "gradual"
    has_onboarded: bool = False

    # Google OAuth
    google_id: Optional[str] = None
    google_access_token: Optional[str] = None
    google_refresh_token: Optional[str] = None
    google_token_expiry: Optional[datetime] = None
    google_calendar_connected: bool = False

    # Gamification
    xp: int = 0
    level: int = 1
    level_title: str = "Novice"
    streak_days: int = 0
    last_active_date: Optional[datetime] = None
    daily_xp: int = 0
    daily_xp_goal: int = 500
    achievements: List[str] = Field(default_factory=list)
    skill_points: dict = Field(default_factory=dict)

    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "users"
        indexes = ["email"]


class Hub(Document):
    """A topic/hub the user has searched; each hub has its own knowledge graph."""
    user_id: PydanticObjectId
    topic: str
    title: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_accessed_at: Optional[datetime] = None

    class Settings:
        name = "hubs"
        indexes = ["user_id"]


class ConceptNode(Document):
    user_id: PydanticObjectId
    hub_id: Optional[PydanticObjectId] = None
    concept: str
    domain: str
    complexity_tier: int = 1
    dependency_depth: int = 0
    state: NodeState = NodeState.RED
    mode: Optional[LearningMode] = None
    mastery_score: float = 0.0
    stability_s: float = 1.0
    retention_rt: float = 1.0
    last_reviewed: Optional[datetime] = None
    review_count: int = 0
    canvas_x: float = 0.0
    canvas_y: float = 0.0
    difficulty_label: Optional[str] = None  # "easy" | "intermediate" | "hard" for this learner
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "concept_nodes"
        indexes = ["user_id", "concept", "hub_id"]


class LearningEvent(Document):
    user_id: PydanticObjectId
    node_id: PydanticObjectId
    event_type: str
    duration_seconds: int = 0
    success: Optional[bool] = None
    confidence_before: Optional[float] = None
    confidence_after: Optional[float] = None
    source: str = "inapp"
    metadata: Optional[dict] = None
    xp_earned: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "learning_events"
        indexes = ["user_id", "node_id", "created_at"]


class Recommendation(Document):
    node_id: PydanticObjectId
    user_id: PydanticObjectId
    gemini_reasoning: str
    practice_scenario: str
    youtube_video_id: Optional[str] = None
    youtube_title: Optional[str] = None
    timestamp_start: Optional[int] = None
    timestamp_end: Optional[int] = None
    snippet_reason: Optional[str] = None
    learning_mode: Optional[LearningMode] = None
    dismissed: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "recommendations"
        indexes = ["node_id", "user_id"]


class KnowledgeEdge(Document):
    user_id: PydanticObjectId
    hub_id: Optional[PydanticObjectId] = None
    from_node_id: PydanticObjectId
    to_node_id: PydanticObjectId
    edge_type: str = "prerequisite"

    class Settings:
        name = "knowledge_edges"
        indexes = ["user_id", "hub_id"]


class Achievement(Document):
    key: str
    name: str
    description: str
    icon: str
    condition: str
    xp_reward: int = 50
    rarity: AchievementRarity = AchievementRarity.COMMON

    class Settings:
        name = "achievements"
        indexes = ["key"]


class StudySession(BaseModel):
    """A single scheduled study session within a plan."""
    concept: str
    hub_id: Optional[str] = None
    node_id: Optional[str] = None
    start_time: datetime
    end_time: datetime
    activity_type: str = "review"  # review | quiz | feynman | video
    reason: str = ""
    google_event_id: Optional[str] = None
    completed: bool = False


class StudyPlan(Document):
    """A weekly study plan generated by Gemini."""
    user_id: PydanticObjectId
    week_start: datetime
    sessions: List[StudySession] = Field(default_factory=list)
    hours_per_week: float = 2.0
    hub_ids: List[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "study_plans"
        indexes = ["user_id", "week_start"]


class GeminiRateLimit(Document):
    """Tracks Gemini API calls per user per node for rate limiting."""
    user_id: PydanticObjectId
    node_id: PydanticObjectId
    last_called: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "gemini_rate_limits"
        indexes = ["user_id", "node_id"]


# All document models for init_beanie registration
ALL_MODELS = [
    User,
    Hub,
    ConceptNode,
    LearningEvent,
    Recommendation,
    KnowledgeEdge,
    Achievement,
    GeminiRateLimit,
    StudyPlan,
]
