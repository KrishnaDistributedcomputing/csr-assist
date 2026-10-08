# Copyright (c) Microsoft Corporation.
# SPDX-License-Identifier: MIT

"""Document reconciliation tests."""

from __future__ import annotations

import sqlite3
from pathlib import Path
from unittest.mock import patch

from csr_assist.database import Database, extract_key_facts, query_terms
from csr_assist.documents import DocumentService, chunk_text


def test_scan_add_change_and_remove(tmp_path: Path) -> None:
    root = tmp_path / "documents"
    root.mkdir()
    database = Database(tmp_path / "index.db")
    database.initialize()
    service = DocumentService(database, root, 1024 * 1024)
    document = root / "policy.txt"

    document.write_text("Returns are accepted for thirty days.", encoding="utf-8")
    assert service.scan()["processed"] == 1
    assert database.search("thirty")

    document.write_text("Returns are accepted for sixty days.", encoding="utf-8")
    service.scan()
    assert not database.search("thirty")
    assert database.search("sixty")
    assert database.search("sixt")

    document.unlink()
    assert service.scan()["removed"] == 1
    assert database.search("sixty") == []


def test_scan_skips_unchanged_documents(tmp_path: Path) -> None:
    root = tmp_path / "documents"
    root.mkdir()
    database = Database(tmp_path / "index.db")
    database.initialize()
    service = DocumentService(database, root, 1024 * 1024)
    (root / "policy.md").write_text("Local policy content.", encoding="utf-8")
    service.scan()
    with patch.object(
        service,
        "_metadata",
        side_effect=AssertionError("unchanged files must not be rehashed"),
    ):
        status = service.scan()
    assert status["unchanged"] == 1
    assert status["errors"] == 0


def test_json_and_xml_are_processed_into_searchable_data(tmp_path: Path) -> None:
    root = tmp_path / "documents"
    root.mkdir()
    database = Database(tmp_path / "index.db")
    database.initialize()
    service = DocumentService(database, root, 1024 * 1024)
    (root / "policy.json").write_text(
        '{"returns": {"window_days": 45, "proof": "receipt required"}}',
        encoding="utf-8",
    )
    (root / "catalog.xml").write_text(
        "<catalog><product sku=\"A-42\"><name>Contoso Router</name>"
        "<support>Premium coverage</support></product></catalog>",
        encoding="utf-8",
    )

    status = service.scan()

    assert status["processed"] == 2
    assert database.search("window_days 45")[0]["name"] == "policy.json"
    assert database.search("Premium coverage")[0]["name"] == "catalog.xml"


def test_xml_rejects_entity_declarations(tmp_path: Path) -> None:
    root = tmp_path / "documents"
    root.mkdir()
    database = Database(tmp_path / "index.db")
    database.initialize()
    service = DocumentService(database, root, 1024 * 1024)
    path = root / "unsafe.xml"
    path.write_text(
        '<!DOCTYPE root [<!ENTITY secret "value">]><root>&secret;</root>',
        encoding="utf-8",
    )

    status = service.scan()

    assert status["errors"] == 1
    assert database.document_by_path("unsafe.xml")["status"] == "error"


def test_chunk_text_is_bounded() -> None:
    chunks = chunk_text("A" * 5000, maximum=1000, overlap=100)
    assert len(chunks) > 1
    assert all(len(chunk) <= 1000 for chunk in chunks)


def test_markdown_chunks_preserve_heading_boundaries(tmp_path: Path) -> None:
    root = tmp_path / "documents"
    root.mkdir()
    database = Database(tmp_path / "index.db")
    database.initialize()
    service = DocumentService(database, root, 1024 * 1024)
    path = root / "requirements.md"
    path.write_text(
        "---\ntitle: Requirements\n---\n\n"
        "## Offline mode requirements\n\nOffline summary.\n\n"
        "### Offline functional requirements\n\n"
        + ("offline-control " * 250)
        + "\n\n## Online mode requirements\n\nOnline summary.\n\n"
        "### Online functional requirements\n\n"
        + ("online-control " * 250),
        encoding="utf-8",
    )

    chunks = service.extract(path)
    offline_chunks = [
        chunk for chunk in chunks if chunk["location"].startswith("Offline")
    ]
    online_chunks = [
        chunk for chunk in chunks if chunk["location"].startswith("Online")
    ]

    assert offline_chunks
    assert online_chunks
    assert all("online-control" not in chunk["text"] for chunk in offline_chunks)
    assert all("offline-control" not in chunk["text"] for chunk in online_chunks)
    assert all(chunk["location"] in chunk["text"] for chunk in chunks)
    assert all("title: Requirements" not in chunk["text"] for chunk in chunks)


def test_query_terms_remove_question_stop_words() -> None:
    assert query_terms("What do returns require?") == ["returns", "require"]


def test_extracts_and_searches_key_facts(tmp_path: Path) -> None:
    facts = extract_key_facts(
        "Returns must include proof of purchase. Processing takes 5 business days."
    )
    assert [fact["category"] for fact in facts] == ["requirement", "timing"]

    database = Database(tmp_path / "index.db")
    database.initialize()
    database.replace_document(
        {
            "relative_path": "policy.txt",
            "name": "policy.txt",
            "extension": ".txt",
            "size_bytes": 80,
            "modified_ns": 1,
            "sha256": "b" * 64,
        },
        [
            {
                "location": "Section 1",
                "text": (
                    "Returns must include proof of purchase. "
                    "Processing takes 5 business days."
                ),
                "extraction": "native",
            }
        ],
    )

    result = database.search("processing days")[0]
    assert result["retrieval"] == "key-fact"
    assert result["text"] == "Processing takes 5 business days."
    assert database.usage_summary()["key_facts"] == 2


def test_cache_is_revision_aware_and_usage_is_aggregated(tmp_path: Path) -> None:
    database = Database(tmp_path / "index.db")
    database.initialize()
    response = {
        "state": "answered",
        "text": "Thirty days [1]",
        "citations": [],
        "sources": [],
        "model": "local-index",
        "cached": False,
    }
    database.store_cached_answer("return policy", "fast", "local-index", response)
    assert database.cached_answer("return policy", "fast", "local-index")

    database.record_usage(
        request_kind="chat",
        mode="fast",
        model="local-index",
        cache_hit=True,
        prompt_tokens=0,
        output_tokens=0,
        latency_ms=12,
    )
    summary = database.usage_summary()
    assert summary["totals"]["requests"] == 1
    assert summary["totals"]["cache_hit_rate"] == 100.0
    assert summary["totals"]["total_tokens"] == 0

    database.replace_document(
        {
            "relative_path": "policy.txt",
            "name": "policy.txt",
            "extension": ".txt",
            "size_bytes": 20,
            "modified_ns": 1,
            "sha256": "c" * 64,
        },
        [{"location": "Section 1", "text": "New policy text.", "extraction": "native"}],
    )
    assert database.cached_answer("return policy", "fast", "local-index") is None


def test_initialize_invalidates_legacy_cache_entries(tmp_path: Path) -> None:
    path = tmp_path / "index.db"
    with sqlite3.connect(path) as db:
        db.execute(
            """
            CREATE TABLE answer_cache (
                cache_key TEXT PRIMARY KEY,
                query TEXT NOT NULL,
                mode TEXT NOT NULL,
                model TEXT NOT NULL,
                corpus_revision INTEGER NOT NULL,
                response_json TEXT NOT NULL,
                hits INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_hit_at TEXT
            )
            """
        )
        db.execute(
            """
            INSERT INTO answer_cache(
                cache_key, query, mode, model, corpus_revision, response_json
            ) VALUES ('old', 'query', 'fast', 'local-index', 1, '{}')
            """
        )

    database = Database(path)
    database.initialize()

    assert database.usage_summary()["cached_answers"] == 0


def test_vector_index_and_persistent_history(tmp_path: Path) -> None:
    database = Database(tmp_path / "index.db")
    database.initialize()
    document_id = database.replace_document(
        {
            "relative_path": "policy.txt",
            "name": "policy.txt",
            "extension": ".txt",
            "size_bytes": 20,
            "modified_ns": 1,
            "sha256": "a" * 64,
        },
        [{"location": "Section 1", "text": "Return policy", "extraction": "native"}],
    )
    chunk = database.chunks_without_vectors()[0]
    database.store_vectors([chunk["chunk_id"]], [[0.1] * 768])

    matches = database.vector_search([0.1] * 768)
    assert matches[0]["document_id"] == document_id
    assert database.vector_count() == 1

    database.add_history(
        "chat",
        "What is the return policy?",
        response_text="Thirty days [1]",
        response_state="answered",
        model="phi3:mini",
        sources=matches,
    )
    history = database.list_history()
    assert history[0]["query"] == "What is the return policy?"
    assert history[0]["sources"][0]["name"] == "policy.txt"
    assert database.clear_history() == 1
    assert database.list_history() == []
