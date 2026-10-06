---
title: CSR Assist Architecture
description: Local-first architecture, data flow, storage, retrieval, and learning boundaries
author: CSR Assist team
ms.date: 2026-10-06
ms.topic: concept
---

## Architecture overview

CSR Assist supports two explicit processing boundaries. Offline mode runs the
React interface, FastAPI application, SQLite indexes, document processors, OCR,
and Ollama runtime in one local container. Online mode uses managed identity to
query an approved Azure AI Search index and invoke a grounded Azure AI Foundry
model.

![Architecture page showing the local processing layers](./images/architecture.png)

The interface reinforces the selected boundary throughout the workspace.
Offline mode uses teal local-data styling. Online mode switches the application
accents and compliance boundary to Azure blue. Text labels, source badges, and
citations identify the active mode without relying on color alone.

## Source isolation

The modes use separate source collections and retrieval paths:

* Offline documents are never automatically uploaded, copied, synchronized, or
  made searchable in Online mode.
* Online content must be separately approved and indexed in Azure AI Search.
* Azure-indexed content cannot be searched from Offline mode.
* Changing the selector changes the retrieval path. It does not move data.
* Offline and Online answers use separate cache namespaces.

## Data flow

1. Files enter the managed `/data/documents` volume through a bind mount or the
   validated upload endpoint.
2. Format-specific processors extract text from PDF, DOCX, TXT, Markdown, CSV,
   JSON, XML, and supported image formats.
3. The processing pipeline hashes files, skips unchanged content, chunks text,
   extracts sentence-level facts, and stores processed data in SQLite.
4. Offline retrieval checks the revision-aware answer cache, key-fact FTS5
   index, full chunk FTS5 index, and optional vector index in that order.
   Online retrieval queries the configured Azure AI Search index.
5. Fast mode returns cited local evidence without model tokens. Generated mode
   sends bounded local evidence to an approved Ollama model.
6. Online mode sends bounded retrieved excerpts and the question to the
   configured Foundry deployment. Generated claims must cite a retrieved
   source.
7. Good and bad ratings adjust local source weights. A bad rating invalidates
   the matching cached answer.

### Offline flow and custody

Offline parsing, OCR, chunking, key-fact extraction, FTS5 retrieval, optional
vector retrieval, answer construction, and optional Ollama generation run
inside the local application environment. The application stores document
metadata, extracted chunks, local cache entries, history, feedback, and usage
events in SQLite under `/data/index`.

These application boundaries do not replace customer operational controls. The
customer controls host and file access, document classification, disk
encryption, backups, malware scanning, retention, deletion, recovery testing,
patching, audit collection, legal holds, and incident response.

### Online flow and persistence

The Online request path is:

1. An administrator separately approves chunks for the Azure AI Search index.
2. CSR Assist transfers the search question to the Azure AI Search query
   endpoint.
3. Azure AI Search returns up to two chunks for a chat request.
4. CSR Assist bounds each excerpt to 700 characters and creates the grounded
   prompt.
5. CSR Assist transfers the question and bounded excerpts to the configured
   Azure AI Foundry deployment-specific endpoint.
6. A cited answer returns to the application.

The Foundry URL follows this deployment-specific shape:

```text
https://<resource>.services.ai.azure.com/openai/deployments/<deployment-name>/chat/completions
```

Foundry generation is bounded to 10 seconds, regardless of a higher general
Azure timeout. Azure AI Search content persists until the customer deletes it.
The customer must select and verify region, residency, retention, diagnostic
logging, networking, encryption, deletion, legal-hold, and incident-response
settings for the production deployment.

### Grounded fallback behavior

Quota errors, transient HTTP failures, timeouts, empty Foundry responses, and
other unavailable-generation conditions cause CSR Assist to return a cited
extractive answer from the Azure AI Search results. The response includes a
notice that identifies the extractive fallback.

If Foundry refuses a supported question or returns text without citations,
CSR Assist uses the same transparent fallback only when the retrieved sources
strongly support the question. Unsupported questions receive the standard
insufficient-evidence response. The fallback never uses external knowledge.

## Persistent storage

| Container path | Purpose |
|---|---|
| `/data/documents` | Original managed documents |
| `/data/index` | SQLite documents, facts, history, cache, feedback, and usage |
| `/data/config` | Active model, model allowlist, and Mira persona |
| `/data/models` | Ollama manifests and model blobs |

The supplied Compose configuration bind-mounts documents, index data, and
configuration beneath the ignored local `data/` directory. Model blobs use a
named Docker volume.

## Retrieval layers

### Key-fact index

Sentence-level facts preserve their source document and chunk. FTS5 searches
facts before larger excerpts, reducing ranking noise and response construction
cost.

### Full-text index

Complete chunks remain in a second FTS5 index for broader matches and source
preview.

### Vector index

`nomic-embed-text` supplies 768-dimensional vectors through loopback-only
Ollama. Vector work begins only after an interactive idle period, preventing
background indexing from competing with searches and chat.

### Answer cache

The persistent cache key includes the normalized question, answer mode, active
model, corpus revision, and cache format version. Any document mutation
increments the corpus revision and removes stale answers.

## Security boundaries

* Document paths are confined beneath the managed root
* Symlinks, traversal names, unsupported extensions, and oversized files are
  rejected
* XML document type and entity declarations are rejected
* Uploaded names use a strict basename allowlist
* Ollama remains on `127.0.0.1` inside the container
* Browser security headers restrict scripts, connections, frames, and referrers
* Document instructions are treated as untrusted evidence
* Feedback never triggers automatic training or leaves the workstation
* Online mode is opt-in and clearly labelled in the interface
* Offline files are not synchronized to Online storage by changing modes
* Azure credentials are not stored in the application; managed identity
  obtains short-lived tokens for Search and Foundry
* The application identity has read-only Search data access and Foundry user
  access
* Uncited Foundry output is rejected instead of returned to the user

## Data Compliance tab

The mode-aware **Data Compliance** tab presents controls using four status
classes:

| Documentation status | Meaning |
|---|---|
| Implemented | An application-enforced behavior present in the current implementation |
| Boundary | A documented local, Azure, or transfer boundary |
| Customer control | A deployment, custody, or policy decision owned by the customer |
| Verify | A control that requires release or production evidence before a claim |

Offline cards cover local parsing and indexing, local cache and answers, the
absence of Azure AI transfer, local feedback, and customer custody. Online
cards cover the approved Azure index, query and excerpt transfer, managed
identity and RBAC, Offline-data isolation, and grounded model input.

The tab also references
[CAN/ASC EN 301 549:2024 Section 11](https://accessible.canada.ca/standards-and-technical-guides/standards-and-technical-guides-database/can-asc-en-301-5492024-accessibility-requirements-ict-products-and-services-en-301-5492021-idt/11-software)
for software accessibility assessment. The status cards and accessibility
mapping document controls only. They do not certify compliance, establish
conformance, or provide legal advice.

## Public demo boundary

The [public demo](https://ca-csr-assist-demo.salmondesert-76e2a623.westus2.azurecontainerapps.io/)
starts with bundled public sample documents and uses `/tmp` for documents,
indexes, configuration, and model directories. That runtime state is ephemeral
and is not customer storage.

The demo rejects uploads, feedback, model changes, settings changes, and
history deletion. It does not write search or chat history. The History view
returns no entries. Only public samples are intended for the demo, and users
must not submit private, confidential, personal, or regulated data.

## Deployment topology

```text
Browser
  |
  | http://127.0.0.1:8080
  v
FastAPI + React static assets
  |-- Document processors and OCR
  |-- SQLite FTS5 + sqlite-vec
  |-- Answer cache, history, feedback, usage
  |
  | http://127.0.0.1:11434 (container only)
  v
Ollama local models
```
