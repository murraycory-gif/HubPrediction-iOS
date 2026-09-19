# Take back the desk address. Soft FAIL changing 8080.
$ports = @(8080, 18080, 18081, 18082, 18083, 18084, 18085, 18086, 18087, 18088, 18089, 12783)

function Stop-ListenPort([int]$Port) {
  try {
    Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop |
      ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
    return
  } catch {}
  netstat -ano | ForEach-Object {
    if ($_ -match ":$Port\s+" -and $_ -match 'LISTENING\s+(\d+)\s*$') {
      Stop-Process -Id $Matches[1] -Force -ErrorAction SilentlyContinue
    }
  }
}

foreach ($port in $ports) { Stop-ListenPort $port }

Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -match '^node(\.exe)?$' -and $_.CommandLine -match 'desk-host\.mjs' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Start-Sleep -Milliseconds 400
