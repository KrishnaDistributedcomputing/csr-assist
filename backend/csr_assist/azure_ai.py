# Copyright (c) Microsoft Corporation.
# SPDX-License-Identifier: MIT

"""Managed-identity clients for Azure AI Search and Foundry Models."""

from __future__ import annotations

from dataclasses import dataclass
import os
import time
from typing import Any
from urllib.parse import quote

import httpx

from csr_assist.config import Settings
from csr_assist.ollama import GenerationResult

SEARCH_API_VERSION = "2024-07-01"
FOUNDRY_API_VERSION = "2024-10-21"
FOUNDRY_TIMEOUT_SECONDS = 10


@dataclass
class CachedToken:
    """A managed-identity token and its expiration time."""

    value: str
    expires_at: float


class AzureAIClient:
    """Queries Azure AI Search and a Foundry model using managed identity."""

    def __init__(
        self,
        settings: Settings,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.search_endpoint = settings.azure_ai_search_endpoint.rstrip("/")
        self.search_index = settings.azure_ai_search_index
        self.foundry_endpoint = settings.azure_ai_foundry_endpoint.rstrip("/")
        self.foundry_deployment = settings.azure_ai_foundry_deployment
        self.identity_client_id = settings.azure_ai_identity_client_id
        self.timeout = settings.azure_ai_timeout
        self.foundry_timeout = min(self.timeout, FOUNDRY_TIMEOUT_SECONDS)
        self.transport = transport
        self._tokens: dict[str, CachedToken] = {}

    @property
    def configured(self) -> bool:
        """Return whether both Azure retrieval and generation are configured."""
        return bool(
            self.search_endpoint
            and self.search_index
            and self.foundry_endpoint
            and self.foundry_deployment
        )

    async def _access_token(self, resource: str) -> str:
        cached = self._tokens.get(resource)
        if cached and cached.expires_at - time.time() > 300:
            return cached.value

        endpoint = os.environ.get("IDENTITY_ENDPOINT", "")
        identity_header = os.environ.get("IDENTITY_HEADER", "")
        if not endpoint or not identity_header:
            raise RuntimeError("Azure managed identity is unavailable")

        params = {
            "api-version": "2019-08-01",
            "resource": resource,
        }
        if self.identity_client_id:
            params["client_id"] = self.identity_client_id
        async with httpx.AsyncClient(
            timeout=self.timeout,
            transport=self.transport,
        ) as client:
            response = await client.get(
                endpoint,
                params=params,
                headers={"X-IDENTITY-HEADER": identity_header},
            )
            response.raise_for_status()
        data = response.json()
        token = str(data["access_token"])
        expires_at = float(data.get("expires_on", time.time() + 3600))
        self._tokens[resource] = CachedToken(token, expires_at)
        return token

    async def search(
        self,
        query: str,
        limit: int,
    ) -> list[dict[str, Any]]:
        """Search the configured Azure AI Search index."""
        if not self.configured:
            raise RuntimeError("Azure AI online mode is not configured")
        token = await self._access_token("https://search.azure.com/")
        index = quote(self.search_index, safe="")
        url = f"{self.search_endpoint}/indexes/{index}/docs/search"
        payload = {
            "search": query,
            "top": limit,
            "queryType": "simple",
            "searchMode": "any",
            "select": (
                "document_id,chunk_id,name,relative_path,location,text,"
                "extraction,source_url"
            ),
        }
        async with httpx.AsyncClient(
            timeout=self.timeout,
            transport=self.transport,
        ) as client:
            response = await client.post(
                url,
                params={"api-version": SEARCH_API_VERSION},
                headers={"Authorization": f"Bearer {token}"},
                json=payload,
            )
            response.raise_for_status()
        results: list[dict[str, Any]] = []
        for item in response.json().get("value", []):
            results.append(
                {
                    "document_id": int(item["document_id"]),
                    "chunk_id": int(item["chunk_id"]),
                    "name": str(item["name"]),
                    "relative_path": str(item["relative_path"]),
                    "location": str(item["location"]),
                    "text": str(item["text"]),
                    "extraction": str(item.get("extraction", "structured")),
                    "source_url": str(item.get("source_url", "")),
                    "retrieval": "azure-ai-search",
                    "channel": "online",
                }
            )
        return results

    async def generate(self, prompt: str) -> GenerationResult:
        """Generate a grounded answer with the configured Foundry deployment."""
        if not self.configured:
            raise RuntimeError("Azure AI online mode is not configured")
        token = await self._access_token(
            "https://cognitiveservices.azure.com/"
        )
        deployment = quote(self.foundry_deployment, safe="")
        url = (
            f"{self.foundry_endpoint}/openai/deployments/{deployment}/"
            "chat/completions"
        )
        payload = {
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.1,
            "max_tokens": 120,
        }
        async with httpx.AsyncClient(
            timeout=self.foundry_timeout,
            transport=self.transport,
        ) as client:
            response = await client.post(
                url,
                params={"api-version": FOUNDRY_API_VERSION},
                headers={"Authorization": f"Bearer {token}"},
                json=payload,
            )
            response.raise_for_status()
        data = response.json()
        choices = data.get("choices", [])
        if not choices:
            raise RuntimeError("Azure AI Foundry returned no answer")
        answer = str(choices[0].get("message", {}).get("content", "")).strip()
        if not answer:
            raise RuntimeError("Azure AI Foundry returned an empty answer")
        usage = data.get("usage", {})
        return GenerationResult(
            text=answer,
            prompt_tokens=max(int(usage.get("prompt_tokens", 0)), 0),
            output_tokens=max(int(usage.get("completion_tokens", 0)), 0),
        )
