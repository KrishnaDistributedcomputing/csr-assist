# Copyright (c) Microsoft Corporation.
# SPDX-License-Identifier: MIT

"""Core API behavior tests."""

from __future__ import annotations

from pathlib import Path

import httpx
from fastapi.testclient import TestClient

from csr_assist.api import UNSUPPORTED_ANSWER, create_app
from csr_assist.config import Settings
from csr_assist.ollama import GenerationResult


def test_health_is_available_without_model(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["application"] == "healthy"


def test_status_polling_does_not_consume_action_limits(client: TestClient) -> None:
    for _ in range(100):
        assert client.get("/api/documents").status_code == 200
        assert client.get("/api/models").status_code == 200
        assert client.get("/api/scan/status").status_code == 200


def test_static_assets_are_compressed_and_cached(client: TestClient) -> None:
    assets = (
        Path(__file__).parents[1] / "csr_assist" / "static" / "assets"
    )
    javascript = next(assets.glob("*.js"))

    response = client.get(f"/assets/{javascript.name}")

    assert response.status_code == 200
    assert response.headers["content-encoding"] == "gzip"
    assert response.headers["cache-control"] == (
        "public, max-age=31536000, immutable"
    )


def test_search_and_insufficient_evidence(
    client: TestClient, settings: Settings
) -> None:
    (settings.documents_dir / "policy.txt").write_text(
        "Returns require proof of purchase.", encoding="utf-8"
    )
    client.post("/api/scan")
    results = client.get("/api/search", params={"q": "proof purchase"}).json()
    assert results["results"][0]["name"] == "policy.txt"
    documents = client.get("/api/documents").json()
    assert documents[0]["chunk_count"] == 1
    assert documents[0]["key_fact_count"] >= 1
    assert documents[0]["indexed_at"]

    answer = client.post("/api/chat", json={"message": "holiday hours"}).json()
    assert answer["state"] == "insufficient-evidence"
    assert answer["text"] == UNSUPPORTED_ANSWER


def test_generated_chat_replaces_uncited_model_knowledge_with_sources(
    client: TestClient, settings: Settings
) -> None:
    (settings.documents_dir / "budget.txt").write_text(
        "Capital spending for the France office requires manager approval.",
        encoding="utf-8",
    )
    client.post("/api/scan")
    prompts: list[str] = []

    async def installed_models() -> set[str]:
        return {"phi3:mini"}

    async def unsupported_generation(
        _model: str, prompt: str
    ) -> GenerationResult:
        prompts.append(prompt)
        return GenerationResult(
            text="Paris is the capital of France.",
            prompt_tokens=20,
            output_tokens=7,
        )

    client.app.state.ollama.installed_models = installed_models
    client.app.state.ollama.generate = unsupported_generation

    body = client.post(
        "/api/chat",
        json={
            "message": "What is the capital of France?",
            "mode": "generated",
        },
    ).json()

    assert body["state"] == "answered"
    assert body["model"] == "local-index:extractive-fallback"
    assert "Paris is the capital of France." not in body["text"]
    assert "Capital spending" in body["text"]
    assert body["citations"]
    assert body["sources"]
    assert "extracted directly" in body["notice"]
    assert "Do not use prior knowledge, external knowledge, or speculation" in (
        prompts[0]
    )
    assert UNSUPPORTED_ANSWER in prompts[0]


def test_search_uses_fast_keyword_path(
    client: TestClient, settings: Settings
) -> None:
    (settings.documents_dir / "policy.txt").write_text(
        "Returns require proof of purchase.", encoding="utf-8"
    )
    client.post("/api/scan")
    embedded: list[list[str]] = []

    async def record_embeddings(texts: list[str]) -> list[list[float]]:
        embedded.append(texts)
        return []

    client.app.state.ollama.embed = record_embeddings
    response = client.get("/api/search", params={"q": "proof"})

    assert response.status_code == 200
    assert response.json()["results"]
    assert embedded == []


def test_online_mode_requires_azure_configuration(client: TestClient) -> None:
    assert (
        client.get(
            "/api/search",
            params={"q": "Cogsdale", "source": "online"},
        ).status_code
        == 503
    )
    assert (
        client.post(
            "/api/chat",
            json={"message": "What is Cogsdale?", "source": "online"},
        ).status_code
        == 503
    )


def test_online_search_and_foundry_answer(
    settings: Settings,
) -> None:
    online_settings = settings.model_copy(
        update={
            "azure_ai_search_endpoint": "https://search.example",
            "azure_ai_search_index": "documents",
            "azure_ai_foundry_endpoint": "https://foundry.example",
            "azure_ai_foundry_deployment": "phi-4-mini",
            "azure_ai_foundry_deployments": "gpt-4o-mini",
            "azure_region": "West US 2",
            "azure_container_app_service": "ca-csr-assist-demo",
            "azure_container_app_sku": "Consumption",
            "azure_ai_search_service": "srch-csr-assist-kvenk26",
            "azure_ai_search_sku": "Free",
            "azure_ai_foundry_service": "aif-csr-assist-kvenk26",
            "azure_ai_foundry_sku": "S0",
        }
    )
    app = create_app(settings=online_settings)
    source = {
        "document_id": 7,
        "chunk_id": 11,
        "name": "PUBLIC-cogsdale-overview.md",
        "relative_path": "PUBLIC-cogsdale-overview.md",
        "location": "section 2",
        "text": "Cogsdale CSM supports utility billing services.",
        "extraction": "native",
        "source_url": "https://cogsdale.com/",
        "retrieval": "azure-ai-search",
        "channel": "online",
    }

    async def online_search(_: str, __: int) -> list[dict[str, object]]:
        return [source]

    selected_models: list[str] = []

    async def online_generate(_: str, model: str) -> GenerationResult:
        selected_models.append(model)
        return GenerationResult(
            text="Cogsdale CSM supports utility billing services. [1]",
            prompt_tokens=30,
            output_tokens=10,
        )

    app.state.azure_ai.search = online_search
    app.state.azure_ai.generate = online_generate
    with TestClient(app) as online_client:
        deployment = online_client.get("/api/deployment").json()
        search = online_client.get(
            "/api/search",
            params={"q": "Cogsdale utility billing", "source": "online"},
        ).json()
        answer = online_client.post(
            "/api/chat",
            json={
                "message": "What utility billing services does Cogsdale support?",
                "source": "online",
                "model": "gpt-4o-mini",
            },
        ).json()

    assert search["source"] == "online"
    assert deployment["azure_region"] == "West US 2"
    assert deployment["online_models"][0]["input_cost_per_million"] == 0.075
    assert deployment["online_models"][0]["output_cost_per_million"] == 0.3
    assert deployment["azure_services"][1] == {
        "name": "Azure AI Search",
        "resource": "srch-csr-assist-kvenk26",
        "region": "West US 2",
        "sku": "Free",
        "billing_basis": "Provisioned search capacity; not token-priced",
    }
    assert search["results"][0]["channel"] == "online"
    assert answer["state"] == "answered"
    assert answer["model"] == "azure-foundry:gpt-4o-mini"
    assert selected_models == ["gpt-4o-mini"]
    assert answer["citations"][0]["name"] == "PUBLIC-cogsdale-overview.md"


def test_online_chat_uses_extractive_fallback_when_foundry_is_limited(
    settings: Settings,
) -> None:
    online_settings = settings.model_copy(
        update={
            "azure_ai_search_endpoint": "https://search.example",
            "azure_ai_search_index": "documents",
            "azure_ai_foundry_endpoint": "https://foundry.example",
            "azure_ai_foundry_deployment": "phi-4-mini",
        }
    )
    app = create_app(settings=online_settings)
    source = {
        "document_id": 7,
        "chunk_id": 11,
        "name": "PUBLIC-cogsdale-overview.md",
        "relative_path": "PUBLIC-cogsdale-overview.md",
        "location": "section 2",
        "text": "Cogsdale CSM supports utility billing services.",
        "extraction": "native",
        "source_url": "https://cogsdale.com/",
        "retrieval": "azure-ai-search",
        "channel": "online",
    }

    async def online_search(_: str, __: int) -> list[dict[str, object]]:
        return [source]

    async def limited_generation(_: str, __: str) -> GenerationResult:
        raise httpx.HTTPStatusError(
            "rate limited",
            request=httpx.Request("POST", "https://foundry.example"),
            response=httpx.Response(429),
        )

    app.state.azure_ai.search = online_search
    app.state.azure_ai.generate = limited_generation
    with TestClient(app) as online_client:
        answer = online_client.post(
            "/api/chat",
            json={"message": "Tell me about Cogsdale", "source": "online"},
        ).json()

    assert answer["state"] == "answered"
    assert answer["model"] == "azure-ai-search:extractive-fallback"
    assert answer["citations"][0]["name"] == "PUBLIC-cogsdale-overview.md"
    assert "Azure AI Foundry is temporarily unavailable" in answer["notice"]


def test_online_chat_uses_extractive_fallback_for_grounded_model_refusal(
    settings: Settings,
) -> None:
    online_settings = settings.model_copy(
        update={
            "azure_ai_search_endpoint": "https://search.example",
            "azure_ai_search_index": "documents",
            "azure_ai_foundry_endpoint": "https://foundry.example",
            "azure_ai_foundry_deployment": "phi-4-mini",
        }
    )
    app = create_app(settings=online_settings)
    source = {
        "document_id": 7,
        "chunk_id": 11,
        "name": "PUBLIC-cogsdale-overview.md",
        "relative_path": "PUBLIC-cogsdale-overview.md",
        "location": "section 2",
        "text": "Cogsdale CSM supports utility billing services.",
        "extraction": "native",
        "source_url": "https://cogsdale.com/",
        "retrieval": "azure-ai-search",
        "channel": "online",
    }

    async def online_search(_: str, __: int) -> list[dict[str, object]]:
        return [source]

    async def model_refusal(_: str, __: str) -> GenerationResult:
        return GenerationResult(
            text=UNSUPPORTED_ANSWER,
            prompt_tokens=30,
            output_tokens=10,
        )

    app.state.azure_ai.search = online_search
    app.state.azure_ai.generate = model_refusal
    with TestClient(app) as online_client:
        answer = online_client.post(
            "/api/chat",
            json={
                "message": "What utility billing services does Cogsdale support?",
                "source": "online",
            },
        ).json()
        unrelated = online_client.post(
            "/api/chat",
            json={
                "message": "What repair services are available?",
                "source": "online",
            },
        ).json()

    assert answer["state"] == "answered"
    assert answer["model"] == "azure-ai-search:extractive-fallback"
    assert answer["citations"]
    assert unrelated["state"] == "insufficient-evidence"
    assert unrelated["text"] == UNSUPPORTED_ANSWER


def test_model_missing_keeps_sources(
    client: TestClient, settings: Settings
) -> None:
    (settings.documents_dir / "policy.txt").write_text(
        "Returns require proof of purchase.", encoding="utf-8"
    )
    client.post("/api/scan")
    response = client.post(
        "/api/chat",
        json={"message": "What do returns require?", "mode": "generated"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["state"] == "model-missing"
    assert body["sources"]


def test_fast_chat_does_not_call_local_models(
    client: TestClient, settings: Settings
) -> None:
    (settings.documents_dir / "policy.txt").write_text(
        "Returns require proof of purchase. Items must be unused.",
        encoding="utf-8",
    )
    client.post("/api/scan")

    async def unexpected_call(*_: object) -> str:
        raise AssertionError("fast chat must not call a local model")

    client.app.state.ollama.generate = unexpected_call
    response = client.post("/api/chat", json={"message": "What is the return policy?"})

    assert response.status_code == 200
    body = response.json()
    assert body["state"] == "answered"
    assert body["model"] == "local-index"
    assert "proof of purchase" in body["text"]
    assert body["citations"]


def test_fast_chat_cache_and_usage_dashboard(
    client: TestClient, settings: Settings
) -> None:
    (settings.documents_dir / "policy.txt").write_text(
        "Returns require proof of purchase.", encoding="utf-8"
    )
    client.post("/api/scan")

    first = client.post(
        "/api/chat", json={"message": "What is the return policy?"}
    ).json()
    second = client.post(
        "/api/chat", json={"message": "What is the return policy?"}
    ).json()
    usage = client.get("/api/usage").json()

    assert first["cached"] is False
    assert second["cached"] is True
    assert usage["totals"]["requests"] == 2
    assert usage["totals"]["cache_hits"] == 1
    assert usage["totals"]["total_tokens"] == 0
    assert usage["cached_answers"] == 1
    assert usage["key_facts"] >= 1


def test_bad_feedback_invalidates_cache_and_reranks_sources(
    client: TestClient, settings: Settings
) -> None:
    (settings.documents_dir / "a-policy.txt").write_text(
        "Returns require alpha proof of purchase.", encoding="utf-8"
    )
    (settings.documents_dir / "b-policy.txt").write_text(
        "Returns require beta proof of purchase.", encoding="utf-8"
    )
    client.post("/api/scan")
    request = {"message": "What do returns require?"}

    first = client.post("/api/chat", json=request).json()
    feedback = client.post(
        "/api/feedback",
        json={"history_id": first["history_id"], "rating": "bad"},
    )
    second = client.post("/api/chat", json=request).json()
    usage = client.get("/api/usage").json()

    assert feedback.status_code == 200
    assert feedback.json()["bad"] == 1
    assert second["cached"] is False
    assert second["sources"][0]["name"] != first["sources"][0]["name"]
    assert usage["feedback"]["bad"] == 1


def test_fast_chat_stays_with_highest_ranked_document(
    client: TestClient, settings: Settings
) -> None:
    (settings.documents_dir / "returns.txt").write_text(
        "Returns require proof of purchase.", encoding="utf-8"
    )
    (settings.documents_dir / "build.txt").write_text(
        "Build resources must follow the platform policy.", encoding="utf-8"
    )
    client.post("/api/scan")

    body = client.post(
        "/api/chat", json={"message": "What is the return policy?"}
    ).json()

    assert [source["name"] for source in body["sources"]] == ["returns.txt"]
    assert "Build resources" not in body["text"]


def test_fast_follow_up_reuses_recent_sources(
    client: TestClient, settings: Settings
) -> None:
    (settings.documents_dir / "policy.txt").write_text(
        "Returns require proof of purchase.", encoding="utf-8"
    )
    client.post("/api/scan")
    client.post("/api/chat", json={"message": "What is the return policy?"})

    response = client.post(
        "/api/chat", json={"message": "Draft a customer-ready response"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["sources"][0]["name"] == "policy.txt"
    assert body["text"].startswith("Customer-ready response:")
    assert "proof of purchase" in body["text"]


def test_unrelated_follow_up_does_not_reuse_recent_sources(
    client: TestClient, settings: Settings
) -> None:
    (settings.documents_dir / "policy.txt").write_text(
        "Returns require proof of purchase.", encoding="utf-8"
    )
    (settings.documents_dir / "budget.txt").write_text(
        "Capital expenses require manager approval.", encoding="utf-8"
    )
    client.post("/api/scan")
    client.post("/api/chat", json={"message": "What is the return policy?"})

    body = client.post(
        "/api/chat", json={"message": "What is the capital of France?"}
    ).json()

    assert body["state"] == "insufficient-evidence"
    assert body["text"] == UNSUPPORTED_ANSWER
    assert body["sources"] == []


def test_upload_validation(client: TestClient) -> None:
    response = client.post(
        "/api/documents/upload",
        files={"file": ("payload.exe", b"unsafe", "application/octet-stream")},
    )
    assert response.status_code == 400


def test_read_only_demo_does_not_persist_user_activity(
    settings: Settings,
) -> None:
    demo_settings = settings.model_copy(update={"read_only_demo": True})
    app = create_app(settings=demo_settings)

    async def no_models() -> set[str]:
        return set()

    async def no_embeddings(_: list[str]) -> list[list[float]]:
        return []

    app.state.ollama.installed_models = no_models
    app.state.ollama.embed = no_embeddings
    (settings.documents_dir / "policy.txt").write_text(
        "Returns require proof of purchase.", encoding="utf-8"
    )

    with TestClient(app) as demo_client:
        demo_client.post("/api/scan")
        assert demo_client.get("/api/deployment").json() == {
            "read_only_demo": True,
            "online_available": False,
            "online_model": "",
            "online_models": [],
            "azure_region": "",
            "azure_services": [],
            "token_pricing_as_of": "2026-10-06",
        }
        answer = demo_client.post(
            "/api/chat", json={"message": "What do returns require?"}
        ).json()
        cached = demo_client.post(
            "/api/chat", json={"message": "What do returns require?"}
        ).json()

        assert answer["state"] == "answered"
        assert answer["history_id"] == 0
        assert cached["cached"] is True
        assert cached["history_id"] == 0
        assert demo_client.get("/api/history").json() == []
        assert demo_client.delete("/api/history").status_code == 403
        assert (
            demo_client.post(
                "/api/documents/upload",
                files={"file": ("notes.txt", b"private", "text/plain")},
            ).status_code
            == 403
        )
        assert (
            demo_client.post(
                "/api/feedback",
                json={"history_id": 1, "rating": "good"},
            ).status_code
            == 403
        )
        assert demo_client.put(
            "/api/settings",
            json={
                "active_model": "phi3:mini",
                "allowed_models": [],
                "persona": "Changed",
            },
        ).status_code == 403


def test_search_and_chat_are_persisted(
    client: TestClient, settings: Settings
) -> None:
    (settings.documents_dir / "policy.txt").write_text(
        "Returns require proof of purchase.", encoding="utf-8"
    )
    client.post("/api/scan")
    client.get("/api/search", params={"q": "proof"})
    client.post("/api/chat", json={"message": "What requires proof?"})

    history = client.get("/api/history").json()
    assert [entry["kind"] for entry in history] == ["chat", "search"]
    assert history[0]["sources"][0]["name"] == "policy.txt"
    assert client.delete("/api/history").json()["deleted"] == 2
