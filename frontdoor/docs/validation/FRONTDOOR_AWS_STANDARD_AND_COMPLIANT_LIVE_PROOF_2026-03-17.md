# Frontdoor AWS Standard And Compliant Live Proof 2026-03-17

**Status:** ACTIVE VALIDATION
**Last Updated:** 2026-03-18
**Related:** `/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/specs/FRONTDOOR_AWS_HOSTING_AND_SERVER_CLASS_MODEL.md`, `/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/specs/FRONTDOOR_HOSTED_PACKAGE_INSTALL_POLICY_AND_DEPLOYMENT_CLASSES.md`, `/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/specs/FRONTDOOR_HIPAA_READINESS_HARDENING.md`

## Purpose

This validation note records the first live proof that one AWS-hosted frontdoor
can do both of the following at the same time:

1. provision and operate `compliant` customer servers on AWS
2. provision and operate `standard` customer servers on Hetzner

The critical transport proof for `standard` is that the AWS frontdoor reaches
the Hetzner runtime over Tailscale, not over the old Hetzner-private-network
assumption.

## Customer Experience Baseline

The live proof preserves the intended customer experience:

1. one frontdoor
2. one login
3. one server list
4. `standard` vs `compliant`
5. no cloud-vendor UX

## Live Infrastructure Proven

### AWS frontdoor host

- instance id: `i-09e80f7b7da307e7c`
- public IP: `18.118.236.10`
- private IP: `172.31.15.170`
- tailnet hostname: `frontdoor-aws`
- tailnet IP: `100.90.95.57`

### AWS compliant provider baseline

- region: `us-east-2`
- subnet id: `subnet-0d204df9a705d6f9e`
- compliant runtime security group: `sg-05c4ab1bc82da8c1c`
- frontdoor host security group: `sg-0f51e4bd4fed68750`
- compliant runtime AMI: `ami-0c4ecec436fe2c2f4`
- EC2 key pair: `nexus-operator`

### Hetzner standard provider baseline

- network id: `12001111` (`nexus-net`)
- tenant firewall id: `10639052` (`nexus-tenant-fw`)
- SSH key ids: `108023325`, `108541245`
- golden snapshot id: `367439854` (`nex-golden-v5-package-operator`)

## Live Records Proven

### Compliant server

- server id: `srv-f0ea7e25-b25`
- tenant id: `t-0a11b8fc-b92`
- provider: `aws`
- server class: `compliant`
- deployment class: `customer_server`
- status: `running`
- private transport path: `172.31.14.72`

### Standard server

- server id: `srv-6fc91d17-d4e`
- tenant id: `t-f225dfff-376`
- provider: `hetzner`
- server class: `standard`
- deployment class: `customer_server`
- status: `running`
- Hetzner private IP: `10.0.0.4`
- Tailscale transport host: `100.119.36.126`
- tailnet hostname: `nex-t-f225dfff-376.tailf397a5.ts.net`

### Tagged standard bootstrap reprovision

- destroyed throwaway server id: `srv-49d7dc27-ccf`
- destroyed throwaway tenant id: `t-01ed79ce-daf`
- replacement Hetzner provider id: `124126731`
- replacement Tailscale transport host: `100.77.181.73`
- replacement tailnet hostname: `nex-t-01ed79ce-daf.tailf397a5.ts.net`
- joined with tag: `tag:nex-standard-server`

### Fresh compliant reprovision

- server id: `srv-1cfddbf9-8b6`
- tenant id: `t-c2a80806-d75`
- provider: `aws`
- server class: `compliant`
- deployment class: `customer_server`
- status: `running`
- AWS instance id: `i-0cd36afda75fb4d8c`
- private transport path: `172.31.5.122`

## What Was Proven Live

### 1. AWS frontdoor host is real and serving

Observed:

1. `nexus-frontdoor.service` is active on the AWS EC2 host
2. `caddy` terminates `80/443` and reverse proxies to `127.0.0.1:4789`
3. `frontdoor.nexushub.sh` and `*.nexushub.sh` both resolve to `18.118.236.10`
4. the host is joined to the Tailscale tailnet

### 2. Compliant AWS provisioning is real

Observed:

1. the AWS frontdoor can provision and operate `srv-f0ea7e25-b25`
2. the compliant tenant subdomain `https://t-0a11b8fc-b92.nexushub.sh/` returns `404`, not `503`
3. the compliant server remains reachable through the AWS-hosted frontdoor

### 3. Standard Hetzner provisioning from AWS frontdoor is real

Observed:

1. `POST /api/servers/create` with `server_class = standard` returned `200`
2. the AWS frontdoor created Hetzner server `124057222`
3. the new server booted from snapshot `367439854`
4. the new server completed cloud-init successfully

### 4. Standard bootstrap now executes the Tailscale branch

Observed directly from `/var/log/cloud-init-output.log` on the new Hetzner
server:

1. frontdoor host allowlist changed from the old AWS private IP assumption to
   the Tailscale frontdoor IP:
   - `Allowing runtime port 18789 from frontdoor host 100.90.95.57 via UFW`
2. the bootstrap explicitly enabled the Tailscale overlay path:
   - `Allowing SSH and runtime traffic from Tailscale CGNAT range via UFW`
3. the bootstrap installed Tailscale on first boot
4. the server joined the tailnet successfully
5. the bootstrap set:
   - `Private IP: 10.0.0.4`
   - `Transport host: 100.119.36.126`
6. the provision callback succeeded on the first attempt

### 5. AWS frontdoor <-> Hetzner runtime path now uses Tailscale transport

Observed:

1. frontdoor persisted the Hetzner `standard` server as `running`
2. frontdoor-issued runtime token projection for `srv-6fc91d17-d4e` reports:
   - `ws_url = ws://100.119.36.126:18789`
3. the standard tenant subdomain `https://t-f225dfff-376.nexushub.sh/` returns `404`, not `503`
4. the AWS frontdoor host can SSH to `root@100.119.36.126` over the tailnet

This is the key live proof that the old Hetzner-private-network assumption is
no longer required for `standard` from an AWS-hosted frontdoor.

### 6. Tagged standard bootstrap is now the live path

Observed:

1. the AWS frontdoor host is tagged as `tag:frontdoor`
2. frontdoor bootstrap config now uses the tagged reusable auth key for
   `tag:nex-standard-server`
3. a fresh Hetzner `standard` reprovision joined the tailnet as:
   - `tag:nex-standard-server`
4. frontdoor persisted the replacement transport host as:
   - `100.77.181.73`

This closes the earlier gap where proof relied on a user-scoped reusable
Tailscale auth key.

### 7. Sequential real-API reprovision proof is now green

Observed:

1. a real OIDC session principal for the live user account was used against
   `POST /api/servers/create`
2. a fresh `standard` throwaway was created, reached `running`, and then was
   destroyed through:
   - `POST /api/servers/:server_id/destroy` with `confirm = true`
3. after the account was cleared, a fresh `compliant` server was created
   through the same live frontdoor API path
4. the fresh `compliant` reprovision reached:
   - `status = running`
   - `provider = aws`
   - `transport_host = 172.31.5.122`

This proves the live public frontdoor API can sequentially provision both
classes correctly under the current account limits.

## Required Hard-Cut Fix That Unblocked Standard

The first Hetzner attempt from the AWS frontdoor did not join Tailscale because
the AWS frontdoor host was still running an older built artifact that lacked
the Tailscale bootstrap branch.

The fix that made the live proof pass was:

1. rebuild the current frontdoor tree locally
2. redeploy the updated `dist/` to the AWS frontdoor host
3. reprovision the Hetzner `standard` server from scratch

That means the current passing proof depends on the updated build, not merely
on env wiring.

## Current Validation State

### Proven

1. one AWS-hosted frontdoor can serve both `standard` and `compliant`
2. compliant provisioning on AWS works live
3. standard provisioning on Hetzner works live
4. standard bootstrap can install and join Tailscale automatically
5. frontdoor serves both tenant subdomains through the DNS-based public edge
6. frontdoor runtime token projection now reflects Tailscale transport for
   Hetzner `standard`
7. AWS frontdoor can reach the standard runtime/operator path over the tailnet
8. package republish to the AWS frontdoor host succeeded for `spike`, `glowbot`,
   `zenoti-emr`, and `patient-now-emr`
9. `glowbot` is installed and active on the compliant proof server after republish
10. password login and signup are hard-disabled on the live AWS frontdoor
11. Google OIDC start on `frontdoor.nexushub.sh` remains active
12. the old Hetzner frontdoor and obsolete Hetzner tenant servers are retired
13. tagged Tailscale bootstrap for fresh `standard` servers works live
14. a fresh sequential `compliant` reprovision through the live frontdoor API
    works after clearing account capacity
15. a human-walked Google OIDC login on `https://frontdoor.nexushub.sh` succeeded

### Not Yet Proven

1. UI badge and guardrail proof for `standard` vs `compliant`

## Residuals Before Full Migration

1. frontdoor UI still needs to catch up with the hard-cut `standard` vs
   `compliant` model and install guardrails already enforced in backend policy
