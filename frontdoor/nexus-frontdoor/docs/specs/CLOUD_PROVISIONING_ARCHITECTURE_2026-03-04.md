# Cloud Provisioning Architecture

**Status:** CANONICAL
**Last Updated:** 2026-03-06
**Related:** FRONTDOOR_ARCHITECTURE.md, FRONTDOOR_HOSTED_ACCESS_AND_ROUTING.md, FRONTDOOR_PACKAGE_REGISTRY_AND_LIFECYCLE.md, BILLING_ARCHITECTURE_ACCOUNT_MODEL_2026-03-02.md, CRITICAL_CUSTOMER_FLOWS_2026-03-02.md, `nex/docs/specs/platform/server-lifecycle-and-durability.md`

---

## 1) Overview

Frontdoor is the provisioning and recovery orchestrator for durable hosted servers. It creates, manages, archives, restores, and only exceptionally destroys the backing tenant VPS instances on cloud providers. Each tenant gets a dedicated VPS — full VM isolation, not containers.

**Core decisions:**
- One VPS per tenant (simplicity, full isolation, nex runtime agents have full freedom)
- Frontdoor owns all provisioning logic (no separate provisioning service)
- Durable server lifecycle — archive and restore are first-class; provider VM destroy is the final low-level step, not the normal lifecycle story
- Cloud Provider Abstraction — Hetzner first, AWS later (for HIPAA/BAA compliance)
- Golden snapshot images with minimal cloud-init bootstrap for tenant-specific config
- Provision callback (phone-home) pattern for VPS readiness signaling

---

## 2) Architecture: One VPS Per Tenant

Each server a user creates maps to a dedicated cloud VPS:

```
User "Create Server" click
    ↓
Frontdoor (provisioning orchestrator)
    ↓ Hetzner Cloud API (or AWS EC2 API)
New VPS created from golden snapshot
    ↓ boots, runs cloud-init bootstrap
    ↓ starts nex runtime
    ↓ phones home to frontdoor
Frontdoor adds VPS to routing table → server is "running"
```

**Why one VPS per tenant (not containers):**
1. Full VM isolation — strongest security boundary.
2. Nex runtime agents get full system freedom (install packages, run processes, manage files).
3. Simpler to reason about — each VPS is a self-contained unit.
4. Maps cleanly to both Hetzner VPS and AWS EC2.
5. Easier to offer different server sizes (just different VM types).
6. HIPAA compliance is simpler with VM isolation.

**Tradeoff:** More expensive per-tenant than containers. Acceptable at current scale and aligns with the paid-server billing model (users pay for their VPS).

---

## 3) Cloud Provider Abstraction

### 3.1 Provider Interface

```typescript
interface CloudProvider {
  /** Provider identifier */
  readonly name: string; // "hetzner" | "aws"

  /**
   * Create a new VPS for a tenant.
   * Returns immediately with the cloud provider's server ID and IP.
   * The VPS may still be booting — use getServerStatus() to poll.
   */
  createServer(opts: CreateServerOpts): Promise<CreateServerResult>;

  /**
   * Check the status of a VPS.
   * Used during provisioning to detect when the VPS is running.
   * NOTE: "running" at the cloud level does not mean nex runtime is ready.
   * The provision callback (phone-home) is the definitive readiness signal.
   */
  getServerStatus(providerServerId: string): Promise<ProviderServerStatus>;

  /**
   * Destroy a backing VPS and all associated provider resources.
   * This is the final irreversible provider-level action used only after the
   * durable server lifecycle authorizes destruction.
   * It does NOT define the normal customer-visible server lifecycle by itself.
   */
  destroyServer(providerServerId: string): Promise<void>;

  /**
   * List available server plans (sizes).
   * Used to populate the "New Server" modal with size options.
   */
  listPlans(): Promise<ServerPlan[]>;

  /**
   * List available regions/datacenters.
   * Used to populate the "New Server" modal with location options.
   */
  listRegions(): Promise<ProviderRegion[]>;
}

interface CreateServerOpts {
  /** Unique tenant identifier (used for naming, labeling, and config) */
  tenantId: string;

  /** Cloud provider plan/type (e.g., "cx22" for Hetzner, "t3.small" for AWS) */
  plan: string;

  /** Cloud provider region/datacenter (e.g., "fsn1" for Hetzner, "us-east-1" for AWS) */
  region: string;

  /**
   * Cloud-init user-data script.
   * Runs on first boot to configure tenant-specific settings.
   * The golden snapshot has everything pre-installed — cloud-init only handles
   * tenant config, auth tokens, and starting the nex runtime.
   */
  userData: string;

  /** Private network ID to attach the VPS to (for Hetzner Cloud Networks) */
  networkId?: string;

  /** Firewall ID to apply to the VPS */
  firewallId?: string;

  /** SSH key IDs to authorize on the VPS */
  sshKeyIds?: string[];

  /** Labels/tags for the VPS (for cloud console organization) */
  labels?: Record<string, string>;
}

interface CreateServerResult {
  /** Cloud provider's server ID (e.g., Hetzner server ID or AWS instance ID) */
  providerServerId: string;

  /** Public IPv4 address (may not be used if private network routing is used) */
  publicIp?: string;

  /** Private network IP (used by frontdoor for proxying) */
  privateIp?: string;
}

interface ProviderServerStatus {
  /** Cloud-level state */
  state: "creating" | "running" | "stopped" | "deleting" | "error";

  /** Public IPv4 (once assigned) */
  publicIp?: string;

  /** Private network IP (once assigned) */
  privateIp?: string;

  /** Provider-specific error message */
  error?: string;
}

interface ServerPlan {
  /** Plan identifier (e.g., "cx22") */
  id: string;

  /** Human-readable name (e.g., "CX22 — 2 vCPU, 4 GB RAM") */
  displayName: string;

  /** Monthly cost in cents (USD) */
  monthlyCostCents: number;

  /** Spec details */
  vcpus: number;
  memoryMb: number;
  diskGb: number;

  /** Provider-specific metadata */
  providerMeta?: Record<string, unknown>;
}

interface ProviderRegion {
  /** Region identifier (e.g., "fsn1") */
  id: string;

  /** Human-readable name (e.g., "Falkenstein, Germany") */
  displayName: string;

  /** Country code */
  country: string;

  /** Whether this region is available for new servers */
  available: boolean;
}
```

### 3.2 Provider Registration

Frontdoor loads providers at startup based on configuration:

```typescript
// In frontdoor config
{
  "provisioning": {
    "defaultProvider": "hetzner",
    "providers": {
      "hetzner": {
        "apiToken": "env:HETZNER_API_TOKEN",
        "networkId": "12345",
        "firewallId": "67890",
        "sshKeyIds": ["111"],
        "defaultPlan": "cax11",
        "defaultRegion": "nbg1",
        "snapshotId": "98765"
      }
    }
  }
}
```

Only one provider is active at a time per frontdoor instance. Multi-provider support (letting users choose Hetzner vs AWS) is a future capability.

---

## 4) Hetzner Provider Implementation

### 4.1 Hetzner Cloud API

The Hetzner provider uses the Hetzner Cloud API (`https://api.hetzner.cloud/v1/`).

**Authentication:** Bearer token in `Authorization` header.

**Key endpoints:**
- `POST /v1/servers` — Create a server
- `GET /v1/servers/{id}` — Get server status
- `DELETE /v1/servers/{id}` — Delete a server
- `GET /v1/server_types` — List available server types
- `GET /v1/datacenters` — List available datacenters

### 4.2 Create Server Call

```
POST /v1/servers
{
  "name": "nex-t-a3f9c2",
  "server_type": "cax11",
  "image": <snapshot_id>,
  "datacenter": "nbg1-dc3",
  "ssh_keys": [<nexus_operator_key_id>],
  "networks": [<private_network_id>],
  "firewalls": [{ "firewall": <firewall_id> }],
  "user_data": "<cloud-init script>",
  "labels": {
    "managed-by": "nexus-frontdoor",
    "tenant-id": "t-a3f9c2",
    "server-id": "srv-xyz"
  }
}
```

### 4.3 Resource Setup (One-Time)

These Hetzner Cloud resources are created once and shared across all tenants:

1. **Cloud Network:** A private network (e.g., `10.0.0.0/16`) that frontdoor and all tenant VPSes join.
2. **Cloud Firewall:** Rules that apply to all tenant VPSes:
   - Allow inbound from private network subnet (frontdoor → VPS)
   - Allow inbound SSH (port 22) from frontdoor's private IP only
   - Block all other inbound
   - Allow all outbound
3. **SSH Key:** The `nexus-operator` public key, uploaded to Hetzner.

### 4.4 Hetzner Server Plans (Initial Offering)

Using ARM64 (Ampere CAX) instances for cost efficiency (same architecture as frontdoor):

| Plan | Display Name | vCPU | RAM | Disk | Hetzner Price | Our Display |
|------|-------------|------|-----|------|--------------|-------------|
| cax11 | Starter | 2 | 4 GB | 40 GB | ~€3.29/mo | Show cost |
| cax21 | Standard | 4 | 8 GB | 80 GB | ~€5.49/mo | Show cost |
| cax31 | Performance | 8 | 16 GB | 160 GB | ~€9.49/mo | Show cost |

All servers created in `nbg1` datacenter (Nuremberg) — same as frontdoor.
Pricing is displayed at operator cost with no markup. User sees the actual Hetzner price.
No region selection in UI — all servers go to nbg1.

---

## 5) AWS Provider Implementation (Future — HIPAA)

### 5.1 Overview

The AWS provider enables HIPAA-compliant deployments. AWS will sign a BAA (Business Associate Agreement), which Hetzner does not offer. The same `CloudProvider` interface is implemented with AWS EC2 calls.

### 5.2 Key Differences from Hetzner

| Aspect | Hetzner | AWS |
|--------|---------|-----|
| API | Hetzner Cloud REST API | AWS SDK (EC2) |
| VM Image | Snapshot | AMI (Amazon Machine Image) |
| Network | Hetzner Cloud Network | VPC + Private Subnets |
| Firewall | Hetzner Cloud Firewall | Security Groups |
| Encryption | Disk encryption (manual) | EBS encryption (native, KMS) |
| Compliance | No BAA | BAA available |
| SSH Keys | Hetzner SSH Keys | EC2 Key Pairs |

### 5.3 AMI Strategy

The AMI is built using the same manual process as Hetzner snapshots, but targeting AWS:

1. Launch a base Amazon Linux 2023 or Ubuntu 24.04 EC2 instance
2. Install Node.js, nex runtime, systemd services, SSH hardening
3. Create AMI from the instance
4. Use that AMI for all tenant EC2 instances in the region

AMIs are region-specific — must be copied to each region where tenants will run.

### 5.4 HIPAA-Specific Requirements

- EBS volumes encrypted with AWS KMS (customer-managed keys)
- VPC with private subnets (no public IP on tenant instances)
- CloudTrail audit logging enabled
- No PHI in logs or cloud-init user-data
- Data retention and deletion policies per BAA requirements

---

## 6) Golden Snapshot Strategy

### 6.1 What's in the Snapshot

The golden snapshot is a fully configured VPS image with everything pre-installed:

```
Base OS: Ubuntu 24.04 LTS (ARM64 — matches frontdoor and all tenant CAX instances)

Pre-installed software:
  - Node.js (version matched to nex runtime requirements)
  - nex runtime at /opt/nex/runtime/
  - systemd service: nex-runtime.service (enabled, NOT started)
  - SSH hardened (password auth disabled, key-only)
  - ufw configured (private network only, SSH from frontdoor only)
  - fail2ban installed and configured
  - unattended-upgrades enabled (security updates only)

Pre-configured paths:
  /opt/nex/runtime/        — nex runtime installation
  /opt/nex/config/         — tenant config directory (populated by cloud-init)
  /opt/nex/data/           — runtime data directory
  /opt/nex/apps/           — app installation directory
  /opt/nex/bootstrap.sh    — first-boot bootstrap script

Pre-configured systemd:
  nex-runtime.service      — nex runtime process (ExecStart, restart policy, etc.)
```

### 6.2 What Cloud-Init Does (Minimal — Tenant-Specific Only)

The snapshot has everything installed. Cloud-init only handles tenant-specific configuration on first boot:

```bash
#!/bin/bash
# Tenant bootstrap — runs once on first boot via cloud-init

set -euo pipefail

# --- Tenant configuration (injected by frontdoor) ---
TENANT_ID="__TENANT_ID__"
SERVER_ID="__SERVER_ID__"
AUTH_TOKEN="__AUTH_TOKEN__"
PROVISION_TOKEN="__PROVISION_TOKEN__"
FRONTDOOR_URL="__FRONTDOOR_URL__"
FRONTDOOR_INTERNAL_URL="__FRONTDOOR_INTERNAL_URL__"
APPS_TO_INSTALL='__APPS_JSON__'

# --- Write tenant config ---
cat > /opt/nex/config/tenant.json <<CONF
{
  "tenantId": "${TENANT_ID}",
  "serverId": "${SERVER_ID}",
  "authToken": "${AUTH_TOKEN}",
  "frontdoorUrl": "${FRONTDOOR_URL}",
  "frontdoorInternalUrl": "${FRONTDOOR_INTERNAL_URL}",
  "appsToInstall": ${APPS_TO_INSTALL}
}
CONF

# --- Set hostname ---
hostnamectl set-hostname "nex-${TENANT_ID}"

# --- Start nex runtime ---
systemctl start nex-runtime

# --- Wait for runtime to be ready ---
for i in $(seq 1 60); do
  if curl -sf http://localhost:8080/health > /dev/null 2>&1; then
    break
  fi
  sleep 2
done

# --- Phone home: tell frontdoor we're ready ---
PRIVATE_IP=$(hostname -I | awk '{print $1}')
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
```

### 6.3 Snapshot Versioning

Snapshots are versioned and kept indefinitely:

```
nex-golden-v1  (2026-03-04) — initial snapshot
nex-golden-v2  (2026-03-15) — nex runtime 0.2.0
nex-golden-v3  (2026-04-01) — nex runtime 0.3.0 + security patches
```

- New servers always use the latest snapshot.
- Existing servers are NOT automatically updated — they continue running on their original snapshot.
- In-place updates to existing servers: SSH in via private network, update nex runtime, restart service.
- Major migrations: create a replacement VPS from a new snapshot, migrate and verify, cut the durable server over, then archive or destroy the old backing VPS according to lifecycle policy.

### 6.4 Building a New Snapshot

Manual process for both Hetzner and AWS (no Packer — build scripts may differ per provider):

**Hetzner:**
1. Create a CAX11 VPS from base Ubuntu 24.04 ARM64 image (nbg1 datacenter)
2. SSH in, run the setup script (install node, nex, configure systemd, harden)
3. Clean up (remove SSH host keys, cloud-init state, bash history)
4. Create snapshot via Hetzner API or console
5. Record snapshot ID in frontdoor config
6. Destroy the builder VPS

**AWS:**
1. Launch a t3.small EC2 instance from base Ubuntu 24.04 AMI
2. SSH in, run the setup script (same core steps, AWS-specific adjustments)
3. Clean up
4. Create AMI via AWS console or CLI
5. Record AMI ID in frontdoor config
6. Terminate the builder instance

---

## 7) Provisioning Flow (End-to-End)

### 7.1 User Initiates Server Creation

```
User clicks "New Server" → modal with options:
  - Name: text input (optional, auto-generated default like "Coral Meadow")
  - Size: Starter / Standard / Performance (with cost shown)
  - "Create Server" button

No region selection — all servers created in nbg1 (Nuremberg).
```

### 7.2 Frontend → API

```
POST /api/servers/create
{
  "display_name": "My Dev Server",    // optional
  "plan": "cax11"                      // server size (default: cax11)
}
```

### 7.3 Frontdoor Orchestration

```
Step 1: Create server record in DB
  INSERT frontdoor_servers:
    server_id:        "srv-<random>"
    account_id:       session.accountId
    tenant_id:        "t-<random>"
    display_name:     "My Dev Server"
    status:           "provisioning"
    plan:             "cax11"
    region:           "nbg1"
    provider:         "hetzner"
    provider_server_id: null (pending)
    private_ip:       null (pending)
    provision_token:  "prov-<random-256-bit>"
    runtime_port:     null (pending)
    created_at_ms:    Date.now()

Step 2: Generate cloud-init user-data
  - Template the bootstrap script with tenant-specific values
  - Include: tenant_id, server_id, auth_token, provision_token
  - Include: apps_to_install (user's entitled apps)

Step 3: Call cloud provider
  provider.createServer({
    tenantId: "t-<random>",
    plan: "cx22",
    region: "fsn1",
    userData: <rendered cloud-init>,
    networkId: config.hetzner.networkId,
    firewallId: config.hetzner.firewallId,
    sshKeyIds: config.hetzner.sshKeyIds,
    labels: { "managed-by": "nexus-frontdoor", "tenant-id": "t-...", "server-id": "srv-..." }
  })

Step 4: Store cloud provider result
  UPDATE frontdoor_servers SET
    provider_server_id = result.providerServerId,
    private_ip = result.privateIp,
    public_ip = result.publicIp

Step 5: Return to frontend
  { ok: true, server_id: "srv-...", status: "provisioning" }
```

### 7.4 Frontend Polls for Status

```
GET /api/servers/srv-...

Response during provisioning:
{ server_id: "srv-...", status: "provisioning", display_name: "My Dev Server", ... }

Response once ready (after phone-home):
{ server_id: "srv-...", status: "running", display_name: "My Dev Server", ... }
```

### 7.5 VPS Phone-Home (Provision Callback)

When the VPS finishes booting and the nex runtime is healthy, it calls back to frontdoor:

```
POST /api/internal/provision-callback
Authorization: Bearer prov-<provision-token>
{
  "tenant_id": "t-a3f9c2",
  "server_id": "srv-xyz",
  "status": "ready",
  "private_ip": "10.0.1.5",
  "runtime_port": 8080
}
```

**Frontdoor handles the callback:**

1. Look up the server record by `server_id` and `tenant_id`
2. Verify `provision_token` matches → reject if mismatch (prevents unauthorized registration)
3. Verify server status is `"provisioning"` → reject if already running or already in a final destroyed state
4. Update server record:
   ```
   status = "running"
   private_ip = callback.private_ip (may differ from initial assignment)
   runtime_port = callback.runtime_port
   provision_token = null (invalidate — one-time use)
   ```
5. Add to routing table: `t-a3f9c2.nexushub.sh → 10.0.1.5:8080`
6. Return `{ ok: true }` to the VPS

**Security properties of the provision callback:**
- One-time token: each provisioning generates a unique token, used once, then invalidated
- Token is transmitted via cloud-init (Hetzner encrypts user-data at rest)
- Callback URL is HTTPS (TLS in transit)
- Frontdoor validates token + tenant_id + server_id triple — all must match
- No way for an external party to register a VPS as a tenant without the provision token

### 7.6 Provisioning Timeout

If the VPS fails to phone home within **5 minutes**:

1. Frontdoor sets server status to `"failed"`
2. Frontdoor attempts to destroy the VPS via provider API (cleanup)
3. Frontend shows error: "Server creation failed. Please try again."
4. User can retry from dashboard

### 7.7 Canonical Lifecycle Transitions

```
provisioning → running    (phone-home received, healthy)
provisioning → failed     (timeout, provider error, phone-home error)
running      → recovering (restore or replacement repair)
running      → suspended  (billing or operator hold)
running      → archived   (non-destructive offboarding)
running      → destroy_pending (explicit final destroy)
recovering   → running    (replacement or restore complete)
recovering   → failed     (restore or repair failed)
suspended    → running    (resume)
suspended    → archived   (inactive but durable)
archived     → recovering (restore from archive or recovery point)
archived     → destroy_pending (explicit final destroy)
destroy_pending → destroyed (provider destruction completed)
```

---

## 8) Archive, Restore, And Final Destroy

### 8.1 Archive Is The Default Offboarding Action

```
User clicks "Archive Server" → confirmation modal:
  "Archive 'My Dev Server'?
   The server will stop running and leave active routing,
   but it will remain recoverable."
  [Cancel] [Archive Server]
```

Archive orchestration:

```
Step 1: Validate session and account access
Step 2: Remove from active routing
Step 3: Stop or offline active compute as provider/runtime policy allows
Step 4: Persist server status = "archived"
Step 5: Retain package state, recovery metadata, and durable server identity
```

Archive is the normal answer for:

- customer offboarding without permanent destruction
- suspension after billing or subscription issues
- operator-managed offlining before later restore

### 8.2 Restore Returns The Same Durable Server Asset

Restore orchestration:

1. Select the recovery artifact or archive source
2. Create or resume the backing provider VM
3. Boot the runtime with the same `server_id` and `tenant_id`
4. Health-check before routing cutover
5. Restore active routing once healthy

Restore should preserve the durable customer machine identity even if the
provider VM changes.

### 8.3 Final Destroy Is Exceptional

```
User clicks "Destroy Server Permanently" → confirmation modal:
  "Permanently destroy 'My Dev Server'?
   This irreversibly removes the durable server asset and its recovery path.
   This action cannot be undone."
  [Cancel] [Destroy Permanently]
```

Final destroy orchestration:

1. Validate stronger destructive confirmation and policy
2. Enter `destroy_pending`
3. Satisfy retention and recovery-point policy
4. Clear provider protection if required
5. Execute final provider destruction
6. Persist server status = `destroyed`
7. Keep only the audit tombstone required by policy

Destroy is not the default offboarding flow.
It is the final low-level infrastructure action after the durable lifecycle says
destruction is truly intended.

### 8.4 What Final Destroy Cleans Up

| Resource | Cleanup |
|----------|---------|
| Backing cloud VPS | Destroyed via provider API |
| Provider boot disk | Destroyed with backing VPS unless retained by explicit policy |
| Private network attachment | Removed with backing VPS |
| Firewall attachment | Removed with backing VPS |
| DNS | Nothing to clean up (wildcard) |
| Frontdoor routing table | Already removed before final destroy |
| Durable server DB record | Reduced to audit tombstone / destroyed lifecycle record |
| Recovery metadata | Retained or purged according to destroy policy |
| App subscriptions | Unchanged (account-level, not server-level) |

### 8.5 Orphan Protection

On frontdoor startup, reconcile cloud provider state with DB:
- Query provider for all servers with label `managed-by: nexus-frontdoor`
- Compare with DB records
- Any provider servers not in DB → alert operator (potential orphan)
- Any DB records with status "running" but no provider server → enter recovery instead of assuming intentional destruction

---

## 9) SSH Key Management

### 9.1 Nexus Operator Key

A single SSH keypair (`nexus-operator`) is used for all tenant VPS access:

- **Public key:** Baked into every golden snapshot + registered with Hetzner as an SSH key resource
- **Private key locations:**
  - `/root/.ssh/nexus-operator` on frontdoor VPS (for automated maintenance and agent access)
  - `~/.ssh/nexus-operator` on the operator's local machine (for manual debugging)
- **Usage:** SSH from frontdoor to any tenant VPS over the private network: `ssh -i /root/.ssh/nexus-operator root@10.0.1.5`

### 9.2 Security Properties

- Tenant VPSes only accept SSH from the private network (firewall enforced)
- No password authentication (disabled in sshd_config in the snapshot)
- Users do NOT get SSH access — they interact through platform UIs
- The operator key enables maintenance, updates, and agent-driven troubleshooting

### 9.3 Static Public Platform Hosts

The platform also has static public hosts such as the frontdoor host and, when
needed, product-specific control plane hosts.

These hosts are not lifecycle-managed tenant VPSes and therefore follow a
different hardening policy:

- canonical operator access uses the same `nexus-operator` key
- public SSH is restricted to explicit operator-controlled ingress rather than
  open internet access
- host-level firewall policy and provider-level firewall policy both narrow
  inbound access
- backups remain enabled
- delete and rebuild protection remain enabled
- named snapshots are taken before major infrastructure changes

Lifecycle-managed tenant VPSes keep the private-network SSH model defined above.
Under the durable server lifecycle, tenant delete and rebuild protection should
become the default once the platform's archive, restore, and final-destroy flow
explicitly knows how to clear or preserve protection at the right step.

### 9.4 Key Rotation (Future)

When the operator key needs to be rotated:
1. Generate new keypair
2. Update the golden snapshot with new public key
3. Push new public key to all running VPSes via SSH (using old key)
4. Remove old key from authorized_keys on all VPSes
5. Update frontdoor and local machine with new private key
6. Delete old Hetzner SSH key resource

---

## 10) Server Database Schema Additions

The existing `frontdoor_servers` table needs new columns for cloud provisioning:

```sql
-- New columns for cloud provisioning
ALTER TABLE frontdoor_servers ADD COLUMN provider TEXT;           -- "hetzner" | "aws"
ALTER TABLE frontdoor_servers ADD COLUMN provider_server_id TEXT; -- Hetzner server ID or AWS instance ID
ALTER TABLE frontdoor_servers ADD COLUMN plan TEXT;               -- "cx22", "t3.small", etc.
ALTER TABLE frontdoor_servers ADD COLUMN region TEXT;             -- "fsn1", "us-east-1", etc.
ALTER TABLE frontdoor_servers ADD COLUMN private_ip TEXT;         -- Private network IP
ALTER TABLE frontdoor_servers ADD COLUMN public_ip TEXT;          -- Public IP (if applicable)
ALTER TABLE frontdoor_servers ADD COLUMN runtime_port INTEGER;    -- Port nex runtime listens on
ALTER TABLE frontdoor_servers ADD COLUMN provision_token TEXT;    -- One-time phone-home token (null after use)
ALTER TABLE frontdoor_servers ADD COLUMN destroyed_at_ms INTEGER; -- When server was permanently destroyed
```

---

## 11) Configuration

### 11.1 Frontdoor Environment Variables

```bash
# Hetzner Cloud API
HETZNER_API_TOKEN=<token>

# Provisioning defaults
PROVISION_DEFAULT_PROVIDER=hetzner
PROVISION_DEFAULT_PLAN=cax11
PROVISION_DEFAULT_REGION=nbg1
PROVISION_TIMEOUT_MS=300000  # 5 minutes

# Hetzner resource IDs (created during one-time setup)
HETZNER_NETWORK_ID=<network-id>
HETZNER_FIREWALL_ID=<firewall-id>
HETZNER_SSH_KEY_ID=<ssh-key-id>
HETZNER_SNAPSHOT_ID=<golden-snapshot-id>
```

### 11.2 Frontdoor Config File Additions

```json
{
  "provisioning": {
    "defaultProvider": "hetzner",
    "timeoutMs": 300000,
    "providers": {
      "hetzner": {
        "apiToken": "env:HETZNER_API_TOKEN",
        "networkId": "env:HETZNER_NETWORK_ID",
        "firewallId": "env:HETZNER_FIREWALL_ID",
        "sshKeyIds": ["env:HETZNER_SSH_KEY_ID"],
        "snapshotId": "env:HETZNER_SNAPSHOT_ID",
        "defaultPlan": "cx22",
        "defaultRegion": "fsn1"
      }
    }
  }
}
```

---

## 12) Future Considerations

### 12.1 Server Suspension

When an account exhausts credits outside the free tier:
1. Frontdoor marks running servers as suspended and removes them from routing
2. The shell explains that credits must be added before the server resumes
3. A later credit deposit may unsuspend the server without reprovisioning
4. Longer-term offboarding policy archives durable servers before any final destroy policy is considered

### 12.2 Server Migration

Moving a tenant to a different plan or region:
1. Create new VPS with desired plan/region
2. Transfer data from old VPS to new VPS (rsync over private network)
3. Update routing table to point to new VPS
4. Archive or destroy the old backing VPS according to the durable lifecycle policy

### 12.3 Auto-Scaling (Not Planned)

One VPS per tenant does not auto-scale. If a tenant needs more resources, they upgrade their plan (vertical scaling). Horizontal scaling would require a different architecture (containers, orchestration) and is explicitly not in scope.

### 12.4 Multi-Region (Future)

Tenant VPSes in different regions need frontdoor to proxy across regions. Options:
- Frontdoor in each region (load-balanced by GeoDNS)
- Single frontdoor with cross-region private networking
- Per-region frontdoor proxies with a global control plane

Not designed yet — revisit when international expansion is needed.
