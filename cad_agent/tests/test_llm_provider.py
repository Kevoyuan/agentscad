"""Tests for LLM provider resolution and MiniMax compatibility."""

from __future__ import annotations

import httpx
import json
import pytest

from cad_agent.app.llm.provider import AnthropicCompatibleLLMClient, LLMProviderConfig
from cad_agent.config import Settings


def test_resolve_minimax_provider_config() -> None:
    settings = Settings(
        llm_provider="minimax",
        llm_model="ignored-for-minimax",
        minimax_api_key=None,
        anthropic_api_key="anthropic-fallback-key",
    )

    config = settings.resolve_llm_provider_config()

    assert config.provider == "minimax"
    assert config.model == "MiniMax-M2.7"
    assert config.api_key == "anthropic-fallback-key"
    assert config.base_url == "https://api.minimaxi.com/anthropic"
    assert config.is_anthropic_compatible is True
    assert config.messages_endpoint() == "https://api.minimaxi.com/anthropic/v1/messages"


def test_resolve_anthropic_provider_config() -> None:
    settings = Settings(
        llm_provider="anthropic",
        llm_model="Claude-Style-Model",
        anthropic_api_key="anthropic-key",
    )

    config = settings.resolve_llm_provider_config()

    assert config.provider == "anthropic"
    assert config.model == "Claude-Style-Model"
    assert config.api_key == "anthropic-key"
    assert config.base_url == "https://api.anthropic.com"


def test_anthropic_client_rejects_non_anthropic_provider() -> None:
    config = LLMProviderConfig(
        provider="openai",
        model="gpt-4o-mini",
        api_key="key",
        base_url="https://api.openai.com/v1",
    )

    with pytest.raises(ValueError, match="does not use Anthropic-compatible transport"):
        AnthropicCompatibleLLMClient(config)


@pytest.mark.asyncio
async def test_anthropic_client_builds_request_payload() -> None:
    captured = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["headers"] = dict(request.headers)
        captured["body"] = request.read().decode("utf-8")
        return httpx.Response(200, json={"content": [{"type": "text", "text": "ok"}]})

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as client:
        llm_client = AnthropicCompatibleLLMClient(
            LLMProviderConfig(
                provider="minimax",
                model="MiniMax-M2.7",
                api_key="token-plan-key",
                base_url="https://api.minimaxi.com/anthropic",
            ),
            http_client=client,
        )

        response = await llm_client.generate(
            [{"role": "user", "content": [{"type": "text", "text": "Hello"}]}],
            system="You are helpful.",
            max_tokens=128,
        )

    assert response["content"][0]["text"] == "ok"
    assert captured["url"] == "https://api.minimaxi.com/anthropic/v1/messages"
    payload = json.loads(captured["body"])
    assert payload["model"] == "MiniMax-M2.7"
    assert payload["max_tokens"] == 128
    assert payload["system"] == "You are helpful."
    assert captured["headers"]["x-api-key"] == "token-plan-key"
