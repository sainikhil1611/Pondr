import os
import re
import logging
from dotenv import load_dotenv
from firecrawl import FirecrawlApp

load_dotenv()
logger = logging.getLogger(__name__)

FIRECRAWL_API_KEY = os.getenv("FIRECRAWL_API_KEY")

_app = None


def _get_firecrawl():
    global _app
    if _app is None and FIRECRAWL_API_KEY:
        _app = FirecrawlApp(api_key=FIRECRAWL_API_KEY)
    return _app


def chunk_text(text: str, max_chunk_size: int = 1000, overlap: int = 100) -> list[str]:
    """Split text into overlapping chunks suitable for embedding."""
    paragraphs = re.split(r"\n{2,}", text.strip())

    chunks = []
    current_chunk = ""

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue

        if len(current_chunk) + len(para) + 2 <= max_chunk_size:
            current_chunk = (current_chunk + "\n\n" + para).strip()
        else:
            if current_chunk:
                chunks.append(current_chunk)
                overlap_text = current_chunk[-overlap:] if len(current_chunk) > overlap else current_chunk
                current_chunk = (overlap_text + "\n\n" + para).strip()
            else:
                sentences = re.split(r"(?<=[.!?])\s+", para)
                for sentence in sentences:
                    if len(current_chunk) + len(sentence) + 1 <= max_chunk_size:
                        current_chunk = (current_chunk + " " + sentence).strip()
                    else:
                        if current_chunk:
                            chunks.append(current_chunk)
                        current_chunk = sentence

    if current_chunk:
        chunks.append(current_chunk)

    return chunks


def scrape_url(url: str) -> dict:
    """Scrape a URL via Firecrawl and return chunked markdown."""
    fc = _get_firecrawl()
    if fc is None:
        raise RuntimeError("FIRECRAWL_API_KEY environment variable is not set")

    try:
        result = fc.scrape(url, formats=["markdown"])
    except Exception as exc:
        logger.error("Firecrawl scrape error: %s", exc)
        raise RuntimeError(f"Firecrawl error: {exc}") from exc

    markdown = result.markdown or ""
    title = getattr(result.metadata, "title", "") or url

    if not markdown:
        raise RuntimeError("No content returned for the given URL.")

    chunks = chunk_text(markdown)

    return {
        "url": url,
        "title": title,
        "chunks": chunks,
        "raw_markdown": markdown,
    }
