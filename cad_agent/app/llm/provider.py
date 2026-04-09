"""Minimal provider abstraction for Anthropic-compatible LLM APIs."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping, Sequence

import httpx

LLMProviderName = str


@dataclass(frozen=True)
class LLMProviderConfig:
    """Resolved LLM provider configuration."""

    provider: LLMProviderName
    model: str
    api_key: str
    base_url: str
    timeout_seconds: float = 60.0
    api_version: str = "2023-06-01"

    @property
    def is_anthropic_compatible(self) -> bool:
        """Whether the transport should use Anthropic-style requests."""
        return self.provider in {"anthropic", "minimax"}

    def messages_endpoint(self) -> str:
        """Return the messages endpoint URL for the active provider."""
        return f"{self.base_url.rstrip('/')}/v1/messages"

    def auth_headers(self) -> dict[str, str]:
        """Build transport headers for the active provider."""
        if self.is_anthropic_compatible:
            return {
                "x-api-key": self.api_key,
                "anthropic-version": self.api_version,
                "content-type": "application/json",
            }

        if self.provider == "openai":
            return {
                "Authorization": f"Bearer {self.api_key}",
                "content-type": "application/json",
            }

        if self.provider == "azure":
            return {
                "api-key": self.api_key,
                "content-type": "application/json",
            }

        return {"content-type": "application/json"}


class AnthropicCompatibleLLMClient:
    """Thin wrapper for Anthropic-compatible chat/message APIs."""

    def __init__(
        self,
        config: LLMProviderConfig,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        if not config.is_anthropic_compatible:
            raise ValueError(
                f"Provider {config.provider} does not use Anthropic-compatible transport"
            )
        self._config = config
        self._client = http_client
        self._owns_client = http_client is None

    async def aclose(self) -> None:
        """Close the owned HTTP client if we created it."""
        if self._owns_client and self._client is not None:
            await self._client.aclose()
            self._client = None

    async def generate(
        self,
        messages: Sequence[Mapping[str, Any]],
        *,
        system: str | None = None,
        max_tokens: int = 1024,
        tools: Sequence[Mapping[str, Any]] | None = None,
        temperature: float | None = None,
    ) -> dict[str, Any]:
        """Send an Anthropic-compatible messages request and return raw JSON."""
        payload: dict[str, Any] = {
            "model": self._config.model,
            "max_tokens": max_tokens,
            "messages": [dict(message) for message in messages],
        }

        if system is not None:
            payload["system"] = system
        if tools is not None:
            payload["tools"] = [dict(tool) for tool in tools]
        if temperature is not None:
            payload["temperature"] = temperature

        client = self._client
        if client is None:
            timeout = httpx.Timeout(self._config.timeout_seconds)
            async with httpx.AsyncClient(timeout=timeout) as transient_client:
                response = await transient_client.post(
                    self._config.messages_endpoint(),
                    headers=self._config.auth_headers(),
                    json=payload,
                )
                response.raise_for_status()
                return response.json()

        response = await client.post(
            self._config.messages_endpoint(),
            headers=self._config.auth_headers(),
            json=payload,
        )
        response.raise_for_status()
        return response.json()
