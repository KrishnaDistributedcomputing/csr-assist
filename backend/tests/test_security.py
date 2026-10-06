# Copyright (c) Microsoft Corporation.
# SPDX-License-Identifier: MIT

"""Security boundary tests."""

from __future__ import annotations

from pathlib import Path

import pytest

from csr_assist.security import confined_path, validate_filename


def test_rejects_traversal(tmp_path: Path) -> None:
    root = tmp_path / "documents"
    root.mkdir()
    with pytest.raises(ValueError, match="escapes"):
        confined_path(root, "../secret.txt")


def test_rejects_absolute_outside_path(tmp_path: Path) -> None:
    root = tmp_path / "documents"
    root.mkdir()
    with pytest.raises(ValueError, match="escapes"):
        confined_path(root, tmp_path / "secret.txt")


@pytest.mark.parametrize("name", ["../bad.txt", "bad.exe", "bad<script>.txt"])
def test_rejects_unsafe_upload_names(name: str) -> None:
    with pytest.raises(ValueError):
        validate_filename(name)


def test_accepts_supported_basename() -> None:
    assert validate_filename("Support Policy 2026.pdf") == "Support Policy 2026.pdf"


@pytest.mark.parametrize("name", ["policy.json", "catalog.xml", "notes.txt"])
def test_accepts_structured_and_text_documents(name: str) -> None:
    assert validate_filename(name) == name
