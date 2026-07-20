# Money Manager PC Manager exporter
# Usage: open "PC Manager" in the Money Manager phone app, then run: powershell -ExecutionPolicy Bypass -File .\export.ps1
param(
    [string]$BaseUrl = "http://192.168.1.38:8888",
    [string]$Mbid = "1",
    [int]$FloorYear = 2010
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$exportsDir = Join-Path $root "exports"
$dataDir = Join-Path $root "data"
New-Item -ItemType Directory -Force $exportsDir | Out-Null
New-Item -ItemType Directory -Force $dataDir | Out-Null

# --- reachability check ---
try {
    $init = Invoke-WebRequest -Uri "$BaseUrl/moneyBook/getInitData" -UseBasicParsing -TimeoutSec 10
} catch {
    Write-Host "Cannot reach $BaseUrl" -ForegroundColor Red
    Write-Host "Open 'PC Manager' in the Money Manager phone app and check the IP address shown there matches." -ForegroundColor Yellow
    exit 1
}
$initText = [System.Text.Encoding]::UTF8.GetString($init.RawContentStream.ToArray())
Set-Content -Path (Join-Path $dataDir "initData.json") -Value $initText -Encoding utf8
Write-Host "Connected. Book mbid=$Mbid"

function Get-YearRows([int]$year) {
    $url = "$BaseUrl/moneyBook/getDataByPeriod?startDate=$year-01-01&endDate=$year-12-31&mbid=$Mbid&assetId="
    $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 30
    $text = [System.Text.Encoding]::UTF8.GetString($resp.RawContentStream.ToArray())
    return [xml]$text
}

# --- find data range: walk back from current year until an empty year past 2020 ---
$currentYear = (Get-Date).Year
$years = @()
for ($y = $currentYear; $y -ge $FloorYear; $y--) {
    $xml = $null
    foreach ($attempt in 1..2) {
        try { $xml = Get-YearRows $y; break } catch {
            Write-Host ("  {0}: request failed (attempt {1}): {2}" -f $y, $attempt, $_.Exception.Message) -ForegroundColor Yellow
        }
    }
    if ($null -eq $xml) {
        # phone server tends to stall on empty years; if we already have data, assume end of history
        if ($years.Count -gt 0) { break } else { exit 1 }
    }
    $count = [int]$xml.dataset.results
    Write-Host ("  {0}: {1} rows" -f $y, $count)
    if ($count -eq 0 -and $years.Count -gt 0) { break }
    if ($count -gt 0) { $years += @{ Year = $y; Xml = $xml; Count = $count } }
}
if ($years.Count -eq 0) { Write-Host "No transactions found." -ForegroundColor Red; exit 1 }

# --- per year: save .xls + collect transactions ---
$transactions = New-Object System.Collections.Generic.List[object]
foreach ($entry in ($years | Sort-Object { $_.Year })) {
    $y = $entry.Year
    $body = "startDate=$y-01-01&endDate=$y-12-31&mbid=$Mbid&assetId=&inOutType="
    $xlsPath = Join-Path $exportsDir "$y.xls"
    Invoke-WebRequest -Uri "$BaseUrl/moneyBook/getExcelFile" -Method POST -Body $body `
        -ContentType "application/x-www-form-urlencoded" -OutFile $xlsPath -UseBasicParsing -TimeoutSec 60
    Write-Host ("Saved {0} ({1:N0} bytes)" -f $xlsPath, (Get-Item $xlsPath).Length)

    foreach ($row in $entry.Xml.dataset.row) {
        $transactions.Add([pscustomobject]@{
            date        = $row.SelectSingleNode("mbDate").InnerText
            type        = $row.SelectSingleNode("inOutType").InnerText
            category    = $row.SelectSingleNode("mbCategory").InnerText
            subCategory = $row.SelectSingleNode("subCategory").InnerText
            content     = $row.SelectSingleNode("mbContent").InnerText
            detail      = $row.SelectSingleNode("mbDetailContent").InnerText
            amount      = [double]$row.SelectSingleNode("mbCash").InnerText
            assetId     = $row.SelectSingleNode("assetId").InnerText
            payType     = $row.SelectSingleNode("payType").InnerText
        })
    }
}

$sorted = $transactions | Sort-Object date
$json = ConvertTo-Json -InputObject @($sorted) -Depth 4 -Compress

# data/data.js is what index.html loads via <script src> (a plain fetch()
# of a local .json/.csv is blocked by browser CORS on file:// with no server;
# a same-folder <script src> is not, so the data ships as a JS file).
$exportedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm")
$dataJsPath = Join-Path $dataDir "data.js"
$dataJs = "window.MM_DATA = $json;`nwindow.MM_EXPORTED_AT = `"$exportedAt`";`n"
[System.IO.File]::WriteAllText($dataJsPath, $dataJs, (New-Object System.Text.UTF8Encoding($false)))
Write-Host ("Wrote {0} transactions -> {1}" -f $sorted.Count, $dataJsPath)

# portable copies for Excel / other tools - not read by the dashboard itself
$jsonPath = Join-Path $dataDir "transactions.json"
[System.IO.File]::WriteAllText($jsonPath, $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Host ("Wrote {0}" -f $jsonPath)

$csvCols = "date","type","category","subCategory","content","detail","amount","payType"
$csvPath = Join-Path $dataDir "transactions.csv"
$sorted | Select-Object $csvCols | Export-Csv -Path $csvPath -NoTypeInformation -Encoding utf8
Write-Host ("Wrote {0}" -f $csvPath)

Write-Host "Done. Open index.html" -ForegroundColor Green
