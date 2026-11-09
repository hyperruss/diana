param(
  [string]$ConfigPath = "",
  [string]$ServerAddress = "91.197.96.7",
  [string]$ServerUser = "root",
  [string]$Domain = "smena-academy.ru",
  [string]$ProjectName = "smena-academy",
  [string]$CompanyEmail = "grgrv.stnslv@gmail.com",
  [string]$Vat = "",
  [string]$Sno = "",
  [string]$KeyPath = (Join-Path $env:USERPROFILE ".ssh\id_ed25519")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$target = "$ServerUser@$ServerAddress"

function Assert-NativeCommand {
  param([string]$Action)
  if ($LASTEXITCODE -ne 0) {
    throw "$Action failed with exit code $LASTEXITCODE."
  }
}

function ConvertTo-SystemdEnvironmentLine {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Value
  )
  if ($Value -match '[\x00-\x1F\x7F]') {
    throw "$Name contains a control character."
  }
  $escapedValue = $Value.Replace('\', '\\')
  $escapedValue = $escapedValue.Replace('"', '\"')
  $escapedValue = $escapedValue.Replace('$', '\$')
  $escapedValue = $escapedValue.Replace('`', '\`')
  return "$Name=`"$escapedValue`""
}

if (-not (Test-Path -LiteralPath $KeyPath -PathType Leaf)) {
  throw "SSH private key was not found: $KeyPath"
}

if ([string]::IsNullOrWhiteSpace($ConfigPath)) {
  $downloads = Join-Path $env:USERPROFILE "Downloads"
  $candidate = Get-ChildItem -LiteralPath $downloads -File -Filter "*.xml*" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  $suggestion = if ($candidate) { $candidate.FullName } else { "" }
  $enteredPath = Read-Host "Path to the ATOL CMS XML file [$suggestion]"
  $ConfigPath = if ([string]::IsNullOrWhiteSpace($enteredPath)) {
    $suggestion
  } else {
    $enteredPath.Trim('"')
  }
}

if (-not (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) {
  throw "ATOL XML file was not found: $ConfigPath"
}

try {
  [xml]$xml = Get-Content -Raw -Encoding UTF8 -LiteralPath $ConfigPath
} catch {
  throw "The selected file is not a valid ATOL XML configuration."
}

$access = $xml.cms_params.shop.access
$inn = [string]$xml.cms_params.INN
$groupCode = [string]$access.group_code
$login = [string]$access.login
$atolPassword = [string]$access.password

if ($inn -notmatch '^(\d{10}|\d{12})$' -or
    [string]::IsNullOrWhiteSpace($groupCode) -or
    [string]::IsNullOrWhiteSpace($login) -or
    [string]::IsNullOrWhiteSpace($atolPassword)) {
  throw "The XML file does not contain a complete ATOL CMS configuration."
}
if ($CompanyEmail -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$') {
  throw "CompanyEmail is invalid."
}

$allowedVat = @(
  "none", "vat0", "vat5", "vat7", "vat10", "vat20", "vat22",
  "vat105", "vat107", "vat110", "vat120", "vat122"
)
$vat = if ([string]::IsNullOrWhiteSpace($Vat)) {
  (Read-Host "VAT for receipts (for example: none, vat22 or vat122)").Trim()
} else {
  $Vat.Trim()
}
if ($allowedVat -notcontains $vat) {
  throw "Unsupported VAT value. Nothing was changed on the server."
}

$allowedSno = @("", "osn", "usn_income", "usn_income_outcome", "envd", "esn", "patent")
$sno = if ([string]::IsNullOrWhiteSpace($Sno)) {
  (Read-Host "Tax system (blank if the cash register has one): osn, usn_income, usn_income_outcome, esn or patent").Trim()
} else {
  $Sno.Trim()
}
if ($allowedSno -notcontains $sno) {
  throw "Unsupported tax system value. Nothing was changed on the server."
}

Write-Host "Checking the ATOL API v4 credentials..."
$authBody = @{ login = $login; pass = $atolPassword } | ConvertTo-Json -Compress
try {
  $authResult = Invoke-RestMethod -Method Post `
    -Uri "https://online.atol.ru/possystem/v4/getToken" `
    -ContentType "application/json; charset=utf-8" `
    -Body ([Text.Encoding]::UTF8.GetBytes($authBody)) `
    -TimeoutSec 15
} catch {
  throw "ATOL API v4 authorization request failed. Nothing was changed on the server."
}
if ($null -ne $authResult.error -or [string]::IsNullOrWhiteSpace([string]$authResult.token)) {
  throw "ATOL rejected the XML credentials. Nothing was changed on the server."
}

$environmentLines = @(
  ConvertTo-SystemdEnvironmentLine -Name "ATOL_LOGIN" -Value $login
  ConvertTo-SystemdEnvironmentLine -Name "ATOL_PASSWORD" -Value $atolPassword
  ConvertTo-SystemdEnvironmentLine -Name "ATOL_GROUP_CODE" -Value $groupCode
  ConvertTo-SystemdEnvironmentLine -Name "ATOL_INN" -Value $inn
  ConvertTo-SystemdEnvironmentLine -Name "ATOL_COMPANY_EMAIL" -Value $CompanyEmail
  ConvertTo-SystemdEnvironmentLine -Name "ATOL_VAT" -Value $vat
  ConvertTo-SystemdEnvironmentLine -Name "ATOL_SNO" -Value $sno
  ConvertTo-SystemdEnvironmentLine -Name "ATOL_API_BASE_URL" -Value "https://online.atol.ru/possystem/v4"
) -join "`n"
$encodedEnvironment = [Convert]::ToBase64String(
  [Text.Encoding]::UTF8.GetBytes("$environmentLines`n")
)

$remoteCommand = @'
set -eu
CURRENT_FILE=/etc/__PROJECT__.env
TEMP_FILE=$(mktemp /tmp/__PROJECT__-atol-env.XXXXXX)
MERGED_FILE=$(mktemp /tmp/__PROJECT__-env-merged.XXXXXX)
trap 'rm -f "$TEMP_FILE" "$MERGED_FILE"' EXIT
tr -d '\r' | base64 -d > "$TEMP_FILE"
test -s "$TEMP_FILE"
if [ -f "$CURRENT_FILE" ]; then
  grep -Ev '^(ATOL_LOGIN|ATOL_PASSWORD|ATOL_GROUP_CODE|ATOL_INN|ATOL_COMPANY_EMAIL|ATOL_VAT|ATOL_SNO|ATOL_API_BASE_URL)=' "$CURRENT_FILE" \
    > "$MERGED_FILE" || true
fi
cat "$TEMP_FILE" >> "$MERGED_FILE"
install -o root -g root -m 600 "$MERGED_FILE" "$CURRENT_FILE"
if systemctl list-unit-files '__PROJECT__.service' --no-legend 2>/dev/null | grep -q '__PROJECT__.service'; then
  systemctl restart '__PROJECT__.service'
  systemctl is-active --quiet '__PROJECT__.service'
fi
'@.Replace("__PROJECT__", $ProjectName)

try {
  Write-Host "Saving ATOL credentials on the server..."
  $encodedEnvironment | & ssh.exe -o BatchMode=yes -o ConnectTimeout=12 `
    -i $KeyPath $target $remoteCommand
  Assert-NativeCommand "ATOL configuration"
  Write-Host "ATOL Online API v4 is configured in /etc/$ProjectName.env."
  Write-Host "The XML and its password were not uploaded or written to the project."
} finally {
  $atolPassword = $null
  $authBody = $null
  $environmentLines = $null
  $encodedEnvironment = $null
}
