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
$frontendRemote = "/tmp/$ProjectName-frontend-$releaseId.tar.gz"
$serverRemote = "/tmp/$ProjectName-server-$releaseId.tar.gz"
$nginxRemote = "/tmp/$ProjectName-nginx-$releaseId.conf"
$serviceRemote = "/tmp/$ProjectName-service-$releaseId.service"
$frontendLocal = Join-Path ([System.IO.Path]::GetTempPath()) "$ProjectName-frontend-$releaseId.tar.gz"
$serverLocal = Join-Path ([System.IO.Path]::GetTempPath()) "$ProjectName-server-$releaseId.tar.gz"
$target = "$ServerUser@$ServerAddress"

function Assert-NativeCommand {
  param([string]$Action)

  if ($LASTEXITCODE -ne 0) {
    throw "$Action failed with exit code $LASTEXITCODE."
  }
}

foreach ($command in @("ssh.exe", "scp.exe", "tar.exe")) {
  if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
    throw "$command was not found. Install the Windows OpenSSH and tar clients."
  }
}

if (-not (Test-Path -LiteralPath $KeyPath -PathType Leaf)) {
  throw "SSH private key was not found: $KeyPath"
}

Push-Location $projectRoot

try {
  Write-Host "[1/7] Running payment tests and production build..."
  & npm.cmd run check
  Assert-NativeCommand "Project checks"

  if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "dist\index.html") -PathType Leaf)) {
    throw "Production build is incomplete: dist/index.html was not found."
  }

  Write-Host "[2/7] Packing frontend and payment API..."
  & tar.exe -czf $frontendLocal -C (Join-Path $projectRoot "dist") .
  Assert-NativeCommand "Frontend archive creation"
  & tar.exe -czf $serverLocal -C (Join-Path $projectRoot "server") .
  Assert-NativeCommand "Payment API archive creation"

  Write-Host "[3/7] Checking SSH and creating staging..."
  & ssh.exe -o BatchMode=yes -o ConnectTimeout=12 -i $KeyPath $target `
    "mkdir -p '$stagingPath/public' '$stagingPath/server'"
  Assert-NativeCommand "Remote staging setup"

  Write-Host "[4/7] Uploading release and server configuration..."
  & scp.exe -o BatchMode=yes -i $KeyPath $frontendLocal "${target}:${frontendRemote}"
  Assert-NativeCommand "Frontend upload"
  & scp.exe -o BatchMode=yes -i $KeyPath $serverLocal "${target}:${serverRemote}"
  Assert-NativeCommand "Payment API upload"
  & scp.exe -o BatchMode=yes -i $KeyPath `
    (Join-Path $PSScriptRoot "smena-academy.conf") "${target}:${nginxRemote}"
  Assert-NativeCommand "Nginx configuration upload"
  & scp.exe -o BatchMode=yes -i $KeyPath `
    (Join-Path $PSScriptRoot "smena-academy.service") "${target}:${serviceRemote}"
  Assert-NativeCommand "systemd service upload"

  Write-Host "[5/7] Activating release $releaseId..."
  $remoteScript = @'
set -eu

PROJECT='__PROJECT__'
DOMAIN='__DOMAIN__'
STAGING='__STAGING__'
RELEASE='__RELEASE__'
FRONTEND_ARCHIVE='__FRONTEND_ARCHIVE__'
SERVER_ARCHIVE='__SERVER_ARCHIVE__'
NGINX_UPLOAD='__NGINX_UPLOAD__'
SERVICE_UPLOAD='__SERVICE_UPLOAD__'
CURRENT="/var/www/$PROJECT/current"
DATA_DIRECTORY="/var/lib/$PROJECT"
NGINX_CONFIG="/etc/nginx/sites-available/$PROJECT.conf"
NGINX_LINK="/etc/nginx/sites-enabled/$PROJECT.conf"
SERVICE_FILE="/etc/systemd/system/$PROJECT.service"
NGINX_BACKUP="/tmp/$PROJECT-nginx-backup-__RELEASE_ID__.conf"
SERVICE_BACKUP="/tmp/$PROJECT-service-backup-__RELEASE_ID__.service"
PREVIOUS=$(readlink -f "$CURRENT" 2>/dev/null || true)
HAD_NGINX=0
HAD_SERVICE=0
ACTIVATED=0

rollback() {
  set +e
  if [ "$ACTIVATED" -eq 1 ]; then
    echo 'Deployment check failed. Rolling back...' >&2
    if [ -n "$PREVIOUS" ] && [ -d "$PREVIOUS" ]; then
      ln -sfn "$PREVIOUS" "$CURRENT"
    fi
    if [ "$HAD_NGINX" -eq 1 ]; then
      install -o root -g root -m 644 "$NGINX_BACKUP" "$NGINX_CONFIG"
    else
      rm -f "$NGINX_CONFIG" "$NGINX_LINK"
    fi
    if [ "$HAD_SERVICE" -eq 1 ]; then
      install -o root -g root -m 644 "$SERVICE_BACKUP" "$SERVICE_FILE"
    else
      systemctl stop "$PROJECT.service" >/dev/null 2>&1 || true
      systemctl disable "$PROJECT.service" >/dev/null 2>&1 || true
      rm -f "$SERVICE_FILE"
    fi
    systemctl daemon-reload
    if [ "$HAD_SERVICE" -eq 1 ] && [ -n "$PREVIOUS" ]; then
      systemctl restart "$PROJECT.service" >/dev/null 2>&1 || true
    fi
    nginx -t >/dev/null 2>&1 && systemctl reload nginx || true
  fi
}

trap rollback EXIT

if [ -e "$RELEASE" ]; then
  echo "Release already exists: $RELEASE" >&2
  exit 1
fi

if [ -f "$NGINX_CONFIG" ]; then
  cp "$NGINX_CONFIG" "$NGINX_BACKUP"
  HAD_NGINX=1
fi
if [ -f "$SERVICE_FILE" ]; then
  cp "$SERVICE_FILE" "$SERVICE_BACKUP"
  HAD_SERVICE=1
fi

tar -xzf "$FRONTEND_ARCHIVE" -C "$STAGING/public"
tar -xzf "$SERVER_ARCHIVE" -C "$STAGING/server"
test -f "$STAGING/public/index.html"
test -f "$STAGING/server/index.js"

mv "$STAGING" "$RELEASE"
chown -R root:www-data "$RELEASE"
find "$RELEASE" -type d -exec chmod 750 {} +
find "$RELEASE" -type f -exec chmod 640 {} +
find "$RELEASE/public" -type d -exec chmod 755 {} +
find "$RELEASE/public" -type f -exec chmod 644 {} +

install -d -o www-data -g www-data -m 700 "$DATA_DIRECTORY"
install -o root -g root -m 644 "$NGINX_UPLOAD" "$NGINX_CONFIG"
install -o root -g root -m 644 "$SERVICE_UPLOAD" "$SERVICE_FILE"
ln -sfn "$NGINX_CONFIG" "$NGINX_LINK"
ln -sfn "$RELEASE" "$CURRENT"
ACTIVATED=1

nginx -t
systemctl daemon-reload
systemctl enable "$PROJECT.service" >/dev/null
systemctl restart "$PROJECT.service"
systemctl is-active --quiet "$PROJECT.service"
systemctl reload nginx

echo 'Checking local payment API...'
API_READY=0
ATTEMPT=0
while [ "$ATTEMPT" -lt 30 ]; do
  if curl --noproxy '*' --fail --silent --max-time 2 \
    'http://127.0.0.1:3000/api/health' | grep -Fq '"ok":true'; then
    API_READY=1
    break
  fi
  ATTEMPT=$((ATTEMPT + 1))
  sleep 0.5
done
if [ "$API_READY" -ne 1 ]; then
  systemctl status "$PROJECT.service" --no-pager -l || true
  journalctl -u "$PROJECT.service" -n 40 --no-pager || true
  echo 'Payment API did not become ready.' >&2
  exit 1
fi
echo 'Checking frontend through Nginx...'
curl --noproxy '*' --fail --silent --show-error --max-time 20 \
  --resolve "$DOMAIN:443:127.0.0.1" \
  "https://$DOMAIN/documents" | grep -Fq '<div id="root"></div>'
echo 'Checking payment API through Nginx...'
curl --noproxy '*' --fail --silent --show-error --max-time 20 \
  --resolve "$DOMAIN:443:127.0.0.1" \
  "https://$DOMAIN/api/health" | grep -Fq '"ok":true'

ACTIVATED=0
trap - EXIT
rm -f "$FRONTEND_ARCHIVE" "$SERVER_ARCHIVE" "$NGINX_UPLOAD" "$SERVICE_UPLOAD" \
  "$NGINX_BACKUP" "$SERVICE_BACKUP"
printf 'Activated release: %s\nPrevious release: %s\n' "$RELEASE" "$PREVIOUS"
'@

  $remoteScript = $remoteScript.Replace("__PROJECT__", $ProjectName)
  $remoteScript = $remoteScript.Replace("__DOMAIN__", $Domain)
  $remoteScript = $remoteScript.Replace("__STAGING__", $stagingPath)
  $remoteScript = $remoteScript.Replace("__RELEASE__", $releasePath)
  $remoteScript = $remoteScript.Replace("__FRONTEND_ARCHIVE__", $frontendRemote)
  $remoteScript = $remoteScript.Replace("__SERVER_ARCHIVE__", $serverRemote)
  $remoteScript = $remoteScript.Replace("__NGINX_UPLOAD__", $nginxRemote)
  $remoteScript = $remoteScript.Replace("__SERVICE_UPLOAD__", $serviceRemote)
  $remoteScript = $remoteScript.Replace("__RELEASE_ID__", $releaseId)

  $remoteScript | & ssh.exe -o BatchMode=yes -o ConnectTimeout=12 `
    -i $KeyPath $target "bash -s"
  Assert-NativeCommand "Release activation"

  Write-Host "[6/7] Checking the public website and payment API..."
  & curl.exe --fail --silent --show-error --max-time 25 --output NUL `
    "https://$Domain/documents"
  Assert-NativeCommand "Public website check"
  & curl.exe --fail --silent --show-error --max-time 25 --output NUL `
    "https://$Domain/api/health"
  Assert-NativeCommand "Public payment API check"

  Write-Host "[7/7] Deployment completed."
  Write-Host "Website: https://$Domain"
  Write-Host "Release: $releaseId"
  Write-Host "Old releases and payment data were preserved."
}
finally {
  Pop-Location

  foreach ($archive in @($frontendLocal, $serverLocal)) {
    if (Test-Path -LiteralPath $archive) {
      Remove-Item -LiteralPath $archive -Force
    }
  }
}
