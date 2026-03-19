#!/usr/bin/env bash

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "must run as root" >&2
  exit 1
fi

RUNTIME_BUNDLE_TARBALL="${RUNTIME_BUNDLE_TARBALL:-/tmp/nex-runtime-bundle.tgz}"
RUNTIME_BUNDLE_STRIP_COMPONENTS="${RUNTIME_BUNDLE_STRIP_COMPONENTS:-0}"
NODE_VERSION="${NODE_VERSION:-22}"
NEX_USER="${NEX_USER:-nex}"
RUNTIME_DIR="${RUNTIME_DIR:-/opt/nex/runtime}"
STATE_DIR="${STATE_DIR:-/opt/nex/state}"
CONFIG_DIR="${CONFIG_DIR:-/opt/nex/config}"
STAGING_DIR="${STAGING_DIR:-/opt/nex/staging}"
SERVICE_NAME="${SERVICE_NAME:-nex-runtime}"

if [ ! -f "$RUNTIME_BUNDLE_TARBALL" ]; then
  echo "runtime bundle tarball not found: $RUNTIME_BUNDLE_TARBALL" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y curl jq ca-certificates gnupg ufw fail2ban unattended-upgrades

mkdir -p /etc/apt/keyrings
if [ ! -f /etc/apt/keyrings/nodesource.gpg ]; then
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
fi
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_VERSION}.x nodistro main" \
  >/etc/apt/sources.list.d/nodesource.list
apt-get update
apt-get install -y nodejs

corepack enable
corepack prepare pnpm@10.23.0 --activate

if ! id "$NEX_USER" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir /opt/nex --shell /bin/bash "$NEX_USER"
fi

mkdir -p "$RUNTIME_DIR" "$STATE_DIR" "$CONFIG_DIR" "$STAGING_DIR"
rm -rf "$RUNTIME_DIR"
mkdir -p "$RUNTIME_DIR"
if [ "$RUNTIME_BUNDLE_STRIP_COMPONENTS" -gt 0 ]; then
  tar -xzf "$RUNTIME_BUNDLE_TARBALL" -C "$RUNTIME_DIR" --strip-components="$RUNTIME_BUNDLE_STRIP_COMPONENTS"
else
  tar -xzf "$RUNTIME_BUNDLE_TARBALL" -C "$RUNTIME_DIR"
fi

chown -R "$NEX_USER:$NEX_USER" /opt/nex

if [ ! -f "${RUNTIME_DIR}/package.json" ]; then
  echo "runtime bundle missing package.json after extraction" >&2
  exit 1
fi
if [ ! -f "${RUNTIME_DIR}/pnpm-lock.yaml" ]; then
  echo "runtime bundle missing pnpm-lock.yaml after extraction" >&2
  exit 1
fi
if [ ! -f "${RUNTIME_DIR}/dist/index.js" ]; then
  echo "runtime bundle missing dist/index.js after extraction" >&2
  exit 1
fi

su -s /bin/bash "$NEX_USER" -c "cd '$RUNTIME_DIR' && HOME=/opt/nex pnpm install --prod --frozen-lockfile"

if [ ! -d "${RUNTIME_DIR}/node_modules" ]; then
  echo "runtime dependency install did not create node_modules" >&2
  exit 1
fi

su -s /bin/bash "$NEX_USER" -c "cd '$RUNTIME_DIR' && HOME=/opt/nex node --input-type=module -e 'import(\"json5\").then(()=>process.exit(0)).catch((error)=>{console.error(error);process.exit(1)})'"

cat >/etc/systemd/system/${SERVICE_NAME}.service <<EOF
[Unit]
Description=Nex Runtime
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${NEX_USER}
WorkingDirectory=${RUNTIME_DIR}
EnvironmentFile=-${CONFIG_DIR}/nex.env
ExecStart=/usr/bin/node ${RUNTIME_DIR}/dist/index.js start --port 18789
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

cat >"${CONFIG_DIR}/nex.env" <<'EOF'
NEXUS_ROOT=/opt/nex
NEXUS_STATE_DIR=/opt/nex/state
NEXUS_RUNTIME_PORT=18789
HOME=/opt/nex
NODE_ENV=production
EOF

chmod 600 "${CONFIG_DIR}/nex.env"
chown "$NEX_USER:$NEX_USER" "${CONFIG_DIR}/nex.env"

ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw --force enable

systemctl daemon-reload
systemctl disable "${SERVICE_NAME}.service" || true
systemctl stop "${SERVICE_NAME}.service" || true

echo "compliant runtime image prepared"
