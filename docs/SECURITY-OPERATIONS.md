---
title: CSR Assist Microsoft Sentinel Operations
description: Security telemetry, detections, incident handling, privacy boundaries, and deployment guidance for CSR Assist
author: CSR Assist team
ms.date: 2026-10-07
ms.topic: how-to
---

## Security monitoring boundary

The Azure deployment routes Container Apps console and system logs to a
dedicated Log Analytics workspace with Microsoft Sentinel enabled. The
**Security** tab provides a read-only operational view of incidents, analytic
rules, and aggregate telemetry.

The integration does not send these values to security logs:

* User questions or generated answers
* Document text, excerpts, or citations
* Document names or selected grounding scopes
* Raw client network addresses
* Access tokens, identity headers, or configuration secrets

CSR Assist emits a `CSR_SECURITY` event only for a bounded set of operational
conditions. The event contains the route, HTTP method, status where
applicable, event type, and a truncated SHA-256 client identifier. The hash is
useful for short-term correlation but is not a durable user identity.

> [!IMPORTANT]
> Microsoft Sentinel is enabled only for the Azure deployment. The local
> Docker deployment reports that Sentinel is not configured and does not send
> local telemetry to Azure.

## Deployed controls

The deployment script configures these resources and permissions:

* A `PerGB2018` Log Analytics workspace with 30-day retention
* Microsoft Sentinel onboarding for the workspace
* Container Apps environment logs routed to the workspace
* `Log Analytics Reader` for the CSR Assist user-assigned identity
* `Microsoft Sentinel Reader` for the same identity
* Read-only application queries for incidents, analytic rules, and aggregate
  telemetry

The application identity does not receive Sentinel Contributor, workspace
write, incident update, or analytic-rule update permissions.

## Analytic rules

Three scheduled rules run every five minutes over a ten-minute window.

| Detection | Severity | Trigger | Purpose |
|---|---|---|---|
| CSR Assist rate-limit surge | Medium | More than 10 events | Identifies repeated requests rejected by API rate controls |
| CSR Assist server error spike | High | More than 5 events | Identifies a sustained API failure pattern |
| CSR Assist managed identity failure | High | Any event | Identifies authorization failures for Azure AI or security services |

Rules create Sentinel incidents and group matching alerts for one hour. They
inspect only `CSR_SECURITY` console events for the CSR Assist Container App.

## Security tab states

The **Security** tab reports one of three states:

* `Connected and healthy` means incidents, rules, and Log Analytics telemetry
  all returned successfully.
* `Connected with partial data` means Sentinel is configured, but at least one
  source timed out, denied access, or returned an error. The failed sources
  remain visible in the interface.
* `Microsoft Sentinel is not configured here` means the deployment has no
  Sentinel workspace configuration. This is expected for local Docker.

The tab displays the latest 20 incidents and analytic rules. The aggregate
telemetry window defaults to 24 hours and can be configured from 1 to 168
hours.

## Deploy or refresh the integration

Authenticate Azure CLI with permission to create workspaces, assign roles,
configure Container Apps, and administer Microsoft Sentinel. Run:

```powershell
pwsh ./scripts/Deploy-CsrAssistSentinel.ps1
```

The script is idempotent. It creates or updates the workspace, preserves the
30-day retention setting, reapplies the three deterministic analytic rules,
and configures these application settings:

```text
CSR_AZURE_LOG_ANALYTICS_WORKSPACE_ID
CSR_AZURE_SENTINEL_SUBSCRIPTION_ID
CSR_AZURE_SENTINEL_RESOURCE_GROUP
CSR_AZURE_SENTINEL_WORKSPACE_NAME
CSR_AZURE_SENTINEL_LOOKBACK_HOURS
```

The Container Apps environment uses the workspace key only to establish log
routing. The key is not stored in the application settings or exposed through
the CSR Assist API.

## Validate after deployment

1. Confirm the Container Apps environment log destination is `log-analytics`.
2. Confirm the new application revision is healthy and receives all traffic.
3. Open **Security** and verify the workspace name and connected state.
4. Confirm all three analytic rules are enabled.
5. Generate a controlled rate-limit event in a nonproduction window, then
   confirm the event reaches `ContainerAppConsoleLogs_CL`.
6. Verify incident creation, ownership, notification routing, and closure
   procedures with the security operations team.
7. Confirm questions, answers, citations, and document text do not appear in
   the workspace.

Log ingestion and analytic-rule execution are asynchronous. Allow several
minutes for a new workspace to receive its first Container Apps records.

## Investigate an incident

1. Validate the detection query, event timestamps, Container App revision, and
   affected route.
2. Correlate the event with Container Apps system logs, health metrics, and
   deployment activity.
3. Contain the issue by holding traffic expansion, applying rate controls, or
   shifting to the last known-good revision.
4. Preserve the relevant logs and Azure activity records before changing the
   deployment.
5. Run health, grounding, citation, document-scope, and identity probes before
   reopening access.
6. Record the root cause, corrective action, and detection improvement in the
   approved incident system.

Follow the [Day 2 go-live plan](./GO-LIVE-PLAN.md) for severity, communication,
rollback, handoff, and hypercare decisions.

## Cost and retention

The workspace uses ingestion-based `PerGB2018` billing and 30-day retention.
Review ingestion daily during hypercare. Container Apps console logging should
remain operationally useful without including prompts or document content.
Configure Azure budgets and alerts outside CSR Assist according to the
organization's cost policy.
