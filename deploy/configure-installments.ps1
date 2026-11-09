param(
  [string]$ServerAddress = "91.197.96.7",
  [string]$ServerUser = "root",
  [string]$ProjectName = "smena-academy",
  [string]$ShopId = "35bb5137-06c0-4c9e-91bc-a28a1b40b08d",
  [string]$ShowcaseId = "bc224ee9-9d68-4ec7-8cf3-2a314f7d2b1e",
  [string]$PromoCode6 = "installment_0_0_6_8,6",
  [string]$PromoCode12 = "installment_0_0_12_15,2",
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

function Read-RequiredValue {
  param(
    [Parameter(Mandatory = $true)][string]$Prompt,
    [Parameter(Mandatory = $true)][int]$MaximumLength
  )

  $value = (Read-Host $Prompt).Trim()
  if ([string]::IsNullOrWhiteSpace($value) -or $value.Length -gt $MaximumLength) {
    throw "$Prompt must contain from 1 to $MaximumLength characters."
  }
  if ($value -match '[\x00-\x1F\x7F]') {
    throw "$Prompt contains a control character."
  }
  return $value
}

function ConvertTo-SystemdEnvironmentLine {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Value
  )

  $escapedValue = $Value.Replace('\', '\\')
  $escapedValue = $escapedValue.Replace('"', '\"')
  $escapedValue = $escapedValue.Replace('$', '\$')
  $escapedValue = $escapedValue.Replace('`', '\`')
  return "$Name=`"$escapedValue`""
}

if (-not (Test-Path -LiteralPath $KeyPath -PathType Leaf)) {
  throw "SSH private key was not found: $KeyPath"
}

Write-Host "Enter the values from T-Business: Stores -> Online -> Integration -> Lending."
if ([string]::IsNullOrWhiteSpace($ShopId)) {
  $ShopId = Read-RequiredValue -Prompt "T-Bank installment shopId" -MaximumLength 50
}
if ([string]::IsNullOrWhiteSpace($ShowcaseId)) {
  $ShowcaseId = Read-RequiredValue -Prompt "T-Bank installment showcaseId" -MaximumLength 50
}
if ([string]::IsNullOrWhiteSpace($PromoCode6)) {
  $PromoCode6 = Read-RequiredValue -Prompt "promoCode for 6 months" -MaximumLength 64
}
if ([string]::IsNullOrWhiteSpace($PromoCode12)) {
  $PromoCode12 = Read-RequiredValue -Prompt "promoCode for 12 months" -MaximumLength 64
}

$secureApiPassword = Read-Host "T-Bank installment API password (input is hidden)" -AsSecureString
$apiPasswordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureApiPassword)

try {
  $apiPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($apiPasswordPointer)

  foreach ($entry in @(
    @{ Name = "shopId"; Value = $ShopId; MaximumLength = 50 },
    @{ Name = "showcaseId"; Value = $ShowcaseId; MaximumLength = 50 },
    @{ Name = "promoCode for 6 months"; Value = $PromoCode6; MaximumLength = 64 },
    @{ Name = "promoCode for 12 months"; Value = $PromoCode12; MaximumLength = 64 },
    @{ Name = "installment API password"; Value = $apiPassword; MaximumLength = 256 }
  )) {
    if ([string]::IsNullOrWhiteSpace($entry.Value) -or
        $entry.Value.Length -gt $entry.MaximumLength -or
        $entry.Value -match '[\x00-\x1F\x7F]') {
      throw "$($entry.Name) has an unexpected format."
    }
  }

  $environmentLines = @(
    ConvertTo-SystemdEnvironmentLine -Name "TBANK_INSTALLMENT_SHOP_ID" -Value $ShopId
    ConvertTo-SystemdEnvironmentLine -Name "TBANK_INSTALLMENT_SHOWCASE_ID" -Value $ShowcaseId
    ConvertTo-SystemdEnvironmentLine -Name "TBANK_INSTALLMENT_API_PASSWORD" -Value $apiPassword
    ConvertTo-SystemdEnvironmentLine -Name "TBANK_INSTALLMENT_PROMO_CODE_6" -Value $PromoCode6
    ConvertTo-SystemdEnvironmentLine -Name "TBANK_INSTALLMENT_PROMO_CODE_12" -Value $PromoCode12
  ) -join "`n"
  $encodedEnvironment = [Convert]::ToBase64String(
    [Text.Encoding]::UTF8.GetBytes("$environmentLines`n")
  )

$remoteCommand = @'
set -eu
CURRENT_FILE=/etc/__PROJECT__.env
TEMP_FILE=$(mktemp /tmp/__PROJECT__-installments-env.XXXXXX)
MERGED_FILE=$(mktemp /tmp/__PROJECT__-env-merged.XXXXXX)
trap 'rm -f "$TEMP_FILE" "$MERGED_FILE"' EXIT
tr -d '\r' | base64 -d > "$TEMP_FILE"
test -s "$TEMP_FILE"
if [ -f "$CURRENT_FILE" ]; then
  grep -Ev '^(TBANK_INSTALLMENT_SHOP_ID|TBANK_INSTALLMENT_SHOWCASE_ID|TBANK_INSTALLMENT_API_PASSWORD|TBANK_INSTALLMENT_PROMO_CODE|TBANK_INSTALLMENT_PROMO_CODE_6|TBANK_INSTALLMENT_PROMO_CODE_12)=' "$CURRENT_FILE" \
    > "$MERGED_FILE" || true
fi
cat "$TEMP_FILE" >> "$MERGED_FILE"
install -o root -g root -m 600 "$MERGED_FILE" "$CURRENT_FILE"
if systemctl list-unit-files '__PROJECT__.service' --no-legend 2>/dev/null | grep -q '__PROJECT__.service'; then
  systemctl restart '__PROJECT__.service'
  systemctl is-active --quiet '__PROJECT__.service'
fi
'@.Replace("__PROJECT__", $ProjectName)

  Write-Host "Saving installment parameters on the server..."
  $encodedEnvironment | & ssh.exe -o BatchMode=yes -o ConnectTimeout=12 `
    -i $KeyPath $target $remoteCommand
  Assert-NativeCommand "T-Bank installment configuration"
  Write-Host "Installment parameters saved to /etc/$ProjectName.env (root:root, mode 600)."
  Write-Host "The API password was not written to the project or printed to the terminal."
} finally {
  if ($apiPasswordPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($apiPasswordPointer)
  }
  $apiPassword = $null
  $environmentLines = $null
  $encodedEnvironment = $null
}
