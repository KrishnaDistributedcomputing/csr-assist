---
title: CSR Assist Business Requirements
description: Business goals, operating modes, stakeholders, requirements, service measures, constraints, and acceptance criteria for CSR Assist
author: CSR Assist team
ms.date: 2026-10-08
ms.topic: reference
---

## Business purpose

CSR Assist helps customer-service representatives find approved information,
prepare clear responses, and verify factual claims against cited source
evidence. It reduces time spent searching across documents without replacing
the representative, knowledge owner, security team, or final
customer-response approval process.

The product supports two intentionally separate operating models:

* Offline mode keeps approved documents, indexes, answer history, and optional
  model inference inside the customer-controlled Docker environment.
* Online mode retrieves separately approved content from Azure AI Search and
  uses an allowlisted Azure AI Foundry deployment for grounded generation.

Changing modes selects a different retrieval boundary. It does not upload,
copy, synchronize, or fall back across Offline and Online content.

## Business goals

The goals below define the expected business value. Initial targets are pilot
hypotheses and must be calibrated against a measured service baseline before
production commitments are approved.

| ID       | Business goal                           | Business value                                                                   | Initial success indicator                                                           | Owner                           |
| -------- | --------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------- |
| BG-001   | Reduce knowledge-search time            | Representatives spend more time resolving cases and less time locating policy    | Median time from question to usable cited answer improves by at least 30%           | Service owner                   |
| BG-002   | Improve response consistency            | Customers receive answers based on the same approved instructions                | At least 95% of known-answer probes produce the approved answer and citations       | Knowledge owner                 |
| BG-003   | Prevent unsupported commitments         | Representatives avoid promises that are absent from approved sources             | Zero unsupported answers accepted during launch validation                          | Business owner                  |
| BG-004   | Make evidence review routine            | Representatives can confirm why an answer was produced before sending it         | 100% of supported factual answers include accessible source citations               | Service and knowledge owners    |
| BG-005   | Govern knowledge scope                  | Business owners control which documents and versions can influence answers       | Zero cross-boundary or out-of-scope results in release probes                       | Knowledge and security owners   |
| BG-006   | Support deployment choice               | Teams can select a private local path or managed Azure services by use case      | Both approved operating modes pass their independent acceptance gates               | Product and platform owners     |
| BG-007   | Accelerate common interactions          | Repeated questions return quickly without unnecessary generation                 | Supported FAQ cache hits return in under 1 second after warm-up                     | Application engineering         |
| BG-008   | Improve representative confidence       | Transparent processing and citations reduce uncertainty during customer calls    | Pilot users rate answer usefulness and evidence clarity at least 4 out of 5         | Change management               |
| BG-009   | Control operating cost                  | Retrieval, generation, scaling, and monitoring costs remain observable           | Cost drivers, model path, token estimates, and cache utilization are reportable     | Service and platform owners     |
| BG-010   | Detect service and security issues      | Operations can identify degradation before it creates sustained customer impact  | Defined health signals and security detections are enabled and tested               | Platform and security owners    |
| BG-011   | Enable continuous knowledge improvement | Feedback and failed probes lead to controlled document or retrieval corrections  | High-impact defects have an owner and target resolution date within one workday     | Knowledge owner                 |
| BG-012   | Maintain human accountability           | Customer-facing decisions remain with trained representatives                    | No automated customer sending or policy approval occurs through CSR Assist          | Business owner                  |

## Business performance measures

| Measure                                | Definition                                                                      | Pilot target                                        | Review cadence   |
| -------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------- | ---------------- |
| Search-to-answer time                  | Time from submission to a reviewable answer or unsupported response             | Establish baseline, then improve median by 30%      | Daily            |
| Cached FAQ latency                     | End-to-end response time for a supported prebuilt answer                        | Under 1 second after warm-up                        | Daily            |
| Known-answer accuracy                  | Approved probes with the expected answer and correct source references          | At least 95%, with 100% for critical policies       | Per release      |
| Citation availability                  | Supported factual answers containing accessible references                      | 100%                                                | Daily            |
| Unsupported-answer containment         | Unsupported probes that avoid an invented answer                                | 100%                                                | Per release      |
| Source-boundary integrity              | Scope probes that return content only from the active mode and selection        | 100%                                                | Per release      |
| Representative adoption                | Trained pilot users completing qualified interactions with CSR Assist           | At least 80% of the pilot cohort weekly             | Weekly           |
| Representative usefulness score        | Average rating for answer usefulness and evidence clarity                       | At least 4 out of 5                                 | Weekly           |
| Escalation and correction completion   | High-impact knowledge defects resolved within the agreed service target         | At least 90%                                        | Weekly           |
| Operational readiness                  | Required launch gates with retained evidence                                    | 100% before cohort expansion                        | Per gate         |

Business owners should not use latency alone as a success measure. A fast
answer without correct scope, evidence, and representative review is a failed
business outcome.

## Operating modes at a glance

| Decision area            | Offline mode                                                      | Online mode                                                           |
| ------------------------ | ----------------------------------------------------------------- | --------------------------------------------------------------------- |
| Primary use case         | Private or disconnected document assistance                       | Managed Azure search and generation at organizational scale           |
| Source authority         | Files approved in the configured local document directory         | Documents separately approved and loaded into Azure AI Search         |
| Retrieval store          | Local SQLite FTS5 with optional vectors                           | Azure AI Search                                                       |
| Generation               | Optional allowlisted Ollama model or fast extractive retrieval    | Allowlisted Azure AI Foundry deployment                               |
| Document scope           | Active local corpus                                               | Active index, optionally narrowed by selected document IDs            |
| Data movement            | No document content leaves the local environment                  | Question and bounded retrieved excerpts are sent to Foundry           |
| Identity model           | Host, container, and customer environment controls                | User-assigned managed identity and Azure RBAC                         |
| Monitoring               | Local health, usage, cache, and application diagnostics           | Azure health, Log Analytics, Microsoft Sentinel, usage, and cost      |
| Resilience path          | Indexed extraction remains available without local generation     | Cited extractive fallback is used only when evidence remains valid    |
| Primary cost drivers     | Host capacity, storage, support, and local model compute          | Search units, model tokens, Container Apps, logs, and retention       |

## Stakeholders and responsibilities

| Stakeholder                       | Business responsibility                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| Customer-service representative   | Ask focused questions, review citations, edit drafts, and approve customer-facing text      |
| Knowledge owner                   | Approve documents, effective dates, expected answers, conflicts, and retirement decisions   |
| Business owner                    | Approve policy interpretation, service outcomes, risk decisions, and customer commitments   |
| Service owner                     | Own prioritization, adoption, performance measures, and business acceptance                 |
| Application engineering           | Maintain retrieval, grounding, caching, model routing, tests, and releases                  |
| Platform operations               | Operate Container Apps or Docker, availability, capacity, backups, and rollback             |
| Security operations               | Monitor Sentinel, investigate incidents, maintain detections, and coordinate containment    |
| Privacy and compliance            | Approve data classes, retention, residency, logging, and legal-hold obligations             |
| Change management                 | Coordinate training, communications, rollout cohorts, and support readiness                 |

## Shared business requirements

These requirements apply in both operating modes.

| ID       | Priority   | Requirement                                                    | Acceptance criteria                                                                                       |
| -------- | ---------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| BR-001   | Must       | Search only the active source boundary                         | Switching modes changes the retrieval channel without copying or synchronizing data                       |
| BR-002   | Must       | Answer only from retrieved evidence                            | Unsupported or unrelated questions return the required out-of-scope response                              |
| BR-003   | Must       | Cite supported factual answers                                 | Every supported factual response includes source references that open the retrieved excerpts              |
| BR-004   | Must       | Keep the representative accountable                            | The application drafts text but does not send responses, approve policy, or resolve authority conflicts   |
| BR-005   | Must       | Preserve answer transparency                                   | The interface shows mode, model or fallback path, processing stages, cache state, and citations           |
| BR-006   | Must       | Keep Mira available during review                              | Desktop displays the persistent right-side assistant beside the active workspace                          |
| BR-007   | Must       | Support representative revision                                | Users can ask a follow-up, change scope, copy a draft, or edit customer-ready text outside the assistant  |
| BR-008   | Should     | Prebuild evidence-supported frequently asked answers           | Supported configured FAQs are cached after startup and relevant index refresh                             |
| BR-009   | Should     | Capture quality feedback in private deployments                | Ratings update quality metrics, and bad feedback invalidates the rejected cached answer                   |
| BR-010   | Must       | Keep the public demonstration read-only                        | Upload, shared history, feedback mutation, and administration remain disabled                             |
| BR-011   | Must       | Support mobile representatives                                 | Users can open focused chat, read answers, inspect citations, and return to the workspace                 |
| BR-012   | Must       | Present readable generated text                                | Answers use accessible contrast, readable type, generous spacing, and bounded line length                 |
| BR-013   | Must       | Surface failures explicitly                                    | Unavailable dependencies return clear unavailable or degraded states rather than fabricated success       |
| BR-014   | Must       | Provide operational visibility                                 | Analytics, Go-Live, Architecture, Compliance, and applicable Security views remain available              |
| BR-015   | Should     | Support business-relevant suggested prompts                    | Prompts reflect approved document topics and help users begin qualified tasks                             |
| BR-016   | Must       | Preserve source lineage                                        | Results carry document, chunk, location, retrieval, and source-channel metadata                           |

## Offline mode requirements

### Offline business goals

Offline mode supports teams that require local processing, predictable data
residency, continued retrieval without cloud model access, or controlled
evaluation before adopting managed AI services.

| Goal                                 | Expected outcome                                                                                                         |
| ------                               | ------------------                                                                                                       |
| Keep approved document content local | Source files, extracted text, indexes, and local model context remain within the customer-controlled environment         |
| Preserve a fast no-model path        | Representatives can retrieve cited answers even when local generation is disabled, slow, or unavailable                  |
| Support constrained infrastructure   | Administrators can choose among approved local models based on available CPU, memory, and response-time needs            |
| Simplify private pilots              | Teams can evaluate document quality, representative workflows, and business value without provisioning Azure AI services |
| Maintain corpus control              | Knowledge owners can scan, refresh, inspect, and retire the local source set under their own change process              |

### Offline functional requirements

| ID        | Priority   | Requirement                                                  | Acceptance criteria                                                                                                                                                                |
| --------- | ---------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------                                                                            |
| OFF-001   | Must       | Discover approved local documents                            | The scanner reports ready, unsupported, and failed files under the configured document root                                                                                        |
| OFF-002   | Must       | Build reusable local indexes                                 | Extracted chunks and facts are stored in SQLite FTS5, with optional vectors when configured                                                                                        |
| OFF-003   | Must       | Provide fast extractive retrieval                            | Representatives can request a cited answer without invoking an LLM                                                                                                                 |
| OFF-004   | Should     | Support approved local generation                            | Only available allowlisted Ollama models can be selected or invoked                                                                                                                |
| OFF-005   | Must       | Keep local model traffic on loopback                         | Application-to-Ollama requests do not require an externally exposed model endpoint                                                                                                 |
| OFF-006   | Must       | Handle local model failures explicitly                       | Unavailable models cannot be selected, timeouts return HTTP 504, runtime failures return HTTP 503, and uncited or refused output uses cited extraction when evidence is sufficient |
| OFF-007   | Must       | Track local corpus revisions                                 | Scanning changed content creates a new revision and invalidates stale corpus-scoped cache entries                                                                                  |
| OFF-008   | Must       | Persist required local state                                 | Documents, indexes, configuration, and models use explicitly configured persistent storage                                                                                         |
| OFF-009   | Must       | Confine file access                                          | Document operations reject traversal and remain under the approved root                                                                                                            |
| OFF-010   | Should     | Report model resource expectations                           | The model selector describes size, expected speed, and local resource tradeoffs                                                                                                    |
| OFF-011   | Must       | Avoid silent cloud fallback                                  | Offline requests never invoke Azure Search or Foundry when local retrieval or generation fails                                                                                     |
| OFF-012   | Must       | Support local recovery                                       | Operations can restore approved documents, index state, configuration, and application revision                                                                                    |

### Offline data and security requirements

| ID         | Priority   | Requirement                                           | Acceptance criteria                                                                                     |
| ---------- | ---------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| OFFD-001   | Must       | Keep original documents in controlled storage         | Source files remain under the configured document directory                                             |
| OFFD-002   | Must       | Keep interaction data customer controlled             | Local history, feedback, usage, and cache data remain in the configured SQLite store                    |
| OFFD-003   | Must       | Make local retention configurable                     | Owners define retention and deletion for documents, indexes, history, feedback, cache, and backups      |
| OFFD-004   | Must       | Protect local persisted volumes                       | Production owners define host access, encryption, backup, malware scanning, and recovery controls       |
| OFFD-005   | Must       | Remove retired knowledge from active retrieval        | A completed retirement process removes the file, derived index records, and related cached answers      |

### Offline acceptance gate

Offline mode is ready for an approved cohort when:

1. The local document manifest, classifications, and effective dates are
   approved.
2. Scan results contain no unresolved error for a critical source.
3. Known-answer, unsupported, conflict, and malicious-instruction probes pass.
4. Fast extractive retrieval remains available with Ollama stopped.
5. Every allowlisted model either passes its validation set or is unavailable
   to representatives.
6. File-confinement, persistence, backup, restore, and deletion procedures are
   demonstrated.
7. Network observation confirms that Offline questions and source content do
   not reach Azure AI services.

## Online mode requirements

### Online business goals

Online mode supports centrally managed knowledge, Azure-native identity,
elastic application hosting, operational telemetry, and managed model
inference for approved organizational use cases.

| Goal                                | Expected outcome                                                                                             |
| ------                              | ------------------                                                                                           |
| Scale approved knowledge access     | Representatives retrieve centrally indexed content without distributing local document copies                |
| Narrow answers to the current task  | Representatives can select approved documents and apply that scope to search and chat                        |
| Use managed identity                | Azure services are accessed without application-managed API keys                                             |
| Control generation context          | Foundry receives only the question and bounded excerpts retrieved from the approved index                    |
| Improve operational oversight       | Platform and security teams can monitor health, revisions, errors, detections, usage, and cost drivers       |
| Support controlled cloud resilience | Search evidence remains visible and a cited extractive fallback is used only when sufficient evidence exists |

### Online functional requirements

| ID       | Priority   | Requirement                                             | Acceptance criteria                                                                                       |
| -------- | ---------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| ON-001   | Must       | Search a separately approved Azure index                | Online retrieval uses only the configured Azure AI Search service and index                               |
| ON-002   | Must       | List available grounding documents                      | The API returns distinct approved document IDs and display names from filterable index fields             |
| ON-003   | Must       | Apply selected-document scope server-side               | Search and chat include the selected IDs in the Azure AI Search filter                                    |
| ON-004   | Must       | Bound document selection                                | A request accepts no more than 50 valid document IDs                                                      |
| ON-005   | Must       | Use an allowlisted Foundry deployment                   | The user can invoke only configured and available Azure model deployments                                 |
| ON-006   | Must       | Minimize model context                                  | Foundry receives the question and no more than the bounded retrieved excerpts                             |
| ON-007   | Must       | Validate generated citation references                  | Missing or invalid source markers reject the generated result                                             |
| ON-008   | Must       | Preserve a cited fallback                               | Foundry failure uses extractive evidence only when retrieval remains sufficient                           |
| ON-009   | Must       | Expose dependency degradation                           | Search, Foundry, identity, Log Analytics, and Sentinel failures remain visible to users or operators      |
| ON-010   | Must       | Report generation cost signals                          | The model selector and Architecture view show model identity and estimated token cost where available     |
| ON-011   | Must       | Avoid silent Offline fallback                           | Online failure never searches local documents or invokes Ollama                                           |
| ON-012   | Must       | Support immutable application rollback                  | Operations can return traffic to the last healthy Container Apps revision                                 |

### Online data and security requirements

| ID        | Priority   | Requirement                                        | Acceptance criteria                                                                                                        |
| --------- | ---------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| OND-001   | Must       | Use managed identity for Azure access              | Application code stores no Azure AI, Log Analytics, or Sentinel API keys                                                   |
| OND-002   | Must       | Apply least-privilege Azure RBAC                   | The runtime identity receives only roles required for Search, Foundry, Log Analytics, and Sentinel                         |
| OND-003   | Must       | Keep Online approval separate from Offline files   | No automatic upload, replication, or synchronization path exists                                                           |
| OND-004   | Must       | Protect content from security telemetry            | Prompts, answers, citations, document names, and document text do not enter `CSR_SECURITY` events                          |
| OND-005   | Must       | Monitor defined security conditions                | Sentinel detects rate-limit surges, server-error spikes, and managed-identity failures                                     |
| OND-006   | Must       | Preserve partial-source errors                     | The Security view reports degraded telemetry sources instead of returning success-shaped data                              |
| OND-007   | Must       | Keep client correlation privacy safe               | Security events use bounded hashed client identifiers rather than raw addresses                                            |
| OND-008   | Must       | Make Azure retention explicit                      | Owners approve retention and deletion for Search data, application state, Log Analytics, Sentinel incidents, and backups   |
| OND-009   | Must       | Record deployment evidence                         | Revision, image, configuration, health, traffic, and rollback evidence are retained for release decisions                  |

### Online acceptance gate

Online mode is ready for an approved cohort when:

1. The Azure index manifest, field mapping, filterability, classifications,
   region, and owners are approved.
2. Managed identity access succeeds with no broader RBAC assignment than the
   documented service roles.
3. Known-answer, unsupported, conflict, malicious-instruction, and
   selected-document probes pass.
4. Scope tests show that unselected documents do not influence search or chat.
5. Captured request evidence confirms that Foundry receives only the question
   and bounded retrieved excerpts.
6. Search or Foundry failure returns an explicit error or valid cited fallback
   without using Offline content.
7. Log Analytics ingestion is fresh, Sentinel is enabled, and the required
   detections pass a controlled test.
8. Cost, scale, incident, communication, and immutable rollback procedures are
   approved.

## Shared security and compliance requirements

| ID       | Priority   | Requirement                                                  | Acceptance criteria                                                                                    |
| -------- | ---------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| SR-001   | Must       | Reject path traversal and unsafe filenames                   | Upload and document access remain confined to approved directories                                     |
| SR-002   | Must       | Limit high-cost or mutating requests                         | Route-specific limits return HTTP 429 with a retry interval                                            |
| SR-003   | Must       | Set browser security headers                                 | Responses include content type, framing, referrer, and content security policies                       |
| SR-004   | Must       | Keep operational logging privacy safe                        | Customer content and raw client addresses are excluded from bounded security events                    |
| SR-005   | Must       | Distinguish product controls from customer obligations       | Compliance guidance labels implemented controls, boundaries, verification, and customer ownership      |
| SR-006   | Must       | Protect secrets and tokens                                   | Access tokens, identity headers, credentials, and secrets are never logged, returned, or committed     |
| SR-007   | Must       | Maintain release traceability                                | Approved changes map to an image or revision, validation evidence, owner, and rollback point           |

## Shared nonfunctional requirements

| ID        | Category          | Requirement                                                                                                 | Acceptance criteria                                                                                                                    |
| --------- | ----------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-001   | Availability      | Health checks identify application, active index, model, and deployment readiness                           | Automated health probes report the active dependency state and fail when a required dependency is unavailable                          |
| NFR-002   | Performance       | Cached and indexed retrieval paths remain independent from model load time                                  | A cached FAQ returns in under 1 second after warm-up, and extractive retrieval completes without loading a model                       |
| NFR-003   | Reliability       | Fallback behavior occurs only when retrieved evidence remains sufficient                                    | Unsupported probes never receive fallback text, and fallback answers contain valid retrieved citations                                 |
| NFR-004   | Accessibility     | Keyboard navigation, focus visibility, labels, contrast, and responsive layouts are maintained              | Keyboard and responsive interaction tests pass, and release review records no unresolved critical accessibility defect                 |
| NFR-005   | Auditability      | Releases, incidents, corpus changes, metrics, and go-live decisions have reviewable evidence                | Each production release records its revision, validation results, approval, known risks, and rollback point                            |
| NFR-006   | Maintainability   | Backend and frontend contracts remain typed and covered by focused automated tests                          | Type checks, production build, and affected backend and frontend tests pass before release                                             |
| NFR-007   | Portability       | The solution runs in customer-controlled Docker and Azure Container Apps                                    | The approved release passes health and representative journey probes in both deployment targets                                        |
| NFR-008   | Cost control      | FAQ caching, bounded context, token reporting, scale controls, and telemetry retention remain observable    | Owners can review cache use, selected model, token usage, replica settings, and Log Analytics retention before expansion               |
| NFR-009   | Usability         | A trained representative can select scope, ask, review citations, revise, and copy a draft without help     | At least 90% of pilot participants complete the standard representative journey without facilitator intervention                       |
| NFR-010   | Recoverability    | Each mode has documented backup or rebuild, rollback, and business-continuity procedures                    | A tabletop or controlled exercise demonstrates restoration or rebuild, application rollback, owner notification, and evidence capture  |

## Assumptions and dependencies

* Knowledge owners can identify authoritative documents and resolve conflicts.
* Representatives receive policy, citation-review, privacy, and escalation
  training before access.
* Customer systems remain the authority for identity, case data, customer
  communication, and final business records.
* Offline hosts provide sufficient storage and compute for the selected local
  models.
* Online deployments have approved Azure regions, subscriptions, quotas,
  identities, indexes, models, logging, and security operations.
* Production owners define data classification, retention, backup, deletion,
  legal hold, malware scanning, private networking, and disaster recovery.
* Baseline handling time, quality, adoption, and cost data are available for
  measuring business improvement.

## Scope boundaries

CSR Assist does not:

* Approve policy or determine legal interpretation
* Replace representative review before a response is sent
* Automatically upload Offline documents into Azure
* Use public internet knowledge to fill evidence gaps
* Resolve conflicting source authority without a knowledge owner
* Send customer communications or write to the system of record
* Declare regulatory, privacy, security, or accessibility certification
* Replace enterprise identity governance, data loss prevention, backup,
  malware scanning, case management, or incident-management systems

## Shared business acceptance gate

Production acceptance for either mode requires:

1. The business owner approves goals, baseline measures, pilot targets, and
   the initial representative cohort.
2. The knowledge owner approves source authority, expected answers, conflicts,
   effective dates, and retirement procedures.
3. Every supported factual answer has accessible citations, and
   representatives are trained to compare claims with cited text.
4. The mode-specific acceptance gate passes with retained evidence.
5. Service, security, privacy, operations, and business owners accept their
   implemented controls and remaining responsibilities.
6. Rollback, communications, support, escalation, and customer-impact
   procedures pass a tabletop exercise.
7. Open risks have an accountable owner, severity, treatment decision, and
   target date.

Follow the [business flow](./BUSINESS-FLOW.md),
[data architecture](./DATA-ARCHITECTURE.md),
[security architecture](./SECURITY-ARCHITECTURE.md), and
[Day 2 go-live plan](./GO-LIVE-PLAN.md) for implementation and operating
evidence.
