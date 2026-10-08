---
title: CSR Assist Business Requirements
description: Business outcomes, stakeholders, functional requirements, service measures, constraints, and acceptance criteria for CSR Assist
author: CSR Assist team
ms.date: 2026-10-08
ms.topic: reference
---

## Business purpose

CSR Assist helps customer-service representatives find approved information,
prepare clear responses, and verify every factual claim against source
evidence. It reduces time spent searching across documents without replacing
the representative, policy owner, security team, or final customer-response
approval process.

The product supports two intentionally separate operating models:

* Offline processing for customer-controlled documents, indexes, and optional
  local model inference
* Online processing for separately approved Azure AI Search content and an
  allowlisted Azure AI Foundry deployment

## Business outcomes

| Outcome                             | Measure                                                     | Initial target                                  | Evidence source                    |
| ---                                 | ---                                                         | ---:                                            | ---                                |
| Faster knowledge discovery          | Median time from question to usable cited answer            | Under 30 seconds for cached or extractive paths | Analytics request latency          |
| Reduced unsupported responses       | Answers without adequate source evidence                    | 0 accepted answers                              | Response state and citation review |
| Higher representative confidence    | Responses with reviewable citations                         | 100% of factual answers                         | Citation records                   |
| Controlled knowledge scope          | Answers grounded outside the selected source boundary       | 0                                               | Scope probes and incident records  |
| Faster handling of common questions | Exact supported FAQ cache hit latency                       | Under 1 second after warm-up                    | Cache and latency metrics          |
| Operational readiness               | Critical launch gates with recorded evidence                | 100% before expansion                           | Go-Live plan                       |
| Detectable security degradation     | High-severity identity or server-error conditions monitored | 100% of defined detections enabled              | Microsoft Sentinel                 |

Targets are planning thresholds. Product and operations owners approve final
service-level objectives before production use.

## Stakeholders and responsibilities

| Stakeholder                     | Business responsibility                                                                   |
| ---                             | ---                                                                                       |
| Customer-service representative | Ask focused questions, review citations, edit drafts, and approve customer-facing text    |
| Knowledge owner                 | Approve documents, effective dates, expected answers, conflicts, and retirement decisions |
| Service owner                   | Own product outcomes, prioritization, user adoption, and business acceptance              |
| Application engineering         | Maintain retrieval, grounding, caching, model routing, tests, and releases                |
| Platform operations             | Operate Container Apps or Docker, availability, capacity, backups, and rollback           |
| Security operations             | Monitor Sentinel, investigate incidents, maintain detections, and coordinate containment  |
| Privacy and compliance          | Approve data classes, retention, residency, logging, and legal-hold obligations           |
| Change management               | Coordinate training, communications, rollout cohorts, and support readiness               |

## Functional requirements

| ID     | Priority | Requirement                                                       | Acceptance criteria                                                                                    |
| ---    | ---      | ---                                                               | ---                                                                                                    |
| BR-001 | Must     | Search only the active Offline or Online source boundary          | Switching mode changes the retrieval channel without copying data between indexes                      |
| BR-002 | Must     | Return answers only when retrieved evidence supports the question | Unsupported or unrelated questions return the required out-of-scope response                           |
| BR-003 | Must     | Cite factual answers                                              | Every supported factual response includes source citations that open the used excerpts                 |
| BR-004 | Must     | Allow Azure users to select grounding documents                   | Search and chat apply the selected document IDs as server-side filters                                 |
| BR-005 | Must     | Keep Mira available while users review operational content        | Desktop displays persistent right-side chat beside the active workspace                                |
| BR-006 | Must     | Support fast non-generative answers                               | Representatives can use extractive retrieval without selecting an LLM                                  |
| BR-007 | Should   | Support approved local and Azure models                           | Unavailable or unapproved models cannot be selected or invoked                                         |
| BR-008 | Should   | Prebuild evidence-supported FAQ answers                           | Supported configured FAQs are cached after startup and index refresh                                   |
| BR-009 | Must     | Preserve answer transparency                                      | The interface shows source mode, model or fallback path, processing stages, cache state, and citations |
| BR-010 | Must     | Keep public demo mutations disabled                               | Upload, shared history, feedback mutation, and administration return or display read-only behavior     |
| BR-011 | Should   | Capture quality feedback for private deployments                  | Good and bad ratings update metrics, and bad feedback invalidates the cached response                  |
| BR-012 | Must     | Provide operational and security visibility                       | Analytics, Go-Live, Security, Architecture, and Compliance views remain available                      |
| BR-013 | Must     | Support mobile representatives                                    | Users can open a focused chat, read answers, review citations, and return to the workspace             |
| BR-014 | Must     | Present readable generated text                                   | Answers use accessible contrast, enlarged text, generous line spacing, and bounded line length         |

## Data requirements

| ID     | Priority | Requirement                                                    | Acceptance criteria                                                                                          |
| ---    | ---      | ---                                                            | ---                                                                                                          |
| DR-001 | Must     | Keep original Offline documents in customer-controlled storage | Files remain under the configured documents directory                                                        |
| DR-002 | Must     | Separate Offline and Online indexes                            | No automatic replication or cross-boundary fallback occurs                                                   |
| DR-003 | Must     | Track document and corpus revisions                            | Index changes invalidate stale corpus-scoped answer cache entries                                            |
| DR-004 | Must     | Minimize generation context                                    | Online generation receives the question and no more than the bounded retrieved excerpts                      |
| DR-005 | Must     | Protect content from security telemetry                        | Prompts, answers, citations, document names, and document text do not enter `CSR_SECURITY` events            |
| DR-006 | Should   | Support common service document formats                        | The scanner reports ready, unsupported, and error states explicitly                                          |
| DR-007 | Must     | Make retention customer controlled                             | Production owners define retention and deletion for documents, indexes, history, feedback, logs, and backups |
| DR-008 | Must     | Preserve source lineage                                        | Every result carries document, chunk, location, extraction, retrieval, and channel metadata                  |

## Security and compliance requirements

| ID     | Priority | Requirement                                                | Acceptance criteria                                                                                                                      |
| ---    | ---      | ---                                                        | ---                                                                                                                                      |
| SR-001 | Must     | Use managed identity for Azure service access              | Application code stores no Azure AI or Sentinel API keys                                                                                 |
| SR-002 | Must     | Apply least-privilege RBAC                                 | The runtime identity receives only the minimum roles required to read Search data, invoke Foundry, read Log Analytics, and read Sentinel |
| SR-003 | Must     | Reject path traversal and unsafe filenames                 | Upload and document access remain confined to approved directories                                                                       |
| SR-004 | Must     | Limit high-cost or mutating requests                       | Route-specific limits return HTTP 429 with a retry interval                                                                              |
| SR-005 | Must     | Set browser security headers                               | Responses include content type, framing, referrer, and content security policies                                                         |
| SR-006 | Must     | Monitor defined security events                            | Sentinel detects rate-limit surges, server-error spikes, and managed-identity failures                                                   |
| SR-007 | Must     | Expose partial monitoring failures                         | The Security view reports degraded sources instead of success-shaped data                                                                |
| SR-008 | Must     | Keep operational logging privacy safe                      | Client addresses are hashed and customer content is excluded                                                                             |
| SR-009 | Must     | Support controlled rollback                                | Operations can restore the last healthy immutable application revision                                                                   |
| SR-010 | Must     | Distinguish implemented controls from customer obligations | Compliance guidance labels application controls, boundaries, verification, and customer ownership                                        |

## Nonfunctional requirements

| ID      | Category        | Requirement                                                                                                |
| ---     | ---             | ---                                                                                                        |
| NFR-001 | Availability    | Health checks must identify application, index, model, and deployment readiness                            |
| NFR-002 | Performance     | Cache and extractive paths must remain available without local generation                                  |
| NFR-003 | Reliability     | Azure generation failure must use a cited extractive fallback only when evidence remains sufficient        |
| NFR-004 | Accessibility   | Keyboard navigation, focus visibility, labels, contrast, and responsive layouts must be maintained         |
| NFR-005 | Auditability    | Releases, incidents, corpus changes, metrics, and go-live decisions must have reviewable evidence          |
| NFR-006 | Maintainability | Backend and frontend contracts must remain typed and covered by focused automated tests                    |
| NFR-007 | Portability     | The solution must run in customer-controlled Docker and Azure Container Apps                               |
| NFR-008 | Cost control    | FAQ caching, bounded context, token reporting, scale controls, and Log Analytics retention must be visible |

## Scope boundaries

CSR Assist does not:

* Approve policy or determine legal interpretation
* Replace representative review before a response is sent
* Automatically upload Offline documents into Azure
* Use public internet knowledge to fill evidence gaps
* Declare regulatory or accessibility certification
* Replace enterprise identity governance, data loss prevention, backup,
  malware scanning, case management, or incident-management systems

## Business acceptance gate

Production acceptance requires:

1. The knowledge owner approves the document manifest and representative
   known-answer set.
2. Supported, unsupported, conflict, missing-information, and selected-scope
   tests pass.
3. Every supported factual answer has correct and accessible citations.
4. Online and Offline boundary probes show no cross-source leakage.
5. Required analytics and Sentinel detections are healthy.
6. Service, security, privacy, and operations owners accept their controls and
   remaining responsibilities.
7. Rollback, communications, and support procedures pass a tabletop exercise.

Follow the [business flow](./BUSINESS-FLOW.md), [data architecture](./DATA-ARCHITECTURE.md),
[security architecture](./SECURITY-ARCHITECTURE.md), and
[Day 2 go-live plan](./GO-LIVE-PLAN.md) for implementation and operating
evidence.
