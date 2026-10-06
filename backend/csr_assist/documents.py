# Copyright (c) Microsoft Corporation.
# SPDX-License-Identifier: MIT

"""Local document extraction, OCR, chunking, and scan reconciliation."""

from __future__ import annotations

import csv
import hashlib
import io
import json
import logging
import re
import xml.etree.ElementTree as ElementTree
from dataclasses import asdict, dataclass
from pathlib import Path
from threading import Lock
from typing import Any
from uuid import uuid4

import pymupdf
import pytesseract
from docx import Document as DocxDocument
from PIL import Image

from csr_assist.database import Database
from csr_assist.security import SUPPORTED_EXTENSIONS, validate_document_file

logger = logging.getLogger(__name__)
MAX_STRUCTURED_FIELDS = 100_000
MAX_STRUCTURED_DEPTH = 64


@dataclass
class ScanStatus:
    """Mutable scan operation state."""

    id: str = ""
    state: str = "idle"
    discovered: int = 0
    processed: int = 0
    unchanged: int = 0
    removed: int = 0
    errors: int = 0


class DocumentService:
    """Indexes documents from one confined local root."""

    def __init__(self, database: Database, root: Path, max_size: int) -> None:
        self.database = database
        self.root = root
        self.max_size = max_size
        self._scan_lock = Lock()
        self._status_lock = Lock()
        self._status = ScanStatus()

    def status(self) -> dict[str, Any]:
        """Return a snapshot of scan status."""
        with self._status_lock:
            return asdict(self._status)

    def scan(self) -> dict[str, Any]:
        """Reconcile the complete managed directory."""
        if not self._scan_lock.acquire(blocking=False):
            return self.status()
        try:
            with self._status_lock:
                self._status = ScanStatus(id=str(uuid4()), state="running")
            present: set[str] = set()
            candidates = sorted(
                path
                for path in self.root.rglob("*")
                if path.is_file()
                and not path.is_symlink()
                and path.suffix.lower() in SUPPORTED_EXTENSIONS
            )
            self._set(discovered=len(candidates))
            for path in candidates:
                relative = path.relative_to(self.root).as_posix()
                present.add(relative)
                try:
                    previous = self.database.document_by_path(relative)
                    stat = path.stat()
                    if (
                        previous
                        and previous["status"] == "ready"
                        and previous["size_bytes"] == stat.st_size
                        and previous["modified_ns"] == stat.st_mtime_ns
                    ):
                        self._increment("unchanged")
                        continue
                    metadata = self._metadata(path, relative)
                    if (
                        previous
                        and previous["status"] == "ready"
                        and previous["sha256"] == metadata["sha256"]
                    ):
                        self._increment("unchanged")
                        continue
                    chunks = self.extract(path)
                    if not chunks:
                        raise ValueError("No searchable text was extracted")
                    self.database.replace_document(metadata, chunks)
                    self._increment("processed")
                except Exception as exc:
                    logger.warning("Document processing failed for %s: %s", relative, exc)
                    fallback = self._fallback_metadata(path, relative)
                    self.database.mark_error(fallback, str(exc))
                    self._increment("errors")
            self._set(removed=self.database.remove_missing(present))
            final_state = (
                "completed-errors" if self.status()["errors"] else "completed"
            )
            self._set(state=final_state)
            return self.status()
        finally:
            self._scan_lock.release()

    def extract(self, path: Path) -> list[dict[str, str]]:
        """Extract and chunk one supported file."""
        safe = validate_document_file(self.root, path, self.max_size)
        suffix = safe.suffix.lower()
        sections: list[tuple[str, str, str]]
        if suffix in {".txt", ".md", ".markdown"}:
            sections = [("Section 1", safe.read_text(encoding="utf-8"), "native")]
        elif suffix == ".csv":
            sections = [("Rows", self._extract_csv(safe), "native")]
        elif suffix == ".json":
            sections = [("JSON fields", self._extract_json(safe), "structured")]
        elif suffix == ".xml":
            sections = [("XML elements", self._extract_xml(safe), "structured")]
        elif suffix == ".docx":
            document = DocxDocument(safe)
            text = "\n\n".join(
                paragraph.text for paragraph in document.paragraphs if paragraph.text
            )
            sections = [("Document", text, "native")]
        elif suffix == ".pdf":
            sections = self._extract_pdf(safe)
        elif suffix in {".png", ".jpg", ".jpeg", ".tif", ".tiff"}:
            with Image.open(safe) as image:
                text = pytesseract.image_to_string(image)
            sections = [("Image", text, "ocr")]
        else:
            raise ValueError("Unsupported file extension")
        chunks: list[dict[str, str]] = []
        for location, text, extraction in sections:
            for chunk in chunk_text(text):
                chunks.append(
                    {"location": location, "text": chunk, "extraction": extraction}
                )
        return chunks

    def _extract_pdf(self, path: Path) -> list[tuple[str, str, str]]:
        sections: list[tuple[str, str, str]] = []
        with pymupdf.open(path) as document:
            if document.needs_pass:
                raise ValueError("Encrypted PDF files are not supported")
            for index, page in enumerate(document):
                text = page.get_text("text").strip()
                extraction = "native"
                if not text:
                    pixmap = page.get_pixmap(matrix=pymupdf.Matrix(2, 2), alpha=False)
                    image = Image.open(io.BytesIO(pixmap.tobytes("png")))
                    text = pytesseract.image_to_string(image).strip()
                    extraction = "ocr"
                sections.append((f"Page {index + 1}", text, extraction))
        return sections

    @staticmethod
    def _extract_csv(path: Path) -> str:
        with path.open("r", encoding="utf-8-sig", newline="") as stream:
            return "\n".join(" | ".join(row) for row in csv.reader(stream))

    @staticmethod
    def _extract_json(path: Path) -> str:
        with path.open("r", encoding="utf-8-sig") as stream:
            document = json.load(stream)
        lines: list[str] = []
        stack: list[tuple[str, Any, int]] = [("$", document, 0)]
        while stack:
            field_path, value, depth = stack.pop()
            if depth > MAX_STRUCTURED_DEPTH:
                raise ValueError("JSON nesting exceeds the supported depth")
            if isinstance(value, dict):
                stack.extend(
                    (f"{field_path}.{key}", item, depth + 1)
                    for key, item in reversed(list(value.items()))
                )
            elif isinstance(value, list):
                stack.extend(
                    (f"{field_path}[{index}]", item, depth + 1)
                    for index, item in reversed(list(enumerate(value)))
                )
            else:
                rendered = json.dumps(value, ensure_ascii=False)
                lines.append(f"{field_path}: {rendered}")
                if len(lines) > MAX_STRUCTURED_FIELDS:
                    raise ValueError("JSON contains too many searchable fields")
        return "\n".join(lines)

    @staticmethod
    def _extract_xml(path: Path) -> str:
        source = path.read_text(encoding="utf-8-sig")
        if re.search(r"<!\s*(DOCTYPE|ENTITY)\b", source, re.IGNORECASE):
            raise ValueError("XML document type and entity declarations are unsupported")
        try:
            root = ElementTree.fromstring(source)
        except ElementTree.ParseError as exc:
            raise ValueError(f"Invalid XML: {exc}") from exc

        def local_name(name: str) -> str:
            return name.rsplit("}", 1)[-1]

        lines: list[str] = []
        stack: list[tuple[ElementTree.Element, str, int]] = [
            (root, f"/{local_name(root.tag)}", 0)
        ]
        while stack:
            element, element_path, depth = stack.pop()
            if depth > MAX_STRUCTURED_DEPTH:
                raise ValueError("XML nesting exceeds the supported depth")
            for name, value in element.attrib.items():
                lines.append(f"{element_path}/@{local_name(name)}: {value}")
            text = (element.text or "").strip()
            if text:
                lines.append(f"{element_path}: {text}")
            children = list(element)
            stack.extend(
                (
                    child,
                    f"{element_path}/{local_name(child.tag)}",
                    depth + 1,
                )
                for child in reversed(children)
            )
            if len(lines) > MAX_STRUCTURED_FIELDS:
                raise ValueError("XML contains too many searchable fields")
        return "\n".join(lines)

    def _metadata(self, path: Path, relative: str) -> dict[str, Any]:
        safe = validate_document_file(self.root, path, self.max_size)
        stat = safe.stat()
        digest = hashlib.sha256()
        with safe.open("rb") as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(block)
        return {
            "relative_path": relative,
            "name": safe.name,
            "extension": safe.suffix.lower(),
            "size_bytes": stat.st_size,
            "modified_ns": stat.st_mtime_ns,
            "sha256": digest.hexdigest(),
        }

    def _fallback_metadata(self, path: Path, relative: str) -> dict[str, Any]:
        try:
            return self._metadata(path, relative)
        except Exception:
            stat = path.stat()
            return {
                "relative_path": relative,
                "name": path.name,
                "extension": path.suffix.lower(),
                "size_bytes": stat.st_size,
                "modified_ns": stat.st_mtime_ns,
                "sha256": "0" * 64,
            }

    def _set(self, **values: Any) -> None:
        with self._status_lock:
            for key, value in values.items():
                setattr(self._status, key, value)

    def _increment(self, field: str) -> None:
        with self._status_lock:
            setattr(self._status, field, getattr(self._status, field) + 1)


def chunk_text(text: str, maximum: int = 1400, overlap: int = 180) -> list[str]:
    """Create paragraph-aware chunks with bounded overlap."""
    normalized = "\n".join(line.strip() for line in text.splitlines()).strip()
    if not normalized:
        return []
    paragraphs = [item.strip() for item in normalized.split("\n\n") if item.strip()]
    if not paragraphs:
        paragraphs = [normalized]
    chunks: list[str] = []
    current = ""
    for paragraph in paragraphs:
        remaining = paragraph
        while remaining:
            capacity = maximum - len(current) - (2 if current else 0)
            if capacity <= 0:
                chunks.append(current)
                current = current[-overlap:] if overlap else ""
                continue
            segment = remaining[:capacity]
            remaining = remaining[capacity:]
            current = f"{current}\n\n{segment}".strip()
            if len(current) >= maximum:
                chunks.append(current)
                current = current[-overlap:] if overlap else ""
    if current and (not chunks or current != chunks[-1]):
        chunks.append(current)
    return chunks
