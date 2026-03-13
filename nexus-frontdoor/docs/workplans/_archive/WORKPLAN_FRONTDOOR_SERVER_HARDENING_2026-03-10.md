# Workplan: Frontdoor Server Hardening

**Date:** 2026-03-10
**Status:** COMPLETED
**Spec:** `/Users/tyler/nexus/home/projects/nexus/docs/governance/spec-driven-development-workflow.md`
**Depends on:** `/Users/tyler/nexus/home/projects/nexus/nexus-frontdoor/docs/specs/CLOUD_PROVISIONING_ARCHITECTURE_2026-03-04.md`
**Depends on:** `/Users/tyler/nexus/home/projects/nexus/nexus-frontdoor/docs/specs/TENANT_NETWORKING_AND_ROUTING_2026-03-04.md`
**Approach:** HARD CUTOVER — canonical operator access uses `nexus-operator`, public SSH is explicitly restricted, and tenant SSH stays private-network-only

---

## Objective

Harden the live Hetzner footprint so the operator path is explicit, recoverable,
and narrow:

1. `frontdoor-1` and `oracle-1` accept the canonical `nexus-operator` admin key
   and no longer rely on Tyler's personal `id_ed25519` key.
2. Public SSH to `frontdoor-1` and `oracle-1` is restricted to the current
   operator IP instead of open internet exposure.
3. Tenant VPS SSH remains reachable only over the private Hetzner network via
   the frontdoor host.
4. Static public hosts gain delete/rebuild protection plus Hetzner backups.
5. CLI-based Hetzner and Vercel access is discoverable to other agents through
   Nexus external-CLI auth profile tracking.

Completed 2026-03-10 after:

1. cutting public-host SSH over to `nexus-operator`
2. disabling password-based SSH on `frontdoor-1` and `oracle-1`
3. applying Hetzner firewalls and matching `UFW` rules on both public hosts
4. verifying tenant SSH remains private-network-only
5. enabling protection/backups and creating named snapshots on both public hosts
6. adding Hetzner and Vercel external CLI auth profiles to Nexus and syncing
   them into the credential database

## Customer Experience Goal

The hosted platform should feel safe and boring:

1. customers still reach public product traffic on the normal HTTPS surface
2. operators have one deterministic SSH path that works when needed
3. tenant runtimes remain unreachable from the public internet over SSH
4. destructive mistakes on the public control-plane hosts are harder to make
5. other agents can discover how infra access is authenticated without
   scavenging local shell state

## Research Findings

1. Local operator SSH currently works to `frontdoor-1` (`178.104.21.207`) and
   `oracle-1` (`46.225.118.74`) only via `~/.ssh/id_ed25519` as `root`.
   `~/.ssh/nexus-operator` is not yet accepted on either host.
2. Both public hosts currently expose SSH on `0.0.0.0:22`, have no Hetzner
   firewall attached, have `UFW` inactive, and still have
   `PasswordAuthentication yes`.
3. `frontdoor-1` already contains `/root/.ssh/nexus-operator` and can SSH to
   both tenant private IPs (`10.0.0.3`, `10.0.0.4`) successfully as `root`.
4. Tenant public SSH already appears blocked at the network edge; the shared
   tenant firewall only allows inbound TCP from `10.0.0.0/16`.
5. `oracle-1` is not the current Nexus frontdoor host despite older docs
   naming it that way. The live topology is:
   - `frontdoor-1`: Nexus frontdoor + Caddy + private network attachment
   - `oracle-1`: legacy Spike-hosted services behind Caddy
6. None of the four visible servers currently have Hetzner backups enabled or
   delete/rebuild protection enabled.
7. Hetzner already has both local public keys registered:
   - `nexus-operator`
   - `tyler-mbp`
8. The current operator public IP is `136.49.99.9/32`.
9. Enabling Hetzner delete protection on lifecycle-managed tenant VPSes right
   now would break frontdoor destroy flows, so tenant protection must be
   handled separately from static public hosts.

## Phase 1: Canonical Operator Access Cutover

### Goal

Make `nexus-operator` the only canonical admin key for the public hosts.

### Changes

1. Add `~/.ssh/nexus-operator.pub` to `/root/.ssh/authorized_keys` on
   `frontdoor-1` and `oracle-1`.
2. Verify direct SSH from the local machine using `~/.ssh/nexus-operator`.
3. Remove the personal `id_ed25519` key from `/root/.ssh/authorized_keys` on
   both public hosts after the new path is proven.
4. Tighten `sshd` on both public hosts:
   - `PasswordAuthentication no`
   - `KbdInteractiveAuthentication no`
   - `ChallengeResponseAuthentication no`
   - keep root key-based access only

### Exit Criteria

`ssh -i ~/.ssh/nexus-operator root@<public-host>` works for both public hosts,
and `ssh -i ~/.ssh/id_ed25519 root@<public-host>` no longer works.

## Phase 2: Network Hardening

### Goal

Constrain public network exposure without breaking public product traffic.

### Changes

1. Create and attach Hetzner firewalls for `frontdoor-1` and `oracle-1` with
   these rules:
   - allow TCP `80` from `0.0.0.0/0` and `::/0`
   - allow TCP `443` from `0.0.0.0/0` and `::/0`
   - allow TCP `22` from `136.49.99.9/32`
   - allow ICMP from `0.0.0.0/0` and `::/0`
2. Enable `UFW` on both public hosts with matching intent:
   - default deny incoming
   - default allow outgoing
   - allow `80/tcp`
   - allow `443/tcp`
   - allow `22/tcp` from `136.49.99.9`
3. Reconfirm tenant public SSH remains unreachable on the public IPs after the
   public-host firewall changes.
4. Reconfirm frontdoor-to-tenant SSH over the private network still works.

### Exit Criteria

Public HTTPS remains reachable, public SSH only accepts connections from the
operator IP, and tenant SSH is still private-network-only.

## Phase 3: Protection And Recovery Posture

### Goal

Harden the static public control-plane hosts against accidental destructive
actions and define the recovery baseline.

### Changes

1. Enable Hetzner delete and rebuild protection on:
   - `frontdoor-1`
   - `oracle-1`
2. Enable Hetzner backups on:
   - `frontdoor-1`
   - `oracle-1`
3. Create manual point-in-time snapshots for the static public hosts after the
   hardening cutover so there is an explicit recovery checkpoint.
4. Record the operational policy:
   - static public hosts keep backups enabled plus named snapshots before major
     infra changes
   - lifecycle-managed tenant VPSes keep the private-network SSH firewall model
     today, but Hetzner delete protection is deferred until frontdoor destroy
     flows explicitly disable protection first

### Exit Criteria

Static public hosts have backups enabled, delete/rebuild protection enabled, and
fresh named snapshots available.

## Phase 4: Credential Tracking

### Goal

Make existing CLI-authenticated access discoverable in Nexus without storing raw
secrets.

### Changes

1. Add a Nexus `external_cli` auth profile for Hetzner pointing at the local
   `hcloud` CLI context.
2. Add a Nexus `external_cli` auth profile for Vercel pointing at the local
   `vercel` CLI session.
3. Sync those auth profiles into the Nexus credential database so other agents
   can discover them without scavenging shell state.

### Exit Criteria

Another agent can discover that Hetzner and Vercel access already exist on this
machine without guessing from shell state alone or requiring raw secrets to be
copied into the credential index.

## Phase 5: Validation

### Goal

Prove the final live posture matches the intended operator model.

### Validation

1. Verify SSH matrix:
   - `nexus-operator` succeeds to both public hosts
   - `id_ed25519` fails to both public hosts
   - tenant public SSH fails
   - frontdoor private-network SSH to each tenant succeeds
2. Verify host-level posture on both public hosts:
   - `UFW status verbose`
   - `sshd -T` shows password auth disabled
   - `ss -lntup` matches the expected listening surfaces, with any legacy
     non-canonical public binds blocked at the network edge
3. Verify Hetzner posture:
   - firewall attachments
   - delete protection
   - rebuild protection
   - backups enabled
   - snapshots present
4. Verify Nexus credential tracking:
   - Hetzner and Vercel external CLI profiles exist in
     `state/credentials/auth-profiles.json`
   - `nexus credential sync-db` succeeds

### Exit Criteria

The operator path is explicit and verified, public SSH is narrowed, tenant SSH
is private-only, recovery protections exist on static public hosts, and Nexus
tracks the relevant infra-access pointers via external CLI profiles.

## Residual Note

`oracle-1` still has a legacy Spike service bound on `*:7422`. This is no
longer reachable from the public internet because both Hetzner and `UFW` now
allow only `80`, `443`, and operator-scoped `22`, but the service should still
be rebound to loopback if `oracle-1` remains in service long-term.
