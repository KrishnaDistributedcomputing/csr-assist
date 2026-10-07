# Copyright (c) Microsoft Corporation.
# SPDX-License-Identifier: MIT

"""Read-only Microsoft Sentinel and Log Analytics integration."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any
from urllib.parse import quote

import httpx

from csr_assist.config import Settings

SENTINEL_API_VERSION = "2024-09-01"
LOG_ANALYTICS_ENDPOINT = "https://api.loganalytics.azure.com"
LOG_ANALYTICS_RESOURCE = "https://api.loganalytics.io/"
ARM_ENDPOINT = "https://management.azure.com"
ARM_RESOURCE = "https://management.azure.com/"

TokenProvider = Callable[[str], Awaitable[str]]
EXPECTED_AZURE_ERRORS = (
    httpx.TimeoutException,
    httpx.HTTPStatusError,
    RuntimeError,
    KeyError,
    TypeError,
    ValueError,
)


class SentinelClient:
    """Return a bounded, read-only security posture from Microsoft Sentinel."""

    def __init__(
        self,
        settings: Settings,
        token_provider: TokenProvider,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.subscription_id = settings.azure_sentinel_subscription_id
        self.resource_group = settings.azure_sentinel_resource_group
        self.workspace_name = settings.azure_sentinel_workspace_name
        self.workspace_id = settings.azure_log_analytics_workspace_id
        self.container_app_name = settings.azure_container_app_service
        self.region = settings.azure_region
        self.lookback_hours = settings.azure_sentinel_lookback_hours
        self.timeout = settings.azure_ai_timeout
        self.token_provider = token_provider
        self.transport = transport

    @property
    def configured(self) -> bool:
        """Return whether every required Sentinel identifier is configured."""
        return bool(
            self.subscription_id
            and self.resource_group
            and self.workspace_name
            and self.workspace_id
        )

    async def overview(self) -> dict[str, Any]:
        """Return Sentinel posture without hiding partial-source failures."""
        if not self.configured:
            return {
                "configured": False,
                "state": "not-configured",
                "workspace": {
                    "name": "",
                    "resource_group": "",
                    "region": "",
                },
                "lookback_hours": self.lookback_hours,
                "summary": self._empty_summary(),
                "telemetry": self._empty_telemetry(),
                "incidents": [],
                "analytic_rules": [],
                "errors": [],
                "refreshed_at": datetime.now(UTC).isoformat(),
            }

        errors: list[str] = []
        incidents: list[dict[str, Any]] = []
        analytic_rules: list[dict[str, Any]] = []
        telemetry = self._empty_telemetry()

        try:
            incidents = await self._incidents()
        except EXPECTED_AZURE_ERRORS as exc:
            errors.append(self._source_error("Sentinel incidents", exc))
        try:
            analytic_rules = await self._analytic_rules()
        except EXPECTED_AZURE_ERRORS as exc:
            errors.append(self._source_error("Sentinel analytic rules", exc))
        try:
            telemetry = await self._telemetry()
        except EXPECTED_AZURE_ERRORS as exc:
            errors.append(self._source_error("Log Analytics telemetry", exc))

        open_incidents = [
            incident
            for incident in incidents
            if incident["status"].casefold() not in {"closed", "resolved"}
        ]
        summary = {
            "open_incidents": len(open_incidents),
            "high_severity_incidents": sum(
                incident["severity"].casefold() in {"high", "critical"}
                for incident in open_incidents
            ),
            "active_analytic_rules": sum(
                rule["enabled"] for rule in analytic_rules
            ),
            "telemetry_events": telemetry["events"],
        }
        return {
            "configured": True,
            "state": "degraded" if errors else "healthy",
            "workspace": {
                "name": self.workspace_name,
                "resource_group": self.resource_group,
                "region": self.region,
            },
            "lookback_hours": self.lookback_hours,
            "summary": summary,
            "telemetry": telemetry,
            "incidents": incidents[:20],
            "analytic_rules": analytic_rules[:20],
            "errors": errors,
            "refreshed_at": datetime.now(UTC).isoformat(),
        }

    async def _incidents(self) -> list[dict[str, Any]]:
        data = await self._arm_get("incidents")
        incidents: list[dict[str, Any]] = []
        for item in data.get("value", []):
            properties = item.get("properties", {})
            incidents.append(
                {
                    "id": str(item.get("name", "")),
                    "title": str(properties.get("title", "Untitled incident")),
                    "severity": str(properties.get("severity", "Informational")),
                    "status": str(properties.get("status", "Unknown")),
                    "created_at": str(
                        properties.get("createdTimeUtc", "")
                    ),
                    "updated_at": str(
                        properties.get("lastModifiedTimeUtc", "")
                    ),
                    "owner": str(
                        properties.get("owner", {}).get(
                            "assignedTo", "Unassigned"
                        )
                    ),
                }
            )
        return sorted(
            incidents,
            key=lambda incident: incident["updated_at"],
            reverse=True,
        )

    async def _analytic_rules(self) -> list[dict[str, Any]]:
        data = await self._arm_get("alertRules")
        rules: list[dict[str, Any]] = []
        for item in data.get("value", []):
            properties = item.get("properties", {})
            rules.append(
                {
                    "id": str(item.get("name", "")),
                    "name": str(
                        properties.get(
                            "displayName",
                            item.get("name", "Unnamed detection"),
                        )
                    ),
                    "severity": str(
                        properties.get("severity", "Informational")
                    ),
                    "enabled": bool(properties.get("enabled", False)),
                    "tactics": [
                        str(tactic)
                        for tactic in properties.get("tactics", [])
                    ],
                    "query_frequency": str(
                        properties.get("queryFrequency", "")
                    ),
                }
            )
        return sorted(
            rules,
            key=lambda rule: (not rule["enabled"], rule["name"].casefold()),
        )

    async def _telemetry(self) -> dict[str, int]:
        safe_name = self.container_app_name.replace("'", "''")
        query = (
            "union isfuzzy=true ContainerAppConsoleLogs_CL, "
            "ContainerAppSystemLogs_CL\n"
            f"| where TimeGenerated >= ago({self.lookback_hours}h)\n"
            f"| where isempty('{safe_name}') or ContainerAppName_s =~ "
            f"'{safe_name}' or _ResourceId has '/containerApps/{safe_name}'\n"
            "| extend SecurityMessage = tostring(coalesce("
            "Log_s, Reason_s, Event_s, Type))\n"
            "| summarize Events=count(), "
            "Errors=countif(SecurityMessage has_any "
            "('ERROR', 'exception', 'failed')), "
            "Warnings=countif(SecurityMessage has 'WARNING'), "
            "RateLimits=countif(SecurityMessage has 'event=rate_limit'), "
            "IdentityFailures=countif(SecurityMessage has "
            "'event=identity_failure')"
        )
        token = await self.token_provider(LOG_ANALYTICS_RESOURCE)
        url = (
            f"{LOG_ANALYTICS_ENDPOINT}/v1/workspaces/"
            f"{quote(self.workspace_id, safe='')}/query"
        )
        async with httpx.AsyncClient(
            timeout=self.timeout,
            transport=self.transport,
        ) as client:
            response = await client.post(
                url,
                headers={"Authorization": f"Bearer {token}"},
                json={"query": query},
            )
            response.raise_for_status()
        tables = response.json().get("tables", [])
        if not tables or not tables[0].get("rows"):
            return self._empty_telemetry()
        columns = [
            str(column["name"]).casefold()
            for column in tables[0].get("columns", [])
        ]
        row = tables[0]["rows"][0]
        values = {
            name: max(int(row[index] or 0), 0)
            for index, name in enumerate(columns)
        }
        return {
            "events": values.get("events", 0),
            "errors": values.get("errors", 0),
            "warnings": values.get("warnings", 0),
            "rate_limits": values.get("ratelimits", 0),
            "identity_failures": values.get("identityfailures", 0),
        }

    async def _arm_get(self, resource_type: str) -> dict[str, Any]:
        token = await self.token_provider(ARM_RESOURCE)
        workspace = quote(self.workspace_name, safe="")
        resource_group = quote(self.resource_group, safe="")
        subscription = quote(self.subscription_id, safe="")
        url = (
            f"{ARM_ENDPOINT}/subscriptions/{subscription}/resourceGroups/"
            f"{resource_group}/providers/Microsoft.OperationalInsights/"
            f"workspaces/{workspace}/providers/Microsoft.SecurityInsights/"
            f"{resource_type}"
        )
        async with httpx.AsyncClient(
            timeout=self.timeout,
            transport=self.transport,
        ) as client:
            response = await client.get(
                url,
                params={"api-version": SENTINEL_API_VERSION},
                headers={"Authorization": f"Bearer {token}"},
            )
            response.raise_for_status()
        return dict(response.json())

    @staticmethod
    def _empty_summary() -> dict[str, int]:
        return {
            "open_incidents": 0,
            "high_severity_incidents": 0,
            "active_analytic_rules": 0,
            "telemetry_events": 0,
        }

    @staticmethod
    def _empty_telemetry() -> dict[str, int]:
        return {
            "events": 0,
            "errors": 0,
            "warnings": 0,
            "rate_limits": 0,
            "identity_failures": 0,
        }

    @staticmethod
    def _source_error(source: str, error: Exception) -> str:
        if isinstance(error, httpx.HTTPStatusError):
            return (
                f"{source} returned HTTP "
                f"{error.response.status_code}"
            )
        if isinstance(error, httpx.TimeoutException):
            return f"{source} timed out"
        return f"{source} is unavailable: {error}"
