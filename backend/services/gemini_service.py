from google import genai
import json
import os
import logging
import time
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
MODEL = "gemini-2.5-flash"

FALLBACK_RECOMMENDATION = {
    "top_concept": "unknown",
    "reasoning": "Gemini is temporarily unavailable. Please review your weakest concepts manually.",
    "practice_scenario": "Review your notes on the flagged concept for 10 minutes.",
    "youtube_query": "",
    "timestamp_hint": "",
    "learning_mode": "quick",
    "_fallback": True,
}


def _safe_parse_json(text: str) -> dict | None:
    """Strip markdown fences and parse JSON."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        first_nl = cleaned.find("\n")
        if first_nl != -1:
            cleaned = cleaned[first_nl + 1:]
    if cleaned.endswith("```"):
        cleaned = cleaned.rsplit("```", 1)[0]
    cleaned = cleaned.strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        return None


def _call_gemini_once(prompt: str) -> dict | None:
    """Single Gemini call with 429 backoff (up to 5 retries with longer waits)."""
    for attempt in range(6):
        try:
            response = client.models.generate_content(
                model=MODEL,
                contents=prompt,
            )
            return _safe_parse_json(response.text)
        except Exception as e:
            err_str = str(e).lower()
            if "429" in err_str or "resource" in err_str or "rate" in err_str:
                wait = min(3 * (2 ** attempt), 60)  # 3, 6, 12, 24, 48, 60
                logger.warning("Gemini 429 rate limit, backing off %ds (attempt %d)", wait, attempt + 1)
                time.sleep(wait)
                continue
            logger.error("Gemini API error: %s", e)
            return None
    logger.error("Gemini still rate-limited after retries")
    return None


def _call_gemini(prompt: str, retry_strict: bool = True) -> dict | None:
    """Call Gemini with 429 backoff + optional retry on invalid JSON."""
    result = _call_gemini_once(prompt)
    if result is not None:
        return result

    if retry_strict:
        logger.warning("Gemini returned invalid JSON, retrying with strict prefix")
        strict_prompt = (
            "IMPORTANT: Return ONLY valid JSON. No markdown, no backticks, no extra text.\n\n"
            + prompt
        )
        result = _call_gemini_once(strict_prompt)
        if result is not None:
            return result

    logger.error("Gemini failed to return valid JSON after retry")
    return None


def build_recommendation(
    user_profile: dict, decaying_nodes: list, recent_signals: list
) -> dict:
    prompt = f"""You are a personalized learning coach AI inside pondr.

USER PROFILE:
- Goal: {user_profile['goal']}
- Background: {user_profile['background']}
- Learner Type: {user_profile.get('learner_type', 'unknown')}

DECAYING CONCEPTS (ML model flagged these as about to be forgotten):
{json.dumps(decaying_nodes, indent=2)}

RECENT BEHAVIORAL SIGNALS:
{json.dumps(recent_signals, indent=2)}

Your task: Respond with ONLY a valid JSON object (no markdown, no backticks):
  {{
    "top_concept": "<the single most urgent concept to address>",
    "reasoning": "<2-3 sentences explaining WHY this concept is at risk>",
    "practice_scenario": "<a concrete practice task for 10 minutes>",
    "youtube_query": "<precise 4-6 word search query for this gap>",
    "timestamp_hint": "<describe what ideal video segment covers>",
    "learning_mode": "<one of: teach / defend / connect / quick>"
  }}"""

    result = _call_gemini(prompt)
    return result or FALLBACK_RECOMMENDATION


def evaluate_feynman(
    concept: str, user_explanation: str, user_background: str
) -> dict:
    prompt = f"""You are evaluating a learner's explanation of a concept using the Feynman Technique.

CONCEPT: {concept}
LEARNER BACKGROUND: {user_background}
LEARNER'S EXPLANATION: {user_explanation}

Respond ONLY with valid JSON:
  {{
    "score": <float 0.0 to 1.0>,
    "correct_parts": "<what they explained well>",
    "gap_identified": "<the precise gap in their understanding>",
    "gap_fill": "<clear explanation filling exactly that gap - 2-4 sentences>"
  }}"""

    result = _call_gemini(prompt)
    if result is None:
        return {
            "score": 0.5,
            "correct_parts": "Unable to evaluate at this time.",
            "gap_identified": "Please try again.",
            "gap_fill": "Gemini is temporarily unavailable.",
            "_fallback": True,
        }
    return result


def socratic_open(concept: str, user_background: str) -> dict:
    prompt = f"""You are a Socratic tutor. Take a specific, debatable position about:
CONCEPT: {concept}
LEARNER BACKGROUND: {user_background}

Respond ONLY with valid JSON:
  {{
    "position": "<a clear, arguable claim about this concept>",
    "opening_challenge": "<1-2 sentences challenging the learner to respond>"
  }}"""

    result = _call_gemini(prompt)
    if result is None:
        return {
            "position": f"Understanding {concept} is essential but often misunderstood.",
            "opening_challenge": f"Can you explain why {concept} matters in practice?",
            "_fallback": True,
        }
    return result


def socratic_reply(
    concept: str, position: str, history: list, user_reply: str
) -> dict:
    conversation = "\n".join(
        [f"{m['role']}: {m['content']}" for m in history]
    )
    prompt = f"""Concept: {concept}. Your position: {position}.
Conversation so far: {conversation}
Learner just said: {user_reply}

Respond ONLY with valid JSON:
  {{
    "pushback": "<push back, probe deeper, expose a nuance they missed>",
    "misconception_caught": true or false,
    "misconception_detail": "<what misconception was exposed?>"
  }}"""

    result = _call_gemini(prompt)
    if result is None:
        return {
            "pushback": "Interesting point. Can you elaborate further?",
            "misconception_caught": False,
            "misconception_detail": "",
            "_fallback": True,
        }
    return result


def generate_quick_snapshot(concept: str, user_background: str) -> dict:
    prompt = f"""Generate a 30-second micro-challenge for this concept: {concept}
Learner background: {user_background}
Respond ONLY with valid JSON:
  {{
    "question": "<a specific, answerable question>",
    "ideal_answer_points": ["point1", "point2"]
  }}"""

    result = _call_gemini(prompt)
    if result is None:
        return {
            "question": f"In your own words, what is {concept}?",
            "ideal_answer_points": ["Core definition", "Practical application"],
            "_fallback": True,
        }
    return result


ONBOARDING_PROMPT = """You are initializing a personalized knowledge graph for a new learner on pondr, an AI-powered adaptive learning platform.

LEARNER GOAL: {goal}
LEARNER BACKGROUND: {background}
PRIOR LEARNING HISTORY: {prior_history}
PAST HUBS (topics this learner has already studied): {past_hub_topics}

Generate a knowledge graph of 15-25 concepts that maps the SPECIFIC journey
from their current knowledge to their goal. The concepts MUST be tailored to what 
the learner actually wants to learn — do NOT use generic placeholder concepts.

Rules:
- If PRIOR LEARNING HISTORY is empty or 'None' AND PAST HUBS is empty or 'None yet', treat the learner as a complete beginner: set EVERY node to state 'red' and difficulty_label 'hard'. Do not include green or yellow nodes.
- Otherwise use PRIOR LEARNING HISTORY and PAST HUBS to decide, for THIS learner, whether each concept is easy / intermediate / hard. Set difficulty_label: "easy" (they likely know or have seen it), "intermediate" (partial exposure or related to past hubs), "hard" (new to them).
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


def generate_onboarding_graph(
    goal: str, background: str, prior_history: str = "", past_hub_topics: list | None = None
) -> dict | None:
    """Generate a personalized knowledge graph via Gemini. Returns graph data or a fallback. Uses prior_history and past_hub_topics for difficulty per node."""
    past = past_hub_topics or []
    past_str = ", ".join(past[:30]) if past else "None yet"
    prompt = ONBOARDING_PROMPT.format(
        goal=goal,
        background=background,
        prior_history=prior_history or "None provided",
        past_hub_topics=past_str,
    )

    result = _call_gemini(prompt)

    if result and "nodes" in result and len(result["nodes"]) >= 5:
        logger.info("Gemini onboarding graph generated: %d nodes, %d edges",
                     len(result["nodes"]), len(result.get("edges", [])))
        return result

    logger.warning("Gemini onboarding returned insufficient data, generating fallback graph for goal: %s", goal)
    return _build_fallback_graph(goal, background, past_hub_topics=past, prior_history=prior_history)


def _build_fallback_graph(goal: str, background: str, past_hub_topics: list | None = None, prior_history: str | None = None) -> dict:
    """Build a reasonable starter graph when Gemini fails. If no prior_history and no past_hub_topics, all nodes are red (new user)."""
    goal_lower = goal.lower()
    past = past_hub_topics or []
    history_empty = not (prior_history or "").strip() or (prior_history or "").strip().lower() == "none provided"
    new_user = history_empty and len(past) == 0

    domain = "general"
    if any(kw in goal_lower for kw in ["ml", "machine learning", "ai", "deep learning", "data science"]):
        domain = "machine_learning"
    elif any(kw in goal_lower for kw in ["web", "react", "frontend", "backend", "full stack", "fullstack"]):
        domain = "web_development"
    elif any(kw in goal_lower for kw in ["python", "programming", "coding", "software"]):
        domain = "programming"
    elif any(kw in goal_lower for kw in ["design", "ux", "ui", "figma"]):
        domain = "design"
    elif any(kw in goal_lower for kw in ["finance", "trading", "accounting", "financial"]):
        domain = "finance"

    def _dl(s: str) -> str:
        return "easy" if s == "green" else ("intermediate" if s == "yellow" else "hard")

    if new_user:
        # All red, all hard — learner has not started
        nodes = [
            {"concept": f"Foundations of {goal}", "domain": domain, "state": "red", "difficulty_label": "hard",
             "complexity_tier": 1, "dependency_depth": 0, "canvas_x": 100, "canvas_y": 0},
            {"concept": f"Core Principles", "domain": domain, "state": "red", "difficulty_label": "hard",
             "complexity_tier": 1, "dependency_depth": 0, "canvas_x": 100, "canvas_y": -120},
            {"concept": f"Key Terminology", "domain": domain, "state": "red", "difficulty_label": "hard",
             "complexity_tier": 1, "dependency_depth": 0, "canvas_x": 100, "canvas_y": 120},
            {"concept": f"Intermediate {goal} Skills", "domain": domain, "state": "red", "difficulty_label": "hard",
             "complexity_tier": 2, "dependency_depth": 1, "canvas_x": 400, "canvas_y": -60},
            {"concept": f"Practical Applications", "domain": domain, "state": "red", "difficulty_label": "hard",
             "complexity_tier": 2, "dependency_depth": 1, "canvas_x": 400, "canvas_y": 60},
            {"concept": f"Problem Solving in {goal}", "domain": domain, "state": "red", "difficulty_label": "hard",
             "complexity_tier": 2, "dependency_depth": 2, "canvas_x": 700, "canvas_y": -80},
            {"concept": f"Tools & Frameworks", "domain": domain, "state": "red", "difficulty_label": "hard",
             "complexity_tier": 2, "dependency_depth": 2, "canvas_x": 700, "canvas_y": 80},
            {"concept": f"Advanced {goal} Concepts", "domain": domain, "state": "red", "difficulty_label": "hard",
             "complexity_tier": 3, "dependency_depth": 3, "canvas_x": 1000, "canvas_y": -60},
            {"concept": f"Real-World Projects", "domain": domain, "state": "red", "difficulty_label": "hard",
             "complexity_tier": 3, "dependency_depth": 3, "canvas_x": 1000, "canvas_y": 60},
            {"concept": f"Mastery & Portfolio", "domain": domain, "state": "red", "difficulty_label": "hard",
             "complexity_tier": 3, "dependency_depth": 4, "canvas_x": 1300, "canvas_y": 0},
        ]
    else:
        nodes = [
            {"concept": f"Foundations of {goal}", "domain": domain, "state": "green" if background else "yellow", "difficulty_label": _dl("green" if background else "yellow"),
             "complexity_tier": 1, "dependency_depth": 0, "canvas_x": 100, "canvas_y": 0},
            {"concept": f"Core Principles", "domain": domain, "state": "yellow", "difficulty_label": "intermediate",
             "complexity_tier": 1, "dependency_depth": 0, "canvas_x": 100, "canvas_y": -120},
            {"concept": f"Key Terminology", "domain": domain, "state": "green", "difficulty_label": "easy",
             "complexity_tier": 1, "dependency_depth": 0, "canvas_x": 100, "canvas_y": 120},
            {"concept": f"Intermediate {goal} Skills", "domain": domain, "state": "yellow", "difficulty_label": "intermediate",
             "complexity_tier": 2, "dependency_depth": 1, "canvas_x": 400, "canvas_y": -60},
            {"concept": f"Practical Applications", "domain": domain, "state": "red", "difficulty_label": "hard",
             "complexity_tier": 2, "dependency_depth": 1, "canvas_x": 400, "canvas_y": 60},
            {"concept": f"Problem Solving in {goal}", "domain": domain, "state": "red", "difficulty_label": "hard",
             "complexity_tier": 2, "dependency_depth": 2, "canvas_x": 700, "canvas_y": -80},
            {"concept": f"Tools & Frameworks", "domain": domain, "state": "red", "difficulty_label": "hard",
             "complexity_tier": 2, "dependency_depth": 2, "canvas_x": 700, "canvas_y": 80},
            {"concept": f"Advanced {goal} Concepts", "domain": domain, "state": "red", "difficulty_label": "hard",
             "complexity_tier": 3, "dependency_depth": 3, "canvas_x": 1000, "canvas_y": -60},
            {"concept": f"Real-World Projects", "domain": domain, "state": "red", "difficulty_label": "hard",
             "complexity_tier": 3, "dependency_depth": 3, "canvas_x": 1000, "canvas_y": 60},
            {"concept": f"Mastery & Portfolio", "domain": domain, "state": "red", "difficulty_label": "hard",
             "complexity_tier": 3, "dependency_depth": 4, "canvas_x": 1300, "canvas_y": 0},
        ]

    edges = [
        {"from": f"Foundations of {goal}", "to": f"Intermediate {goal} Skills", "type": "prerequisite"},
        {"from": "Core Principles", "to": f"Intermediate {goal} Skills", "type": "prerequisite"},
        {"from": "Key Terminology", "to": "Practical Applications", "type": "prerequisite"},
        {"from": f"Intermediate {goal} Skills", "to": f"Problem Solving in {goal}", "type": "prerequisite"},
        {"from": "Practical Applications", "to": "Tools & Frameworks", "type": "prerequisite"},
        {"from": f"Problem Solving in {goal}", "to": f"Advanced {goal} Concepts", "type": "prerequisite"},
        {"from": "Tools & Frameworks", "to": "Real-World Projects", "type": "prerequisite"},
        {"from": f"Advanced {goal} Concepts", "to": f"Mastery & Portfolio", "type": "prerequisite"},
        {"from": "Real-World Projects", "to": f"Mastery & Portfolio", "type": "prerequisite"},
    ]

    return {"nodes": nodes, "edges": edges, "_fallback": True}


def generate_adaptive_quiz(concepts: list[dict], user_background: str, difficulty: str = "mixed") -> dict:
    """Generate a NotebookLM-style adaptive quiz from the user's knowledge graph."""
    prompt = f"""You are a world-class assessment designer for an adaptive learning platform called pondr.

LEARNER BACKGROUND: {user_background}
DIFFICULTY PREFERENCE: {difficulty}

CONCEPTS FROM THEIR KNOWLEDGE GRAPH (with current mastery state):
{json.dumps(concepts, indent=2)}

Generate an adaptive quiz with exactly 10 questions. The quiz should feel like NotebookLM's 
interactive quizzes — diverse question types, contextual, and genuinely testing understanding 
not just recall.

RULES:
- Mix question types: multiple_choice, true_false, fill_blank, ordering, code_trace
- Weight more questions toward concepts with lower mastery (red/yellow/fading states)
- Green concepts: 1-2 review questions to confirm retention
- Each question must reference a specific concept from the list
- Multiple choice must have exactly 4 options with one correct answer
- Difficulty should match the concept's complexity_tier
- Include a brief explanation for each correct answer

Respond ONLY with valid JSON:
{{
  "quiz_title": "<creative quiz title>",
  "total_questions": 10,
  "estimated_minutes": <int>,
  "questions": [
    {{
      "id": 1,
      "type": "multiple_choice",
      "concept": "<concept name>",
      "difficulty": "easy|medium|hard",
      "question": "<the question text>",
      "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
      "correct_answer": "A",
      "explanation": "<why this is correct — 1-2 sentences>"
    }},
    {{
      "id": 2,
      "type": "true_false",
      "concept": "<concept name>",
      "difficulty": "easy|medium|hard",
      "question": "<statement to evaluate>",
      "correct_answer": "true",
      "explanation": "<why>"
    }},
    {{
      "id": 3,
      "type": "fill_blank",
      "concept": "<concept name>",
      "difficulty": "medium",
      "question": "<sentence with ___ blank>",
      "correct_answer": "<expected word or phrase>",
      "accept_alternatives": ["<alt1>", "<alt2>"],
      "explanation": "<why>"
    }},
    {{
      "id": 4,
      "type": "ordering",
      "concept": "<concept name>",
      "difficulty": "hard",
      "question": "<put these steps in the correct order>",
      "items": ["step1", "step2", "step3", "step4"],
      "correct_order": [2, 0, 3, 1],
      "explanation": "<why this order>"
    }},
    {{
      "id": 5,
      "type": "code_trace",
      "concept": "<concept name>",
      "difficulty": "hard",
      "question": "<what does this code output?>",
      "code_snippet": "<2-5 lines of code>",
      "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
      "correct_answer": "B",
      "explanation": "<step by step trace>"
    }}
  ]
}}"""

    result = _call_gemini(prompt)
    if result is None:
        return {
            "quiz_title": "Knowledge Check",
            "total_questions": 0,
            "estimated_minutes": 0,
            "questions": [],
            "_fallback": True,
        }
    return result


def generate_concept_explanation(concept: str, user_background: str, user_goal: str) -> dict:
    """Generate a concise AI explanation of a concept tailored to the user."""
    prompt = f"""You are an expert tutor on the pondr learning platform.

CONCEPT: {concept}
LEARNER BACKGROUND: {user_background}
LEARNER GOAL: {user_goal}

Provide a clear, concise explanation of this concept tailored to the learner.

Respond ONLY with valid JSON:
  {{
    "title": "{concept}",
    "explanation": "<3-5 paragraph explanation, clear and beginner-friendly where needed>",
    "key_points": ["<point 1>", "<point 2>", "<point 3>"],
    "real_world_example": "<a concrete real-world application or analogy>",
    "prerequisites": ["<concept 1>", "<concept 2>"],
    "next_steps": "<what to learn after mastering this>"
  }}"""

    result = _call_gemini(prompt)
    if result is None:
        return {
            "title": concept,
            "explanation": f"{concept} is a key concept on your learning path. Review resources to build understanding.",
            "key_points": ["Core definition", "Practical application", "Common patterns"],
            "real_world_example": "Used across many real-world applications.",
            "prerequisites": [],
            "next_steps": "Continue to the next concept in your learning path.",
            "_fallback": True,
        }
    return result


def generate_node_quiz(concept: str, user_background: str) -> dict:
    """Generate a focused 5-question quiz for a single concept. 80% required to pass."""
    prompt = f"""You are generating a focused quiz for a single concept on an adaptive learning platform.

CONCEPT: {concept}
LEARNER BACKGROUND: {user_background}

Generate exactly 5 questions testing understanding of {concept}. Mix question types.
The learner needs 80% (4/5) correct to pass and unlock the next topic.

RULES:
- Use only multiple_choice and true_false types
- Multiple choice must have exactly 4 options (A, B, C, D) with one correct
- Questions should test real understanding, not just recall
- Progress from easier to harder
- Include a brief explanation for each correct answer

Respond ONLY with valid JSON:
{{
  "quiz_title": "Quiz: {concept}",
  "total_questions": 5,
  "pass_threshold": 0.8,
  "questions": [
    {{
      "id": 1,
      "type": "multiple_choice",
      "concept": "{concept}",
      "difficulty": "easy",
      "question": "<question text>",
      "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
      "correct_answer": "A",
      "explanation": "<why this is correct>"
    }}
  ]
}}"""

    result = _call_gemini(prompt)
    if result is None:
        return {
            "quiz_title": f"Quiz: {concept}",
            "total_questions": 0,
            "pass_threshold": 0.8,
            "questions": [],
            "_fallback": True,
        }
    return result


def grade_open_answer(concept: str, question: str, user_answer: str, correct_answer: str) -> dict:
    """Grade a fill-in-the-blank or open-ended answer using Gemini."""
    prompt = f"""You are grading a learner's answer.

CONCEPT: {concept}
QUESTION: {question}
EXPECTED ANSWER: {correct_answer}
LEARNER'S ANSWER: {user_answer}

Respond ONLY with valid JSON:
{{
  "is_correct": true or false,
  "score": <float 0.0 to 1.0, with partial credit>,
  "feedback": "<specific feedback on their answer — 1-2 sentences>"
}}"""

    result = _call_gemini(prompt)
    if result is None:
        return {"is_correct": False, "score": 0.0, "feedback": "Unable to grade at this time."}
    return result


ADD_TOPIC_PROMPT = """You are expanding a learner's knowledge graph with a new topic.

NEW TOPIC: {topic}
LEARNER BACKGROUND: {background}
EXISTING CONCEPTS: {existing}

Generate 5-10 concept nodes for this new topic that complement the learner's existing knowledge.

Rules:
- All new nodes start with state: 'red' (needs learning)
- complexity_tier: 1=fundamental, 2=intermediate, 3=advanced
- dependency_depth: relative to this topic's root
- canvas_x: start from {start_x} going right, spacing ~200px apart
- canvas_y: centered around {start_y} with +/-150 spread
- Include prerequisite edges between the new concepts
- If any existing concepts are prerequisites, include edges from them

Return ONLY valid JSON:
{{
  "nodes": [
    {{
      "concept": "string",
      "domain": "string",
      "state": "red",
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


def generate_topic_nodes(
    topic: str, background: str, existing_concepts: list[str],
    start_x: float = 0, start_y: float = 0,
) -> dict | None:
    prompt = ADD_TOPIC_PROMPT.format(
        topic=topic,
        background=background,
        existing=", ".join(existing_concepts[:20]) if existing_concepts else "None yet",
        start_x=start_x,
        start_y=start_y,
    )
    return _call_gemini(prompt)


def generate_study_schedule(
    free_slots: list[dict],
    hub_concepts: list[dict],
    hours_per_week: float,
) -> dict | None:
    """Generate an optimal study schedule using Gemini, fitting sessions into free slots."""
    # Smaller payload = faster response: compact JSON, cap slots/concepts
    slots_json = json.dumps(free_slots[:20])
    concepts_json = json.dumps(hub_concepts[:25])
    prompt = f"""Schedule study into these free slots (use only these start/end times): {slots_json}. Concepts to schedule (priority order): {concepts_json}. Weekly budget: {hours_per_week} hours. Each session 30-60 min. Activity types: review, quiz, feynman, video. Return ONLY valid JSON, no markdown: {{"sessions":[{{"concept":"string","hub_id":null,"start_iso":"2026-03-10T09:00:00","end_iso":"2026-03-10T09:45:00","activity_type":"review","reason":"brief"}}]}}"""
    return _call_gemini(prompt)
