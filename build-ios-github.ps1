$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

$workflow = 'ios-build.yml'
$artifactName = 'ios-app'
$outputRoot = Join-Path $PSScriptRoot 'builds\ios'

function Find-GhPath {
    $cmd = Get-Command gh -ErrorAction SilentlyContinue
    if ($cmd) {
        return $cmd.Source
    }

    $fallback = Join-Path $env:ProgramFiles 'GitHub CLI\gh.exe'
    if (Test-Path $fallback) {
        return $fallback
    }

    throw 'GitHub CLI was not found. Install it first: winget install --id GitHub.cli -e'
}

function Invoke-GhText {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Args
    )

    $output = & $script:ghPath @Args 2>&1
    if ($LASTEXITCODE -ne 0) {
        $message = ($output | Out-String).Trim()
        if (-not $message) {
            $message = "GitHub CLI command failed: gh $($Args -join ' ')"
        }
        throw $message
    }

    return ($output | Out-String).TrimEnd()
}

function Test-GhAuth {
    & $script:ghPath auth status *> $null
    return $LASTEXITCODE -eq 0
}

function Get-RepoNameWithOwner {
    if ($script:repoNameWithOwner) {
        return $script:repoNameWithOwner
    }

    $script:repoNameWithOwner = Invoke-GhText -Args @('repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner')
    return $script:repoNameWithOwner
}

function Get-RemoteBranches {
    $raw = & git ls-remote --heads origin 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw 'Unable to read remote branches from origin.'
    }

    return @(
        $raw |
            ForEach-Object {
                $parts = $_ -split "`t"
                if ($parts.Count -ge 2) {
                    $parts[1] -replace '^refs/heads/', ''
                }
            } |
            Where-Object { $_ -and $_ -ne 'HEAD' } |
            Sort-Object -Unique
    )
}

function Get-WorkflowRuns {
    param(
        [string]$Branch = '',
        [int]$Limit = 20
    )

    $args = @(
        'run', 'list',
        '--workflow', $workflow,
        '--limit', $Limit,
        '--json', 'databaseId,headBranch,headSha,status,conclusion,createdAt,displayTitle,event'
    )

    if ($Branch) {
        $args += @('--branch', $Branch)
    }

    $json = Invoke-GhText -Args $args
    if (-not $json) {
        return @()
    }

    $runs = $json | ConvertFrom-Json
    return @($runs)
}

function Get-VersionInfoFromRemoteRef {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Ref
    )

    $repo = Get-RepoNameWithOwner
    $encodedRef = [uri]::EscapeDataString($Ref)
    $json = Invoke-GhText -Args @('api', "repos/$repo/contents/package.json?ref=$encodedRef")
    if (-not $json) {
        return $null
    }

    $file = $json | ConvertFrom-Json
    if (-not $file.content) {
        return $null
    }

    $base64 = ($file.content -replace '\s', '')
    $packageJson = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($base64)) | ConvertFrom-Json
    $rawVersion = [string]$packageJson.version
    if (-not $rawVersion) {
        return $null
    }

    $displayVersion = $rawVersion -replace '(\.0)+$', ''
    if (-not $displayVersion) {
        $displayVersion = $rawVersion
    }

    $displayVersion = $displayVersion -replace '[\\/:*?"<>|]', '-'

    return [PSCustomObject]@{
        Raw = $rawVersion
        Display = $displayVersion
        Ref = $Ref
    }
}

function Select-FromList {
    param(
        [string]$Prompt,
        [object[]]$Items,
        [scriptblock]$Display
    )

    if (-not $Items -or $Items.Count -eq 0) {
        return $null
    }

    for ($i = 0; $i -lt $Items.Count; $i++) {
        $label = & $Display $Items[$i] ($i + 1)
        Write-Host $label
    }

    while ($true) {
        $choice = Read-Host $Prompt
        if ($choice -match '^\d+$') {
            $index = [int]$choice
            if ($index -ge 1 -and $index -le $Items.Count) {
                return $Items[$index - 1]
            }
        }
        Write-Host 'Invalid selection. Enter a listed number.'
    }
}

function Wait-ForNewRun {
    param(
        [string]$Branch,
        [Nullable[int64]]$PreviousId,
        [datetimeoffset]$TriggeredAt
    )

    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        $runs = Get-WorkflowRuns -Branch $Branch -Limit 10 |
            Where-Object { $_.event -eq 'workflow_dispatch' } |
            Sort-Object { [datetimeoffset]$_.createdAt } -Descending

        $run = $runs | Where-Object {
            ([datetimeoffset]$_.createdAt) -ge $TriggeredAt.AddSeconds(-10) -and
            (-not $PreviousId -or [int64]$_.databaseId -ne $PreviousId)
        } | Select-Object -First 1

        if ($run) {
            return $run
        }

        Start-Sleep -Seconds 2
    }

    throw 'Unable to determine the new workflow run ID.'
}

function Download-RunArtifact {
    param(
        [Parameter(Mandatory = $true)]
        [int64]$RunId,
        [string]$VersionRef = ''
    )

    if (-not (Test-Path $outputRoot)) {
        New-Item -ItemType Directory -Path $outputRoot | Out-Null
    }

    $runOutput = Join-Path $outputRoot ("run-{0}" -f $RunId)
    if (Test-Path $runOutput) {
        Remove-Item -Path $runOutput -Recurse -Force
    }
    New-Item -ItemType Directory -Path $runOutput | Out-Null

    $versionInfo = $null
    if ($VersionRef) {
        try {
            $versionInfo = Get-VersionInfoFromRemoteRef -Ref $VersionRef
        }
        catch {
            Write-Host ("[WARN] Unable to read remote version from ref {0}. Falling back to run ID naming." -f $VersionRef)
        }
    }

    $finalFileName = if ($versionInfo) { '{0}.ipa' -f $versionInfo.Display } else { 'run-{0}.ipa' -f $RunId }
    $finalPath = Join-Path $outputRoot $finalFileName

    Write-Host ''
    Write-Host '[3/4] Downloading IPA artifact...'
    & $script:ghPath run download $RunId --name $artifactName --dir $runOutput
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to download artifact for run $RunId."
    }

    $ipa = Get-ChildItem -Path $runOutput -Filter *.ipa -Recurse -File | Select-Object -First 1

    Write-Host ''
    Write-Host '[4/4] Done.'
    if ($ipa) {
        if (Test-Path $finalPath) {
            Remove-Item -Path $finalPath -Force
        }
        Move-Item -Path $ipa.FullName -Destination $finalPath -Force
        Remove-Item -Path $runOutput -Recurse -Force
        if ($versionInfo) {
            Write-Host ("Version: {0}" -f $versionInfo.Raw)
        }
        Write-Host ("IPA: {0}" -f $finalPath)
    }
    else {
        Write-Host ("Artifact folder: {0}" -f $runOutput)
    }
}

function Start-BuildFlow {
    $branches = Get-RemoteBranches
    if (-not $branches -or $branches.Count -eq 0) {
        throw 'No remote branches were found.'
    }

    Write-Host ''
    Write-Host 'Select a branch to build:'
    $selectedBranch = Select-FromList -Prompt 'Enter branch number' -Items $branches -Display {
        param($item, $index)
        '[{0}] {1}' -f $index, $item
    }

    $previousRun = Get-WorkflowRuns -Branch $selectedBranch -Limit 1 |
        Where-Object { $_.event -eq 'workflow_dispatch' } |
        Select-Object -First 1

    Write-Host ''
    Write-Host ("[INFO] Selected branch: {0}" -f $selectedBranch)
    Write-Host '[INFO] Push your latest commits before running this build.'
    Write-Host ''
    Write-Host '[1/4] Triggering GitHub Actions workflow...'

    $triggeredAt = [datetimeoffset]::UtcNow
    & $script:ghPath workflow run $workflow --ref $selectedBranch
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to trigger workflow for branch $selectedBranch."
    }

    $previousId = if ($previousRun) { [int64]$previousRun.databaseId } else { $null }
    $run = Wait-ForNewRun -Branch $selectedBranch -PreviousId $previousId -TriggeredAt $triggeredAt
    $runId = [int64]$run.databaseId

    Write-Host ("[INFO] Workflow run ID: {0}" -f $runId)
    Write-Host ''
    Write-Host '[2/4] Waiting for the build to finish...'
    & $script:ghPath run watch $runId --exit-status
    if ($LASTEXITCODE -ne 0) {
        $detailsUrl = Invoke-GhText -Args @('run', 'view', $runId, '--json', 'url', '--jq', '.url')
        throw ("GitHub Actions build failed. Details: {0}" -f $detailsUrl)
    }

    $versionRef = if ($run.headSha) { [string]$run.headSha } else { $selectedBranch }
    Download-RunArtifact -RunId $runId -VersionRef $versionRef
}

function Start-DownloadFlow {
    $runs = Get-WorkflowRuns -Limit 30 |
        Where-Object { $_.conclusion -eq 'success' } |
        Sort-Object { [datetimeoffset]$_.createdAt } -Descending

    if (-not $runs -or $runs.Count -eq 0) {
        throw 'No successful iOS builds were found on GitHub.'
    }

    Write-Host ''
    Write-Host 'Select a build to download:'
    $selectedRun = Select-FromList -Prompt 'Enter build number' -Items $runs -Display {
        param($item, $index)
        $time = ([datetimeoffset]$item.createdAt).ToLocalTime().ToString('yyyy-MM-dd HH:mm:ss')
        '[{0}] {1} | branch: {2} | run: {3}' -f $index, $time, $item.headBranch, $item.databaseId
    }

    $versionRef = if ($selectedRun.headSha) { [string]$selectedRun.headSha } else { [string]$selectedRun.headBranch }
    Download-RunArtifact -RunId ([int64]$selectedRun.databaseId) -VersionRef $versionRef
}

try {
    $script:ghPath = Find-GhPath

    if (-not (Test-GhAuth)) {
        throw 'GitHub CLI is not authenticated. Run: gh auth login'
    }

    Write-Host 'Select an action:'
    Write-Host '[1] Build and download iOS IPA'
    Write-Host '[2] Download existing iOS build'
    Write-Host '[3] Exit'

    while ($true) {
        $mode = Read-Host 'Enter option number'
        switch ($mode) {
            '1' {
                Start-BuildFlow
                exit 0
            }
            '2' {
                Start-DownloadFlow
                exit 0
            }
            '3' {
                Write-Host 'Exited.'
                exit 0
            }
            default {
                Write-Host 'Invalid selection. Enter 1, 2, or 3.'
            }
        }
    }
}
catch {
    Write-Host ''
    Write-Host ('[ERROR] {0}' -f $_.Exception.Message)
    exit 1
}
