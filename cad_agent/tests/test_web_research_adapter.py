"""Tests for live web research adapters."""

from __future__ import annotations

import httpx
import pytest

from cad_agent.app.research import MiniMaxWebSearchAdapter


@pytest.mark.asyncio
async def test_minimax_adapter_extracts_mac_studio_dimensions_from_search_results() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == "https://api.minimaxi.com/v1/coding_plan/search"
        payload = {
            "organic": [
                {
                    "title": "Mac Studio (M3 Max or M3 Ultra) - Technical Specifications - Apple",
                    "link": "https://www.apple.com/mac-studio/specs/",
                    "snippet": "Height: 9.5 cm (3.7 inches) Width: 19.7 cm (7.7 inches) Depth: 19.7 cm (7.7 inches).",
                }
            ]
        }
        return httpx.Response(200, json=payload)

    adapter = MiniMaxWebSearchAdapter(
        api_key="test-key",
        timeout_seconds=1.0,
    )
    adapter.SEARCH_ENDPOINT = "https://api.minimaxi.com/v1/coding_plan/search"

    original_client = httpx.AsyncClient

    class MockAsyncClient(httpx.AsyncClient):
        def __init__(self, *args, **kwargs):
            kwargs["transport"] = httpx.MockTransport(handler)
            super().__init__(*args, **kwargs)

    httpx.AsyncClient = MockAsyncClient
    try:
        result = await adapter.research("帮我设计一个mac studio m3底座")
    finally:
        httpx.AsyncClient = original_client

    assert result.entity_name.startswith("Mac Studio")
    assert result.source_urls == ["https://www.apple.com/mac-studio/specs/"]
    assert result.dimensions_mm == {
        "device_width": 197.0,
        "device_depth": 197.0,
        "device_height": 95.0,
    }


@pytest.mark.asyncio
async def test_minimax_adapter_extracts_phone_feature_map_from_search_results() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == "https://api.minimaxi.com/v1/coding_plan/search"
        payload = {
            "organic": [
                {
                    "title": "Samsung Galaxy S25 Ultra specs",
                    "link": "https://www.samsung.com/galaxy-s25-ultra/specs/",
                    "snippet": "Height 162.8 mm Width 79.0 mm Depth 8.6 mm. Camera bump 38 x 42 mm. Power and volume buttons on the right side. USB-C port on the bottom edge.",
                }
            ]
        }
        return httpx.Response(200, json=payload)

    adapter = MiniMaxWebSearchAdapter(
        api_key="test-key",
        timeout_seconds=1.0,
    )
    adapter.SEARCH_ENDPOINT = "https://api.minimaxi.com/v1/coding_plan/search"

    original_client = httpx.AsyncClient

    class MockAsyncClient(httpx.AsyncClient):
        def __init__(self, *args, **kwargs):
            kwargs["transport"] = httpx.MockTransport(handler)
            super().__init__(*args, **kwargs)

    httpx.AsyncClient = MockAsyncClient
    try:
        result = await adapter.research("帮我设计一个三星 S25 Ultra 手机壳")
    finally:
        httpx.AsyncClient = original_client

    assert result.entity_name.startswith("Samsung Galaxy S25 Ultra")
    assert result.dimensions_mm == {
        "body_width": 79.0,
        "body_length": 162.8,
        "body_depth": 8.6,
    }
    assert result.feature_map["camera_region"]["bbox_mm"] == {"width": 38.0, "height": 42.0}
    assert result.feature_map["button_zones"][0]["side"] == "right"
    assert result.feature_map["port_zone"]["type"] == "usb-c"


@pytest.mark.asyncio
async def test_minimax_adapter_extracts_mac_mini_dimensions_from_search_results() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == "https://api.minimaxi.com/v1/coding_plan/search"
        payload = {
            "organic": [
                {
                    "title": "Mac mini (M4, 2024) - Technical Specifications - Apple",
                    "link": "https://www.apple.com/mac-mini/specs/",
                    "snippet": "Height: 5.0 cm Width: 12.7 cm Depth: 12.7 cm.",
                }
            ]
        }
        return httpx.Response(200, json=payload)

    adapter = MiniMaxWebSearchAdapter(
        api_key="test-key",
        timeout_seconds=1.0,
    )
    adapter.SEARCH_ENDPOINT = "https://api.minimaxi.com/v1/coding_plan/search"

    original_client = httpx.AsyncClient

    class MockAsyncClient(httpx.AsyncClient):
        def __init__(self, *args, **kwargs):
            kwargs["transport"] = httpx.MockTransport(handler)
            super().__init__(*args, **kwargs)

    httpx.AsyncClient = MockAsyncClient
    try:
        result = await adapter.research("帮我设计一个mac mini m4的底座")
    finally:
        httpx.AsyncClient = original_client

    assert result.entity_name.startswith("Mac mini")
    assert result.source_urls == ["https://www.apple.com/mac-mini/specs/"]
    assert result.dimensions_mm == {
        "device_width": 127.0,
        "device_depth": 127.0,
        "device_height": 50.0,
    }
