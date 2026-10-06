---
title: CSR Assist Architecture
description: Docker and Azure topology, model routing, grounding, storage, security, and operational boundaries
author: CSR Assist team
ms.date: 2026-10-06
ms.topic: concept
---

## Architecture overview

CSR Assist exposes two explicit knowledge and processing boundaries through one
React and FastAPI application:

* Docker on-premises mode keeps document processing, retrieval, application
  state, and optional Ollama generation inside the customer-controlled Docker
  host.
* Azure cloud mode searches separately approved content in Azure AI Search and
  sends the question plus bounded retrieved excerpts to an allowlisted Azure AI
  Foundry deployment.

The selected source controls retrieval, generation, cache namespacing, interface
labels, and citations. Changing the source does not copy or synchronize data
between the boundaries.

![Architecture page showing the local processing layers](./images/architecture.png)

The interface uses teal for Offline mode and Azure blue for Online mode. Text
labels, boundary notices, source badges, and citations communicate the active
mode without relying on color alone.

> [!IMPORTANT]
> The architecture and compliance views describe implemented controls,
> processing boundaries, and customer responsibilities. They do not certify a
> deployment, establish legal or regulatory conformance, or provide legal
> advice.

## Deployment topologies

### Docker on-premises

The supplied Compose topology publishes the application only on host loopback.
FastAPI serves both the API and the compiled React assets. Document processors,
OCR, SQLite FTS5, the optional vector index, and Ollama run inside the local
application boundary.

```text
Browser
  |
  | http://127.0.0.1:<CSR_ASSIST_PORT>
  v
Docker container
  |-- FastAPI API and React static assets
  |-- document processors and OCR
  |-- SQLite FTS5, sqlite-vec, cache, history, feedback, and usage
  |
  | http://127.0.0.1:11434 (container loopback)
  v
Ollama installed models and embedding model
```

The customer controls the host, the mounted document and configuration
directories, the model volume, and all surrounding network and identity
controls.

### Azure cloud

The Azure topology serves the same application from Azure Container Apps.
Online requests use the Container App's managed identity to query Azure AI
Search and call an approved Azure AI Foundry deployment. API keys are not
required by this implementation.

```text
Browser
  |
  | HTTPS
  v
Azure Container Apps
  |-- FastAPI API and React static assets
  |-- local application state for the public demo
  |
  | managed identity + Search data-plane RBAC
  v
Azure AI Search approved index
  |
  | question + up to two bounded retrieved excerpts
  | managed identity + Foundry RBAC
  v
Azure AI Foundry allowlisted deployment
```

Online availability requires a Search endpoint and index, a Foundry endpoint,
and at least one configured Foundry deployment. If any required value is
missing, the API reports Online mode as unavailable and the interface disables
the Online selector.

### Public demo environment preview

The read-only public demo replaces the normal mode badge with an
**Environment preview** control labelled **Docker** and **Azure**. This control
changes the active source in the same deployed application:

* Docker selects the demo's bundled offline sample index and local extractive
  path.
* Azure selects the configured Azure AI Search and Foundry path.
* Azure remains disabled when the deployment API reports that Online mode is
  unavailable.
* Switching either direction clears the current results, source preview,
  answer, and feedback state so evidence from one boundary is not presented in
  the other.

The Docker preview does not provision, connect to, or emulate a customer's
on-premises Docker host. It demonstrates the Offline request path with public
sample content inside the Container App.

Outside read-only demo mode, the header shows the current Offline or Online
boundary as a status pill. Source selection remains available in the Answers
workspace and the Mira assistant.

## Source and trust boundaries

The system maintains these data boundaries:

* Offline documents are never automatically uploaded, copied, synchronized, or
  made searchable in Online mode.
* Online content must be approved and indexed separately in Azure AI Search.
* Azure-indexed content is not searched from Offline mode.
* The browser sends the selected source and, for chat, the selected model
  identifier to the FastAPI API.
* FastAPI is the enforcement point for source routing, model allowlists,
  installed-model checks, grounding, citations, caching, and usage recording.
* Retrieved document text is untrusted evidence. The generated prompt instructs
  the model to ignore instructions embedded in documents.
* Managed identity is the Azure service trust boundary. The application obtains
  short-lived tokens for Search and Foundry rather than storing service keys.

The application does not implement end-user authentication or document-level
authorization. A production operator must place the service behind suitable
identity, network, and access controls and must grant the workload identity only
the required Search and Foundry data-plane roles.

## Per-request model selection

Source selection and model selection are separate decisions. The interface
loads local models from `/api/models` and Azure deployments from
`/api/deployment`, maintains a selection for each source, and sends the selected
identifier with each chat request.

### Offline model routing

The Offline selector contains a **Fast local index (no LLM)** option and the
administrator-approved local model entries.

1. With no local model selected, the frontend sends `mode: "fast"` and omits the
   model identifier.
2. With a local model selected, the frontend sends `mode: "generated"` and the
   model identifier.
3. The API rejects an identifier that is not in the persisted local allowlist.
4. For generated requests, the API retrieves evidence before asking Ollama for
   its installed-model list.
5. If the approved model is not installed, the response has
   `model-missing` state, explains that setup is required, and is not cached.
6. If the model is installed, Ollama receives the bounded grounded prompt.

The persistent `active_model` supplies the API default when a client omits a
model from a generated request. The frontend initially prefers the active
installed model, then the first available model. Per-request selection does not
change the persisted active model.

The editable local allowlist accepts only recognized model identifier families
for the configured provider. It rejects identifiers containing URL or path
syntax. Installation and allowlisting are independent: an allowed model can
still be unavailable because its Ollama files have not been provisioned.

### Azure deployment routing

The Azure allowlist is assembled from
`CSR_AZURE_AI_FOUNDRY_DEPLOYMENT` followed by the comma-separated
`CSR_AZURE_AI_FOUNDRY_DEPLOYMENTS` value. Empty entries are removed, whitespace
is trimmed, and duplicates retain their first position. The first resulting
deployment is the default. `CSR_AZURE_AI_FOUNDRY_DEPLOYMENTS` enables future
additional choices after those deployments are provisioned and allowlisted; it
does not guarantee that multiple deployments are available.

The deployment API returns only those allowlisted identifiers. The frontend
selects the reported default unless the user's current Azure selection remains
valid. Every Online chat carries the selected deployment identifier. The API
rejects arbitrary or stale client identifiers before inference, and the Azure
client validates the allowlist again before constructing the deployment-specific
URL:

```text
https://<resource>.services.ai.azure.com/openai/deployments/<deployment>/chat/completions?api-version=2024-10-21
```

The request body currently labels Online chat as `mode: "fast"`, but Online
requests always follow the Azure Search and Foundry orchestration path. The mode
value participates in cache and usage namespacing; it does not bypass Foundry.

## Retrieval and grounding lifecycle

### Offline ingestion and indexing

1. Files enter the managed documents directory through its bind mount or the
   validated upload endpoint.
2. Format-specific processors extract text from PDF, DOCX, TXT, Markdown, CSV,
   JSON, XML, and supported image formats.
3. The scanner hashes files, skips unchanged content, chunks extracted text,
   derives sentence-level key facts, and stores document state in SQLite.
4. Document mutations advance the corpus revision, which prevents stale cache
   entries from being reused.
5. Optional vector work uses `nomic-embed-text` through container-loopback
   Ollama. It starts only after an interactive idle interval and yields to
   foreground answer work.

### Offline search and answer paths

Offline search queries local keyword retrieval without requiring semantic
embedding when keyword results exist. Results are tagged `offline`.

Fast chat follows this lifecycle:

1. Check the revision-aware answer cache.
2. Search extracted key facts and full chunks in local SQLite.
3. Apply source feedback weights and rank the results.
4. Confirm that the retrieved evidence covers enough meaningful query terms.
5. Construct a short extractive answer from the best source sentences.
6. Add numbered citations and persist eligible history, usage, and cache data.

Generated Offline chat retrieves and validates evidence first, then optionally
uses local vector retrieval when foreground capacity permits. The grounded
prompt includes no more than two source chunks, bounds each evidence excerpt to
700 characters, and requires every factual claim to cite a numbered excerpt.
The configured persona cannot override this grounding policy.

### Online search and answer paths

Online search sends the query to the configured Azure AI Search index and
returns approved fields from up to the requested limit. Search results are
tagged `online` and can include the approved source URL.

Online chat follows this lifecycle:

1. Check the Online and deployment-specific answer cache namespace.
2. Query Azure AI Search for up to two approved chunks.
3. Require at least one meaningful query-term match before generation.
4. Bound each excerpt to 700 characters and build the mandatory evidence-only
   prompt.
5. Obtain a managed-identity token for Foundry.
6. Invoke the selected deployment with temperature `0.1`, a 120-token output
   limit, and a maximum generation wait of 10 seconds.
7. Accept generated text only when it contains citations that correspond to the
   retrieved source numbers.
8. Persist eligible history, usage, and cache data.

The prompt forbids prior knowledge, external knowledge, speculation, and
instructions found inside retrieved content. Unsupported questions return the
standard insufficient-evidence response:

> I’m unable to answer this question because it falls outside the scope of the
> provided documents or is not supported by their content.

## Cache and usage namespaces

The persistent answer-cache key is a SHA-256 digest of:

* Current corpus revision
* Source and request mode, such as `offline:fast`, `offline:generated`, or
  `online:fast`
* Model namespace
* Case-folded, whitespace-normalized question

The database also checks the cache format version before returning an entry.
The model namespace is `local-index` for Offline fast answers, the local Ollama
identifier for Offline generated answers, and
`azure-foundry:<deployment-id>` for Online answers. These dimensions prevent
answers from crossing source, mode, model, deployment, or corpus boundaries.

Each completed chat records its mode, response model, cache-hit flag, prompt and
output token counts, and latency. Cached requests record zero model tokens.
Usage aggregation groups records by the stored model and mode. Extractive Azure
fallbacks use the visible model namespace
`azure-ai-search:extractive-fallback` and are deliberately not cached.

Search requests are written to history outside demo mode, but the current usage
event implementation records chat requests only.

## Failure and fallback behavior

Failures are surfaced according to the boundary where they occur:

| Condition | Current behavior |
|---|---|
| Online mode is incomplete | Return `503`; disable Online selection in the interface |
| Azure AI Search timeout | Return `504`; do not call Foundry or fall back to Offline data |
| Azure AI Search HTTP or identity failure | Return `503`; do not cross into the Offline source |
| No sufficiently relevant Azure evidence | Return the standard insufficient-evidence response |
| Unapproved Azure deployment | Return `400` before inference |
| Foundry HTTP failure, timeout, quota response, or empty answer | Return a cited extractive answer from the retrieved Search results with a visible notice |
| Foundry refusal or uncited output with strongly matching evidence | Return a cited extractive answer with a visible notice |
| Foundry refusal or uncited output without strong support | Return the standard insufficient-evidence response |
| Unapproved local model | Return `400` |
| Approved local model not installed | Return `model-missing`; preserve the retrieved sources; do not cache the response |
| Ollama generation timeout | Return `504`; no automatic extractive fallback |
| Ollama HTTP failure | Return `503`; no automatic extractive fallback |
| Unexpected non-JSON API response | The frontend reports an actionable refresh or server-restart error instead of parsing HTML as JSON |

Azure extractive fallback never uses model memory or external sources. It uses
only the Azure AI Search results already retrieved for the request. Fallback
answers are not cached so a later request can retry Foundry.

## Persistent and ephemeral storage

### Docker storage

| Container path | Purpose | Compose storage |
|---|---|---|
| `/data/documents` | Original managed documents | Host bind mount at `data/documents` |
| `/data/index` | SQLite documents, facts, vectors, cache, history, feedback, and usage | Host bind mount at `data/index` |
| `/data/config` | Active model, local model allowlist, and Mira persona in `settings.json` | Host bind mount at `data/config` |
| `/data/models` | Ollama manifests and model blobs | Named volume `csr-assist-models` |

### Azure storage

Approved Online content persists in the customer-managed Azure AI Search index
until the customer deletes or replaces it. Azure AI Foundry receives request
content for inference but is not the application's document system of record.
Azure service retention and diagnostic behavior depend on the selected service,
region, SKU, and customer configuration.

The public demo uses ephemeral application directories and bundled public sample
documents. It does not use those directories as customer storage. Read-only
demo mode rejects uploads, feedback, model activation, settings updates, and
history deletion. It does not persist user search or chat history, although
ephemeral usage and cache records can exist for the lifetime of the running demo
instance.

## Runtime configuration

`Settings` reads variables with the `CSR_` prefix and can also read a local
`.env` file.

| Variable | Default | Purpose and behavior |
|---|---|---|
| `CSR_DOCUMENTS_DIR` | `/data/documents` | Managed Offline source root |
| `CSR_INDEX_DIR` | `/data/index` | SQLite database, indexes, cache, history, feedback, and usage |
| `CSR_CONFIG_DIR` | `/data/config` | Persistent administrator settings directory |
| `CSR_MODELS_DIR` | `/data/models` | Model storage directory created by the application and mounted for Ollama data |
| `CSR_OLLAMA_URL` | `http://127.0.0.1:11434` | Local Ollama API endpoint |
| `CSR_MAX_FILE_SIZE` | `52428800` | Maximum upload size in bytes |
| `CSR_INFERENCE_TIMEOUT` | `300` | Local Ollama timeout in seconds, constrained to 5 through 600 |
| `CSR_ALLOWED_EMBED_ORIGINS` | `http://localhost:8080` | Defined runtime setting; the current request middleware does not consume it, and browser connections remain restricted by same-origin CSP |
| `CSR_READ_ONLY_DEMO` | `false` | Enables public-demo mutation and history restrictions |
| `CSR_AZURE_AI_SEARCH_ENDPOINT` | Empty | Azure AI Search service endpoint; required for Online mode |
| `CSR_AZURE_AI_SEARCH_INDEX` | `csr-assist-documents` | Approved Azure AI Search index name |
| `CSR_AZURE_AI_FOUNDRY_ENDPOINT` | Empty | Azure AI Foundry resource endpoint; required for Online mode |
| `CSR_AZURE_AI_FOUNDRY_DEPLOYMENT` | Empty | Primary and default allowlisted Foundry deployment |
| `CSR_AZURE_AI_FOUNDRY_DEPLOYMENTS` | Empty | Future additional comma-separated Foundry deployment identifiers that operators have provisioned and allowlisted |
| `CSR_AZURE_AI_IDENTITY_CLIENT_ID` | Empty | Client ID used to select a user-assigned managed identity |
| `CSR_AZURE_AI_TIMEOUT` | `60` | Search and managed-identity timeout in seconds, constrained to 5 through 180; Foundry generation is additionally capped at 10 seconds |

Compose also uses `CSR_ASSIST_PORT`, defaulting to `8080`, to choose the
loopback host port. It is Compose interpolation, not a FastAPI `Settings` field.

The checked-in Compose and `.env.example` surfaces currently pass the primary
Foundry deployment but do not forward
`CSR_AZURE_AI_FOUNDRY_DEPLOYMENTS`. Operators who need multiple Azure choices
must inject that variable into the application container or extend the Compose
environment mapping.

## Security controls

Implemented application controls include:

* Managed document paths confined beneath the configured root
* Rejection of symlinks, traversal names, unsupported extensions, oversized
  uploads, XML document type declarations, and XML entity declarations
* Strict uploaded-filename validation
* Loopback-only host publishing in the supplied Compose configuration
* Container `no-new-privileges` configuration
* Ollama access through container loopback
* Per-client, per-route in-memory rate limits for chat, search, upload, and scan
* Browser headers for content-type sniffing, framing, referrers, scripts,
  connections, and asset caching
* Server-side local and Azure model allowlists
* Managed identity for Azure Search and Foundry access
* Evidence coverage checks, untrusted-document instructions, mandatory
  citations, and rejection of uncited generated output
* Source isolation during retrieval, cache lookup, and interface transitions
* Local-only feedback processing with no automatic model retraining

These controls do not replace authentication, endpoint protection, private
networking, data-loss prevention, malware scanning, encryption, secrets
management, audit retention, or organizational authorization policy.

## Observability

The `/api/health` endpoint reports application and index health, installed
Ollama model identifiers, the embedding-model installation state, and vector
count. It does not expose document text.

The local analytics data includes chat request counts, cache hits and hit rate,
prompt and output tokens, average latency, per-model and per-mode totals,
seven-day daily activity, key-fact count, current-version cached-answer count,
corpus revision, and feedback totals.

The application logs a warning with the exception type when Foundry generation
falls back to an extractive answer. Expected API failures use explicit HTTP
status codes and user-facing details. The current implementation does not emit
structured per-stage timing for managed-identity acquisition, Search, or
Foundry, and it does not provide distributed tracing. Production operators must
configure container logs, Azure diagnostics, alerts, retention, access control,
and correlation outside the application.

## Customer operational responsibilities

For Docker on-premises deployments, the customer is responsible for:

* Host and container access control
* Document classification and authorization
* Disk and backup encryption
* Malware scanning before ingestion
* Backup, restore, retention, deletion, and legal-hold procedures
* Ollama model provenance, licensing, approval, installation, and patching
* Operating-system, container-image, dependency, and model updates
* Log collection, monitoring, incident response, and recovery testing
* Network exposure beyond the supplied loopback binding

For Azure deployments, the customer is also responsible for:

* Selecting and verifying regions, residency, SKUs, and service availability
* Approving content before indexing and removing it when no longer authorized
* Configuring managed identity and least-privilege RBAC
* Deciding whether public access, private endpoints, firewalls, or virtual
  network integration are required
* Configuring encryption, diagnostic settings, log access, retention, deletion,
  backup, legal hold, and incident response
* Validating Foundry model terms, deployment availability, quota, safety
  behavior, and change management
* Testing grounding, fallback, accessibility, privacy, and recovery behavior in
  the actual production environment

Citation display supports human review but does not guarantee model accuracy.
Customers must establish review and escalation procedures appropriate to the
data, decisions, and regulatory context.

## Compliance documentation boundary

The mode-aware **Data Compliance** tab classifies information as Implemented,
Boundary, Customer control, or Verify. Offline cards cover local parsing and
indexing, local cache and answers, absence of Azure AI transfer, local feedback,
and customer custody. Online cards cover the approved Azure index, question and
excerpt transfer, managed identity and RBAC, Offline-data isolation, and
grounded model input.

The tab references
[CAN/ASC EN 301 549:2024 Section 11](https://accessible.canada.ca/standards-and-technical-guides/standards-and-technical-guides-database/can-asc-en-301-5492024-accessibility-requirements-ict-products-and-services-en-301-5492021-idt/11-software)
for software accessibility assessment. Status cards and accessibility mappings
are implementation documentation only. They do not certify compliance,
establish conformance, replace a production assessment, or provide legal
advice.
