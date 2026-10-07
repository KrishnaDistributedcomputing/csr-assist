---
title: CSR Assist Day 2 Go-Live Plan
description: Hour-by-hour production operations, decision gates, incident response, rollback, and hypercare exit criteria
author: CSR Assist team
ms.date: 2026-10-07
ms.topic: how-to
---

## Purpose and operating principles

Use this plan for the second day of a CSR Assist production launch, after the
initial deployment and first-day verification are complete. Day 2 proves that
the service can sustain representative use, preserve its Online and Offline
data boundaries, return grounded citations, and support a controlled handoff
to normal operations.

The plan covers both supported paths:

* Azure Container Apps with approved content in Azure AI Search and an
  allowlisted Azure AI Foundry deployment
* Customer-controlled Docker with local documents, SQLite indexes, and
  optional Ollama generation

> [!IMPORTANT]
> The in-app **Go-Live** tab is an operator checklist and status view. It does
> not replace Azure Monitor, Microsoft Sentinel, Container Apps logs, Docker
> logs, organizational incident tooling, backup systems, or security controls.
> Record authoritative evidence in the approved operations system.

Apply these principles throughout the day:

* Keep Online and Offline evidence isolated. Never use one mode as an
  unannounced fallback for the other.
* Treat citations as a release gate. A fluent answer without valid supporting
  sources is a failed answer.
* Use only approved Azure AI Search documents, Foundry deployments, local
  models, and FAQ questions.
* Stop expansion when a gate fails. Stabilize or roll back before continuing.
* Preserve evidence, timestamps, owners, decisions, and customer impact for
  every incident.

## Day 2 command structure

Assign every role before the operating window. One person may hold more than
one role in a small launch, but the incident commander and change approver
should remain separate whenever staffing allows.

| Role                    | Day 2 owner                         | Primary responsibility                                                        | Backup                          |
|-------------------------|-------------------------------------|--------------------------------------------------------------------------------|---------------------------------|
| Incident commander      | Named operations lead               | Own the timeline, severity, decisions, communications, and stop or go calls     | Service owner                   |
| Service owner           | CSR Assist product or engineering   | Confirm user journeys, grounding quality, scope behavior, and business impact   | Application engineer            |
| Azure platform owner    | Cloud operations                    | Monitor Container Apps, revisions, identity, networking, Search, and Foundry    | Azure administrator             |
| Local platform owner    | Endpoint or Docker operations       | Monitor containers, storage, Ollama, local indexes, and host capacity            | Application engineer            |
| Knowledge owner         | Content or policy authority         | Approve documents, selected scopes, expected answers, and citation correctness   | Business subject-matter expert  |
| Security and compliance | Security or privacy representative  | Verify access, data handling, logging, retention, and incident obligations       | Compliance representative       |
| Communications lead     | Support or change management        | Publish status updates and coordinate user-facing guidance                       | Incident commander              |
| Scribe and metrics      | Operations analyst                  | Capture gate evidence, measures, defects, costs, and handoff records              | Communications lead             |

Record names, contact methods, decision authority, and the conference bridge
or collaboration channel before the first Day 2 gate.

## Required evidence and access

The incident commander confirms that operators can reach the following
resources before the operating window:

* CSR Assist **Go-Live**, **Analytics**, **Sources**, **Architecture**, and
  **Compliance** tabs
* Application health endpoint at `/api/health`
* Azure Container Apps revision status, metrics, and logs
* Azure AI Search service health, query metrics, index document inventory, and
  diagnostic logs when enabled
* Azure AI Foundry deployment health, quota, token use, and diagnostic evidence
  when enabled
* Docker container status and logs for each local deployment
* Persistent local paths for `/data/documents`, `/data/index`, `/data/config`,
  and the `csr-assist-models` volume
* Approved document manifest, expected selected Azure document scopes, and
  representative question set
* Known-good Container Apps revision or image digest, Docker image tag or
  digest, index backup or prior approved index name, and configuration backup
* Incident, security, communications, and change-management systems

> [!WARNING]
> Do not proceed with live traffic if the team cannot observe the active
> revision, identify the indexed corpus, validate citations, or execute the
> documented rollback.

## Entry readiness gate

The incident commander opens Day 2 only when every required item passes or has
a time-bounded exception approved by the service owner and security owner.

### Deployment readiness

* The intended Azure Container Apps revision or Docker image digest is recorded.
* The Azure Container App reports a ready replica and routes traffic only to
  the approved revision.
* The local Docker service reports healthy through its configured 30-second
  health check.
* `/api/health` returns HTTP 200 with `status: ok`, `application: healthy`, and
  `index: healthy`.
* Online mode reports available only when the Search endpoint, Search index,
  Foundry endpoint, and at least one Foundry deployment are configured.
* Managed identity has only the required Search and Foundry data-plane roles.
* The approved rollback target and person authorized to invoke it are present.

### Knowledge readiness

* The Offline document inventory matches the approved local manifest.
* The Online document inventory contains only separately approved Azure AI
  Search content.
* Required document status values are `ready`, with no unexplained processing
  errors.
* Excerpt counts, fact counts, source sizes, and index timestamps are plausible
  for the approved corpus.
* The selected Azure document scopes match each planned user group or scenario.
* Representative searches return the expected documents in both applicable
  modes.

### Answer readiness

* Every launch question returns either a supported answer with reviewable
  citations or the standard insufficient-evidence response.
* Citations reopen the expected source and excerpt.
* Online answers identify the active Azure boundary and approved Foundry model.
* Offline answers identify the local boundary and selected local model or
  **Fast local index (no LLM)**.
* Foundry or Ollama fallback notices are visible when an answer is extractive.
* No answer uses an unselected Azure document or crosses the Online and Offline
  boundary.

### Operational readiness

* There are no open severity 0 or severity 1 incidents.
* On-call coverage, escalation contacts, and communications templates are
  active for the full window.
* Azure budget alerts and service quotas have been reviewed.
* Backups and restore evidence meet the deployment owner's recovery policy.
* Security and compliance checks in this plan have been signed off.

## Hour-by-hour operating schedule

Shift the clock to the local operating window. Preserve the sequence and gate
intent even when launch hours differ.

| Time        | Operating focus              | Required actions                                                                                     | Exit evidence                                                       | Owner                     |
|-------------|------------------------------|------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------|---------------------------|
| 07:00-08:00 | Team activation              | Confirm roster, bridge, access, rollback targets, change freeze, dashboards, and evidence locations | Named owners, reachable tools, approved Day 2 change record          | Incident commander        |
| 08:00-09:00 | Platform readiness           | Check active revisions, replicas, `/api/health`, Docker health, logs, storage, identity, and quotas   | Readiness gate recorded with no unexplained red state                | Platform owners           |
| 09:00-10:00 | Corpus and scope validation  | Reconcile local and Azure inventories, selected scopes, counts, timestamps, and representative search | Signed document manifest and scope results                           | Knowledge owner           |
| 10:00-11:00 | Model and cache validation   | Test Foundry, all required local choices, fast mode, FAQ cache, ordinary cache, and cited fallbacks   | Model matrix and cache checks with citations                         | Application engineer      |
| 11:00-12:00 | Controlled user ramp         | Admit the first user cohort, watch requests, latency, errors, citations, tokens, and feedback         | Ramp gate passed or traffic held                                    | Service owner             |
| 12:00-13:00 | Stability review             | Compare morning metrics with baseline, inspect warnings, check capacity, and review costs             | Midday stop or go decision                                          | Incident commander        |
| 13:00-14:00 | Expanded user ramp           | Admit the next cohort only after the stability gate; repeat critical user journeys                    | No severity 0 or 1 issue and no boundary or citation regression     | Service owner             |
| 14:00-15:00 | Resilience exercise          | Exercise an approved non-destructive failure or rollback rehearsal and verify communications          | Recovery evidence and updated elapsed recovery time                 | Platform owners           |
| 15:00-16:00 | Security and compliance      | Review access, logs, data scopes, retention, network exposure, model approvals, and exceptions         | Security checklist signed or exceptions assigned                    | Security owner            |
| 16:00-17:00 | Business acceptance          | Review answer samples, feedback, unsupported responses, scope behavior, and support desk observations | Knowledge owner and service owner acceptance                        | Knowledge owner           |
| 17:00-18:00 | Handoff and next shift       | Summarize incidents, risks, capacity, spend, changes, owners, and watch items                          | Accepted handoff with open items and next update time               | Incident commander        |
| 18:00 onward | Reduced-staff hypercare     | Continue alerts and scheduled checks; avoid nonessential changes                                      | Stable service and documented next-day review                       | On-call operations        |

## Health gates during the day

Evaluate the following gates at 09:00, before each user-cohort expansion, at
midday, and during handoff.

### Green gate

Proceed when all conditions hold:

* The approved Container Apps revision or Docker container remains healthy.
* The application health endpoint returns the expected healthy application and
  index states.
* No sustained HTTP 5xx increase or repeated user-visible 429 response exists.
* Search and chat complete in both required modes.
* Grounded-answer samples contain valid citations from the selected scope.
* No security boundary, identity, authorization, or data-classification issue
  is open.
* Azure consumption and Foundry tokens remain within the approved Day 2 plan.

### Amber gate

Hold the current cohort and investigate when any condition occurs:

* Latency materially exceeds the measured launch baseline for two consecutive
  checks.
* Container restarts, cold starts, Search timeouts, Foundry fallbacks, or local
  model timeouts increase but core cited service remains available.
* A local model is slow or unavailable while fast local retrieval still works.
* FAQ or ordinary cache effectiveness drops after a known corpus revision.
* A document count, excerpt count, fact count, or selected scope differs from
  the approved manifest without customer impact.
* Cost or quota consumption trends above the approved hourly envelope.

The owner must define a correction, evidence target, and next review time.

### Red gate

Stop expansion and begin incident or rollback procedures when any condition
occurs:

* Health checks fail or no healthy serving revision remains.
* Search or chat is unavailable for the active production boundary.
* Online content appears in Offline mode, Offline content appears in Online
  mode, or an answer cites an unselected Azure document.
* A generated answer lacks citations, cites the wrong evidence, or invents a
  material policy, price, commitment, or customer detail.
* Unauthorized content is indexed or exposed.
* Managed identity, secrets, access, or audit controls are compromised.
* Data loss, index corruption, repeated crash loops, or an unrecoverable
  configuration error occurs.
* Cost, quota, or rate-limit behavior threatens continued controlled operation.

## Azure monitoring

The Azure platform owner monitors the complete request path rather than only
the Container App.

### Azure Container Apps

Check the following signals:

* Active revision, image digest, traffic weight, replica readiness, and restart
  count
* Request count, HTTP 4xx and 5xx responses, latency, CPU, memory, and replica
  scaling
* Cold-start duration after scale from zero, especially because the public
  image contains about 9 GB of bundled model data
* Application warnings for Foundry extractive fallbacks and explicit Search,
  identity, quota, or timeout failures
* Unexpected revision changes or configuration drift

The known public deployment uses the Consumption plan with 2 vCPU, 4 GiB
memory, scale from zero, and a maximum of one replica. Treat these as deployment
facts, not universal production sizing. Validate the actual environment before
approving load.

### Azure AI Search

Check the following signals:

* Service availability, throttling, latency, query failures, and quota
* Active index name and expected document inventory
* Required fields for identifiers, source names, content, and approved source
  URLs
* Results from representative supported and unsupported questions
* Filters produced by selected Azure document scopes
* Removal of content that is no longer approved

CSR Assist returns a 504 for Search timeout and a 503 for Search HTTP or
identity failure. It does not silently switch those requests to Offline data.

### Azure AI Foundry

Check the following signals:

* Approved deployment availability and configured allowlist
* Quota, rate limits, prompt and output token consumption, latency, and safety
  behavior
* Increased extractive fallbacks caused by HTTP failures, timeouts, empty
  responses, refusals, or uncited output
* Deployment identifier changes and model-version changes

Foundry generation is bounded to 10 seconds. When relevant Search evidence
exists but Foundry cannot provide a usable cited answer, CSR Assist returns a
cited extractive fallback and does not cache it.

## Local Docker and Ollama monitoring

The local platform owner checks the host, container, storage, index, and model
runtime:

```powershell
docker compose ps
docker compose logs csr-assist
Invoke-RestMethod http://localhost:8080/api/health
```

Confirm the following:

* The `csr-assist` container remains healthy and does not restart repeatedly.
* The host has sufficient CPU, memory, and free space for documents, SQLite
  state, configuration, and models.
* `/data/documents`, `/data/index`, and `/data/config` remain writable and
  persistent.
* The `csr-assist-models` volume remains mounted and contains only approved
  model artifacts.
* The health response lists the expected installed Ollama identifiers.
* `nomic-embed-text` and the vector count match the deployment's semantic
  retrieval plan. A zero vector count does not block keyword retrieval, but it
  requires investigation when vector search is part of launch scope.
* Local CPU generation times remain acceptable for the selected model.

An `ollama` value of `unavailable` can mean that Ollama is starting or no model
is installed. Local document search should still work. Do not treat an Ollama
failure as permission to send Offline documents to Azure.

## Document, index, and selected-scope validation

The knowledge owner performs this validation before the first ramp and after
every approved corpus change.

1. Compare the visible Offline document list with the approved local manifest.
2. Confirm each required local row is `ready` and investigate every file-level
   error.
3. Compare excerpt count, extracted fact count, source size, and latest index
   time with the expected change.
4. Run **Scan documents** only for an approved local corpus change. Wait for
   scan status to complete.
5. Confirm that the corpus revision advances when a document is added, changed,
   or removed.
6. Compare the Online document list with the separately approved Azure AI
   Search manifest.
7. In **Grounding documents**, select the intended Azure document set for the
   scenario.
8. Search for a unique phrase from a selected document and confirm it appears.
9. Search for a unique phrase from an unselected document and confirm it does
   not appear.
10. Ask Mira a question supported by the selected scope and validate every
    citation.
11. Ask a question supported only by an unselected or unrelated source and
    confirm the standard insufficient-evidence response.
12. Change the selected scope and confirm that prior answer and evidence state
    is cleared before the next request.

Record question text, source mode, selected document IDs or names, returned
sources, citation result, model, cache state, corpus revision, and timestamp.

## Model and FAQ cache checks

### Azure model checks

* Open the model selector in Online mode and confirm that only configured,
  server-allowlisted Foundry deployments appear.
* Confirm the expected default deployment is active.
* Submit a supported question and verify the visible model namespace, evidence,
  and citations.
* Confirm that an unapproved deployment cannot be selected or invoked.
* When a controlled Foundry failure is approved, verify that the result is a
  visibly identified cited extractive fallback and is not cached.

### Local model checks

The hosted Docker preview bundles six approved models:

* Phi-3 Mini
* Llama 3.2 1B
* Llama 3.2 3B
* Qwen 2.5 1.5B
* Gemma 3 1B
* SmolLM2 1.7B

For the models required by the deployment:

1. Compare `/api/health` installed model identifiers with the approved list.
2. Confirm installed models are enabled in the selector.
3. Confirm approved but absent models appear as **Setup required** and cannot
   be used.
4. Run one supported question with **Fast local index (no LLM)**.
5. Run one supported generated question with each required Ollama model.
6. Verify that each answer is grounded in retrieved evidence and contains
   valid citations.
7. Confirm that an Ollama refusal or uncited answer becomes a visible cited
   extractive fallback.
8. Record cold and warm response times. Expect larger CPU models to take
   longer.

### FAQ and ordinary cache checks

CSR Assist prebuilds supported fast Offline answers for the configured FAQ
questions at startup and after every scan. The default set contains five
questions, and `CSR_FAQ_QUESTIONS` accepts up to 20 pipe-delimited questions.

1. Ask a supported configured FAQ and confirm a grounded answer with citations.
2. Repeat it with a local model selected and confirm that the revision-aware
   fast FAQ cache returns the result without local generation.
3. Repeat an ordinary supported question in the same source, mode, model,
   document scope, and corpus revision. Confirm the second response is cached.
4. Confirm cached requests report zero model tokens in Analytics.
5. Change the approved local corpus, rescan, and confirm the corpus revision
   changes and stale cached answers are not returned.
6. Confirm selected Azure document IDs participate in the cache namespace by
   changing scope and verifying evidence does not cross scopes.
7. Confirm Foundry and Ollama extractive fallback answers are not cached.

## Incident severity and communications

Use the organization's incident process when it defines stricter categories.
The following CSR Assist classification supplies a minimum launch standard.

| Severity | CSR Assist examples                                                                 | Initial action target | Update cadence | Decision authority             |
|----------|--------------------------------------------------------------------------------------|-----------------------|----------------|--------------------------------|
| SEV0     | Confirmed unauthorized disclosure, boundary crossing, active compromise, or safety risk | Immediate             | Every 15 min   | Incident commander and security |
| SEV1     | Production unavailable, widespread incorrect citations, corrupt index, or failed rollback | Within 15 min         | Every 30 min   | Incident commander              |
| SEV2     | Degraded model, elevated fallback, partial scope error, or material latency increase    | Within 30 min         | Every 60 min   | Service owner                   |
| SEV3     | Minor defect, isolated content issue, cosmetic problem, or low-impact documentation gap | Same business day     | At milestones  | Workstream owner                |

Every incident record must include:

* Start time, detection source, severity, incident commander, and affected
  deployment
* User groups, source mode, documents or scopes, models, and regions affected
* Known customer or data impact, including whether citations or boundaries are
  in doubt
* Current mitigation, rollback status, next decision time, and named owners
* Links to authoritative logs, metrics, change records, and communication
  updates

Use this communication sequence:

1. Alert the on-call team and assign an incident commander.
2. State facts, impact, source mode, and uncertainty. Do not speculate.
3. Notify security and privacy immediately for suspected unauthorized data
   exposure or boundary crossing.
4. Tell users which workflows to stop and whether a safe mode remains
   available.
5. Publish updates at the severity cadence, even when there is no material
   change.
6. Announce recovery only after health, document scope, and citation gates pass.
7. Schedule a review for every severity 0 or 1 incident and recurring severity
   2 incident.

## Rollback triggers

Rollback is preferred over prolonged diagnosis during the launch window when
one or more of these conditions hold:

* The active revision or image fails health checks and does not recover within
  the approved stabilization interval.
* HTTP 5xx responses, crashes, or latency make a critical user journey
  unreliable.
* Search returns the wrong corpus or selected Azure scope.
* Answers cross a source boundary, cite unauthorized content, or repeatedly
  fail citation validation.
* A document or index change cannot be reconciled quickly with the approved
  manifest.
* A Foundry or Ollama change creates widespread uncited, refused, or incorrect
  answers.
* Identity, role assignment, configuration, or network changes create a
  security or availability regression.
* Consumption, quota, or rate limiting cannot be contained with the approved
  traffic controls.
* The incident commander cannot establish trustworthy observability.

## Rollback procedure

### Common preparation

1. Declare the incident and stop user-cohort expansion.
2. Freeze document, model, configuration, and infrastructure changes.
3. Record the active revision or image digest, Search index, Foundry
   deployment, selected scopes, corpus revision, and incident timestamp.
4. Preserve logs and metrics according to security and retention policy.
5. Decide whether to remove traffic, use a known-safe reduced mode, or roll
   back immediately.

> [!CAUTION]
> **Fast local index (no LLM)** is a reduced local mode, not a fallback for an
> unavailable Online boundary. Never move Online questions or Azure-selected
> content into Offline processing without an approved business and data
> decision.

### Azure rollback

1. Route Container Apps traffic to the recorded previous healthy revision.
2. Confirm the old revision uses the intended image digest and configuration.
3. If the Search corpus caused the incident, point the application to a
   separately preserved known-good approved index or restore the index through
   the organization's Search recovery procedure.
4. If the Foundry deployment caused the incident, restore the prior allowlisted
   deployment configuration or hold Online generation while preserving
   explicit error behavior.
5. Reconfirm managed identity role assignments and network policy.
6. Run `/api/health`, Online document listing, selected-scope searches, and
   citation tests.
7. Restore traffic gradually after the green gate passes.

Do not delete the failed revision, index, or logs until evidence retention and
root-cause needs are satisfied.

### Local Docker rollback

1. Stop the affected service before replacing persistent state.
2. Restore the recorded known-good image tag or digest.
3. Restore `/data/index`, `/data/config`, and, when required, approved
   `/data/documents` from a consistent backup.
4. Restore the `csr-assist-models` volume only when model content caused the
   incident. Preserve ownership and approved provenance.
5. Start the service and wait for the Compose health check.
6. Run `/api/health` and compare installed models, vector count, document
   inventory, corpus revision, and configuration with the rollback record.
7. Run representative fast, generated, FAQ-cache, and citation checks before
   reopening access.

Do not copy a live SQLite database while writes are active. Follow the approved
backup and restore procedure for the deployment.

### Rollback completion gate

Rollback is complete only when:

* The serving revision or container is the recorded target.
* Health checks pass for two consecutive observation intervals.
* The approved document manifest and selected scopes match.
* Critical questions return correct citations or the expected
  insufficient-evidence response.
* No new severity 0 or 1 symptom appears.
* Security, service, and knowledge owners accept the restored state.
* Users receive a recovery update with remaining limitations.

## Security and compliance checks

Complete these checks during readiness and again during the 15:00 review:

* Confirm end-user access is provided by the production identity and network
  controls surrounding CSR Assist. The application does not implement its own
  end-user authentication or document-level authorization.
* Confirm the Container App managed identity has only required Search and
  Foundry data-plane access.
* Confirm Azure service public access, private endpoints, firewalls, and
  network integration match the approved design.
* Confirm local Docker exposure matches policy. The supplied Compose topology
  binds the application to host loopback by default.
* Confirm no Azure service keys, credentials, or private documents appear in
  source, logs, screenshots, incident messages, or browser history.
* Confirm documents were classified, authorized, and malware-scanned before
  ingestion.
* Confirm Online content was approved and indexed separately. Changing source
  mode must not upload or synchronize local files.
* Confirm encryption, backup, retention, deletion, legal hold, diagnostic
  logging, and log-access decisions have documented owners.
* Confirm model provenance, licensing, approval, installation, and patch level.
* Confirm generated answers contain citations and retrieved documents are
  treated as untrusted evidence rather than instructions.
* Confirm browser security headers and same-origin restrictions remain active.
* Confirm exceptions have expiration dates, compensating controls, and owners.

The **Compliance** tab describes implemented controls and customer
responsibilities. It is not a certification or legal determination.

## Cost and capacity controls

The Azure platform owner reviews costs at readiness, midday, and handoff:

* Container Apps vCPU, memory, request volume, replica behavior, cold starts,
  and image-pull impact
* Azure AI Search provisioned capacity, quota, and query volume
* Foundry prompt and output tokens by approved deployment
* Unexpected retries, fallbacks, repeated uncached questions, or automated
  traffic
* Local host CPU, memory, disk, and operational capacity

Apply these controls:

* Keep traffic at the current cohort when consumption exceeds the approved
  hourly envelope.
* Use selected Azure document scopes to narrow evidence, not as a substitute
  for Search capacity planning.
* Use the FAQ cache and ordinary revision-aware cache for repeated supported
  questions.
* Use **Fast local index (no LLM)** when it meets the approved local workflow.
* Do not add Foundry deployments, Container Apps replicas, Search capacity, or
  local models without change approval.
* Alert before Foundry quota exhaustion or budget breach.
* Record actual billing data separately from in-app estimates.

The Architecture and model-selector costs are planning estimates. The current
public deployment identifies Container Apps Consumption, Azure AI Search Free,
and Azure AI Foundry AIServices S0 in West US 2. Actual production resources,
contract rates, taxes, discounts, and regional prices may differ.

## Success metrics

Approve Day 2 completion against explicit launch targets. Replace the example
targets below when the production service-level objectives are stricter.

| Measure                           | Day 2 target                                                               | Evidence source                                      |
|-----------------------------------|----------------------------------------------------------------------------|------------------------------------------------------|
| Availability                      | No severity 0 or 1 outage; health gates pass at every scheduled checkpoint | Health endpoint, platform metrics, incident records  |
| Grounding                         | 100% of sampled supported answers have valid reviewable citations           | Knowledge-owner sample log                           |
| Boundary isolation                | Zero cross-boundary or cross-scope results                                  | Scope tests, incident records                        |
| Unsupported questions             | 100% return the standard insufficient-evidence behavior                     | Negative test set                                    |
| Critical user journeys            | 100% pass for required Online and Offline scenarios                         | Acceptance checklist                                 |
| Document integrity                | Approved manifests, status, counts, and selected scopes reconcile           | Sources tab, Search inventory, scan evidence         |
| Error rate                        | No sustained 5xx increase above the approved launch baseline                | Container Apps or local proxy metrics                |
| Latency                           | Meets the approved per-mode baseline; regressions have owners                | Analytics, Azure metrics, test log                    |
| Cache behavior                    | FAQ and repeat-question checks pass without stale cross-revision results     | Analytics, response cache state, corpus revision     |
| Model readiness                   | Every required allowlisted model passes or has an approved limitation       | Deployment metadata, health, model matrix            |
| Cost                              | Consumption and forecast remain inside the approved Day 2 envelope          | Azure Cost Management and service metrics            |
| User acceptance                   | Knowledge and service owners approve sampled answers and workflow           | Acceptance record                                    |

Do not use cache hit rate, latency, or feedback totals without context. A new
corpus revision, changed scope, cold model, or small sample can shift these
measures without indicating a defect.

## Handoff

The outgoing incident commander provides a written and verbal handoff with:

* Current service state, active revisions or images, region, source modes, and
  traffic cohorts
* Latest green, amber, or red gate and supporting evidence
* Open incidents, severity, user impact, mitigations, and next update time
* Document and index changes, selected-scope concerns, and corpus revision
* Model availability, fallback trends, cache behavior, and FAQ results
* Request, latency, error, token, cost, capacity, and feedback observations
* Security, privacy, compliance, and access exceptions
* Rollbacks, configuration changes, and preserved evidence
* Named owners, deadlines, escalation path, and the next formal review

The receiving owner repeats back critical risks, confirms tool access, and
accepts responsibility in the operations record.

## Hypercare exit criteria

Exit hypercare only after the service owner, operations owner, knowledge owner,
and security owner agree that all required criteria are met:

* Two consecutive business days meet every scheduled green health gate.
* No unresolved severity 0 or severity 1 incident remains.
* Severity 2 incidents have stable mitigations, owners, and committed dates.
* Critical Online and Offline journeys pass with correct source labels and
  citations.
* Approved document inventories and Azure selected-scope tests remain stable.
* Required Foundry and local models remain allowlisted, available, and within
  expected performance limits.
* FAQ and ordinary caches behave correctly across the latest corpus revision.
* Azure and local capacity, quotas, and cost trends fit the approved operating
  envelope.
* Monitoring, alerting, logging, backup, restore, rollback, and on-call
  procedures have evidence from the launch.
* Security and compliance exceptions are closed or transferred to normal
  governance with owners and expiry dates.
* Support teams have known-issue guidance and escalation routes.
* Normal operations accepts the handoff and scheduled service review.

If any criterion fails, continue hypercare with a named owner, corrective
action, measurable exit condition, and next decision time.
