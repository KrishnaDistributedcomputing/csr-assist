# Copyright (c) Microsoft Corporation.
# SPDX-License-Identifier: MIT

"""Filesystem and upload security boundaries."""

from __future__ import annotations

import re
from pathlib import Path

SUPPORTED_EXTENSIONS = {
    ".pdf",
    ".docx",
    ".txt",
    ".md",
    ".markdown",
    ".csv",
    ".json",
    ".xml",
    ".png",
    ".jpg",
    ".jpeg",
    ".tif",
    ".tiff",
}
SAFE_FILENAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._ -]{0,199}$")


def confined_path(root: Path, candidate: Path | str) -> Path:
    """Resolve a path and ensure it remains inside the document root."""
    resolved_root = root.resolve(strict=True)
    supplied = Path(candidate)
    joined = supplied if supplied.is_absolute() else resolved_root / supplied
    resolved = joined.resolve(strict=False)
    if resolved == resolved_root or resolved_root not in resolved.parents:
        raise ValueError("Path escapes the managed document directory")
    return resolved


def validate_filename(filename: str) -> str:
    """Validate and return a safe upload basename."""
    if (
        not filename
        or filename != Path(filename).name
        or not SAFE_FILENAME.fullmatch(filename)
    ):
        raise ValueError("Filename contains unsupported characters")
    if Path(filename).suffix.lower() not in SUPPORTED_EXTENSIONS:
        raise ValueError("Unsupported file extension")
    return filename


def validate_document_file(root: Path, path: Path, max_size: int) -> Path:
    """Validate a discovered document before reading it."""
    safe = confined_path(root, path)
    if safe.is_symlink() or not safe.is_file():
        raise ValueError("Document must be a regular non-symlink file")
    if safe.stat().st_size > max_size:
        raise ValueError(f"Document exceeds the {max_size} byte limit")
    if safe.suffix.lower() not in SUPPORTED_EXTENSIONS:
        raise ValueError("Unsupported file extension")
    return safe
