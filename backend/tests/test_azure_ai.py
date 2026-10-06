# Copyright (c) Microsoft Corporation.
# SPDX-License-Identifier: MIT

"""Azure AI managed-identity client tests."""

from __future__ import annotations

import time

import httpx
import pytest

from csr_assist.azure_ai import AzureAIClient
from csr_assist.config import Settings


@pytest.mark.asyncio
async def test_search_and_foundry_use_managed_identity(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    requests: list[httpx.Request] = []
    timeouts: list[float] = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        timeouts.append(float(request.extensions["timeout"]["read"]))
        if request.url.host == "identity.local":
            return httpx.Response(
                200,
                json={
                    "access_token": "managed-token",
                    "expires_on": time.time() + 3600,
                },
            )
        assert request.headers["Authorization"] == "Bearer managed-token"
        if request.url.host == "search.example":
            return httpx.Response(
                200,
                json={
                    "value": [
                        {
                            "document_id": 7,
                            "chunk_id": 11,
                            "name": "PUBLIC-cogsdale-overview.md",
                            "relative_path": "PUBLIC-cogsdale-overview.md",
                            "location": "section 2",
                            "text": "Cogsdale CSM supports utility billing.",
                            "extraction": "native",
                            "source_url": "https://cogsdale.com/",
                        }
                    ]
                },
            )
        return httpx.Response(
            200,
            json={
                "choices": [
                    {"message": {"content": "CSM supports utility billing. [1]"}}
                ],
                "usage": {"prompt_tokens": 12, "completion_tokens": 7},
            },
        )

    monkeypatch.setenv("IDENTITY_ENDPOINT", "https://identity.local/token")
    monkeypatch.setenv("IDENTITY_HEADER", "identity-secret")
    client = AzureAIClient(
        Settings(
            azure_ai_search_endpoint="https://search.example",
            azure_ai_search_index="documents",
            azure_ai_foundry_endpoint="https://foundry.example",
            azure_ai_foundry_deployment="phi-4-mini",
            azure_ai_identity_client_id="client-id",
            azure_ai_timeout=120,
        ),
        transport=httpx.MockTransport(respond),
    )

    sources = await client.search("Cogsdale billing", 3)
    generation = await client.generate("Use only [1].")

    assert sources[0]["channel"] == "online"
    assert sources[0]["source_url"] == "https://cogsdale.com/"
    assert generation.text.endswith("[1]")
    assert generation.prompt_tokens == 12
    assert client.foundry_timeout == 10
    assert requests[0].url.params["client_id"] == "client-id"
    assert requests[1].url.params["api-version"] == "2024-07-01"
    assert timeouts[1] == 120
    assert requests[3].url.path.endswith(
        "/openai/deployments/phi-4-mini/chat/completions"
    )
    assert requests[3].url.params["api-version"] == "2024-10-21"
    assert timeouts[3] == 10
