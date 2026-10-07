#!/usr/bin/env pwsh
# Copyright (c) Microsoft Corporation.
# SPDX-License-Identifier: MIT
#Requires -Version 7.0

<#
.SYNOPSIS
    Deploys Microsoft Sentinel monitoring for CSR Assist.
.DESCRIPTION
    Creates a cost-bounded Log Analytics workspace, enables Microsoft Sentinel,
    routes Container Apps logs, grants the app identity read-only access,
    deploys scheduled analytic rules, and configures the security API.
.PARAMETER SubscriptionId
    Azure subscription containing CSR Assist.
.PARAMETER ResourceGroup
    Resource group containing the Container App and managed environment.
.PARAMETER Location
    Azure region for the Log Analytics workspace.
.PARAMETER ContainerAppName
    CSR Assist Container App name.
.PARAMETER ContainerEnvironmentName
    Azure Container Apps managed environment name.
.PARAMETER WorkspaceName
    Log Analytics workspace to create or update.
.EXAMPLE
    ./scripts/Deploy-CsrAssistSentinel.ps1
.NOTES
    Requires Azure CLI authentication with resource, role assignment, and
    Microsoft Sentinel permissions.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [ValidateNotNullOrEmpty()]
    [string]$SubscriptionId = 'fa4864b4-3710-453c-bffe-2c22a80cd0f9',

    [Parameter(Mandatory = $false)]
    [ValidateNotNullOrEmpty()]
    [string]$ResourceGroup = 'rg-csr-assist-demo-westus2',

    [Parameter(Mandatory = $false)]
    [ValidateNotNullOrEmpty()]
    [string]$Location = 'westus2',

    [Parameter(Mandatory = $false)]
    [ValidateNotNullOrEmpty()]
    [string]$ContainerAppName = 'ca-csr-assist-demo',

    [Parameter(Mandatory = $false)]
    [ValidateNotNullOrEmpty()]
    [string]$ContainerEnvironmentName = 'cae-csr-assist-demo',

    [Parameter(Mandatory = $false)]
    [ValidateNotNullOrEmpty()]
    [string]$WorkspaceName = 'law-csr-assist-demo'
)

$ErrorActionPreference = 'Stop'

#region Functions
function Assert-AzSuccess {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$Operation
    )

    if ($LASTEXITCODE -ne 0) {
        throw "Azure CLI operation failed: $Operation"
    }
}

function Add-WorkspaceRole {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$PrincipalId,

        [Parameter(Mandatory = $true)]
        [string]$WorkspaceResourceId,

        [Parameter(Mandatory = $true)]
        [string]$RoleName
    )

    $Assignments = az role assignment list `
        --assignee $PrincipalId `
        --scope $WorkspaceResourceId `
        --role $RoleName `
        --output json | ConvertFrom-Json
    Assert-AzSuccess -Operation "Check $RoleName assignment"
    if (@($Assignments).Count -eq 0) {
        az role assignment create `
            --assignee-object-id $PrincipalId `
            --assignee-principal-type ServicePrincipal `
            --scope $WorkspaceResourceId `
            --role $RoleName `
            --output none
        Assert-AzSuccess -Operation "Assign $RoleName"
    }
}

function Set-SentinelRule {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$WorkspaceResourceId,

        [Parameter(Mandatory = $true)]
        [string]$RuleId,

        [Parameter(Mandatory = $true)]
        [string]$DisplayName,

        [Parameter(Mandatory = $true)]
        [ValidateSet('High', 'Medium', 'Low', 'Informational')]
        [string]$Severity,

        [Parameter(Mandatory = $true)]
        [string]$Description,

        [Parameter(Mandatory = $true)]
        [string]$Query,

        [Parameter(Mandatory = $true)]
        [string[]]$Tactics,

        [Parameter(Mandatory = $true)]
        [int]$TriggerThreshold
    )

    $Body = @{
        kind = 'Scheduled'
        properties = @{
            displayName = $DisplayName
            description = $Description
            severity = $Severity
            enabled = $true
            query = $Query
            queryFrequency = 'PT5M'
            queryPeriod = 'PT10M'
            triggerOperator = 'GreaterThan'
            triggerThreshold = $TriggerThreshold
            suppressionDuration = 'PT1H'
            suppressionEnabled = $false
            tactics = $Tactics
            incidentConfiguration = @{
                createIncident = $true
                groupingConfiguration = @{
                    enabled = $true
                    reopenClosedIncident = $false
                    lookbackDuration = 'PT1H'
                    matchingMethod = 'Selected'
                    groupByEntities = @()
                    groupByAlertDetails = @('DisplayName')
                    groupByCustomDetails = @()
                }
            }
        }
    } | ConvertTo-Json -Depth 20 -Compress
    $RuleUrl = (
        "https://management.azure.com$WorkspaceResourceId/providers/" +
        "Microsoft.SecurityInsights/alertRules/${RuleId}?api-version=2024-09-01"
    )
    $BodyPath = Join-Path (
        [System.IO.Path]::GetTempPath()
    ) "csr-assist-sentinel-$RuleId.json"
    try {
        Set-Content -LiteralPath $BodyPath -Value $Body -Encoding utf8
        az rest `
            --method put `
            --url $RuleUrl `
            --headers 'Content-Type=application/json' `
            --body "@$BodyPath" `
            --output none
        Assert-AzSuccess -Operation "Deploy analytic rule $DisplayName"
    }
    finally {
        if (Test-Path -LiteralPath $BodyPath) {
            Remove-Item -LiteralPath $BodyPath -Force
        }
    }
}
#endregion Functions

#region Main Execution
if ($MyInvocation.InvocationName -ne '.') {
    try {
        az account set --subscription $SubscriptionId
        Assert-AzSuccess -Operation 'Select subscription'

        Write-Host 'Creating or updating the Log Analytics workspace...'
        $Workspace = az monitor log-analytics workspace create `
            --resource-group $ResourceGroup `
            --workspace-name $WorkspaceName `
            --location $Location `
            --sku PerGB2018 `
            --retention-time 30 `
            --output json | ConvertFrom-Json
        Assert-AzSuccess -Operation 'Create Log Analytics workspace'

        $WorkspaceKey = az monitor log-analytics workspace get-shared-keys `
            --resource-group $ResourceGroup `
            --workspace-name $WorkspaceName `
            --query primarySharedKey `
            --output tsv
        Assert-AzSuccess -Operation 'Read workspace configuration key'

        Write-Host 'Routing Container Apps logs to Log Analytics...'
        az containerapp env update `
            --resource-group $ResourceGroup `
            --name $ContainerEnvironmentName `
            --logs-destination log-analytics `
            --logs-workspace-id $Workspace.customerId `
            --logs-workspace-key $WorkspaceKey `
            --output none
        Assert-AzSuccess -Operation 'Configure Container Apps logs'

        Write-Host 'Registering the Microsoft Sentinel resource provider...'
        az provider register `
            --namespace Microsoft.SecurityInsights `
            --wait
        Assert-AzSuccess -Operation 'Register Microsoft.SecurityInsights'
        az provider register `
            --namespace Microsoft.OperationsManagement `
            --wait
        Assert-AzSuccess -Operation 'Register Microsoft.OperationsManagement'

        Write-Host 'Enabling Microsoft Sentinel...'
        $OnboardingUrl = (
            "https://management.azure.com$($Workspace.id)/providers/" +
            'Microsoft.SecurityInsights/onboardingStates/default' +
            '?api-version=2024-09-01'
        )
        $OnboardingBody = @{
            properties = @{
                customerManagedKey = $false
            }
        } | ConvertTo-Json -Compress
        az rest `
            --method put `
            --url $OnboardingUrl `
            --headers 'Content-Type=application/json' `
            --body $OnboardingBody `
            --output none
        Assert-AzSuccess -Operation 'Enable Microsoft Sentinel'

        $App = az containerapp show `
            --resource-group $ResourceGroup `
            --name $ContainerAppName `
            --output json | ConvertFrom-Json
        Assert-AzSuccess -Operation 'Read Container App identity'
        $IdentityResourceId = @(
            $App.identity.userAssignedIdentities.PSObject.Properties.Name
        )[0]
        if (-not $IdentityResourceId) {
            throw 'CSR Assist must have a user-assigned managed identity.'
        }
        $Identity = az identity show `
            --ids $IdentityResourceId `
            --output json | ConvertFrom-Json
        Assert-AzSuccess -Operation 'Resolve Container App identity'

        Write-Host 'Granting least-privilege security reader roles...'
        Add-WorkspaceRole `
            -PrincipalId $Identity.principalId `
            -WorkspaceResourceId $Workspace.id `
            -RoleName 'Log Analytics Reader'
        Add-WorkspaceRole `
            -PrincipalId $Identity.principalId `
            -WorkspaceResourceId $Workspace.id `
            -RoleName 'Microsoft Sentinel Reader'

        $SafeAppName = $ContainerAppName.Replace("'", "''")
        $BaseQuery = @"
ContainerAppConsoleLogs_CL
| where ContainerAppName_s =~ '$SafeAppName'
| where Log_s has 'CSR_SECURITY'
"@
        Set-SentinelRule `
            -WorkspaceResourceId $Workspace.id `
            -RuleId '2db57a3b-d10d-4d8d-b93d-1f1f0e70a701' `
            -DisplayName 'CSR Assist rate-limit surge' `
            -Severity Medium `
            -Description 'Detects repeated CSR Assist API rate-limit events without collecting request content.' `
            -Query "$BaseQuery`n| where Log_s has 'event=rate_limit'`n| summarize EventCount=count() by bin(TimeGenerated, 5m)" `
            -Tactics @('Impact') `
            -TriggerThreshold 10
        Set-SentinelRule `
            -WorkspaceResourceId $Workspace.id `
            -RuleId 'd7167327-3582-4116-9e19-ad5960f44502' `
            -DisplayName 'CSR Assist server error spike' `
            -Severity High `
            -Description 'Detects privacy-safe server error events from the CSR Assist API.' `
            -Query "$BaseQuery`n| where Log_s has 'event=server_error'`n| summarize EventCount=count() by bin(TimeGenerated, 5m)" `
            -Tactics @('Impact') `
            -TriggerThreshold 5
        Set-SentinelRule `
            -WorkspaceResourceId $Workspace.id `
            -RuleId '9c6bb92c-65cc-4f15-839e-589e55d67c03' `
            -DisplayName 'CSR Assist managed identity failure' `
            -Severity High `
            -Description 'Detects failed managed-identity authorization to Azure AI or security services.' `
            -Query "$BaseQuery`n| where Log_s has 'event=identity_failure'`n| summarize EventCount=count() by bin(TimeGenerated, 5m)" `
            -Tactics @('CredentialAccess') `
            -TriggerThreshold 0

        Write-Host 'Configuring the CSR Assist Sentinel API...'
        az containerapp update `
            --resource-group $ResourceGroup `
            --name $ContainerAppName `
            --set-env-vars `
                "CSR_AZURE_LOG_ANALYTICS_WORKSPACE_ID=$($Workspace.customerId)" `
                "CSR_AZURE_SENTINEL_SUBSCRIPTION_ID=$SubscriptionId" `
                "CSR_AZURE_SENTINEL_RESOURCE_GROUP=$ResourceGroup" `
                "CSR_AZURE_SENTINEL_WORKSPACE_NAME=$WorkspaceName" `
                'CSR_AZURE_SENTINEL_LOOKBACK_HOURS=24' `
            --output none
        Assert-AzSuccess -Operation 'Configure Sentinel application settings'

        Write-Host "Sentinel deployment completed for $WorkspaceName."
    }
    catch {
        Write-Error -ErrorAction Continue (
            "Deploy-CsrAssistSentinel failed: $($_.Exception.Message)"
        )
        exit 1
    }
}
#endregion Main Execution
