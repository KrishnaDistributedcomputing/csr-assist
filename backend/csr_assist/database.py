# Copyright (c) Microsoft Corporation.
# SPDX-License-Identifier: MIT

"""SQLite storage and FTS5 retrieval."""

from __future__ import annotations

import json
import hashlib
import re
import sqlite3
from collections.abc import Iterable
from pathlib import Path
from threading import RLock
from typing import Any

import sqlite_vec

SEARCH_STOP_WORDS = frozenset(
    {
        "a",
        "about",
        "an",
        "and",
        "are",
        "can",
        "could",
        "do",
        "does",
        "for",
        "how",
        "in",
        "is",
        "it",
        "my",
        "of",
        "or",
        "our",
        "please",
        "should",
        "that",
        "the",
        "this",
        "to",
        "what",
        "when",
        "where",
        "who",
        "why",
        "with",
        "would",
        "your",
    }
)
FACT_CATEGORY_PATTERNS = {
    "requirement": re.compile(
        r"\b(must|shall|required?|need(?:s|ed)? to|should|cannot|may not)\b",
        re.IGNORECASE,
    ),
    "timing": re.compile(
        r"\b(\d+\s+(?:business\s+)?(?:days?|weeks?|months?)|deadline|within|before|after)\b",
        re.IGNORECASE,
    ),
    "contact": re.compile(
        r"\b(contact|email|phone|call|escalat(?:e|ed|ion))\b",
        re.IGNORECASE,
    ),
}
ANSWER_CACHE_VERSION = 2


def query_terms(query: str) -> list[str]:
    """Return distinct searchable terms, preferring meaningful words."""
    raw_terms = list(dict.fromkeys(re.findall(r"\w+", query.lower(), flags=re.UNICODE)))
    meaningful = [term for term in raw_terms if term not in SEARCH_STOP_WORDS]
    return meaningful or raw_terms


def extract_key_facts(text: str, limit: int = 24) -> list[dict[str, str]]:
    """Extract concise sentence-level facts from a document chunk."""
    if text.startswith("---"):
        parts = text.split("---", 2)
        if len(parts) == 3:
            text = parts[2]
    text = re.sub(r"(?m)^#{1,6}\s+.*$", " ", text)
    normalized = re.sub(r"\s+", " ", text).strip()
    if not normalized:
        return []
    facts: list[dict[str, str]] = []
    seen: set[str] = set()
    for sentence in re.split(r"(?<=[.!?])\s+", normalized):
        sentence = sentence.strip()
        if not 20 <= len(sentence) <= 700:
            continue
        fingerprint = sentence.casefold()
        if fingerprint in seen:
            continue
        category = "general"
        for candidate, pattern in FACT_CATEGORY_PATTERNS.items():
            if pattern.search(sentence):
                category = candidate
                break
        facts.append({"text": sentence, "category": category})
        seen.add(fingerprint)
        if len(facts) == limit:
            break
    return facts


class Database:
    """Owns document metadata, chunks, and keyword retrieval."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self._lock = RLock()

    def connect(self) -> sqlite3.Connection:
        """Create a configured database connection."""
        connection = sqlite3.connect(self.path, check_same_thread=False)
        connection.row_factory = sqlite3.Row
        connection.enable_load_extension(True)
        sqlite_vec.load(connection)
        connection.enable_load_extension(False)
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 5000")
        return connection

    def initialize(self) -> None:
        """Create application and FTS tables."""
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute("PRAGMA journal_mode = WAL")
            db.executescript(
                """
                CREATE TABLE IF NOT EXISTS documents (
                    id INTEGER PRIMARY KEY,
                    relative_path TEXT NOT NULL UNIQUE,
                    name TEXT NOT NULL,
                    extension TEXT NOT NULL,
                    size_bytes INTEGER NOT NULL,
                    modified_ns INTEGER NOT NULL,
                    sha256 TEXT NOT NULL,
                    status TEXT NOT NULL,
                    error TEXT,
                    chunk_count INTEGER NOT NULL DEFAULT 0,
                    indexed_at TEXT
                );
                CREATE TABLE IF NOT EXISTS chunks (
                    id INTEGER PRIMARY KEY,
                    document_id INTEGER NOT NULL REFERENCES documents(id)
                        ON DELETE CASCADE,
                    ordinal INTEGER NOT NULL,
                    location TEXT NOT NULL,
                    text TEXT NOT NULL,
                    extraction TEXT NOT NULL,
                    UNIQUE(document_id, ordinal)
                );
                CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
                    text, document_name, relative_path, tokenize='unicode61'
                );
                CREATE VIRTUAL TABLE IF NOT EXISTS chunk_vectors USING vec0(
                    embedding float[768]
                );
                CREATE TABLE IF NOT EXISTS key_facts (
                    id INTEGER PRIMARY KEY,
                    document_id INTEGER NOT NULL REFERENCES documents(id)
                        ON DELETE CASCADE,
                    chunk_id INTEGER NOT NULL REFERENCES chunks(id)
                        ON DELETE CASCADE,
                    ordinal INTEGER NOT NULL,
                    category TEXT NOT NULL,
                    text TEXT NOT NULL,
                    UNIQUE(chunk_id, ordinal)
                );
                CREATE VIRTUAL TABLE IF NOT EXISTS key_facts_fts USING fts5(
                    text, content='key_facts', content_rowid='id',
                    tokenize='unicode61'
                );
                CREATE TRIGGER IF NOT EXISTS key_facts_ai AFTER INSERT ON key_facts
                BEGIN
                    INSERT INTO key_facts_fts(rowid, text)
                    VALUES (new.id, new.text);
                END;
                CREATE TRIGGER IF NOT EXISTS key_facts_ad AFTER DELETE ON key_facts
                BEGIN
                    INSERT INTO key_facts_fts(key_facts_fts, rowid, text)
                    VALUES ('delete', old.id, old.text);
                END;
                CREATE TABLE IF NOT EXISTS index_state (
                    key TEXT PRIMARY KEY,
                    value INTEGER NOT NULL
                );
                INSERT OR IGNORE INTO index_state(key, value)
                VALUES ('corpus_revision', 1);
                CREATE TABLE IF NOT EXISTS answer_cache (
                    cache_key TEXT PRIMARY KEY,
                    cache_version INTEGER NOT NULL DEFAULT 2,
                    query TEXT NOT NULL,
                    mode TEXT NOT NULL,
                    model TEXT NOT NULL,
                    corpus_revision INTEGER NOT NULL,
                    response_json TEXT NOT NULL,
                    hits INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    last_hit_at TEXT
                );
                CREATE TABLE IF NOT EXISTS usage_events (
                    id INTEGER PRIMARY KEY,
                    request_kind TEXT NOT NULL,
                    mode TEXT NOT NULL,
                    model TEXT NOT NULL,
                    cache_hit INTEGER NOT NULL CHECK(cache_hit IN (0, 1)),
                    prompt_tokens INTEGER NOT NULL DEFAULT 0,
                    output_tokens INTEGER NOT NULL DEFAULT 0,
                    latency_ms INTEGER NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
                CREATE TABLE IF NOT EXISTS response_feedback (
                    id INTEGER PRIMARY KEY,
                    history_id INTEGER NOT NULL UNIQUE REFERENCES history(id)
                        ON DELETE CASCADE,
                    rating TEXT NOT NULL CHECK(rating IN ('good', 'bad')),
                    reason TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
                CREATE TABLE IF NOT EXISTS source_feedback (
                    chunk_id INTEGER PRIMARY KEY REFERENCES chunks(id)
                        ON DELETE CASCADE,
                    helpful INTEGER NOT NULL DEFAULT 0,
                    unhelpful INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS history (
                    id INTEGER PRIMARY KEY,
                    kind TEXT NOT NULL CHECK(kind IN ('search', 'chat')),
                    query TEXT NOT NULL,
                    response_text TEXT,
                    response_state TEXT,
                    model TEXT,
                    sources_json TEXT NOT NULL DEFAULT '[]',
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
                """
            )
            cache_columns = {
                str(row["name"])
                for row in db.execute("PRAGMA table_info(answer_cache)")
            }
            if "cache_version" not in cache_columns:
                db.execute(
                    "ALTER TABLE answer_cache "
                    "ADD COLUMN cache_version INTEGER NOT NULL DEFAULT 1"
                )
            db.execute(
                "DELETE FROM answer_cache WHERE cache_version != ?",
                (ANSWER_CACHE_VERSION,),
            )
            if self._backfill_key_facts(db):
                self._bump_revision(db)

    def list_documents(self) -> list[dict[str, Any]]:
        """Return document status ordered by relative path."""
        with self.connect() as db:
            rows = db.execute(
                "SELECT * FROM documents ORDER BY relative_path"
            ).fetchall()
        return [dict(row) for row in rows]

    def document_by_path(self, relative_path: str) -> dict[str, Any] | None:
        """Return one document by relative path."""
        with self.connect() as db:
            row = db.execute(
                "SELECT * FROM documents WHERE relative_path = ?",
                (relative_path,),
            ).fetchone()
        return dict(row) if row else None

    def replace_document(
        self,
        metadata: dict[str, Any],
        chunks: Iterable[dict[str, str]],
    ) -> int:
        """Replace metadata and chunks atomically."""
        materialized = list(chunks)
        with self._lock, self.connect() as db:
            existing = db.execute(
                "SELECT id FROM documents WHERE relative_path = ?",
                (metadata["relative_path"],),
            ).fetchone()
            if existing:
                document_id = int(existing["id"])
                old_ids = [
                    row["id"]
                    for row in db.execute(
                        "SELECT id FROM chunks WHERE document_id = ?",
                        (document_id,),
                    )
                ]
                for chunk_id in old_ids:
                    db.execute("DELETE FROM chunks_fts WHERE rowid = ?", (chunk_id,))
                    db.execute(
                        "DELETE FROM chunk_vectors WHERE rowid = ?", (chunk_id,)
                    )
                db.execute("DELETE FROM chunks WHERE document_id = ?", (document_id,))
                db.execute(
                    """
                    UPDATE documents SET name=?, extension=?, size_bytes=?,
                    modified_ns=?, sha256=?, status='ready', error=NULL,
                    chunk_count=?, indexed_at=CURRENT_TIMESTAMP WHERE id=?
                    """,
                    (
                        metadata["name"],
                        metadata["extension"],
                        metadata["size_bytes"],
                        metadata["modified_ns"],
                        metadata["sha256"],
                        len(materialized),
                        document_id,
                    ),
                )
            else:
                cursor = db.execute(
                    """
                    INSERT INTO documents (
                        relative_path, name, extension, size_bytes, modified_ns,
                        sha256, status, chunk_count, indexed_at
                    ) VALUES (?, ?, ?, ?, ?, ?, 'ready', ?, CURRENT_TIMESTAMP)
                    """,
                    (
                        metadata["relative_path"],
                        metadata["name"],
                        metadata["extension"],
                        metadata["size_bytes"],
                        metadata["modified_ns"],
                        metadata["sha256"],
                        len(materialized),
                    ),
                )
                document_id = int(cursor.lastrowid)
            for ordinal, chunk in enumerate(materialized):
                cursor = db.execute(
                    """
                    INSERT INTO chunks(document_id, ordinal, location, text, extraction)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        document_id,
                        ordinal,
                        chunk["location"],
                        chunk["text"],
                        chunk["extraction"],
                    ),
                )
                db.execute(
                    """
                    INSERT INTO chunks_fts(rowid, text, document_name, relative_path)
                    VALUES (?, ?, ?, ?)
                    """,
                    (
                        cursor.lastrowid,
                        chunk["text"],
                        metadata["name"],
                        metadata["relative_path"],
                    ),
                )
                self._insert_key_facts(
                    db,
                    document_id,
                    int(cursor.lastrowid),
                    chunk["text"],
                )
            self._bump_revision(db)
        return document_id

    @staticmethod
    def _insert_key_facts(
        db: sqlite3.Connection,
        document_id: int,
        chunk_id: int,
        text: str,
    ) -> int:
        facts = extract_key_facts(text)
        db.executemany(
            """
            INSERT INTO key_facts(document_id, chunk_id, ordinal, category, text)
            VALUES (?, ?, ?, ?, ?)
            """,
            [
                (
                    document_id,
                    chunk_id,
                    ordinal,
                    fact["category"],
                    fact["text"],
                )
                for ordinal, fact in enumerate(facts)
            ],
        )
        return len(facts)

    def _backfill_key_facts(self, db: sqlite3.Connection) -> int:
        rows = db.execute(
            """
            SELECT c.id AS chunk_id, c.document_id, c.text
            FROM chunks c
            LEFT JOIN key_facts f ON f.chunk_id = c.id
            WHERE f.id IS NULL
            """
        ).fetchall()
        return sum(
            self._insert_key_facts(
                db,
                int(row["document_id"]),
                int(row["chunk_id"]),
                str(row["text"]),
            )
            for row in rows
        )

    @staticmethod
    def _bump_revision(db: sqlite3.Connection) -> None:
        db.execute(
            "UPDATE index_state SET value = value + 1 WHERE key = 'corpus_revision'"
        )
        db.execute("DELETE FROM answer_cache")

    def mark_error(self, metadata: dict[str, Any], message: str) -> None:
        """Remove stale chunks and record a safe processing error."""
        with self._lock, self.connect() as db:
            existing = db.execute(
                "SELECT id FROM documents WHERE relative_path = ?",
                (metadata["relative_path"],),
            ).fetchone()
            if existing:
                document_id = int(existing["id"])
                db.execute(
                    "DELETE FROM chunks_fts WHERE rowid IN "
                    "(SELECT id FROM chunks WHERE document_id = ?)",
                    (document_id,),
                )
                db.execute(
                    "DELETE FROM chunk_vectors WHERE rowid IN "
                    "(SELECT id FROM chunks WHERE document_id = ?)",
                    (document_id,),
                )
                db.execute("DELETE FROM chunks WHERE document_id = ?", (document_id,))
                db.execute(
                    """
                    UPDATE documents SET name=?, extension=?, size_bytes=?,
                    modified_ns=?, sha256=?, status='error', error=?,
                    chunk_count=0, indexed_at=NULL WHERE id=?
                    """,
                    (
                        metadata["name"],
                        metadata["extension"],
                        metadata["size_bytes"],
                        metadata["modified_ns"],
                        metadata["sha256"],
                        message[:500],
                        document_id,
                    ),
                )
                self._bump_revision(db)
            else:
                db.execute(
                    """
                    INSERT INTO documents (
                        relative_path, name, extension, size_bytes, modified_ns,
                        sha256, status, error
                    ) VALUES (?, ?, ?, ?, ?, ?, 'error', ?)
                    """,
                    (
                        metadata["relative_path"],
                        metadata["name"],
                        metadata["extension"],
                        metadata["size_bytes"],
                        metadata["modified_ns"],
                        metadata["sha256"],
                        message[:500],
                    ),
                )
                self._bump_revision(db)

    def remove_missing(self, present_paths: set[str]) -> int:
        """Delete documents no longer present in the managed root."""
        with self._lock, self.connect() as db:
            rows = db.execute("SELECT id, relative_path FROM documents").fetchall()
            missing = [row["id"] for row in rows if row["relative_path"] not in present_paths]
            for document_id in missing:
                db.execute(
                    "DELETE FROM chunks_fts WHERE rowid IN "
                    "(SELECT id FROM chunks WHERE document_id = ?)",
                    (document_id,),
                )
                db.execute(
                    "DELETE FROM chunk_vectors WHERE rowid IN "
                    "(SELECT id FROM chunks WHERE document_id = ?)",
                    (document_id,),
                )
                db.execute("DELETE FROM documents WHERE id = ?", (document_id,))
            if missing:
                self._bump_revision(db)
        return len(missing)

    def search(self, query: str, limit: int = 8) -> list[dict[str, Any]]:
        """Search extracted key facts first, then fill from full chunks."""
        terms = query_terms(query)
        if not terms:
            return []
        expression = " OR ".join(
            f'"{term}"*' if len(term) >= 3 else f'"{term}"' for term in terms
        )
        with self.connect() as db:
            fact_rows = db.execute(
                """
                SELECT c.id AS chunk_id, d.id AS document_id, d.name,
                       d.relative_path, c.location, f.text, c.extraction,
                       f.category, bm25(key_facts_fts) AS score,
                       COALESCE(sf.helpful, 0) - COALESCE(sf.unhelpful, 0)
                           AS feedback_score
                FROM key_facts_fts
                JOIN key_facts f ON f.id = key_facts_fts.rowid
                JOIN chunks c ON c.id = f.chunk_id
                JOIN documents d ON d.id = f.document_id
                LEFT JOIN source_feedback sf ON sf.chunk_id = c.id
                WHERE key_facts_fts MATCH ?
                ORDER BY feedback_score DESC, score LIMIT ?
                """,
                (expression, limit * 3),
            ).fetchall()
            chunk_rows = db.execute(
                """
                SELECT c.id AS chunk_id, d.id AS document_id, d.name,
                       d.relative_path, c.location, c.text, c.extraction,
                       bm25(chunks_fts) AS score,
                       COALESCE(sf.helpful, 0) - COALESCE(sf.unhelpful, 0)
                           AS feedback_score
                FROM chunks_fts
                JOIN chunks c ON c.id = chunks_fts.rowid
                JOIN documents d ON d.id = c.document_id
                LEFT JOIN source_feedback sf ON sf.chunk_id = c.id
                WHERE chunks_fts MATCH ?
                ORDER BY feedback_score DESC, score LIMIT ?
                """,
                (expression, limit),
            ).fetchall()
        results: dict[int, dict[str, Any]] = {}
        for row in fact_rows:
            item = dict(row)
            item["retrieval"] = "key-fact"
            results.setdefault(int(item["chunk_id"]), item)
            if len(results) == limit:
                return list(results.values())
        for row in chunk_rows:
            item = dict(row)
            item["retrieval"] = "keyword"
            results.setdefault(int(item["chunk_id"]), item)
            if len(results) == limit:
                break
        return list(results.values())

    def get_chunk(self, document_id: int, chunk_id: int) -> dict[str, Any] | None:
        """Return a chunk only when it belongs to the requested document."""
        with self.connect() as db:
            row = db.execute(
                """
                SELECT c.id AS chunk_id, d.id AS document_id, d.name,
                       d.relative_path, c.location, c.text, c.extraction
                FROM chunks c JOIN documents d ON d.id = c.document_id
                WHERE d.id = ? AND c.id = ?
                """,
                (document_id, chunk_id),
            ).fetchone()
        return dict(row) if row else None

    def chunks_without_vectors(self, limit: int = 32) -> list[dict[str, Any]]:
        """Return ready chunks that do not yet have embeddings."""
        with self.connect() as db:
            rows = db.execute(
                """
                SELECT c.id AS chunk_id, c.text
                FROM chunks c
                LEFT JOIN chunk_vectors v ON v.rowid = c.id
                WHERE v.rowid IS NULL
                ORDER BY c.id
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [dict(row) for row in rows]

    def store_vectors(
        self, chunk_ids: list[int], embeddings: list[list[float]]
    ) -> None:
        """Persist vectors for the corresponding chunks."""
        if len(chunk_ids) != len(embeddings):
            raise ValueError("Chunk and embedding counts do not match")
        with self._lock, self.connect() as db:
            for chunk_id, embedding in zip(chunk_ids, embeddings, strict=True):
                if len(embedding) != 768:
                    raise ValueError("nomic-embed-text must return 768 dimensions")
                db.execute(
                    "INSERT INTO chunk_vectors(rowid, embedding) VALUES (?, ?)",
                    (chunk_id, sqlite_vec.serialize_float32(embedding)),
                )

    def vector_search(
        self, embedding: list[float], limit: int = 8
    ) -> list[dict[str, Any]]:
        """Return nearest chunks from the local vector index."""
        if len(embedding) != 768:
            return []
        with self.connect() as db:
            rows = db.execute(
                """
                SELECT c.id AS chunk_id, d.id AS document_id, d.name,
                       d.relative_path, c.location, c.text, c.extraction,
                       v.distance,
                       COALESCE(sf.helpful, 0) - COALESCE(sf.unhelpful, 0)
                           AS feedback_score
                FROM chunk_vectors v
                JOIN chunks c ON c.id = v.rowid
                JOIN documents d ON d.id = c.document_id
                LEFT JOIN source_feedback sf ON sf.chunk_id = c.id
                WHERE v.embedding MATCH ? AND k = ?
                ORDER BY feedback_score DESC, v.distance
                """,
                (sqlite_vec.serialize_float32(embedding), limit),
            ).fetchall()
        return [dict(row) for row in rows]

    def corpus_revision(self) -> int:
        """Return the current document corpus revision."""
        with self.connect() as db:
            row = db.execute(
                "SELECT value FROM index_state WHERE key = 'corpus_revision'"
            ).fetchone()
        return int(row["value"])

    @staticmethod
    def _cache_key(query: str, mode: str, model: str, revision: int) -> str:
        normalized = " ".join(query.casefold().split())
        material = f"{revision}\0{mode}\0{model}\0{normalized}"
        return hashlib.sha256(material.encode("utf-8")).hexdigest()

    def cached_answer(
        self, query: str, mode: str, model: str
    ) -> dict[str, Any] | None:
        """Return and count a revision-matched cached answer."""
        with self._lock, self.connect() as db:
            revision = int(
                db.execute(
                    "SELECT value FROM index_state WHERE key = 'corpus_revision'"
                ).fetchone()[0]
            )
            cache_key = self._cache_key(query, mode, model, revision)
            row = db.execute(
                """
                SELECT response_json FROM answer_cache
                WHERE cache_key = ? AND corpus_revision = ? AND cache_version = ?
                """,
                (cache_key, revision, ANSWER_CACHE_VERSION),
            ).fetchone()
            if not row:
                return None
            db.execute(
                """
                UPDATE answer_cache
                SET hits = hits + 1, last_hit_at = CURRENT_TIMESTAMP
                WHERE cache_key = ?
                """,
                (cache_key,),
            )
        return json.loads(str(row["response_json"]))

    def store_cached_answer(
        self,
        query: str,
        mode: str,
        model: str,
        response: dict[str, Any],
    ) -> None:
        """Persist an answer for the current corpus revision."""
        with self._lock, self.connect() as db:
            revision = int(
                db.execute(
                    "SELECT value FROM index_state WHERE key = 'corpus_revision'"
                ).fetchone()[0]
            )
            cache_key = self._cache_key(query, mode, model, revision)
            db.execute(
                """
                INSERT INTO answer_cache(
                    cache_key, cache_version, query, mode, model,
                    corpus_revision, response_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(cache_key) DO UPDATE SET
                    cache_version = excluded.cache_version,
                    response_json = excluded.response_json,
                    created_at = CURRENT_TIMESTAMP
                """,
                (
                    cache_key,
                    ANSWER_CACHE_VERSION,
                    query,
                    mode,
                    model,
                    revision,
                    json.dumps(response, separators=(",", ":")),
                ),
            )

    def record_usage(
        self,
        *,
        request_kind: str,
        mode: str,
        model: str,
        cache_hit: bool,
        prompt_tokens: int,
        output_tokens: int,
        latency_ms: int,
    ) -> None:
        """Persist one request's actual token and latency metrics."""
        with self.connect() as db:
            db.execute(
                """
                INSERT INTO usage_events(
                    request_kind, mode, model, cache_hit, prompt_tokens,
                    output_tokens, latency_ms
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    request_kind,
                    mode,
                    model,
                    int(cache_hit),
                    max(prompt_tokens, 0),
                    max(output_tokens, 0),
                    max(latency_ms, 0),
                ),
            )

    def usage_summary(self) -> dict[str, Any]:
        """Return aggregate usage, cache, and key-fact metrics."""
        with self.connect() as db:
            totals = dict(
                db.execute(
                    """
                    SELECT COUNT(*) AS requests,
                           COALESCE(SUM(cache_hit), 0) AS cache_hits,
                           COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
                           COALESCE(SUM(output_tokens), 0) AS output_tokens,
                           COALESCE(ROUND(AVG(latency_ms)), 0) AS avg_latency_ms
                    FROM usage_events
                    """
                ).fetchone()
            )
            by_model = [
                dict(row)
                for row in db.execute(
                    """
                    SELECT model, mode, COUNT(*) AS requests,
                           COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
                           COALESCE(SUM(output_tokens), 0) AS output_tokens,
                           COALESCE(ROUND(AVG(latency_ms)), 0) AS avg_latency_ms
                    FROM usage_events
                    GROUP BY model, mode
                    ORDER BY requests DESC, model
                    """
                )
            ]
            daily = [
                dict(row)
                for row in db.execute(
                    """
                    SELECT date(created_at) AS date, COUNT(*) AS requests,
                           COALESCE(SUM(prompt_tokens + output_tokens), 0) AS tokens,
                           COALESCE(SUM(cache_hit), 0) AS cache_hits
                    FROM usage_events
                    WHERE created_at >= datetime('now', '-6 days')
                    GROUP BY date(created_at)
                    ORDER BY date(created_at)
                    """
                )
            ]
            facts = int(db.execute("SELECT COUNT(*) FROM key_facts").fetchone()[0])
            cached_answers = int(
                db.execute(
                    "SELECT COUNT(*) FROM answer_cache WHERE cache_version = ?",
                    (ANSWER_CACHE_VERSION,),
                ).fetchone()[0]
            )
            feedback = dict(
                db.execute(
                    """
                    SELECT COUNT(*) AS total,
                           COALESCE(SUM(rating = 'good'), 0) AS good,
                           COALESCE(SUM(rating = 'bad'), 0) AS bad
                    FROM response_feedback
                    """
                ).fetchone()
            )
        totals["total_tokens"] = (
            int(totals["prompt_tokens"]) + int(totals["output_tokens"])
        )
        totals["cache_hit_rate"] = round(
            int(totals["cache_hits"]) * 100 / max(int(totals["requests"]), 1),
            1,
        )
        return {
            "totals": totals,
            "by_model": by_model,
            "daily": daily,
            "key_facts": facts,
            "cached_answers": cached_answers,
            "corpus_revision": self.corpus_revision(),
            "feedback": feedback,
        }

    def add_history(
        self,
        kind: str,
        query: str,
        *,
        response_text: str | None = None,
        response_state: str | None = None,
        model: str | None = None,
        sources: list[dict[str, Any]] | None = None,
    ) -> int:
        """Persist one search or chat history entry."""
        if kind not in {"search", "chat"}:
            raise ValueError("History kind must be search or chat")
        with self.connect() as db:
            cursor = db.execute(
                """
                INSERT INTO history(
                    kind, query, response_text, response_state, model, sources_json
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    kind,
                    query,
                    response_text,
                    response_state,
                    model,
                    json.dumps(sources or [], separators=(",", ":")),
                ),
            )
        return int(cursor.lastrowid)

    def list_history(self, limit: int = 100) -> list[dict[str, Any]]:
        """Return newest persistent history entries."""
        with self.connect() as db:
            rows = db.execute(
                "SELECT * FROM history ORDER BY id DESC LIMIT ?",
                (min(max(limit, 1), 500),),
            ).fetchall()
        entries = []
        for row in rows:
            entry = dict(row)
            entry["sources"] = json.loads(entry.pop("sources_json"))
            entries.append(entry)
        return entries

    def clear_history(self) -> int:
        """Delete all persisted query and conversation history."""
        with self.connect() as db:
            count = int(db.execute("SELECT COUNT(*) FROM history").fetchone()[0])
            db.execute("DELETE FROM history")
        return count

    def record_feedback(
        self,
        history_id: int,
        rating: str,
        reason: str = "",
    ) -> dict[str, int]:
        """Persist a rating and update local source ranking weights."""
        if rating not in {"good", "bad"}:
            raise ValueError("Feedback rating must be good or bad")
        with self._lock, self.connect() as db:
            history = db.execute(
                """
                SELECT query, sources_json FROM history
                WHERE id = ? AND kind = 'chat'
                """,
                (history_id,),
            ).fetchone()
            if not history:
                raise ValueError("Chat history entry was not found")
            sources = json.loads(str(history["sources_json"]))
            chunk_ids = {
                int(source["chunk_id"])
                for source in sources
                if source.get("chunk_id") is not None
            }
            previous = db.execute(
                "SELECT rating FROM response_feedback WHERE history_id = ?",
                (history_id,),
            ).fetchone()
            if previous and previous["rating"] != rating:
                old_column = "helpful" if previous["rating"] == "good" else "unhelpful"
                for chunk_id in chunk_ids:
                    db.execute(
                        f"""
                        UPDATE source_feedback
                        SET {old_column} = MAX({old_column} - 1, 0)
                        WHERE chunk_id = ?
                        """,
                        (chunk_id,),
                    )
            if not previous or previous["rating"] != rating:
                new_column = "helpful" if rating == "good" else "unhelpful"
                for chunk_id in chunk_ids:
                    db.execute(
                        """
                        INSERT INTO source_feedback(chunk_id, helpful, unhelpful)
                        VALUES (?, ?, ?)
                        ON CONFLICT(chunk_id) DO UPDATE SET
                            helpful = helpful + excluded.helpful,
                            unhelpful = unhelpful + excluded.unhelpful
                        """,
                        (
                            chunk_id,
                            int(new_column == "helpful"),
                            int(new_column == "unhelpful"),
                        ),
                    )
            db.execute(
                """
                INSERT INTO response_feedback(history_id, rating, reason)
                VALUES (?, ?, ?)
                ON CONFLICT(history_id) DO UPDATE SET
                    rating = excluded.rating,
                    reason = excluded.reason,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (history_id, rating, reason.strip()),
            )
            if rating == "bad":
                db.execute(
                    "DELETE FROM answer_cache WHERE query = ? COLLATE NOCASE",
                    (history["query"],),
                )
            summary = db.execute(
                """
                SELECT COUNT(*) AS total,
                       COALESCE(SUM(rating = 'good'), 0) AS good,
                       COALESCE(SUM(rating = 'bad'), 0) AS bad
                FROM response_feedback
                """
            ).fetchone()
        return {key: int(summary[key]) for key in ("total", "good", "bad")}

    def vector_count(self) -> int:
        """Return the number of stored chunk vectors."""
        with self.connect() as db:
            return int(db.execute("SELECT COUNT(*) FROM chunk_vectors").fetchone()[0])
