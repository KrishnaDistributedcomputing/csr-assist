# Copyright (c) Microsoft Corporation.
# SPDX-License-Identifier: MIT

"""Microsoft Sentinel security posture tests."""

from __future__ import annotations

import json

import httpx
import pytest

from csr_assist.config import Settings
from csr_assist.sentinel import SentinelClient


def sentinel_settings() -> Settings:
    """Return complete Sentinel settings for isolated client tests."""
    return Settings(
        azure_log_analytics_workspace_id="workspace-guid",
        azure_sentinel_subscription_id="subscription-guid",
        azure_sentinel_resource_group="security-rg",
        azure_sentinel_workspace_name="law-csr-assist",
        azure_container_app_service="ca-csr-assist-demo",
        azure_region="West US 2",
    )


@pytest.mark.asyncio
async def test_overview_combines_incidents_rules_and_telemetry() -> None:
    requested_resources: list[str] = []
    requests: list[httpx.Request] = []

    async def token_provider(resource: str) -> str:
        requested_resources.append(resource)
        return "managed-token"

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        assert request.headers["Authorization"] == "Bearer managed-token"
        if request.url.host == "api.loganalytics.azure.com":
            payload = json.loads(request.content)
            assert "ContainerAppConsoleLogs_CL" in payload["query"]
            assert "ca-csr-assist-demo" in payload["query"]
            if "by TimeBin" in payload["query"]:
                return httpx.Response(
                    200,
                    json={
                        "tables": [
                            {
                                "columns": [
                                    {"name": "TimeBin"},
                                    {"name": "Events"},
                                    {"name": "Errors"},
                                ],
                                "rows": [
                                    ["2026-10-07T11:00:00Z", 50, 1],
                                    ["2026-10-07T12:00:00Z", 70, 2],
                                ],
                            }
                        ]
                    },
                )
            if "top 6" in payload["query"]:
                return httpx.Response(
                    200,
                    json={
                        "tables": [
                            {
                                "columns": [
                                    {"name": "Signal"},
                                    {"name": "Count"},
                                ],
                                "rows": [
                                    ["RevisionUpdate", 80],
                                    ["ContainerAppConsoleLogs_CL", 40],
                                ],
                            }
                        ]
                    },
                )
            return httpx.Response(
                200,
                json={
                    "tables": [
                        {
                            "columns": [
                                {"name": "Events"},
                                {"name": "Errors"},
                                {"name": "Warnings"},
                                {"name": "RateLimits"},
                                {"name": "IdentityFailures"},
                                {"name": "ConsoleEvents"},
                                {"name": "SystemEvents"},
                                {"name": "UniqueRevisions"},
                                {"name": "UniqueReplicas"},
                                {"name": "FailedScaleEvents"},
                                {"name": "LastEventAt"},
                            ],
                            "rows": [[
                                120,
                                3,
                                5,
                                2,
                                1,
                                40,
                                80,
                                2,
                                3,
                                4,
                                "2026-10-07T12:05:00Z",
                            ]],
                        }
                    ]
                },
            )
        if request.url.path.endswith("/incidents"):
            return httpx.Response(
                200,
                json={
                    "value": [
                        {
                            "name": "incident-1",
                            "properties": {
                                "title": "Repeated server errors",
                                "severity": "High",
                                "status": "Active",
                                "createdTimeUtc": "2026-10-07T12:00:00Z",
                                "lastModifiedTimeUtc": "2026-10-07T12:05:00Z",
                                "owner": {"assignedTo": "Security operations"},
                            },
                        }
                    ]
                },
            )
        return httpx.Response(
            200,
            json={
                "value": [
                    {
                        "name": "rule-1",
                        "properties": {
                            "displayName": "CSR Assist server error spike",
                            "severity": "High",
                            "enabled": True,
                            "tactics": ["Impact"],
                            "queryFrequency": "PT5M",
                        },
                    }
                ]
            },
        )

    client = SentinelClient(
        sentinel_settings(),
        token_provider,
        transport=httpx.MockTransport(respond),
    )

    overview = await client.overview()

    assert overview["state"] == "healthy"
    assert overview["summary"] == {
        "open_incidents": 1,
        "high_severity_incidents": 1,
        "active_analytic_rules": 1,
        "telemetry_events": 120,
    }
    assert overview["telemetry"]["rate_limits"] == 2
    assert overview["telemetry"]["error_rate_percent"] == 2.5
    assert overview["telemetry"]["console_events"] == 40
    assert overview["telemetry_trend"][1]["events"] == 70
    assert overview["top_signals"][0] == {
        "signal": "RevisionUpdate",
        "count": 80,
    }
    assert overview["incident_metrics"]["by_severity"] == {"high": 1}
    assert overview["detection_metrics"]["tactics"] == ["Impact"]
    assert overview["incidents"][0]["owner"] == "Security operations"
    assert overview["analytic_rules"][0]["tactics"] == ["Impact"]
    assert requested_resources == [
        "https://management.azure.com/",
        "https://management.azure.com/",
        "https://api.loganalytics.io/",
        "https://api.loganalytics.io/",
        "https://api.loganalytics.io/",
    ]
    assert len(requests) == 5


@pytest.mark.asyncio
async def test_overview_reports_partial_source_failures() -> None:
    async def token_provider(_: str) -> str:
        return "managed-token"

    def respond(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/incidents"):
            return httpx.Response(403, json={"error": {"message": "Forbidden"}})
        if request.url.host == "api.loganalytics.azure.com":
            return httpx.Response(200, json={"tables": []})
        return httpx.Response(200, json={"value": []})

    client = SentinelClient(
        sentinel_settings(),
        token_provider,
        transport=httpx.MockTransport(respond),
    )

    overview = await client.overview()

    assert overview["state"] == "degraded"
    assert overview["incidents"] == []
    assert overview["analytic_rules"] == []
    assert overview["errors"] == ["Sentinel incidents returned HTTP 403"]
