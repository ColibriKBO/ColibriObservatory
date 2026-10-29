# Read-only analysis of ColibriGrab timestamp tests, run AFTER acquisition.
# Analyses the most recent D:\colibrigrab_tests\timing_* session.
$ErrorActionPreference = 'Stop'
$testRoot = 'D:\colibrigrab_tests'

$session = Get-ChildItem -LiteralPath $testRoot -Directory -Filter 'timing_*' |
    Sort-Object CreationTimeUtc -Descending |
    Select-Object -First 1
if ($null -eq $session) { throw "No timing_* session found under $testRoot" }

Write-Host "Analyzing $($session.FullName)" -ForegroundColor Cyan
$summary = @(
    foreach ($run in (Get-ChildItem -LiteralPath $session.FullName -Directory -Filter 'run_*' | Sort-Object Name)) {
        $files = @(Get-ChildItem -LiteralPath $run.FullName -File -Filter '*.rcd' | Sort-Object Name)
        if ($files.Count -eq 0) { continue }

        $rows = @(
            for ($i = 0; $i -lt $files.Count; $i++) {
                $creationDelta = $null
                $modificationDelta = $null
                if ($i -gt 0) {
                    $creationDelta = ($files[$i].CreationTimeUtc - $files[$i-1].CreationTimeUtc).TotalMilliseconds
                    $modificationDelta = ($files[$i].LastWriteTimeUtc - $files[$i-1].LastWriteTimeUtc).TotalMilliseconds
                }
                $lag = ($files[$i].LastWriteTimeUtc - $files[$i].CreationTimeUtc).TotalMilliseconds

                [PSCustomObject]@{
                    FrameIndex               = $i
                    Filename                 = $files[$i].Name
                    CreationUTC              = $files[$i].CreationTimeUtc.ToString('o')
                    LastWriteUTC             = $files[$i].LastWriteTimeUtc.ToString('o')
                    CreationDeltaMS          = $creationDelta
                    LastWriteDeltaMS         = $modificationDelta
                    LastWriteAfterCreationMS = $lag
                }
            }
        )

        $detailPath = Join-Path $run.FullName 'timestamp_diagnostics.csv'
        $rows | Export-Csv -LiteralPath $detailPath -NoTypeInformation

        $longGaps = @($rows | Where-Object { $null -ne $_.LastWriteDeltaMS -and $_.LastWriteDeltaMS -gt 75 }).Count
        $shortGaps = @($rows | Where-Object { $null -ne $_.LastWriteDeltaMS -and $_.LastWriteDeltaMS -le 10 }).Count
        $negativeGaps = @($rows | Where-Object { $null -ne $_.LastWriteDeltaMS -and $_.LastWriteDeltaMS -lt 0 }).Count
        $largestGap = ($rows | Measure-Object -Property LastWriteDeltaMS -Maximum).Maximum
        $largestLag = ($rows | Measure-Object -Property LastWriteAfterCreationMS -Maximum).Maximum

        [PSCustomObject]@{
            Run                     = $run.Name
            RCDFrames               = $files.Count
            GapsOver75ms            = $longGaps
            Intervals10msOrLess     = $shortGaps
            BackwardTimeSteps       = $negativeGaps
            MaxTimestampGapMS       = [math]::Round($largestGap, 2)
            MaxCreationToLastWriteMS = [math]::Round($largestLag, 2)
        }
    }
)

$summaryPath = Join-Path $session.FullName 'timing_summary.csv'
$summary | Export-Csv -LiteralPath $summaryPath -NoTypeInformation
$summary | Format-Table -AutoSize
Write-Host "Summary saved to: $summaryPath"
Write-Host 'Detailed per-frame CSVs are in each run_* folder.'
Write-Host 'No RCD files were modified.'
