---
title: CSR Assist
description: Source-isolated local and Azure document search with grounded customer-service answers
author: CSR Assist team
ms.date: 2026-10-08
ms.topic: overview
---

## Overview

CSR Assist is a customer-service workspace with explicit Offline and Online
processing modes. Offline mode scans local documents and uses local retrieval
with optional Ollama generation. Online mode searches separately approved
Azure AI Search content and uses Azure AI Foundry for grounded generation.
Mira, the built-in assistant, cites source excerpts and reports missing
evidence rather than simulating an answer.

Mira answers only from retrieved document content. Questions that are
unrelated, out of scope, or unsupported receive this response:

> I’m unable to answer this question because it falls outside the scope of the
> provided documents or is not supported by their content.

![CSR Assist answer workspace](docs/images/overview.png)

Detailed guides:

* [Architecture](docs/ARCHITECTURE.md)
* [Business requirements](docs/BUSINESS-REQUIREMENTS.md)
* [Business flow and diagrams](docs/BUSINESS-FLOW.md)
* [Data architecture](docs/DATA-ARCHITECTURE.md)
* [Security architecture](docs/SECURITY-ARCHITECTURE.md)
* [Microsoft Sentinel operations](docs/SECURITY-OPERATIONS.md)
* [Day 2 go-live plan](docs/GO-LIVE-PLAN.md)
* [User guide](docs/USER-GUIDE.md)

Project links:

* [Public demo](https://ca-csr-assist-demo.salmondesert-76e2a623.westus2.azurecontainerapps.io/)
* [GitHub repository](https://github.com/KrishnaDistributedcomputing/csr-assist)

The production deployment contains the React interface, FastAPI backend,
document extraction, Tesseract OCR, SQLite FTS5 index, Ollama runtime, and
process supervisor in one container. Only `127.0.0.1:8080` is published by
default.

## Start the application

```powershell
Copy-Item .env.example .env
New-Item -ItemType Directory -Force data\documents,data\index,data\config,data\models
Copy-Item sample-documents\SAMPLE-support-policy.md data\documents\
docker compose build
docker compose up -d
docker compose ps
```

Open <http://localhost:8080>. The sample document is clearly labelled and is not
a real policy.

## Public Azure demo

The sample-only deployment is available at
<https://ca-csr-assist-demo.salmondesert-76e2a623.westus2.azurecontainerapps.io>.
It runs as a scale-to-zero Azure Container App in West US 2.

The public deployment sets `CSR_READ_ONLY_DEMO=true`. In this mode:

* Only bundled public sample documents are indexed
* Uploads and administrative mutations return HTTP 403
* Search and chat history is not stored or exposed
* Feedback cannot change shared source rankings
* Model and application settings cannot be changed
* The interface identifies itself as a public read-only demo
* Offline cited answers remain available without provisioning an Ollama model
* Online mode uses Azure AI Search and a grounded Azure AI Foundry deployment
* Runtime documents, indexes, configuration, and model directories use
  ephemeral container storage

The first request after an idle period can take longer while Azure starts a
replica. Use the local Docker deployment for private documents, persistent
history, feedback, uploads, and local model generation.

### Online and offline modes

The source selector makes the processing boundary explicit. Offline uses the
teal local-data theme. Online changes the application boundary to Azure blue,
and results and citations also display their source mode.

* **Offline** searches the local SQLite FTS5 index and uses fast extraction or
  an optional loopback Ollama model.
* **Online** searches a configured Azure AI Search index and sends only the
  bounded retrieved excerpts and question to Azure AI Foundry for grounded
  generation.

Changing modes does not copy data. Offline documents are never automatically
uploaded, synchronized, or made searchable in Online mode. Content must be
separately approved and indexed in Azure AI Search before Online mode can find
it. Azure-indexed sources are unavailable in Offline mode.

Online mode uses managed identity. Assign `Search Index Data Reader` on the
Search service and `Foundry User` on the Foundry resource to the application's
identity. Configure:

```text
CSR_AZURE_AI_SEARCH_ENDPOINT=https://<service>.search.windows.net
CSR_AZURE_AI_SEARCH_INDEX=csr-assist-documents
CSR_AZURE_AI_FOUNDRY_ENDPOINT=https://<resource>.services.ai.azure.com
CSR_AZURE_AI_FOUNDRY_DEPLOYMENT=<deployment-name>
CSR_AZURE_AI_IDENTITY_CLIENT_ID=<user-assigned-managed-identity-client-id>
```

Foundry requests target the configured deployment-specific endpoint:

```text
https://<resource>.services.ai.azure.com/openai/deployments/<deployment-name>/chat/completions
```

CSR Assist bounds each Foundry generation request to 10 seconds, even when the
general Azure client timeout is higher. If Foundry is temporarily unavailable,
rate limited, or returns no usable answer, CSR Assist returns a cited extractive
answer from the Azure AI Search results with a visible fallback notice. It uses
the same transparent fallback when strongly matching search evidence exists but
Foundry refuses the question or omits citations. If the search evidence does
not support the question, the application returns the standard unsupported
answer instead of using the fallback.

The repository includes
[`PUBLIC-cogsdale-overview.md`](sample-documents/PUBLIC-cogsdale-overview.md),
a concise demo document derived from Cogsdale's public website with source
links and a non-authoritative-content notice.

## Data boundaries and compliance controls

The mode-aware **Data Compliance** tab describes the controls and
responsibilities for the selected source:

* Application-enforced controls appear as **Implemented**
* Processing and transfer boundaries appear as **Boundary**
* Deployment decisions owned by the customer appear as **Customer control**
* Release and production checks that still require evidence appear as
  **Verify**

These labels document the current implementation and responsibility boundary.
They are not a compliance certification, accessibility conformance claim, or
legal advice.

### Offline data boundary

Offline mode performs parsing, OCR, chunking, key-fact extraction, SQLite FTS5
retrieval, optional `sqlite-vec` retrieval, and optional Ollama inference within
the local application environment. Original documents remain in
`/data/documents`. Extracted chunks, cache entries, search and chat history,
feedback, and usage records remain in the SQLite database under `/data/index`.

The application does not send Offline questions or excerpts to Azure AI Search
or Azure AI Foundry. The customer remains responsible for host access, document
classification, disk encryption, backups, malware scanning, retention,
deletion, recovery, patching, audit collection, and incident response.

### Online data boundary

Online mode searches only document chunks that an administrator has separately
approved and placed in Azure AI Search. The search question is transferred to
the Azure AI Search query endpoint. CSR Assist then sends the question and at
most two bounded retrieved excerpts to the configured Azure AI Foundry
deployment. It does not send the full Offline corpus.

The application uses managed identity and RBAC rather than stored Azure AI API
keys. Azure-indexed content persists until the customer deletes it. Before
production use, the customer must decide and verify the Azure region, data
residency, retention, diagnostic logging, networking, encryption, deletion,
legal-hold, and incident-response configuration.

### Accessibility reference

The **Data Compliance** tab maps implemented interface practices to
[CAN/ASC EN 301 549:2024 Section 11](https://accessible.canada.ca/standards-and-technical-guides/standards-and-technical-guides-database/can-asc-en-301-5492024-accessibility-requirements-ict-products-and-services-en-301-5492021-idt/11-software).
Full conformance requires testing all applicable preconditions and procedures,
including applicable web requirements. The mapping is implementation
documentation only. It is not certification, a conformance determination, or
legal advice.

## Persistent volumes

The container uses these paths:

| Path              | Purpose                                      |
|-------------------|----------------------------------------------|
| `/data/documents` | Source documents searched by CSR Assist      |
| `/data/index`     | SQLite metadata and FTS5 index               |
| `/data/config`    | Active model, allowlist, and Mira persona     |
| `/data/models`    | Ollama model manifests and blobs             |

The supplied Compose file maps documents, indexes, and configuration to `data/`
under the project directory. Models use the persistent `csr-assist-models`
Docker volume so Ollama can memory-map model blobs efficiently on Windows and
macOS hosts.

## Provision local models

Model installation is an explicit administrator operation and never occurs
during a conversation.

```powershell
docker compose exec csr-assist ollama pull phi3:mini
docker compose exec csr-assist ollama pull llama3.2:1b
docker compose exec csr-assist ollama pull llama3.2:3b
docker compose exec csr-assist ollama pull qwen2.5:1.5b
docker compose exec csr-assist ollama pull gemma3:1b
docker compose exec csr-assist ollama pull smollm2:1.7b
docker compose exec csr-assist ollama pull nomic-embed-text
```

Use the model selector after provisioning. Missing models display a setup
message while document search remains available. `nomic-embed-text` supplies
local embeddings for hybrid semantic retrieval and is not an answer-generation
model. Llama 3.2 1B is the fastest approved generative option for CPU-only
workstations. Qwen 2.5 1.5B, Gemma 3 1B, and SmolLM2 1.7B provide additional
CPU-friendly local options. The larger models trade response speed for
additional capacity.

### Offline model import

On an internet-connected staging host, provision the desired model into a clean
model volume. Stop the container, archive the complete `/data/models` content,
and transfer that archive through your approved offline media process. Restore
it into the target deployment's `csr-assist-models` volume while CSR Assist is
stopped, preserve file ownership, and restart the service.

```powershell
docker compose down
# Restore the reviewed archive into the csr-assist-models Docker volume
docker compose up -d
```

Verify the imported model in the selector before blocking outbound access.
Never import untrusted model archives.

## Offline operation

Package dependencies and frontend assets are installed during image build.
Model blobs are provisioned separately. After both steps complete, normal
operation does not require internet access, cloud credentials, analytics,
external fonts, or a content delivery network.

For a strict deployment, build and provision on a connected staging system,
transfer the image and model directory through an approved process, then start
the service on an internal Docker network with outbound traffic denied.

## Document processing

Supported formats are PDF, DOCX, TXT, Markdown, CSV, JSON, XML, PNG, JPEG, and
TIFF. JSON fields and XML elements are flattened with their paths so structured
keys, attributes, and values remain searchable. XML document type and entity
declarations are rejected before parsing.
Tesseract performs local OCR for images and image-only PDF pages. Rescans first
compare file size and modification time, so unchanged content is skipped
without rereading and hashing large files. Changed files are hashed before
their indexed content is replaced. Rescans also remove deleted content.

The application rejects path traversal, unsafe upload names, unsupported
extensions, oversized files, and symlink documents. It reads source content
only beneath `/data/documents`.

## Persistent history and vector search

Search queries and Mira conversations are stored in the persistent SQLite
database under `/data/index`. Each history entry retains its response state,
selected answer model, and cited source metadata. Use **Clear history** in
Mira's panel to delete all stored query and conversation history.

CSR Assist uses SQLite FTS5 for keyword retrieval and `sqlite-vec` for a local
768-dimensional vector index. During document processing, concise sentence-level
facts are extracted, categorized, and stored in a dedicated FTS5 index.
Retrieval searches these key facts before full document chunks. Meaningful
keyword and prefix matches return directly without waiting for model inference.
Common question words are excluded from retrieval. When keyword matches do not
find evidence, semantic retrieval uses the vector index.

The vector index is populated continuously, one chunk at a time, by
`nomic-embed-text` through loopback-only Ollama. This lets interactive requests
take priority. Vector work starts only after 30 seconds without a search or chat
request and pauses again when a user interacts. The embedding model remains
warm between chunks to avoid repeated model startup. If the embedding model is
absent or unavailable, keyword search continues without downloading a model or
fabricating vectors.

Mira returns fast answers by ranking sentences in the two highest-ranked local
excerpts and attaching source citations. This default path does not invoke an
embedding or generative model. Generic follow-ups, such as drafting a
customer-ready response, reuse the sources from the preceding Mira answer.

API clients can send `"mode": "generated"` to `/api/chat` when model-based
rewriting is worth the additional CPU inference time. Generated mode centers
each prompt excerpt on a matched query term and uses a bounded response budget.

Completed answers are cached in SQLite by normalized query, answer mode, active
model, and corpus revision. Repeated questions return from the cache. Adding,
changing, or removing a document increments the corpus revision and invalidates
stale answers automatically.

The token usage dashboard reports request count, actual prompt and output
tokens, average latency, cache hit rate, cached answers, extracted key facts,
feedback totals, and per-model usage. Fast local-index answers report zero
tokens because they do not invoke a generative model.

Good and bad response ratings remain in the local SQLite database. Good ratings
increase the ranking weight of cited source chunks. Bad ratings decrease their
weight and invalidate the matching cached answer so the next request is
retrieved again. Ratings never trigger automatic model training or send data
outside the workstation.

The answer workspace loads first. History and Analytics fetch their data only
when their tabs are opened, and background polling checks scan status rather
than repeatedly loading models, history, usage, and document lists.

The Architecture tab shows the local document, processing, index, retrieval,
and response layers plus persistent volume and learning boundaries. Analytics
and Architecture are separate lazy-loaded frontend chunks. Hashed assets use
gzip transfer compression and immutable browser caching; the application shell
remains uncached so deployments are discovered immediately.

## Optional NVIDIA GPU acceleration

Install a current NVIDIA driver and NVIDIA Container Toolkit on the host. Add
the following device reservation to the `csr-assist` service locally:

```yaml
deploy:
  resources:
    reservations:
      devices:
        - driver: nvidia
          count: all
          capabilities: [gpu]
```

Recreate the service and inspect container logs to confirm Ollama detects the
GPU. CPU operation remains the default.

## Embed Mira

Add the script to a local webpage:

```html
<script
  src="http://localhost:8080/embed.js"
  data-position="right"
  data-assistant-name="Mira">
</script>
```

The widget exposes `window.CSRAssist.open()` and
`window.CSRAssist.close()`. View the working demonstration at
<http://localhost:8080/embed-demo.html>.

An HTTPS host page cannot load an HTTP widget because browsers block mixed
content. Serve CSR Assist through an authenticated HTTPS reverse proxy with a
trusted certificate before embedding it on an HTTPS page. Configure exact
allowed origins and never use a wildcard for an externally reachable
deployment.

## Security before wider access

The default host-only binding is intended for one private workstation.
Before exposing CSR Assist to other users, place it behind authenticated HTTPS,
define user authorization, configure an origin allowlist, apply network
controls, and review document permissions. Ollama must remain unexposed.

Documents and model output are treated as untrusted text. Routine logs omit
document bodies, prompts, excerpts, and generated customer content. Citations
support human review but do not guarantee model accuracy.

## Development and tests

```powershell
python -m pip install -r requirements-test.lock
npm ci
npm run build
python -m pytest backend\tests
npm test
docker compose config
```

For host development, set the four `CSR_*_DIR` variables in `.env` to writable
local directories and run:

```powershell
$env:PYTHONPATH = "backend"
python -m uvicorn csr_assist.api:create_app --factory --host 127.0.0.1 --port 8080
```

## Health and troubleshooting

Open <http://localhost:8080/api/health> or run:

```powershell
Invoke-RestMethod http://localhost:8080/api/health
docker compose logs csr-assist
```

* An `ollama` status of `unavailable` means the runtime is starting or has no
  installed model. Search should still work.
* OCR errors usually indicate a malformed image or an unsupported source
  encoding. Review the visible file-level error.
* A model setup message means the selected approved model is not installed.
  Provision it explicitly; do not expect a conversation to download it.
* A zero vector count means `nomic-embed-text` is missing or indexing has not
  completed. Provision it and select **Scan documents** to backfill embeddings.
* If a mount is read-only or full, repair the host directory and restart the
  service. CSR Assist reports the failure rather than using stale content.
