param(
  [string]$ServerAddress = "194.67.103.218",
  [string]$ServerUser = "root",
  [string]$Domain = "smena-academy.ru",
  [string]$ProjectName = "smena-academy",
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
    [Parameter(Mandatory = $true)][string]$Value
  )

  if ($Value -match '[\x00-\x1F\x7F]') {
    throw "$Name contains a control character."
  }

  # EnvironmentFile supports double-quoted values. Escape the characters that
  # systemd treats specially inside double quotes.
  $escapedValue = $Value.Replace('\', '\\')
  $escapedValue = $escapedValue.Replace('"', '\"')
  $escapedValue = $escapedValue.Replace('$', '\$')
  $escapedValue = $escapedValue.Replace('`', '\`')
  return "$Name=`"$escapedValue`""
}

if (-not (Test-Path -LiteralPath $KeyPath -PathType Leaf)) {
  throw "SSH private key was not found: $KeyPath"
}

$terminalKey = (Read-Host "T-Bank TerminalKey").Trim()
if ($terminalKey -notmatch '^[A-Za-z0-9_-]{3,64}$') {
  throw "TerminalKey has an unexpected format. Use the terminal identifier from T-Business."
}

$securePassword = Read-Host "T-Bank terminal Password (input is hidden)" -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)

try {
  $terminalPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  if ([string]::IsNullOrEmpty($terminalPassword) -or $terminalPassword.Length -gt 256) {
    throw "Terminal Password must contain from 1 to 256 characters."
  }

  $environmentFile = @(
    ConvertTo-SystemdEnvironmentLine -Name "TBANK_TERMINAL_KEY" -Value $terminalKey
    ConvertTo-SystemdEnvironmentLine -Name "TBANK_PASSWORD" -Value $terminalPassword
    ConvertTo-SystemdEnvironmentLine -Name "PUBLIC_BASE_URL" -Value "https://$Domain"
  ) -join "`n"
  $encodedEnvironment = [Convert]::ToBase64String(
    [Text.Encoding]::UTF8.GetBytes("$environmentFile`n")
  )

  $remoteCommand = @'
set -eu
TEMP_FILE=$(mktemp /tmp/__PROJECT__-env.XXXXXX)
trap 'rm -f "$TEMP_FILE"' EXIT
base64 -d > "$TEMP_FILE"
test -s "$TEMP_FILE"
install -o root -g root -m 600 "$TEMP_FILE" /etc/__PROJECT__.env
if systemctl list-unit-files '__PROJECT__.service' --no-legend 2>/dev/null | grep -q '__PROJECT__.service'; then
  systemctl restart '__PROJECT__.service'
  systemctl is-active --quiet '__PROJECT__.service'
fi
'@.Replace("__PROJECT__", $ProjectName)

  Write-Host "Saving acquiring credentials on the server..."
  $encodedEnvironment | & ssh.exe -o BatchMode=yes -o ConnectTimeout=12 `
    -i $KeyPath $target $remoteCommand
  Assert-NativeCommand "T-Bank configuration"

  Write-Host "T-Bank credentials saved to /etc/$ProjectName.env (root:root, mode 600)."
  Write-Host "The secret was not written to the project or printed to the terminal."
}
finally {
  if ($passwordPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
  }
  $terminalPassword = $null
  $environmentFile = $null
  $encodedEnvironment = $null
}
