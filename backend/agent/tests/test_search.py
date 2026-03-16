"""Integration tests for the search services.

Run with: python -m pytest backend/agent/tests/test_search.py -m integration -v -s
"""

import pytest

from backend.services.search_service import search_web
from backend.services.youtube_service import search_videos


@pytest.mark.integration
@pytest.mark.asyncio
async def test_search_web_returns_results():
    """search_web should return WebResult dicts with url and title."""
    results = await search_web("python decorators")
    assert len(results) == 2
    for r in results:
        assert r["url"]
        assert r["title"]


@pytest.mark.integration
def test_search_youtube_returns_result():
    """search_videos should return dicts with video_id and title."""
    results = search_videos("python decorators", max_results=1)
    assert len(results) >= 1
    assert results[0]["video_id"]
    assert results[0]["title"]
