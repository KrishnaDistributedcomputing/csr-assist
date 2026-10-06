# Copyright (c) Microsoft Corporation.
# SPDX-License-Identifier: MIT

"""Shared isolated application fixture."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from csr_assist.api import create_app
from csr_assist.config import Settings


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    """Return settings rooted in a temporary directory."""
    return Settings(
        documents_dir=tmp_path / "documents",
        index_dir=tmp_path / "index",
        config_dir=tmp_path / "config",
        models_dir=tmp_path / "models",
    )


@pytest.fixture
def client(settings: Settings) -> TestClient:
    """Return an isolated FastAPI test client."""
    app = create_app(settings=settings)

    async def no_models() -> set[str]:
        return set()

    async def no_embeddings(_: list[str]) -> list[list[float]]:
        return []

    app.state.ollama.installed_models = no_models
    app.state.ollama.embed = no_embeddings
    with TestClient(app) as test_client:
        yield test_client
