"""LangGraph-based research agent that searches the web and YouTube,
then scrapes and indexes discovered URLs via Firecrawl + Gemini embeddings."""

import os
import logging
from dotenv import load_dotenv

from langchain_core.tools import tool
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.prebuilt import create_react_agent

from backend.services.search_service import search_web
from backend.services.youtube_service import search_videos
from backend.services.firecrawl_service import scrape_url
from backend.services.indexing_service import index_scraped_data

load_dotenv()
logger = logging.getLogger(__name__)


# ── LangChain tools wrapping existing backend services ──────────────────────

@tool
async def web_search(query: str) -> str:
    """Search the web for relevant articles and websites about a topic.
    Returns URLs and titles of the top results."""
    results = await search_web(query)
    if not results:
        return "No web results found."
    lines = []
    for r in results:
        lines.append(f"- {r['title']}: {r['url']}")
    return "\n".join(lines)


@tool
async def youtube_search(query: str) -> str:
    """Search YouTube for relevant educational videos about a topic.
    Returns the top video with title, channel, and URL."""
    results = search_videos(query, max_results=1)
    if not results:
        return "No YouTube results found."
    video = results[0]
    return (
        f"Title: {video.get('title', '')}\n"
        f"Channel: {video.get('channel', '')}\n"
        f"URL: https://youtube.com/watch?v={video.get('video_id', '')}"
    )


# ── Pipeline: scrape via firecrawl then index ───────────────────────────────

def scrape_and_index(url: str) -> dict:
    """Scrape a URL via the firecrawl service, then embed and index the chunks."""
    data = scrape_url(url)
    return index_scraped_data(data)


# ── Agent setup ─────────────────────────────────────────────────────────────

def build_agent():
    """Build a LangGraph ReAct agent with web + YouTube search tools."""
    llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        google_api_key=os.getenv("GEMINI_API_KEY"),
    )
    tools = [web_search, youtube_search]
    return create_react_agent(llm, tools)


async def run(query: str) -> dict:
    """Run the full pipeline: agent searches → scrape URLs → index embeddings.

    Args:
        query: The topic to research.

    Returns:
        Dict with 'query', 'agent_response', 'urls_indexed', 'youtube'.
    """
    agent = build_agent()

    result = await agent.ainvoke(
        {"messages": [("user", f"Find the best web resources and a YouTube video about: {query}")]}
    )

    # Extract URLs from tool call results to scrape and index
    urls_to_index = []
    youtube_results = []

    for msg in result["messages"]:
        if hasattr(msg, "name") and msg.name == "web_search" and hasattr(msg, "content"):
            for line in msg.content.split("\n"):
                if line.startswith("- ") and ": http" in line:
                    url = line.split(": ", 1)[1].strip()
                    urls_to_index.append(url)
        if hasattr(msg, "name") and msg.name == "youtube_search" and hasattr(msg, "content"):
            youtube_results.append(msg.content)

    # Scrape and index each discovered URL
    indexed = []
    for url in urls_to_index:
        try:
            idx_result = scrape_and_index(url)
            indexed.append(idx_result)
            logger.info("Indexed %d chunks from: %s", idx_result["chunks_indexed"], url)
        except Exception as e:
            logger.warning("Failed to index %s: %s", url, e)

    final_message = result["messages"][-1].content

    return {
        "query": query,
        "agent_response": final_message,
        "urls_indexed": indexed,
        "youtube": youtube_results,
    }
