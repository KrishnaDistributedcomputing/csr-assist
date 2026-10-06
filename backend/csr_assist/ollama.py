# Copyright (c) Microsoft Corporation.
# SPDX-License-Identifier: MIT

"""Bounded client for the loopback Ollama runtime."""

from __future__ import annotations

from dataclasses import dataclass
import time
from typing import Any

import httpx


@dataclass(frozen=True)
class GenerationResult:
    """Generated text and actual token counts reported by Ollama."""

    text: str
    prompt_tokens: int
    output_tokens: int


class OllamaClient:
    """Queries installed models and generates local answers."""

    def __init__(self, base_url: str, timeout: int) -> None:
        if base_url != "http://127.0.0.1:11434":
            raise ValueError("Ollama must use the fixed loopback endpoint")
        self.base_url = base_url
        self.timeout = timeout
        self._models_cache: set[str] = set()
        self._models_cached_at = 0.0

    async def installed_models(self) -> set[str]:
        """Return installed model names, or an empty set when unavailable."""
        if time.monotonic() - self._models_cached_at < 30:
            return set(self._models_cache)
        try:
            async with httpx.AsyncClient(timeout=3) as client:
                response = await client.get(f"{self.base_url}/api/tags")
                response.raise_for_status()
            installed = {
                str(model["name"])
                for model in response.json().get("models", [])
                if model.get("name")
            }
            self._models_cache = installed
            self._models_cached_at = time.monotonic()
            return set(installed)
        except (httpx.HTTPError, ValueError, KeyError):
            return set()

    async def generate(self, model: str, prompt: str) -> GenerationResult:
        """Generate a non-streaming response from an installed local model."""
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.base_url}/api/generate",
                json={
                    "model": model,
                    "prompt": prompt,
                    "stream": False,
                    "keep_alive": "10m",
                    "options": {
                        "temperature": 0.1,
                        "num_ctx": 2048,
                        "num_predict": 40,
                    },
                },
            )
            response.raise_for_status()
        data: dict[str, Any] = response.json()
        answer = str(data.get("response", "")).strip()
        if not answer:
            raise RuntimeError("The local model returned an empty response")
        return GenerationResult(
            text=answer,
            prompt_tokens=max(int(data.get("prompt_eval_count", 0)), 0),
            output_tokens=max(int(data.get("eval_count", 0)), 0),
        )

    async def embed(
        self, texts: list[str], model: str = "nomic-embed-text"
    ) -> list[list[float]]:
        """Embed text locally, returning no vectors when unavailable."""
        if not texts:
            return []
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/api/embed",
                    json={
                        "model": model,
                        "input": texts,
                        "truncate": True,
                        "keep_alive": "10m",
                    },
                )
                response.raise_for_status()
            embeddings = response.json().get("embeddings", [])
            if (
                not isinstance(embeddings, list)
                or len(embeddings) != len(texts)
                or any(len(vector) != 768 for vector in embeddings)
            ):
                return []
            return [[float(value) for value in vector] for vector in embeddings]
        except (httpx.HTTPError, TypeError, ValueError):
            return []
