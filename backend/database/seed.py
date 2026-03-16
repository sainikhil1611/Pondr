"""
Seed script for demo user 'Alex Chen'.
Creates a realistic 2-week learning history for hackathon demo.

Usage: python -m database.seed  (from backend/ directory)
"""

import asyncio
from datetime import datetime, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie, PydanticObjectId
from database.models import (
    ALL_MODELS, User, ConceptNode, LearningEvent,
    Recommendation, KnowledgeEdge, Achievement,
    NodeState, LearningMode,
)
import os
import random
from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.getenv("MONGO_DB_URI", "mongodb://localhost:27017")
MONGO_DB = os.getenv("MONGO_DB_NAME", "pondr")

CONCEPTS = [
    # GREEN (mastered)
    {"concept": "Python Fundamentals", "domain": "coding", "tier": 1, "depth": 0, "state": "green", "x": 100, "y": 0},
    {"concept": "Linear Algebra", "domain": "math", "tier": 1, "depth": 0, "state": "green", "x": 100, "y": -150},
    {"concept": "Statistics Basics", "domain": "math", "tier": 1, "depth": 0, "state": "green", "x": 100, "y": 150},
    {"concept": "Pandas", "domain": "coding", "tier": 1, "depth": 1, "state": "green", "x": 300, "y": -80},
    {"concept": "Data Cleaning", "domain": "coding", "tier": 1, "depth": 1, "state": "green", "x": 300, "y": 80},

    # YELLOW (in progress)
    {"concept": "Gradient Descent", "domain": "machine_learning", "tier": 2, "depth": 2, "state": "yellow", "x": 550, "y": -100},
    {"concept": "Loss Functions", "domain": "machine_learning", "tier": 2, "depth": 2, "state": "yellow", "x": 550, "y": 0},
    {"concept": "Train/Test Split", "domain": "machine_learning", "tier": 2, "depth": 2, "state": "yellow", "x": 550, "y": 100},

    # FADING (decay alert - demo showcase)
    {"concept": "Backpropagation", "domain": "machine_learning", "tier": 2, "depth": 3, "state": "fading", "x": 800, "y": -60},
    {"concept": "Regularization", "domain": "machine_learning", "tier": 2, "depth": 3, "state": "fading", "x": 800, "y": 60},

    # RED (not yet learned)
    {"concept": "Transformers", "domain": "machine_learning", "tier": 3, "depth": 4, "state": "red", "x": 1100, "y": -150},
    {"concept": "Attention Mechanism", "domain": "machine_learning", "tier": 3, "depth": 4, "state": "red", "x": 1100, "y": -50},
    {"concept": "Fine-Tuning", "domain": "machine_learning", "tier": 3, "depth": 4, "state": "red", "x": 1100, "y": 50},
    {"concept": "RLHF", "domain": "machine_learning", "tier": 3, "depth": 5, "state": "red", "x": 1400, "y": -100},
    {"concept": "MLOps", "domain": "machine_learning", "tier": 3, "depth": 5, "state": "red", "x": 1400, "y": 0},
    {"concept": "Model Deployment", "domain": "machine_learning", "tier": 3, "depth": 5, "state": "red", "x": 1400, "y": 100},
]

EDGES = [
    ("Python Fundamentals", "Pandas"),
    ("Python Fundamentals", "Data Cleaning"),
    ("Linear Algebra", "Gradient Descent"),
    ("Statistics Basics", "Loss Functions"),
    ("Statistics Basics", "Train/Test Split"),
    ("Pandas", "Train/Test Split"),
    ("Gradient Descent", "Backpropagation"),
    ("Loss Functions", "Backpropagation"),
    ("Loss Functions", "Regularization"),
    ("Train/Test Split", "Regularization"),
    ("Backpropagation", "Transformers"),
    ("Backpropagation", "Attention Mechanism"),
    ("Regularization", "Fine-Tuning"),
    ("Attention Mechanism", "RLHF"),
    ("Transformers", "Fine-Tuning"),
    ("Fine-Tuning", "MLOps"),
    ("MLOps", "Model Deployment"),
]

ACHIEVEMENT_DEFS = [
    {"key": "first_steps", "name": "First Steps", "description": "Complete your first learning event", "icon": "🚀", "condition": "events >= 1", "xp_reward": 50, "rarity": "common"},
    {"key": "feynman_apprentice", "name": "Feynman Apprentice", "description": "Complete 5 Feynman challenges", "icon": "🎤", "condition": "feynman_count >= 5", "xp_reward": 200, "rarity": "rare"},
    {"key": "debate_champion", "name": "Debate Champion", "description": "Complete 10 Socratic debates", "icon": "⚔️", "condition": "socratic_count >= 10", "xp_reward": 500, "rarity": "epic"},
    {"key": "streak_fire", "name": "Streak Fire", "description": "Maintain a 7-day streak", "icon": "🔥", "condition": "streak >= 7", "xp_reward": 300, "rarity": "rare"},
    {"key": "decay_slayer", "name": "Decay Slayer", "description": "Recover 5 fading concepts", "icon": "🛡️", "condition": "recovered >= 5", "xp_reward": 400, "rarity": "epic"},
    {"key": "graph_explorer", "name": "Graph Explorer", "description": "Unlock 20 concept nodes", "icon": "🗺️", "condition": "nodes >= 20", "xp_reward": 250, "rarity": "rare"},
    {"key": "speed_demon", "name": "Speed Demon", "description": "Complete 3 Quick Snapshots in under 90 seconds", "icon": "⚡", "condition": "fast_snapshots >= 3", "xp_reward": 350, "rarity": "epic"},
    {"key": "knowledge_keeper", "name": "Knowledge Keeper", "description": "Maintain 90%+ retention for 7 days", "icon": "👑", "condition": "high_retention_days >= 7", "xp_reward": 1000, "rarity": "legendary"},
]

EVENT_TYPES = ["view", "practice", "rewatch", "feynman", "search", "snapshot"]


async def seed():
    client = AsyncIOMotorClient(MONGO_URI)
    db = client[MONGO_DB]
    await init_beanie(database=db, document_models=ALL_MODELS)

    # Clear existing data
    for model in ALL_MODELS:
        await model.find_all().delete()

    print("Seeding achievements...")
    for defn in ACHIEVEMENT_DEFS:
        await Achievement(**defn).insert()

    print("Seeding demo user: Alex Chen...")
    from services.auth_service import hash_password
    user = User(
        name="Alex Chen",
        email="alex@pondr.dev",
        hashed_password=hash_password("demo1234"),
        goal="Become an ML Engineer capable of building and deploying production models",
        background="Strong Python skills, intermediate statistics, some linear algebra",
        prior_history="Completed Andrew Ng's ML course, built a few Kaggle notebooks",
        learner_type="consistent",
        xp=4850,
        level=12,
        level_title="Pathfinder",
        streak_days=12,
        last_active_date=datetime.utcnow(),
        daily_xp=320,
        daily_xp_goal=500,
        achievements=["first_steps", "streak_fire", "graph_explorer"],
        skill_points={"machine_learning": 1200, "coding": 800, "math": 650},
        created_at=datetime.utcnow() - timedelta(days=14),
    )
    await user.insert()

    print("Seeding concept nodes...")
    concept_map = {}
    for c in CONCEPTS:
        state = NodeState(c["state"])
        mastery = {"green": 0.95, "yellow": 0.5, "fading": 0.3, "red": 0.0}[c["state"]]
        retention = {"green": 0.92, "yellow": 0.75, "fading": 0.62, "red": 0.0}[c["state"]]
        review_count = {"green": 8, "yellow": 4, "fading": 6, "red": 0}[c["state"]]

        last_reviewed = None
        if c["state"] != "red":
            days_ago = {"green": 2, "yellow": 4, "fading": 10}[c["state"]]
            last_reviewed = datetime.utcnow() - timedelta(days=days_ago)

        node = ConceptNode(
            user_id=user.id,
            concept=c["concept"],
            domain=c["domain"],
            complexity_tier=c["tier"],
            dependency_depth=c["depth"],
            state=state,
            mastery_score=mastery,
            stability_s=5.0 if state == NodeState.GREEN else 2.0,
            retention_rt=retention,
            last_reviewed=last_reviewed,
            review_count=review_count,
            canvas_x=c["x"],
            canvas_y=c["y"],
            created_at=datetime.utcnow() - timedelta(days=14),
        )
        await node.insert()
        concept_map[c["concept"]] = node

    print("Seeding knowledge edges...")
    for from_name, to_name in EDGES:
        if from_name in concept_map and to_name in concept_map:
            edge = KnowledgeEdge(
                user_id=user.id,
                from_node_id=concept_map[from_name].id,
                to_node_id=concept_map[to_name].id,
                edge_type="prerequisite",
            )
            await edge.insert()

    print("Seeding learning events (14 days of history)...")
    active_nodes = [n for n in concept_map.values() if n.state != NodeState.RED]
    for day_offset in range(14, 0, -1):
        base_time = datetime.utcnow() - timedelta(days=day_offset)
        n_events = random.randint(2, 6)
        for _ in range(n_events):
            node = random.choice(active_nodes)
            event_type = random.choice(EVENT_TYPES)
            event = LearningEvent(
                user_id=user.id,
                node_id=node.id,
                event_type=event_type,
                duration_seconds=random.randint(30, 600),
                success=random.choice([True, True, True, False]) if event_type in ("practice", "feynman") else None,
                confidence_before=round(random.uniform(0.3, 0.7), 2) if random.random() > 0.5 else None,
                confidence_after=round(random.uniform(0.5, 0.95), 2) if random.random() > 0.5 else None,
                source="inapp",
                xp_earned=random.choice([20, 40, 60, 80, 120]),
                created_at=base_time + timedelta(hours=random.randint(8, 22), minutes=random.randint(0, 59)),
            )
            await event.insert()

    print("Seeding recommendations for FADING nodes...")
    backprop = concept_map["Backpropagation"]
    rec1 = Recommendation(
        node_id=backprop.id,
        user_id=user.id,
        gemini_reasoning="Your review of Backpropagation was 10 days ago and the ML model predicts retention at 61%. The chain rule application in multi-layer networks is the specific area showing decay.",
        practice_scenario="Implement backpropagation from scratch for a 2-layer neural network. Compute gradients for each weight matrix using the chain rule. Verify your gradients match PyTorch autograd output.",
        youtube_video_id="Ilg3gGewQ5U",
        youtube_title="Backpropagation calculus | Chapter 4, Deep learning",
        timestamp_start=180,
        timestamp_end=360,
        snippet_reason="This segment walks through the chain rule derivation for weight updates in a concrete 2-layer example.",
        learning_mode=LearningMode.TEACH,
        created_at=datetime.utcnow() - timedelta(hours=2),
    )
    await rec1.insert()

    reg = concept_map["Regularization"]
    rec2 = Recommendation(
        node_id=reg.id,
        user_id=user.id,
        gemini_reasoning="Regularization retention dropped to 65%. You practiced L1 but haven't revisited L2 or dropout in 10 days. The mathematical intuition behind why regularization prevents overfitting is fading.",
        practice_scenario="Compare L1 vs L2 regularization on a toy dataset with 20 features. Plot the coefficient paths as lambda increases. Explain why L1 produces sparse solutions.",
        youtube_video_id="Q81RR3Y9kYs",
        youtube_title="Regularization in Machine Learning (L1 and L2)",
        timestamp_start=120,
        timestamp_end=300,
        snippet_reason="Clear visual comparison of L1 vs L2 penalty effects on the loss surface with geometric intuition.",
        learning_mode=LearningMode.DEFEND,
        created_at=datetime.utcnow() - timedelta(hours=1),
    )
    await rec2.insert()

    print(f"""
Seed complete!
  User: Alex Chen (ID: {user.id})
  Nodes: {len(concept_map)}
  Edges: {len(EDGES)}
  Events: ~50+
  Recommendations: 2 (Backpropagation, Regularization)
  Achievements: {len(ACHIEVEMENT_DEFS)} defined, 3 unlocked
  Gamification: Level 12 Pathfinder, 4850 XP, 12-day streak
""")

    client.close()


if __name__ == "__main__":
    asyncio.run(seed())
