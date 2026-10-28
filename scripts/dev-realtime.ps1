param(
  [string]$BinaryPath = '',
  [int]$Port = 8001
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$realtimeDir = Join-Path $projectRoot 'centrifugo'

if (-not $BinaryPath) {
  $BinaryPath = Join-Path $realtimeDir 'centrifugo.exe'
}
if (-not (Test-Path -LiteralPath $BinaryPath -PathType Leaf)) {
  throw "Centrifugo is missing. Place centrifugo.exe in $realtimeDir or pass -BinaryPath."
}
$BinaryPath = (Resolve-Path -LiteralPath $BinaryPath).Path
if ($Port -lt 1 -or $Port -gt 65535) {
  throw 'Port must be between 1 and 65535.'
}

# Match Next.js development env precedence without writing secrets to output.
$values = @{}
foreach ($name in @('.env.development.local', '.env.local', '.env.development', '.env')) {
  $path = Join-Path $projectRoot $name
  if (-not (Test-Path -LiteralPath $path)) { continue }
  foreach ($line in Get-Content -LiteralPath $path) {
    if ($line -notmatch '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') { continue }
    $key = $Matches[1]
    if ($values.ContainsKey($key)) { continue }
    $value = $Matches[2].Trim()
    if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $values[$key] = $value
  }
}

$tokenSecret = $values['CENTRIFUGO_TOKEN_HMAC_SECRET']
$apiKey = $values['CENTRIFUGO_HTTP_API_KEY']
if (-not $apiKey) { $apiKey = $values['CENTRIFUGO_API_KEY'] }
if (-not $tokenSecret -or -not $apiKey) {
  throw 'CENTRIFUGO_TOKEN_HMAC_SECRET and CENTRIFUGO_HTTP_API_KEY (or CENTRIFUGO_API_KEY) are required in a local env file.'
}

$appUrl = $values['NEXT_PUBLIC_APP_URL']
if (-not $appUrl) { $appUrl = 'http://localhost:3000' }
$appOrigin = ([uri]$appUrl).GetLeftPart([System.UriPartial]::Authority)
$appHost = ([uri]$appUrl).Host

$config = Get-Content -LiteralPath (Join-Path $realtimeDir 'config.example.json') -Raw | ConvertFrom-Json
$config.client.token.hmac_secret_key = $tokenSecret
$config.client.allowed_origins = @('http://localhost:3000', 'http://127.0.0.1:3000', $appOrigin) | Select-Object -Unique
$config.http_api.key = $apiKey
$config.http_server.address = '0.0.0.0'
$config.http_server.port = [string]$Port
$config.log.level = 'info'
$config.PSObject.Properties.Remove('admin')

$configPath = Join-Path $realtimeDir 'config.dev.json'
$envPath = Join-Path $projectRoot '.env.development.local'
$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($configPath, ($config | ConvertTo-Json -Depth 20), $utf8)

# Keep the browser socket and server-side publish URL on the same local port.
$overrides = [ordered]@{
  NEXT_PUBLIC_CENTRIFUGO_WS_URL = "ws://${appHost}:${Port}/connection/websocket"
  CENTRIFUGO_HTTP_API_URL = "http://127.0.0.1:${Port}/api"
}
$lines = if (Test-Path -LiteralPath $envPath) { @(Get-Content -LiteralPath $envPath) } else { @() }
foreach ($key in $overrides.Keys) {
  $pattern = '^' + [regex]::Escape($key) + '='
  $lines = @($lines | Where-Object { $_ -notmatch $pattern })
  $lines += "$key=$($overrides[$key])"
}
[System.IO.File]::WriteAllLines($envPath, [string[]]$lines, $utf8)

Write-Host "Dev real-time configured for $appOrigin on port $Port. Restart Next.js if it is already running."
Push-Location $realtimeDir
try {
  # Centrifugo auto-loads .env from its working directory. The repository's
  # Next.js .env is not in Centrifugo format, so run from the realtime folder.
  & $BinaryPath --config $configPath checkconfig
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  & $BinaryPath --config $configPath
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
