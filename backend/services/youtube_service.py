from googleapiclient.discovery import build
from youtube_transcript_api import YouTubeTranscriptApi
import os
import json
import logging
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY")

_youtube = None


def _get_youtube_client():
    global _youtube
    if _youtube is None and YOUTUBE_API_KEY:
        _youtube = build("youtube", "v3", developerKey=YOUTUBE_API_KEY)
    return _youtube


def search_videos(query: str, max_results: int = 5) -> list[dict]:
    """Search YouTube and return candidate videos with captions."""
    yt = _get_youtube_client()
    if yt is None:
        logger.warning("YouTube API key not configured")
        return []

    try:
        request = yt.search().list(
            part="snippet",
            q=query,
            type="video",
            maxResults=max_results,
            relevanceLanguage="en",
            videoCaption="closedCaption",
        )
        result = request.execute()
        return [
            {
                "video_id": item["id"]["videoId"],
                "title": item["snippet"]["title"],
                "channel": item["snippet"]["channelTitle"],
            }
            for item in result.get("items", [])
        ]
    except Exception as e:
        logger.error("YouTube search error: %s", e)
        return []


def get_transcript(video_id: str) -> list[dict]:
    """Return transcript with timestamps."""
    try:
        return YouTubeTranscriptApi.get_transcript(video_id)
    except Exception:
        return []


def find_snippet(
    concept: str, gap_description: str, youtube_query: str, timestamp_hint: str
) -> dict | None:
    """
    Full pipeline:
    1. Search YouTube for candidate videos
    2. Get transcripts for top 3
    3. Ask Gemini to identify the best timestamp range
    4. Return video_id, title, start_sec, end_sec, reason
    """
    from services.gemini_service import _call_gemini

    videos = search_videos(youtube_query, max_results=3)
    if not videos:
        return None

    transcript_context = []
    for video in videos:
        transcript = get_transcript(video["video_id"])
        if not transcript:
            continue
        chunks = []
        window, window_start = [], None
        for seg in transcript:
            if window_start is None:
                window_start = int(seg["start"])
            window.append(seg["text"])
            if seg["start"] - window_start >= 30:
                chunks.append(
                    {
                        "start": window_start,
                        "end": int(seg["start"]),
                        "text": " ".join(window),
                    }
                )
                window, window_start = [], None
        transcript_context.append(
            {
                "video_id": video["video_id"],
                "title": video["title"],
                "chunks": chunks[:40],
            }
        )

    if not transcript_context:
        return None

    prompt = f"""You are finding the single best video segment to teach a learner about:
CONCEPT: {concept}
GAP: {gap_description}
IDEAL CONTENT: {timestamp_hint}

VIDEO TRANSCRIPTS (chunked in 30-second windows):
{json.dumps(transcript_context, indent=2)[:8000]}

Return ONLY valid JSON:
  {{
    "video_id": "<youtube video id>",
    "title": "<video title>",
    "start_seconds": <integer>,
    "end_seconds": <integer>,
    "snippet_reason": "<one sentence: why THIS exact segment addresses the gap>"
  }}"""

    result = _call_gemini(prompt)
    if result is None:
        return None

    start = max(0, result.get("start_seconds", 0))
    end = result.get("end_seconds", start + 60)
    if start > end:
        start, end = end, start

    result["start_seconds"] = start
    result["end_seconds"] = end
    return result
