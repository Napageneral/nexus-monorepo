# Phase 0: Infrastructure Setup

**Status:** NOT STARTED
**Last Updated:** 2026-03-04
**Depends On:** Nothing (first phase)
**Enables:** All subsequent phases
**Specs:** [CLOUD_PROVISIONING_ARCHITECTURE](../specs/CLOUD_PROVISIONING_ARCHITECTURE_2026-03-04.md), [TENANT_NETWORKING_AND_ROUTING](../specs/TENANT_NETWORKING_AND_ROUTING_2026-03-04.md)

---

## Goal

Set up all Hetzner Cloud infrastructure required for cloud provisioning: dedicated frontdoor VPS, private network, firewall, SSH keys, golden snapshot, wildcard DNS, and wildcard TLS.

---

## Current State

- **Existing VPS:** `oracle-1` (CAX31, nbg1-dc3, IP 46.225.118.74) — runs legacy spike/glowbot systems. NOT the frontdoor going forward.
- **DNS:** `nexushub.sh` is on **Vercel DNS** (ns1.vercel-dns.com). `frontdoor.nexushub.sh` → 46.225.118.74. No wildcard record.
- **Hetzner Cloud resources:** No networks, no firewalls, no snapshots.
- **SSH keys in Hetzner:** `tyler-mbp` (ID 108023325) only.
- **Caddy:** Stock 2.6.2 on oracle-1, no DNS challenge plugins.
- **hcloud CLI:** Set up locally, context `oracle-server`, working.

---

## Tasks

### 0.1 — Create dedicated frontdoor VPS

The current `oracle-1` VPS runs legacy systems. We need a clean VPS dedicated to frontdoor.

```bash
hcloud server create \
  --name frontdoor-1 \
  --type cax11 \
  --image ubuntu-24.04 \
  --datacenter nbg1-dc3 \
  --ssh-key tyler-mbp
```

Why CAX11 (2 vCPU, 4 GB): Frontdoor is a lightweight Node.js proxy + SQLite. This is plenty. Can upgrade later if needed.

After creation:
- Note the public IP (will replace 46.225.118.74 in DNS)
- SSH in: `ssh root@<new-ip>`
- Install Node.js 22 LTS
- Install Caddy (custom build — see 0.7)
- Clone/deploy frontdoor code to `/opt/nexus/frontdoor/`
- Set up systemd service for frontdoor

### 0.2 — Create Hetzner Cloud Network

Per spec §4.1 — private network for frontdoor ↔ tenant VPS communication.

```bash
hcloud network create --name nexus-net --ip-range 10.0.0.0/16
hcloud network add-subnet nexus-net --type cloud --network-zone eu-central --ip-range 10.0.0.0/24
```

Record the network ID for use in provisioning config.

### 0.3 — Attach frontdoor-1 to the network

```bash
hcloud server attach-to-network frontdoor-1 --network nexus-net
```

This assigns a private IP (e.g., 10.0.0.2) to frontdoor-1. Record this IP.

### 0.4 — Create Hetzner Cloud Firewall

Per spec §4.2 — restricts tenant VPS inbound to private network only.

```bash
hcloud firewall create --name nexus-tenant-fw

# Allow all TCP from private network
hcloud firewall add-rule nexus-tenant-fw \
  --direction in --protocol tcp --port any \
  --source-ips 10.0.0.0/16 \
  --description "Allow private network traffic"

# Allow SSH from private network
hcloud firewall add-rule nexus-tenant-fw \
  --direction in --protocol tcp --port 22 \
  --source-ips 10.0.0.0/16 \
  --description "SSH from private network"
```

Note: Hetzner Cloud Firewalls block all inbound by default if any inbound rules exist. So only private network traffic gets through.

Record the firewall ID for use in provisioning config.

### 0.5 — Generate and upload nexus-operator SSH key

Per spec §9 — operator key for VPS management.

```bash
# Generate keypair locally
ssh-keygen -t ed25519 -f ~/.ssh/nexus-operator -C "nexus-operator" -N ""

# Upload to Hetzner
hcloud ssh-key create --name nexus-operator --public-key-from-file ~/.ssh/nexus-operator.pub

# Copy private key to frontdoor VPS (for SSH access to tenant VPSes)
scp ~/.ssh/nexus-operator root@<frontdoor-1-ip>:/root/.ssh/nexus-operator
ssh root@<frontdoor-1-ip> "chmod 600 /root/.ssh/nexus-operator"
```

Record the SSH key ID for use in provisioning config.

### 0.6 — Build golden snapshot

Per spec §6 — base image with nex runtime pre-installed.

**Step 1: Create builder VPS**
```bash
hcloud server create \
  --name nex-snapshot-builder \
  --type cax11 \
  --image ubuntu-24.04 \
  --datacenter nbg1-dc3 \
  --ssh-key tyler-mbp \
  --ssh-key nexus-operator
```

**Step 2: SSH in and run setup**
```bash
ssh root@<builder-ip>

# Update system
apt-get update && apt-get upgrade -y

# Install Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

# Create directory structure
mkdir -p /opt/nex/{runtime,config,data,apps}

# Install nex runtime
# Option A: npm global install
npm install -g nexus
# Option B: copy from frontdoor build artifacts
# This depends on how nex is distributed — use whatever method matches current deployment

# Create systemd service (enabled but NOT started — cloud-init starts it)
cat > /etc/systemd/system/nex-runtime.service << 'SYSTEMD'
[Unit]
Description=Nex Runtime
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/nexus runtime run --config /opt/nex/config/tenant.json
Restart=on-failure
RestartSec=5
WorkingDirectory=/opt/nex/runtime
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
SYSTEMD

systemctl daemon-reload
systemctl enable nex-runtime

# Create bootstrap script (called by cloud-init on first boot)
cat > /opt/nex/bootstrap.sh << 'BOOTSTRAP'
#!/bin/bash
set -euo pipefail

# Tenant configuration is written by cloud-init to /opt/nex/config/tenant.json
# before this script runs.

# Start nex runtime
systemctl start nex-runtime

# Wait for runtime to be ready (up to 2 minutes)
for i in $(seq 1 60); do
  if curl -sf http://localhost:8080/health > /dev/null 2>&1; then
    break
  fi
  sleep 2
done

# Read tenant config
TENANT_ID=$(jq -r '.tenantId' /opt/nex/config/tenant.json)
SERVER_ID=$(jq -r '.serverId' /opt/nex/config/tenant.json)
PROVISION_TOKEN=$(jq -r '.provisionToken' /opt/nex/config/tenant.json)
FRONTDOOR_URL=$(jq -r '.frontdoorUrl' /opt/nex/config/tenant.json)

# Get private IP
PRIVATE_IP=$(ip addr show | grep 'inet 10\.' | awk '{print $2}' | cut -d/ -f1 | head -1)

# Phone home
curl -sf -X POST "${FRONTDOOR_URL}/api/internal/provision-callback" \
  -H "Authorization: Bearer ${PROVISION_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"tenant_id\": \"${TENANT_ID}\",
    \"server_id\": \"${SERVER_ID}\",
    \"status\": \"ready\",
    \"private_ip\": \"${PRIVATE_IP}\",
    \"runtime_port\": 8080
  }"
BOOTSTRAP
chmod +x /opt/nex/bootstrap.sh

# Install jq (needed by bootstrap script)
apt-get install -y jq

# Harden SSH
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config

# Install fail2ban
apt-get install -y fail2ban
systemctl enable fail2ban

# Enable unattended security upgrades
apt-get install -y unattended-upgrades
echo 'Unattended-Upgrade::Automatic-Reboot "false";' > /etc/apt/apt.conf.d/51auto-upgrades
```

**Step 3: Clean up before snapshot**
```bash
# Clean cloud-init state so it re-runs on new instances
cloud-init clean --logs

# Remove SSH host keys (regenerated on boot)
rm -f /etc/ssh/ssh_host_*

# Clear history and temp files
rm -rf /root/.bash_history /tmp/* /var/tmp/*
truncate -s 0 /var/log/*.log /var/log/**/*.log 2>/dev/null || true
history -c
```

**Step 4: Create snapshot**
```bash
# From local machine (NOT the builder VPS)
hcloud server create-image nex-snapshot-builder --type snapshot --description "nex-golden-v1"
```

Record the snapshot ID.

**Step 5: Destroy builder**
```bash
hcloud server delete nex-snapshot-builder
```

### 0.7 — Wildcard DNS

DNS for `nexushub.sh` is currently on **Vercel DNS**. We need a wildcard `*.nexushub.sh` A record.

**Option A: Add wildcard in Vercel DNS dashboard**
- Log into Vercel → Domain settings → nexushub.sh
- Add A record: `*` → `<frontdoor-1-ip>`
- Update existing `frontdoor` A record to new IP
- Vercel DNS supports wildcard records

**Option B: Move DNS to Cloudflare** (better for Caddy DNS-01 challenge)
- More robust DNS-01 plugin ecosystem
- But requires moving all records

**Recommendation: Option A** — add the wildcard in Vercel DNS. For the TLS challenge, see 0.8.

Also update: `frontdoor.nexushub.sh` A record → `<frontdoor-1-ip>` (new VPS).

### 0.8 — Custom Caddy build + wildcard TLS

Caddy needs a DNS challenge plugin for wildcard certs. Since DNS is on Vercel, options:

**Option A: Use certbot separately for the wildcard cert, Caddy uses the files**
- Install certbot with a manual or API-based DNS plugin
- Get wildcard cert via DNS-01 challenge (manually add TXT record to Vercel DNS, or use a Vercel DNS API plugin if one exists)
- Configure Caddy to use the cert files:
  ```caddyfile
  *.nexushub.sh, nexushub.sh {
      tls /etc/letsencrypt/live/nexushub.sh/fullchain.pem /etc/letsencrypt/live/nexushub.sh/privkey.pem
      encode gzip zstd
      reverse_proxy 127.0.0.1:4789
  }
  ```
- Set up certbot auto-renewal cron
- This avoids needing a Caddy DNS plugin entirely

**Option B: Move DNS to Cloudflare, use caddy-dns/cloudflare**
- Best long-term solution (Cloudflare has fast propagation, well-maintained Caddy plugin)
- Requires DNS migration
- Build custom Caddy: `xcaddy build --with github.com/caddy-dns/cloudflare`

**Option C: Use caddy-dns/vercel if it exists**
- Check if a Vercel DNS plugin exists for Caddy
- Less common, may not be well-maintained

**Recommendation: Option A for now** (certbot manages cert, Caddy uses cert files). Simple, no DNS migration needed, works immediately. Can migrate to Cloudflare DNS + Caddy plugin later.

On frontdoor-1:
```bash
# Install certbot
apt-get install -y certbot

# Get wildcard cert (manual DNS-01 — add TXT record to Vercel when prompted)
certbot certonly --manual --preferred-challenges dns \
  -d "*.nexushub.sh" -d "nexushub.sh" \
  --agree-tos --email <your-email>

# Certbot will ask you to add a TXT record:
# _acme-challenge.nexushub.sh → <some-value>
# Add this in Vercel DNS, wait for propagation, then confirm
```

After cert is obtained, configure Caddy:
```caddyfile
*.nexushub.sh, nexushub.sh {
    tls /etc/letsencrypt/live/nexushub.sh/fullchain.pem /etc/letsencrypt/live/nexushub.sh/privkey.pem
    encode gzip zstd
    reverse_proxy 127.0.0.1:4789
}

frontdoor.nexushub.sh {
    tls /etc/letsencrypt/live/nexushub.sh/fullchain.pem /etc/letsencrypt/live/nexushub.sh/privkey.pem
    encode gzip zstd
    reverse_proxy 127.0.0.1:4789
}
```

### 0.9 — Deploy frontdoor to new VPS

On frontdoor-1:
```bash
# Create deployment directory
mkdir -p /opt/nexus/frontdoor

# Clone/copy frontdoor code
# Option A: git clone
# Option B: rsync from local machine
rsync -avz --exclude node_modules --exclude .git \
  ~/nexus/home/projects/nexus/nexus-frontdoor/ \
  root@<frontdoor-1-ip>:/opt/nexus/frontdoor/

# Install dependencies
cd /opt/nexus/frontdoor && npm install

# Create env file
cat > /etc/nexus-frontdoor/frontdoor.env << 'ENV'
FRONTDOOR_CONFIG_PATH=/etc/nexus-frontdoor/frontdoor.config.json
HETZNER_API_TOKEN=<cloud-api-token>
HETZNER_NETWORK_ID=<network-id>
HETZNER_FIREWALL_ID=<firewall-id>
HETZNER_SSH_KEY_ID=<ssh-key-id>
HETZNER_SNAPSHOT_ID=<snapshot-id>
PROVISION_DEFAULT_PLAN=cax11
PROVISION_DEFAULT_REGION=nbg1
PROVISION_TIMEOUT_MS=300000
ENV

# Create systemd service
cat > /etc/systemd/system/nexus-frontdoor.service << 'SYSTEMD'
[Unit]
Description=Nexus Frontdoor
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/node /opt/nexus/frontdoor/dist/server.js
EnvironmentFile=/etc/nexus-frontdoor/frontdoor.env
Restart=on-failure
RestartSec=5
WorkingDirectory=/opt/nexus/frontdoor

[Install]
WantedBy=multi-user.target
SYSTEMD

systemctl daemon-reload
systemctl enable nexus-frontdoor
systemctl start nexus-frontdoor
```

### 0.10 — Verify end-to-end infrastructure

Checklist:
- [ ] frontdoor-1 VPS is running
- [ ] frontdoor-1 is attached to nexus-net private network
- [ ] nexus-tenant-fw firewall exists with correct rules
- [ ] nexus-operator SSH key is in Hetzner and on frontdoor-1
- [ ] Golden snapshot exists (nex-golden-v1)
- [ ] `*.nexushub.sh` DNS resolves to frontdoor-1 IP
- [ ] `frontdoor.nexushub.sh` DNS resolves to frontdoor-1 IP
- [ ] Wildcard TLS cert is active (test: `curl https://test.nexushub.sh`)
- [ ] Frontdoor service is running on frontdoor-1
- [ ] Caddy is proxying to frontdoor on port 4789

---

## Outputs

After this phase, the following Hetzner resource IDs must be recorded in the frontdoor env:
- `HETZNER_NETWORK_ID` — Cloud Network ID
- `HETZNER_FIREWALL_ID` — Cloud Firewall ID
- `HETZNER_SSH_KEY_ID` — nexus-operator key ID
- `HETZNER_SNAPSHOT_ID` — golden snapshot ID
- Frontdoor-1 public IP (for DNS records)
- Frontdoor-1 private IP (for reference)
