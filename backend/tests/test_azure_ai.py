# Copyright (c) Microsoft Corporation.
# SPDX-License-Identifier: MIT

"""Azure AI managed-identity client tests."""

from __future__ import annotations

import json
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
                            "name": "SAMPLE-utility-services-overview.md",
                            "relative_path": "SAMPLE-utility-services-overview.md",
                            "location": "section 2",
                            "text": "The service platform supports utility billing.",
                            "extraction": "native",
                            "source_url": "https://example.com/utility-services",
                        }
                    ]
                },
            )
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": "The service platform supports utility billing. [1]"
                        }
                    }
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
            azure_ai_foundry_deployments="gpt-4o-mini",
            azure_ai_identity_client_id="client-id",
            azure_ai_timeout=120,
        ),
        transport=httpx.MockTransport(respond),
    )

    sources = await client.search("utility service billing", 3, [7, 9, 7])
    generation = await client.generate("Use only [1].")
    alternate_generation = await client.generate(
        "Use only [1].",
        "gpt-4o-mini",
    )
    documents = await client.list_documents()

    assert sources[0]["channel"] == "online"
    assert sources[0]["source_url"] == "https://example.com/utility-services"
    assert generation.text.endswith("[1]")
    assert generation.prompt_tokens == 12
    assert alternate_generation.text.endswith("[1]")
    assert documents[0]["document_id"] == 7
    assert client.foundry_deployments == ("phi-4-mini", "gpt-4o-mini")
    assert client.foundry_timeout == 10
    assert requests[0].url.params["client_id"] == "client-id"
    assert requests[1].url.params["api-version"] == "2024-07-01"
    assert json.loads(requests[1].content)["filter"] == (
        "document_id eq 7 or document_id eq 9"
    )
    assert timeouts[1] == 120
    assert requests[3].url.path.endswith(
        "/openai/deployments/phi-4-mini/chat/completions"
    )
    assert requests[3].url.params["api-version"] == "2024-10-21"
    assert timeouts[3] == 10
    assert requests[4].url.path.endswith(
        "/openai/deployments/gpt-4o-mini/chat/completions"
    )
    assert requests[5].headers["Authorization"] == "Bearer managed-token"
    with pytest.raises(ValueError, match="not approved"):
        await client.generate("Use only [1].", "unapproved-model")
