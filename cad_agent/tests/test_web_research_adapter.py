"""Tests for live web research adapters."""

from __future__ import annotations

import httpx
import pytest

from cad_agent.app.research.web_adapter import AppleWebResearchAdapter


APPLE_IPHONE_17_PRO_SPECS = """
<html>
  <body>
    <h1>iPhone 17 Pro Technical Specifications</h1>
    <h2>Size and Weight</h2>
    <p>Width: 2.83 inches (71.9 mm)</p>
    <p>Height: 5.91 inches (150.0 mm)</p>
    <p>Depth: 0.34 inch (8.75 mm)</p>
    <p>Weight: 7.27 ounces (206 grams)</p>
  </body>
</html>
"""


@pytest.mark.asyncio
async def test_apple_adapter_fetches_dimensions_from_official_specs_page() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == "https://www.apple.com/iphone-17-pro/specs/"
        return httpx.Response(200, text=APPLE_IPHONE_17_PRO_SPECS)

    adapter = AppleWebResearchAdapter(
        http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler))
    )

    result = await adapter.research("apple iphone 17 pro")

    assert result.entity_name == "iPhone 17 Pro"
    assert result.source_urls == ["https://www.apple.com/iphone-17-pro/specs/"]
    assert result.dimensions_mm == {
        "body_width": 71.9,
        "body_length": 150.0,
        "body_depth": 8.75,
    }
    await adapter.aclose()
