# Copyright (c) Microsoft Corporation.
# SPDX-License-Identifier: MIT

"""Typed API contracts."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    """A user request to Mira."""

    message: str = Field(min_length=1, max_length=4000)
    mode: Literal["fast", "generated"] = "fast"
    source: Literal["offline", "online"] = "offline"
    model: str | None = Field(default=None, min_length=1, max_length=100)


class ModelSelection(BaseModel):
    """An approved model activation request."""

    model: str = Field(min_length=1, max_length=100)


class ModelConfig(BaseModel):
    """Editable approved model entry."""

    id: str
    provider: Literal[
        "Microsoft",
        "Meta",
        "Alibaba",
        "Google",
        "Hugging Face",
    ]
    name: str = Field(min_length=1, max_length=100)


class ResponseFeedback(BaseModel):
    """A local quality rating for a persisted Mira response."""

    history_id: int = Field(gt=0)
    rating: Literal["good", "bad"]
    reason: str = Field(default="", max_length=500)


class SettingsUpdate(BaseModel):
    """Editable administrator settings."""

    active_model: str
    allowed_models: list[ModelConfig]
    persona: str = Field(min_length=1, max_length=12_000)
