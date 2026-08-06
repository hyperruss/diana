param(
  [string]$ServerAddress = "194.67.103.218",
  [string]$ServerUser = "root",
  [string]$Domain = "smena-academy.ru",
  [string]$ProjectName = "smena-academy",
  [string]$KeyPath = (Join-Path $env:USERPROFILE ".ssh\id_ed25519")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$releaseId = Get-Date -Format "yyyyMMddHHmmss"
$stagingPath = "/tmp/$ProjectName-$releaseId"
$releasePath = "/var/www/$ProjectName/releases/$releaseId"
$archiveRemote = "/tmp/$ProjectName-$releaseId.tar.gz"
$nginxRemote = "/tmp/$ProjectName-nginx-$releaseId.conf"
$archiveLocal = Join-Path ([System.IO.Path]::GetTempPath()) "$ProjectName-$releaseId.tar.gz"
$target = "$ServerUser@$ServerAddress"

function Assert-NativeCommand {
  param([string]$Action)

  if ($LASTEXITCODE -ne 0) {
    throw "$Action failed with exit code $LASTEXITCODE."
  }
}

if (-not (Test-Path -LiteralPath $KeyPath -PathType Leaf)) {
  throw "SSH private key was not found: $KeyPath"
}

if (-not (Get-Command ssh.exe -ErrorAction SilentlyContinue)) {
  throw "ssh.exe was not found. Install the Windows OpenSSH client."
}

if (-not (Get-Command scp.exe -ErrorAction SilentlyContinue)) {
  throw "scp.exe was not found. Install the Windows OpenSSH client."
}

if (-not (Get-Command tar.exe -ErrorAction SilentlyContinue)) {
  throw "tar.exe was not found. Install the Windows tar client."
}

Push-Location $projectRoot

try {
  Write-Host "[1/6] Building the production bundle..."
  & npm.cmd run build
  Assert-NativeCommand "Production build"

  $indexPath = Join-Path $projectRoot "dist\index.html"
  if (-not (Test-Path -LiteralPath $indexPath -PathType Leaf)) {
    throw "Production build is incomplete: dist/index.html was not found."
  }

  Write-Host "[2/6] Packing the release..."
  & tar.exe -czf $archiveLocal -C (Join-Path $projectRoot "dist") .
  Assert-NativeCommand "Release archive creation"

  Write-Host "[3/6] Checking SSH and creating staging..."
  & ssh.exe -o BatchMode=yes -o ConnectTimeout=12 -i $KeyPath $target `
    "mkdir -p '$stagingPath/public'"
  Assert-NativeCommand "Remote staging setup"

  Write-Host "[4/6] Uploading the frontend and Nginx configuration..."
  & scp.exe -o BatchMode=yes -i $KeyPath $archiveLocal "${target}:${archiveRemote}"
  Assert-NativeCommand "Release archive upload"

  & scp.exe -o BatchMode=yes -i $KeyPath `
    (Join-Path $PSScriptRoot "smena-academy.conf") `
    "${target}:${nginxRemote}"
  Assert-NativeCommand "Nginx configuration upload"

  Write-Host "[5/6] Activating release $releaseId..."
  $remoteScript = @'
set -eu

PROJECT='__PROJECT__'
DOMAIN='__DOMAIN__'
STAGING='__STAGING__'
RELEASE='__RELEASE__'
ARCHIVE='__ARCHIVE__'
NGINX_UPLOAD='__NGINX_UPLOAD__'
CURRENT="/var/www/$PROJECT/current"
NGINX_CONFIG="/etc/nginx/sites-available/$PROJECT.conf"
NGINX_LINK="/etc/nginx/sites-enabled/$PROJECT.conf"
NGINX_BACKUP="/tmp/$PROJECT-nginx-backup-__RELEASE_ID__.conf"
PREVIOUS=$(readlink -f "$CURRENT" 2>/dev/null || true)

rollback() {
  echo 'Deployment check failed. Rolling back...' >&2
  if [ -n "$PREVIOUS" ] && [ -d "$PREVIOUS" ]; then
    ln -sfn "$PREVIOUS" "$CURRENT"
  fi
  if [ -f "$NGINX_BACKUP" ]; then
    install -o root -g root -m 644 "$NGINX_BACKUP" "$NGINX_CONFIG"
  fi
  nginx -t >/dev/null 2>&1 || true
  systemctl reload nginx || true
}

if [ -e "$RELEASE" ]; then
  echo "Release already exists: $RELEASE" >&2
  exit 1
fi

if [ -f "$NGINX_CONFIG" ]; then
  cp "$NGINX_CONFIG" "$NGINX_BACKUP"
fi

tar -xzf "$ARCHIVE" -C "$STAGING/public"
test -f "$STAGING/public/index.html"

mv "$STAGING" "$RELEASE"
chown -R root:www-data "$RELEASE"
find "$RELEASE" -type d -exec chmod 750 {} +
find "$RELEASE" -type f -exec chmod 640 {} +
find "$RELEASE/public" -type d -exec chmod 755 {} +
find "$RELEASE/public" -type f -exec chmod 644 {} +

install -o root -g root -m 644 "$NGINX_UPLOAD" "$NGINX_CONFIG"
ln -sfn "$NGINX_CONFIG" "$NGINX_LINK"
ln -sfn "$RELEASE" "$CURRENT"

if ! nginx -t; then
  rollback
  exit 1
fi

systemctl reload nginx

if ! curl --fail --silent --show-error --max-time 20 \
  --resolve "$DOMAIN:443:127.0.0.1" \
  "https://$DOMAIN/documents" | grep -q '<div id="root"></div>';
then
  rollback
  exit 1
fi

rm -f "$ARCHIVE" "$NGINX_UPLOAD" "$NGINX_BACKUP"
printf 'Activated release: %s\nPrevious release: %s\n' "$RELEASE" "$PREVIOUS"
'@

  $remoteScript = $remoteScript.Replace("__PROJECT__", $ProjectName)
  $remoteScript = $remoteScript.Replace("__DOMAIN__", $Domain)
  $remoteScript = $remoteScript.Replace("__STAGING__", $stagingPath)
  $remoteScript = $remoteScript.Replace("__RELEASE__", $releasePath)
  $remoteScript = $remoteScript.Replace("__ARCHIVE__", $archiveRemote)
  $remoteScript = $remoteScript.Replace("__NGINX_UPLOAD__", $nginxRemote)
  $remoteScript = $remoteScript.Replace("__RELEASE_ID__", $releaseId)

  $remoteScript | & ssh.exe -o BatchMode=yes -o ConnectTimeout=12 `
    -i $KeyPath $target "bash -s"
  Assert-NativeCommand "Release activation"

  Write-Host "[6/6] Checking the public website..."
  & curl.exe --fail --silent --show-error --max-time 25 --output NUL `
    "https://$Domain/documents"
  Assert-NativeCommand "Public website check"

  Write-Host ""
  Write-Host "Deployment completed: https://$Domain"
  Write-Host "Release: $releaseId"
  Write-Host "Old releases were preserved for rollback."
}
finally {
  Pop-Location

  if (Test-Path -LiteralPath $archiveLocal) {
    Remove-Item -LiteralPath $archiveLocal -Force
  }
}
