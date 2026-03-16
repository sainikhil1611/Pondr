from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from database.models import User
from api.deps import get_current_user
from services.search_service import search_web
from services.firecrawl_service import scrape_url
import logging
import os
from dotenv import load_dotenv
from googleapiclient.discovery import build

load_dotenv()
logger = logging.getLogger(__name__)
router = APIRouter()


class SearchRequest(BaseModel):
    query: str


class ScrapeRequest(BaseModel):
    url: str


class WebResult(BaseModel):
    url: str
    title: str
    raw_content: Optional[str] = None


class YouTubeResult(BaseModel):
    video_id: str
    title: str
    description: str
    thumbnail_url: str
    video_url: str
    channel_name: str


async def _search_educational_video(query: str) -> dict:
    """Search YouTube for the most relevant educational video (tutorial-biased)."""
    api_key = os.getenv("YOUTUBE_API_KEY")
    if not api_key:
        raise RuntimeError("YOUTUBE_API_KEY environment variable is not set")

    try:
        youtube = build("youtube", "v3", developerKey=api_key)
        search_response = (
            youtube.search()
            .list(
                q=f"{query} tutorial explained",
                part="snippet",
                type="video",
                maxResults=1,
            )
            .execute()
        )
    except Exception as exc:
        error_msg = str(exc)
        if "quotaExceeded" in error_msg or "quota" in error_msg.lower():
            raise RuntimeError("YouTube API quota exceeded. Please try again later.") from exc
        raise RuntimeError(f"YouTube API error: {exc}") from exc

    items = search_response.get("items", [])
    if not items:
        raise RuntimeError(f"No YouTube results found for query: {query}")

    snippet = items[0]["snippet"]
    video_id = items[0]["id"]["videoId"]

    return {
        "video_id": video_id,
        "title": snippet.get("title", ""),
        "description": snippet.get("description", ""),
        "thumbnail_url": snippet.get("thumbnails", {}).get("high", {}).get("url", ""),
        "video_url": f"https://youtube.com/watch?v={video_id}",
        "channel_name": snippet.get("channelTitle", ""),
    }


@router.post("/web")
async def web_search(req: SearchRequest, current_user: User = Depends(get_current_user)):
    """Search the web using Tavily and return the top 2 results."""
    try:
        results = await search_web(req.query)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {"query": req.query, "web_results": results}


@router.post("/youtube")
async def youtube_search(req: SearchRequest, current_user: User = Depends(get_current_user)):
    """Search YouTube for the best educational video (lightweight, no transcript analysis)."""
    try:
        result = await _search_educational_video(req.query)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {"query": req.query, "youtube_result": result}


@router.post("/scrape")
async def scrape_page(req: ScrapeRequest, current_user: User = Depends(get_current_user)):
    """Scrape a URL into chunked markdown via Firecrawl."""
    try:
        result = scrape_url(req.url)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return result
