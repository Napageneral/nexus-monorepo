#!/usr/bin/env bash

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "must run as root" >&2
  exit 1
fi

FRONTDOOR_BUNDLE_TARBALL="${FRONTDOOR_BUNDLE_TARBALL:-/tmp/frontdoor-bundle.tgz}"
FRONTDOOR_ROOT="${FRONTDOOR_ROOT:-/opt/nexus/frontdoor}"
FRONTDOOR_STATE_DIR="${FRONTDOOR_STATE_DIR:-/var/lib/nexus-frontdoor}"
FRONTDOOR_CONFIG_DIR="${FRONTDOOR_CONFIG_DIR:-/etc/nexus-frontdoor}"
FRONTDOOR_DB_PATH="${FRONTDOOR_DB_PATH:-/var/lib/nexus-frontdoor/frontdoor.db}"
FRONTDOOR_SESSION_DB_PATH="${FRONTDOOR_SESSION_DB_PATH:-/var/lib/nexus-frontdoor/frontdoor-sessions.db}"
FRONTDOOR_OWNER_PASSWORD_HASH="${FRONTDOOR_OWNER_PASSWORD_HASH:-scrypt-sha256-v1\$aDWr_n1zbh8eMF5XU1cdiw\$OIdv8VqypOyqHnm3-BbfAXPId4UEAWQldLfb08gX0-E}"
FRONTDOOR_BASE_URL="${FRONTDOOR_BASE_URL:-}"
FRONTDOOR_INTERNAL_BASE_URL="${FRONTDOOR_INTERNAL_BASE_URL:-${FRONTDOOR_BASE_URL}}"
FRONTDOOR_RUNTIME_TOKEN_SECRET="${FRONTDOOR_RUNTIME_TOKEN_SECRET:-}"
FRONTDOOR_RUNTIME_TOKEN_ACTIVE_KID="${FRONTDOOR_RUNTIME_TOKEN_ACTIVE_KID:-v1}"
FRONTDOOR_VPS_SSH_KEY_PATH="${FRONTDOOR_VPS_SSH_KEY_PATH:-/home/ubuntu/.ssh/nexus-operator}"
AWS_FRONTDOOR_REGION="${AWS_FRONTDOOR_REGION:-us-east-2}"
AWS_FRONTDOOR_SUBNET_ID="${AWS_FRONTDOOR_SUBNET_ID:-}"
AWS_FRONTDOOR_SECURITY_GROUP_IDS="${AWS_FRONTDOOR_SECURITY_GROUP_IDS:-}"
AWS_FRONTDOOR_AMI_ID="${AWS_FRONTDOOR_AMI_ID:-}"
AWS_FRONTDOOR_INSTANCE_PROFILE_ARN="${AWS_FRONTDOOR_INSTANCE_PROFILE_ARN:-}"
AWS_FRONTDOOR_INSTANCE_PROFILE_NAME="${AWS_FRONTDOOR_INSTANCE_PROFILE_NAME:-}"
AWS_FRONTDOOR_SSH_KEY_NAME="${AWS_FRONTDOOR_SSH_KEY_NAME:-}"
AWS_FRONTDOOR_ASSIGN_PUBLIC_IP="${AWS_FRONTDOOR_ASSIGN_PUBLIC_IP:-false}"
FRONTDOOR_TAILSCALE_BASE_URL="${FRONTDOOR_TAILSCALE_BASE_URL:-}"
FRONTDOOR_STANDARD_TAILSCALE_AUTH_KEY="${FRONTDOOR_STANDARD_TAILSCALE_AUTH_KEY:-}"

if [ ! -f "$FRONTDOOR_BUNDLE_TARBALL" ]; then
  echo "frontdoor bundle tarball not found: $FRONTDOOR_BUNDLE_TARBALL" >&2
  exit 1
fi
if [ -z "$FRONTDOOR_BASE_URL" ]; then
  echo "FRONTDOOR_BASE_URL is required" >&2
  exit 1
fi
if [ -z "$FRONTDOOR_INTERNAL_BASE_URL" ]; then
  echo "FRONTDOOR_INTERNAL_BASE_URL is required" >&2
  exit 1
fi
if [ -z "$FRONTDOOR_RUNTIME_TOKEN_SECRET" ]; then
  echo "FRONTDOOR_RUNTIME_TOKEN_SECRET is required" >&2
  exit 1
fi
if [ -z "$AWS_FRONTDOOR_SUBNET_ID" ] || [ -z "$AWS_FRONTDOOR_SECURITY_GROUP_IDS" ] || [ -z "$AWS_FRONTDOOR_AMI_ID" ]; then
  echo "AWS compliant provider env is incomplete" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y curl jq rsync ca-certificates gnupg

mkdir -p /etc/apt/keyrings
if [ ! -f /etc/apt/keyrings/nodesource.gpg ]; then
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
fi
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" \
  >/etc/apt/sources.list.d/nodesource.list
apt-get update
apt-get install -y nodejs

corepack enable
corepack prepare pnpm@10.23.0 --activate

mkdir -p "$FRONTDOOR_ROOT" "$FRONTDOOR_ROOT/packages" "$FRONTDOOR_STATE_DIR" "$FRONTDOOR_CONFIG_DIR"
rm -rf "$FRONTDOOR_ROOT"
mkdir -p "$FRONTDOOR_ROOT"
tar -xzf "$FRONTDOOR_BUNDLE_TARBALL" -C "$FRONTDOOR_ROOT" --strip-components=1

cat >"${FRONTDOOR_CONFIG_DIR}/frontdoor.config.json" <<EOF
{
  "host": "0.0.0.0",
  "port": 4789,
  "baseUrl": "${FRONTDOOR_BASE_URL}",
  "internalBaseUrl": "${FRONTDOOR_INTERNAL_BASE_URL}",
  "session": {
    "cookieName": "nexus_fd_session",
    "ttlSeconds": 604800,
    "storePath": "${FRONTDOOR_SESSION_DB_PATH}"
  },
  "frontdoor": {
    "storePath": "${FRONTDOOR_DB_PATH}",
    "operatorUserIds": ["user-owner"],
    "devCreatorEmails": [],
    "inviteTtlSeconds": 604800
  },
  "runtimeToken": {
    "issuer": "${FRONTDOOR_BASE_URL}",
    "audience": "runtime-api",
    "secret": "${FRONTDOOR_RUNTIME_TOKEN_SECRET}",
    "activeKid": "${FRONTDOOR_RUNTIME_TOKEN_ACTIVE_KID}",
    "keys": {
      "${FRONTDOOR_RUNTIME_TOKEN_ACTIVE_KID}": "${FRONTDOOR_RUNTIME_TOKEN_SECRET}"
    },
    "ttlSeconds": 600,
    "refreshTtlSeconds": 2592000
  },
  "security": {
    "sessionCookieSecure": false,
    "hsts": {
      "enabled": false,
      "maxAgeSeconds": 31536000,
      "includeSubDomains": true,
      "preload": true
    }
  },
  "tenants": {
    "tenant-dev": {
      "runtimeUrl": "http://127.0.0.1:18789",
      "runtimePublicBaseUrl": "http://127.0.0.1:18789"
    }
  },
  "billing": {
    "provider": "none",
    "checkoutSuccessUrl": "${FRONTDOOR_BASE_URL}/billing/success",
    "checkoutCancelUrl": "${FRONTDOOR_BASE_URL}/billing/cancel",
    "webhookSecret": "change-me-frontdoor-billing-webhook-secret",
    "stripeSecretKey": "change-me-stripe-secret-key",
    "stripeApiBaseUrl": "https://api.stripe.com",
    "stripePriceIdsByPlan": {
      "starter": "price_starter",
      "pro": "price_pro",
      "business": "price_business"
    }
  },
  "users": [
    {
      "id": "user-owner",
      "username": "owner",
      "passwordHash": "${FRONTDOOR_OWNER_PASSWORD_HASH}",
      "tenantId": "tenant-dev",
      "entityId": "entity-owner",
      "displayName": "Owner",
      "email": "owner@example.com",
      "roles": ["operator"],
      "scopes": ["*"]
    }
  ],
  "oidc": {
    "enabled": false,
    "providers": {},
    "mappings": []
  },
  "autoProvision": {
    "enabled": false,
    "storePath": "${FRONTDOOR_STATE_DIR}/frontdoor-autoprovision.db",
    "providers": [],
    "tenantIdPrefix": "tenant",
    "defaultRoles": ["operator"],
    "defaultScopes": ["operator.admin"],
    "command": "",
    "commandTimeoutMs": 120000
  }
}
EOF

cat >"${FRONTDOOR_CONFIG_DIR}/frontdoor.env" <<EOF
FRONTDOOR_CONFIG_PATH=${FRONTDOOR_CONFIG_DIR}/frontdoor.config.json
FRONTDOOR_BASE_URL=${FRONTDOOR_BASE_URL}
FRONTDOOR_INTERNAL_BASE_URL=${FRONTDOOR_INTERNAL_BASE_URL}
FRONTDOOR_VPS_SSH_KEY_PATH=${FRONTDOOR_VPS_SSH_KEY_PATH}
AWS_REGION=${AWS_FRONTDOOR_REGION}
AWS_FRONTDOOR_REGION=${AWS_FRONTDOOR_REGION}
AWS_FRONTDOOR_SUBNET_ID=${AWS_FRONTDOOR_SUBNET_ID}
AWS_FRONTDOOR_SECURITY_GROUP_IDS=${AWS_FRONTDOOR_SECURITY_GROUP_IDS}
AWS_FRONTDOOR_AMI_ID=${AWS_FRONTDOOR_AMI_ID}
AWS_FRONTDOOR_INSTANCE_PROFILE_ARN=${AWS_FRONTDOOR_INSTANCE_PROFILE_ARN}
AWS_FRONTDOOR_INSTANCE_PROFILE_NAME=${AWS_FRONTDOOR_INSTANCE_PROFILE_NAME}
AWS_FRONTDOOR_SSH_KEY_NAME=${AWS_FRONTDOOR_SSH_KEY_NAME}
AWS_FRONTDOOR_ASSIGN_PUBLIC_IP=${AWS_FRONTDOOR_ASSIGN_PUBLIC_IP}
FRONTDOOR_TAILSCALE_BASE_URL=${FRONTDOOR_TAILSCALE_BASE_URL}
FRONTDOOR_STANDARD_TAILSCALE_AUTH_KEY=${FRONTDOOR_STANDARD_TAILSCALE_AUTH_KEY}
EOF

cd "$FRONTDOOR_ROOT"
pnpm install --frozen-lockfile
pnpm build

cat >/etc/systemd/system/nexus-frontdoor.service <<EOF
[Unit]
Description=Nexus Frontdoor
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${FRONTDOOR_ROOT}
EnvironmentFile=${FRONTDOOR_CONFIG_DIR}/frontdoor.env
ExecStart=/usr/bin/node ${FRONTDOOR_ROOT}/dist/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable nexus-frontdoor.service
systemctl restart nexus-frontdoor.service
systemctl is-active nexus-frontdoor.service >/dev/null

echo "frontdoor host prepared"
