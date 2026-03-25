# Workplan Frontdoor AWS DNS Cutover And Hetzner Retirement

**Status:** COMPLETED (archived 2026-03-17)

## Purpose

This workplan defines the hard cut from the proof-era Hetzner frontdoor to the
AWS-hosted frontdoor after fresh compliant package-install proof is green.

This is a migration workplan, not a target-state spec. The target-state canon
remains:

- [FRONTDOOR_AWS_HOSTING_AND_SERVER_CLASS_MODEL.md](/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/specs/FRONTDOOR_AWS_HOSTING_AND_SERVER_CLASS_MODEL.md)

## Customer Experience First

The cutover must preserve:

1. one frontdoor
2. one login flow
3. one app catalog
4. one server list
5. `standard` vs `compliant`
6. no cloud-vendor UX

The customer should not experience:

1. a second frontdoor
2. a second domain model
3. a migration bridge UI
4. provider-selection prompts

## Current Live State

### AWS frontdoor is now the live public edge

Current live frontdoor host:

1. stable public IP: `18.118.236.10`
2. private IP: `172.31.15.170`
3. tailnet IP: `100.90.95.57`
4. public TLS ingress: `80/443` via `caddy`
5. loopback Node frontdoor listener: `127.0.0.1:4789`

Live DNS records under `nexushub.sh` now point at AWS:

1. `frontdoor.nexushub.sh -> 18.118.236.10`
2. `*.nexushub.sh -> 18.118.236.10`

### Hetzner retirement is mostly complete

Retired:

1. old Hetzner frontdoor `122771269` `frontdoor-1`
2. obsolete Hetzner tenant `123902315` `nex-t-9ca93034-642`
3. obsolete Hetzner tenant `123916531` `nex-t-0d0b1679-ba1`
4. obsolete Hetzner tenant `124007303` `nex-t-db10c8a2-f61`
5. stale `runtime-tenant-dev` DNS records
6. unattached `nexus-frontdoor-public-fw`

Retained intentionally:

1. active `standard` Hetzner tenant `124057222` `nex-t-f225dfff-376`

## Preconditions

The DNS cutover does not begin until all of the following are true:

1. fresh compliant-server provisioning is green on the refreshed AWS AMI
2. first-time hosted `glowbot` install succeeds on a fresh compliant server
3. package publish to the AWS frontdoor host is green
4. the Tailscale bootstrap key is rotated to a reusable tagged
   server-device key
5. the AWS frontdoor auth surface is cleaned up from proof mode

## Phase 1: Final AWS Frontdoor Auth Cleanup

### Goal

Remove proof-mode auth and raw-IP assumptions from the AWS frontdoor host.

### Changes

1. replace proof `baseUrl` with the final DNS URL
2. keep the AWS-private `internalBaseUrl`
3. set `FRONTDOOR_SESSION_COOKIE_DOMAIN=.nexushub.sh`
4. set secure session cookies
5. enable HSTS
6. remove the seeded local proof owner user
7. replace proof login with the intended production auth surface
8. reproduce the old ingress pattern on AWS:
   - public TLS on `80/443`
   - frontdoor loopback listener on `127.0.0.1:4789`
9. ensure the public DNS target is stable before records move

### Exit Criteria

1. no proof-only password auth remains on the AWS frontdoor public surface
2. no raw-IP public URL remains in active frontdoor config
3. session cookies are valid for the intended shell/frontdoor domain model
4. the AWS frontdoor has real TLS ingress on `80/443`
5. the Node frontdoor is no longer exposed directly as the public edge

## Phase 2: DNS Cutover

### Goal

Move the public frontdoor and tenant wildcard DNS from Hetzner to the AWS
frontdoor host.

### Changes

1. repoint `frontdoor.nexushub.sh` from `178.104.21.207` to the AWS frontdoor
2. repoint `*.nexushub.sh` from `178.104.21.207` to the AWS frontdoor
3. remove obsolete Hetzner IPv6 records if they no longer apply
4. validate public HTTPS/session behavior against the final DNS names

### Exit Criteria

1. `frontdoor.nexushub.sh` resolves to the AWS frontdoor
2. tenant wildcard routing resolves to the AWS frontdoor
3. public OIDC redirect flow works against the final domain names
4. standard and compliant tenant subdomains resolve through the AWS frontdoor

## Phase 3: Post-Cutover Validation

### Goal

Prove the DNS-based frontdoor, not the raw-IP proof host.

### Changes

1. login through the final domain
2. list servers through the final domain
3. validate runtime health for:
   - one `standard`
   - one `compliant`
4. validate hosted app launch for a published package
5. validate package publish still reaches the AWS frontdoor host

### Exit Criteria

1. all hosted proof paths are green through the DNS-based frontdoor
2. no validation step depends on the raw AWS public IP

## Phase 4: Hetzner Retirement

### Goal

Destroy the old Hetzner frontdoor and any obsolete Hetzner tenant servers after
the AWS cut is proven.

### Changes

1. destroy `frontdoor-1`
2. destroy obsolete Hetzner tenant servers that are not part of the retained
   `standard` fleet
3. remove dead DNS records and provider metadata tied only to the retired host
4. verify no active control-plane workflows still reference `178.104.21.207`

### Exit Criteria

1. no active frontdoor control-plane traffic depends on Hetzner frontdoor
2. the old Hetzner frontdoor host is deleted
3. only intentionally retained `standard` servers remain in Hetzner

## Immediate Next Cut

1. hard-cut the Tailscale bootstrap key to the tagged server-device model
2. validate an interactive Google OIDC login through `frontdoor.nexushub.sh`
3. archive this workplan once the tagged-key rotation is complete
