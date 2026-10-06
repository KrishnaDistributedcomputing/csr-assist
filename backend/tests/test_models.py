# Copyright (c) Microsoft Corporation.
# SPDX-License-Identifier: MIT

"""Approved local model tests."""

from __future__ import annotations

import json

import pytest

from csr_assist.config import ConfigStore, Settings


def test_includes_fast_local_model(settings: Settings) -> None:
    store = ConfigStore(settings)
    assert "llama3.2:1b" in {
        model["id"] for model in store.read()["allowed_models"]
    }


def test_includes_additional_cpu_friendly_models(settings: Settings) -> None:
    store = ConfigStore(settings)
    models = {model["id"]: model["provider"] for model in store.read()["allowed_models"]}

    assert models["qwen2.5:1.5b"] == "Alibaba"
    assert models["gemma3:1b"] == "Google"
    assert models["smollm2:1.7b"] == "Hugging Face"


def test_read_adds_new_default_to_persisted_allowlist(settings: Settings) -> None:
    store = ConfigStore(settings)
    settings.config_dir.mkdir(parents=True)
    store.path.write_text(
        json.dumps(
            {
                "active_model": "phi3:mini",
                "allowed_models": [
                    {
                        "id": "phi3:mini",
                        "provider": "Microsoft",
                        "name": "Phi-3 Mini",
                    },
                    {
                        "id": "llama3.2:3b",
                        "provider": "Meta",
                        "name": "Llama 3.2 3B",
                    },
                ],
                "persona": "Mira",
            }
        ),
        encoding="utf-8",
    )

    assert "llama3.2:1b" in {
        model["id"] for model in store.read()["allowed_models"]
    }


def test_rejects_remote_model(settings: Settings) -> None:
    store = ConfigStore(settings)
    data = store.read()
    data["allowed_models"].append(
        {"id": "https://remote.example/model", "provider": "Meta", "name": "Remote"}
    )
    with pytest.raises(ValueError, match="approved local"):
        store.write(data)


def test_allows_additional_phi_model(settings: Settings) -> None:
    store = ConfigStore(settings)
    data = store.read()
    data["allowed_models"].append(
        {"id": "phi4:mini", "provider": "Microsoft", "name": "Phi 4 Mini"}
    )
    assert store.write(data)["allowed_models"][-1]["id"] == "phi4:mini"
