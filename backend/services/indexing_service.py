import os
import logging
from datetime import datetime, timezone
from dotenv import load_dotenv
from google import genai
from pymongo import MongoClient

load_dotenv()
logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
MONGODB_URI = os.getenv("MONGO_DB_URI")
MONGODB_DB = os.getenv("MONGO_DB_NAME", "pondr")
MONGODB_COLLECTION = os.getenv("MONGODB_EMBEDDING_COLLECTION", "embeddings")
EMBEDDING_MODEL = "models/gemini-embedding-001"

_genai_client = None
_collection = None


def _get_genai_client():
    global _genai_client
    if _genai_client is None and GEMINI_API_KEY:
        _genai_client = genai.Client(
            api_key=GEMINI_API_KEY,
            http_options={"api_version": "v1beta"},
        )
    return _genai_client


def _get_collection():
    global _collection
    if _collection is None and MONGODB_URI:
        client = MongoClient(MONGODB_URI)
        _collection = client[MONGODB_DB][MONGODB_COLLECTION]
    return _collection


def embed_text(text: str) -> list[float]:
    """Generate an embedding vector for the given text using Gemini."""
    client = _get_genai_client()
    if client is None:
        raise RuntimeError("GEMINI_API_KEY is not set")
    result = client.models.embed_content(
        model=EMBEDDING_MODEL,
        contents=text,
    )
    return result.embeddings[0].values


def index_scraped_data(data: dict) -> dict:
    """Embed each chunk from pre-scraped firecrawl output and store in MongoDB.

    Args:
        data: Dict with keys 'url', 'title', 'chunks' (list of strings).

    Returns:
        Dict with 'url', 'title', 'chunks_indexed' count.
    """
    coll = _get_collection()
    if coll is None:
        raise RuntimeError("MONGO_DB_URI is not set")

    page_url = data["url"]
    title = data["title"]
    chunks: list[str] = data["chunks"]

    # Remove any existing docs for this URL before re-indexing
    coll.delete_many({"url": page_url})

    docs = []
    for i, chunk in enumerate(chunks):
        embedding = embed_text(chunk)
        docs.append({
            "url": page_url,
            "title": title,
            "chunk_index": i,
            "text": chunk,
            "embedding": embedding,
            "indexed_at": datetime.now(timezone.utc),
        })

    if docs:
        coll.insert_many(docs)

    return {
        "url": page_url,
        "title": title,
        "chunks_indexed": len(docs),
    }
