import os
import logging
from dotenv import load_dotenv
from tavily import AsyncTavilyClient

load_dotenv()
logger = logging.getLogger(__name__)

TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")


async def search_web(query: str, max_results: int = 2) -> list[dict]:
    """Search the web via Tavily and return top results with raw content."""
    if not TAVILY_API_KEY:
        raise RuntimeError("TAVILY_API_KEY environment variable is not set")

    try:
        client = AsyncTavilyClient(api_key=TAVILY_API_KEY)
        response = await client.search(
            query=query,
            search_depth="advanced",
            max_results=max_results,
            include_raw_content=True,
        )
    except Exception as exc:
        logger.error("Tavily API error: %s", exc)
        raise RuntimeError(f"Tavily API error: {exc}") from exc

    results = []
    for item in response.get("results", [])[:max_results]:
        results.append({
            "url": item.get("url", ""),
            "title": item.get("title", ""),
            "raw_content": item.get("raw_content"),
        })
    return results
