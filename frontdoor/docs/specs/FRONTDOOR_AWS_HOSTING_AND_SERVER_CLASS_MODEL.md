# Frontdoor AWS Hosting And Server Class Model

**Status:** CANONICAL
**Last Updated:** 2026-03-17
**Related:** FRONTDOOR_ARCHITECTURE.md, CLOUD_PROVISIONING_ARCHITECTURE_2026-03-04.md, FRONTDOOR_HOSTED_ACCESS_AND_ROUTING.md, `nex/docs/specs/platform/server-lifecycle-and-durability.md`, `/Users/tyler/nexus/home/projects/nexus/packages/apps/glowbot/docs/specs/HIPAA_COMPLIANCE.md`

---

## 1) Purpose

This document defines the canonical hosted model for:

1. where frontdoor runs
2. how hosted servers are classified
3. how AWS and Hetzner divide responsibility
4. how frontdoor preserves one customer-facing UX while enforcing different
   compliance boundaries
5. the minimum storage, secrets, logging, and audit posture for frontdoor under
   that model

This is the target state.

It does not describe migration bridges, dual frontdoors, or compatibility
shims.

---

## 2) Customer Experience

The customer-facing experience must stay simple:

1. there is one frontdoor
2. there is one login flow
3. there is one app catalog
4. there is one server list
5. the user chooses a server class, not a cloud vendor

The user should see:

1. `standard`
2. `compliant`

The user should not be asked to choose:

1. AWS
2. Hetzner
3. Tailscale
4. a separate HIPAA frontdoor

The only required UX difference is policy visibility:

1. compliant servers carry a visible compliance badge
2. apps and adapters that require compliant hosting are blocked on standard
   servers
3. compliant-first products may default server creation to compliant

No separate customer-facing frontdoor service is part of the target state.

---

## 3) Non-Negotiable Rules

1. frontdoor backend runs in AWS
2. frontdoor remains the single hosted control plane for all customers
3. `standard` and `compliant` are product-facing server classes, not provider
   brands
4. compliant servers are AWS-only
5. standard servers may run on Hetzner
6. frontdoor remains PHI-poor by contract even though it runs inside the AWS
   compliance boundary
7. frontdoor must not require a separate UX or second domain for HIPAA
8. provider choice is an internal routing and provisioning policy, not a user
   decision
9. hard cutover only; no legacy provider-selection UI survives in the target
   state

---

## 4) Canonical Server Classes

Frontdoor exposes exactly two hosted server classes:

### 4.1 `standard`

The default lower-cost hosted server class.

Intended use:

1. non-regulated workloads
2. cheaper hosted experimentation
3. apps and adapters that do not require HIPAA-sensitive handling

Provider policy:

1. provision on Hetzner by default
2. may later support AWS if cost/performance policy changes
3. does not satisfy compliant-only install requirements

### 4.2 `compliant`

The regulated hosted server class for HIPAA-sensitive workloads.

Intended use:

1. GlowBot clinic runtimes that handle EMR-derived data
2. apps and adapters that require HIPAA-sensitive hosting
3. workloads that must stay inside the AWS BAA boundary

Provider policy:

1. provision on AWS only
2. use AWS-hosted model providers and AWS-hosted control-plane dependencies
   where required
3. reject install attempts from packages that are not approved for compliant
   hosting if such restrictions exist later

---

## 5) Canonical Frontdoor Hosting Boundary

### 5.1 Frontdoor placement

Frontdoor backend is AWS-hosted.

That backend owns:

1. authentication
2. sessions
3. server provisioning and lifecycle orchestration
4. install planning
5. runtime token minting
6. hosted shell delivery
7. product-control-plane routing that remains within frontdoor's allowed
   non-PHI contract

Public ingress contract:

1. the Node frontdoor process remains a private application listener, not the
   public TLS edge
2. the public frontdoor endpoint terminates `80/443` at a host-level reverse
   proxy or equivalent AWS front end
3. the public reverse proxy forwards to the Node frontdoor on loopback
   `127.0.0.1:4789`
4. the public frontdoor DNS must point at a stable address, not a disposable
   EC2 public IP

Canonical addressing rule:

1. frontdoor keeps a public `baseUrl` for browser and operator-facing traffic
2. frontdoor keeps an AWS-private `internalBaseUrl` for private compliant
   server bootstrap and provision-callback traffic
3. compliant AWS servers use `internalBaseUrl`, not the public `baseUrl`, for
   phone-home bootstrap
4. compliant AWS servers must not send the provision callback until bootstrap
   has produced `/opt/nex/state/config.json` and the local runtime health check
   is actually green
5. the compliant runtime image must not auto-start `nex-runtime.service`
   before cloud-init has patched hosted runtime config on first boot
6. first-boot cloud-init owns the initial enable/start of
   `nex-runtime.service`; the baked image must ship the unit installed but
   disabled

### 5.2 Why frontdoor runs in AWS

Frontdoor is too central to rely on a brittle “outside the PHI path” argument.

Running frontdoor in AWS means:

1. the hosted control plane is inside the same cloud boundary as compliant
   servers
2. HIPAA-sensitive hosted traffic no longer depends on Hetzner being outside
   the compliance story
3. frontdoor, compliant servers, Bedrock, backups, and audit live under one
   AWS account boundary
4. the public ingress pattern from the old Hetzner frontdoor can be preserved
   cleanly: TLS on the host edge, Node frontdoor on loopback

### 5.3 What may remain outside AWS

PHI-free public marketing surfaces may remain outside AWS if desired.

Examples:

1. public marketing pages
2. product landing pages
3. static branded entrypoints

Those surfaces are not the canonical hosted control plane and must not become a
backdoor for PHI-bearing behavior.

---

## 6) Provider Policy And Routing

Frontdoor chooses infrastructure provider from server class and policy, not
from direct user cloud selection.

### 6.1 Canonical mapping

1. `standard` -> Hetzner
2. `compliant` -> AWS

### 6.2 Persistent object model

Frontdoor persists:

1. `server_class` on the durable server record
2. `deployment_class` on the durable server record
3. `provider` on the backing infrastructure mapping
4. `private_ip` as the provider-private infrastructure address
5. `transport_host` as the actual runtime and operator transport address that
   frontdoor uses
6. provider-specific server identifiers as infrastructure details, not customer
   identity

The durable customer identity remains:

1. `server_id`
2. `tenant_id`

The provider artifact remains replaceable infrastructure.

### 6.3 Managed-provider dispatch

Frontdoor must not assume one global cloud provider for all managed servers.

Canonical rule:

1. lifecycle and provisioning dispatch from the persisted server record and the
   requested server class
2. `provider="hetzner"` dispatches to the standard-provider implementation
3. `provider="aws"` dispatches to the compliant-provider implementation
4. recovery points remain provider-specific infrastructure artifacts; restore
   does not silently cross providers

### 6.4 Install policy

Installable products and packages use the hosted package policy contract
defined in:

- [Hosted Package Install Policy and Deployment Classes](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/hosted-package-install-policy-and-deployment-classes.md)
- [Frontdoor Hosted Package Install Policy And Deployment Classes](/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/specs/FRONTDOOR_HOSTED_PACKAGE_INSTALL_POLICY_AND_DEPLOYMENT_CLASSES.md)

Frontdoor enforces this before provisioning and install.

---

## 7) Compliant Bootstrap Contract

The compliant AWS bootstrap path is not allowed to report a server as
`running` optimistically.

Required bootstrap sequence:

1. write the tenant bootstrap contract to `/opt/nex/config/tenant.json`
2. stop and disable any pre-started `nex-runtime.service` process from the
   baked image before workspace initialization
3. initialize the workspace rooted at `/opt/nex`
4. verify that initialization produced `/opt/nex/state/config.json`
5. patch trusted-token hosted runtime config into that file
6. enable and start `nex-runtime.service`
7. wait for a successful authenticated local health check on `127.0.0.1:18789`
8. detect the AWS-private RFC1918 runtime IP
9. send the provision callback to frontdoor `internalBaseUrl`

Trusted bootstrap health token contract:

1. issuer must match frontdoor runtime trusted-token issuer
2. audience must be `nexus-runtime`
3. tenant claim must match the hosted tenant
4. the health gate uses the same hosted trusted-token contract as the runtime
   HTTP surface

Non-negotiable rules:

1. bootstrap must retry initialization if the first `nexus init` attempt fails
   transiently
2. bootstrap must fail hard if `/opt/nex/state/config.json` is still missing
   after the retry budget is exhausted
3. the baked compliant AMI must not leave `nex-runtime.service` enabled on the
   image before first boot
4. bootstrap must fail hard if runtime health does not become green before the
   timeout
5. frontdoor must only persist `status=running` from the provision callback
   after that successful bootstrap sequence

This prevents false-positive `running` state when the runtime service is
crash-looping or the workspace was never initialized successfully.

Canonical rules:

1. if a package requires `compliant`, install on `standard` is blocked
2. if a package belongs on `product_control_plane`, install on a customer
   server is blocked
3. frontdoor should guide the user toward selecting or creating the correct
   server rather than exposing cloud-vendor internals

---

## 7) Tailscale Operator Overlay

### 7.1 Purpose

Once frontdoor runs in AWS and still manages Hetzner-backed standard servers, it
needs a secure operator path for:

1. package staging
2. operator lifecycle calls
3. install and upgrade orchestration
4. recovery and maintenance actions

### 7.2 Canonical design

The operator path to Hetzner standard servers runs through Tailscale.

Topology:

1. AWS-hosted frontdoor joins the operator tailnet
2. Hetzner standard servers join the same operator tailnet
3. the tailnet policy defines service tags for non-human machines through
   `tagOwners`
4. AWS-hosted frontdoor authenticates as a tagged service device, not a
   user-scoped device
5. Hetzner standard-server bootstrap uses a reusable tagged server-device auth
   key, not a user-scoped auth key
6. the canonical first tags are:
   - `tag:frontdoor`
   - `tag:nex-standard-server`
7. Hetzner bootstrap reports a Tailscale-backed `transport_host` in the
   provision callback
8. frontdoor uses `transport_host` for standard-server runtime proxy
   transport, operator SSH, and runtime operator access

### 7.3 Non-negotiable constraints

1. no public operator SSH path is required for standard servers
2. Tailscale is an operator/control-plane network, not a customer-facing
   dependency
3. user traffic still goes through the canonical hosted runtime/frontdoor
   routing contract even when frontdoor reaches a standard server over
   Tailscale-backed private transport
4. compliant AWS-hosted servers do not require Hetzner overlay routing to
   satisfy the compliant path
5. for compliant servers, `transport_host` is the AWS private address unless a
   different private transport is explicitly introduced later
6. frontdoor and standard servers must not be left on user-scoped Tailscale
   identities after migration
7. migration is not complete until the reusable standard-server bootstrap key
   is a tagged server-device key

### 7.4 Compliant-server transport

Compliant servers do not depend on Tailscale for core operator reachability.

Canonical design:

1. compliant servers run in AWS private networking reachable from the AWS
   frontdoor host
2. package staging and runtime operator actions may still use SSH plus runtime
   operator HTTP within AWS private addressing
3. compliant servers do not require public ingress for operator traffic
4. browser traffic still lands on frontdoor; frontdoor reaches compliant
   runtimes over private AWS networking
5. compliant bootstrap and provision-callback traffic targets frontdoor
   `internalBaseUrl`, not the public browser `baseUrl`
6. the AWS frontdoor host must allow port `4789` from the compliant-runtime
   security group for bootstrap callback traffic
7. compliant bootstrap must report the real AWS private address, including
   `172.31.x.x`, not just Hetzner-style `10.x.x.x`

---

## 8) Frontdoor PHI Boundary

Frontdoor runs inside the AWS-hosted compliance boundary for simplicity, but it
must still remain PHI-poor by design.

Frontdoor must not persist:

1. patient identifiers
2. appointment-level records
3. raw EMR payloads
4. clinic-local attribution join data

Frontdoor may persist:

1. user/account metadata
2. server metadata
3. package metadata
4. entitlements and billing state
5. session and token state
6. install and lifecycle state
7. non-PHI product-control-plane routing metadata

GlowBot-specific PHI rules remain defined in:

- `/Users/tyler/nexus/home/projects/nexus/packages/apps/glowbot/docs/specs/HIPAA_COMPLIANCE.md`

---

## 9) Storage, Secrets, Logging, And Audit Baseline

### 9.1 Storage

For the current frontdoor scale, local SQLite remains acceptable.

The required posture is:

1. frontdoor runs as a single active instance unless and until persistence is
   redesigned
2. SQLite lives on encrypted EBS
3. backups and restore are mandatory
4. restore procedures must be documented and tested

Canonical rule:

1. moving to AWS does not require an immediate move to RDS

### 9.2 Secrets

Frontdoor may use self-managed secrets initially.

Required posture:

1. secrets are not committed to the repo
2. secrets are not baked into long-lived images
3. secrets are injected at deploy time or boot time
4. rotation remains an operator responsibility until a managed secret system is
   introduced

Canonical rule:

1. Secrets Manager and SSM Parameter Store are optional implementation choices,
   not required target-state product behavior

### 9.3 Logging

Frontdoor logging remains metadata-only by default.

Required posture:

1. no request body logging
2. no response body logging
3. no PHI-bearing fields in structured logs
4. no debug shortcuts that dump arbitrary payloads in production

### 9.4 Audit

CloudTrail is required for the AWS account that hosts frontdoor.

Reason:

1. frontdoor application logs do not replace AWS control-plane audit
2. AWS-side changes to networking, IAM, storage, or secrets must remain
   traceable

CloudWatch is optional if equivalent monitoring and alerting are provided by
another operator-controlled system.

---

## 10) AWS Account And Workforce Access Baseline

### 10.1 IAM Identity Center instance type

For a fresh standalone AWS account hosting frontdoor, use an IAM Identity
Center organization instance.

Reason:

1. AWS account access and permission-set based workforce access require the
   organization-instance capability set
2. account instances do not support AWS account access through the IAM Identity
   Center portal

### 10.2 Identity Center home region

Choose one IAM Identity Center home region deliberately and treat it as the
canonical workforce-access region for that AWS account.

This region defines:

1. the IAM Identity Center directory home
2. the start URL / issuer URL region used by the AWS CLI
3. the region tied to AWS workforce access sign-in behavior

### 10.3 CLI profile model

Frontdoor operators should use AWS CLI SSO profiles, not long-lived IAM user
keys.

Required inputs for the local CLI profile:

1. `sso_start_url` or issuer URL
2. `sso_region`
3. `sso_account_id`
4. `sso_role_name`

The canonical local profile form is:

```ini
[profile frontdoor-admin]
sso_session = frontdoor
sso_account_id = <aws-account-id>
sso_role_name = <permission-set-role-name>
region = <default-aws-region>
output = json

[sso-session frontdoor]
sso_region = <identity-center-region>
sso_start_url = <identity-center-start-url>
sso_registration_scopes = sso:account:access
```

---

## 11) Canonical Deployment Baseline

The initial compliant frontdoor deployment baseline is:

1. frontdoor backend on AWS EC2
2. encrypted EBS for frontdoor state
3. S3 for backups and artifact storage as needed
4. CloudTrail enabled
5. Tailscale installed for operator-overlay access to Hetzner standard servers
6. SQLite retained until a multi-instance persistence redesign is truly needed
7. frontdoor config sets both a public `baseUrl` and a private
   `internalBaseUrl`

This is intentionally lean.

It does not require:

1. RDS
2. Secrets Manager
3. SSM Parameter Store
4. CloudWatch as a mandatory dependency

Those may be adopted later, but they are not part of the canonical minimum
architecture.

### 11.1 First live region baseline

The first live AWS frontdoor and compliant-server proof uses:

1. AWS account `953113807086`
2. region `us-east-2`
3. one AWS-hosted frontdoor EC2 instance
4. one baked ARM64 compliant-runtime AMI in the same region
5. the existing frontdoor operator SSH key identity `nexus-operator`

This first live cut is intentionally narrow.

It proves the hosted model in one region before any multi-region or
high-availability expansion.

### 11.2 First live network baseline

The first live proof may use the AWS default VPC in the target region so long
as these constraints hold:

1. the frontdoor EC2 host may have a public IP for operator access and hosted
   ingress validation
2. compliant tenant servers do not require public ingress
3. frontdoor reaches compliant tenant runtimes over AWS private addressing
4. security groups explicitly limit frontdoor-to-tenant operator and runtime
   traffic

This is a proof baseline, not a statement that the long-term AWS network model
must remain the default-VPC layout forever.

### 11.3 Frontdoor host filesystem contract

The first AWS frontdoor deployment preserves the existing host filesystem
contract so package publishing and install tooling do not need a simultaneous
artifact-storage redesign.

Required paths:

1. frontdoor app root: `/opt/nexus/frontdoor`
2. package artifact root: `/opt/nexus/frontdoor/packages`
3. frontdoor database path: `/var/lib/nexus-frontdoor/frontdoor.db`
4. frontdoor config path: `/etc/nexus-frontdoor/frontdoor.config.json`

Canonical rule:

1. moving frontdoor to AWS does not require changing package publish semantics
   in the same cut

### 11.4 Compliant runtime image contract

The compliant AWS provider path does not launch generic base images.

It launches a baked ARM64 AMI that already contains:

1. `/opt/nex/runtime`
2. the current hosted Nex runtime tree
3. the `nex` system user
4. `nex-runtime.service`
5. the current hosted trusted-token bootstrap contract

Cloud-init remains tenant-specific only.

Canonical rule:

1. the AMI must satisfy the same hosted runtime contract already required of
   the Hetzner golden image
2. the AMI is not allowed to lag the current hosted trusted-token runtime
   contract
3. if live proof shows the baked AMI rejects the current frontdoor bootstrap or
   `/health` contract, the fix is to rebake the AMI from the current Nex
   runtime tree, not to weaken frontdoor around stale image behavior

### 11.5 First live proof before DNS cutover

The first live AWS proof does not require immediate production DNS cutover.

The first proof is successful when:

1. the AWS frontdoor host runs with the canonical frontdoor filesystem layout
2. package publish tooling can target that host successfully
3. frontdoor provisions a compliant AWS server from the baked AMI
4. the compliant server phones home and reaches `running`
5. a compliant-only package install succeeds on that server

Only after that proof is green should production DNS or hosted traffic move.

---

## 12) Explicit Non-Goals

This target state does not include:

1. a second HIPAA-specific frontdoor product
2. user-facing provider choice
3. mandatory managed AWS dependencies beyond what is explicitly required here
4. immediate multi-instance/high-availability frontdoor persistence redesign
5. clinic PHI persistence in frontdoor

---

## 13) Summary

The canonical hosted model is:

1. one AWS-hosted frontdoor
2. one customer-facing UX
3. `standard` and `compliant` server classes
4. Hetzner for `standard`
5. AWS for `compliant`
6. Tailscale operator overlay from AWS frontdoor to Hetzner standard servers
7. frontdoor stays PHI-poor
8. SQLite remains acceptable for now under encrypted-disk and backup discipline
