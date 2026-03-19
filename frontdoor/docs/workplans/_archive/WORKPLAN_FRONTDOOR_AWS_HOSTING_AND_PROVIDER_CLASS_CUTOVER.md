# Workplan Frontdoor AWS Hosting And Provider Class Cutover

**Status:** ACTIVE

## Purpose

This workplan closes the gap between the current Hetzner-first frontdoor
implementation and the canonical AWS-hosted frontdoor / `standard` vs
`compliant` server-class model.

Target-state spec:

- [FRONTDOOR_AWS_HOSTING_AND_SERVER_CLASS_MODEL.md](/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/specs/FRONTDOOR_AWS_HOSTING_AND_SERVER_CLASS_MODEL.md)

## Customer Experience First

The target customer experience is:

1. one frontdoor
2. one login
3. one server list
4. customers choose `standard` or `compliant`, not a cloud vendor
5. HIPAA-sensitive apps and adapters cannot land on `standard`

The customer should not need to understand:

1. AWS vs Hetzner
2. Tailscale
3. operator SSH topology
4. why frontdoor itself moved clouds

## Current Reality

What is true today:

1. frontdoor persistence is SQLite
2. frontdoor is now deployed on AWS EC2 for live proof
3. the first live proof is still using the default VPC/subnets in `us-east-2`
4. the current compliant-runtime AMI contract is now green for live proof
5. the AWS account has the `nexus-operator` EC2 key pair
6. no AWS instance profile is currently required for the live frontdoor host
7. Tailscale operator-overlay behavior now exists in frontdoor code and has
   been proven for Hetzner `standard`

What is already in good shape:

1. hosted trusted-token bootstrap is active
2. hosted package/operator baseline is active
3. durable server lifecycle canon already exists
4. the AWS account and CLI SSO baseline are working
5. `server_class` and `deployment_class` exist in frontdoor persistence/API
6. install-policy enforcement exists in publish and install flows
7. compliant provisioning can dispatch to AWS in code
8. the first AWS frontdoor host, subnet, security groups, and key pair now
   exist in `us-east-2`
9. CloudTrail is enabled in the target AWS account
10. the current compliant AMI and live frontdoor build now complete both the
    AWS `compliant` proof and the Hetzner `standard` Tailscale proof

## Research Findings For Live AWS Proof

### Customer experience boundary

The live cut must preserve:

1. one frontdoor
2. one login
3. one server list
4. `standard` vs `compliant`
5. no cloud-vendor UX

### Frontdoor host contract that must be preserved

Current package publishing and hosted install flows assume these host-local
paths on the frontdoor machine:

1. app root: `/opt/nexus/frontdoor`
2. package artifact root: `/opt/nexus/frontdoor/packages`
3. database path: `/var/lib/nexus-frontdoor/frontdoor.db`
4. config path: `/etc/nexus-frontdoor/frontdoor.config.json`

The first AWS cut should preserve those paths instead of redesigning artifact
storage in the same move.

### Internal frontdoor bootstrap address

Private-only compliant AWS servers cannot bootstrap against the public
frontdoor browser URL.

Therefore the AWS frontdoor config must carry both:

1. public `baseUrl` for browser and operator-facing traffic
2. private `internalBaseUrl` for compliant cloud-init bootstrap and
   provision-callback traffic inside the VPC

### Compliant runtime image constraint

Current cloud-init does not build a tenant runtime from scratch.

It assumes the image already contains:

1. `/opt/nex/runtime`
2. the current hosted Nex runtime tree
3. the `nex` user
4. `nex-runtime.service`

Therefore the first AWS compliant proof requires a real baked ARM64 AMI, not a
generic Ubuntu launch.

The image contract is stricter than file presence:

1. the unit must be installed on the image
2. the unit must be disabled on the image before first boot
3. first-boot cloud-init must own the initial enable/start sequence after
   hosted config is patched

### First live region decision

The first live proof should stay narrow:

1. AWS account: `953113807086`
2. region: `us-east-2`
3. frontdoor host on AWS EC2
4. compliant runtime AMI in `us-east-2`
5. no production DNS cutover until live proof is green

### First live network decision

For speed and proof quality, the first cut may use the default VPC in
`us-east-2` so long as:

1. frontdoor host gets the public ingress needed for operator access and hosted
   validation
2. compliant tenant servers do not require public ingress
3. frontdoor reaches compliant tenant runtimes over private addressing
4. security groups lock operator/runtime access to the intended hosts
5. frontdoor host ingress on `4789` must also allow the compliant-runtime
   security group so private bootstrap callbacks can reach `internalBaseUrl`

### Current live proof blocker

The first live compliant create no longer fails at frontdoor bootstrap wiring,
and stale runtime-image drift has already been closed once by rebaking from
the current Nex runtime tree.

What the current live proof shows instead:

1. the current AWS frontdoor host is working
2. compliant create launches a real private EC2 instance from the fresh AMI
3. the fresh AMI boots the current Nex runtime tree and no longer shows stale
   trusted-token behavior
4. the remaining bootstrap failure is a first-boot service-ordering race:
   `nex-runtime.service` auto-starts from the baked image before cloud-init
   patches hosted config
5. that race causes `database is locked` during `nexus init` and makes the
   fatal local health gate brittle

Therefore the next hard-cut fix is:

1. make the compliant image ship `nex-runtime.service` installed but disabled
2. make bootstrap stop/disable any pre-started runtime before `nexus init`
3. enable/start the runtime only after hosted config is patched
4. rebake the compliant AMI from that corrected image contract
5. rerun fresh compliant create proof against the new AMI

### Operator SSH identity

The existing operator key should be reused for the first cut:

1. local key name: `nexus-operator`
2. public key file: `~/.ssh/nexus-operator.pub`

## Status Snapshot

- Phase 0 canon alignment: complete
- Phase 1 AWS account and CLI SSO baseline: complete
- Phase 2 AWS frontdoor hosting baseline: partially complete
- Phase 3 server-class persistence and API cutover: complete
- Phase 4 AWS provider implementation: partially complete
- Phase 5 Tailscale operator overlay: partially complete
- Phase 6 validation: partially complete

## Phase 0: Canon Alignment

### Goal

Make the AWS-hosted one-frontdoor / provider-class model the active canon.

### Changes

1. add the focused AWS hosting + server-class canonical spec
2. align `FRONTDOOR_ARCHITECTURE.md`
3. align `CLOUD_PROVISIONING_ARCHITECTURE_2026-03-04.md`
4. make active indexes point at the new canon

### Exit Criteria

1. active frontdoor specs no longer teach “Hetzner first, AWS later”
2. active frontdoor specs no longer teach one provider per frontdoor instance

**Status:** complete

## Phase 1: AWS Account And Operator Access Baseline

### Goal

Prepare the AWS account and workforce/operator access model.

### Changes

1. enable IAM Identity Center organization instance in the AWS account
2. create the operator/admin access role used by the CLI
3. configure local AWS CLI SSO profile
4. define the frontdoor AWS region baseline
5. define the Tailscale tailnet/operator policy for cross-provider management

### Exit Criteria

1. frontdoor operators can log in to the target AWS account with CLI SSO
2. Tailscale policy is defined for frontdoor and standard servers

Current progress:

1. IAM Identity Center is enabled for AWS account `953113807086`
2. the local AWS CLI SSO profile `frontdoor-admin` is configured and working
3. validation record:
   - [FRONTDOOR_AWS_OPERATOR_ACCESS_BASELINE.md](/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/validation/FRONTDOOR_AWS_OPERATOR_ACCESS_BASELINE.md)
4. the first-live AWS region is fixed to `us-east-2`
5. the AWS frontdoor host and Hetzner `standard` proof server are both joined
   to the tailnet
6. Tailscale operator-network implementation is now live for proof
7. the remaining Tailscale hardening gap is policy and auth cleanup:
   - define service tags in `tagOwners`
   - retag the AWS frontdoor host as a service device
   - rotate the standard-server bootstrap key to a reusable tagged
     server-device key

**Status:** partially complete

## Phase 2: Frontdoor AWS Hosting Baseline

### Goal

Run frontdoor backend in AWS without changing the customer UX.

### Changes

1. deploy frontdoor on AWS EC2
2. keep SQLite on encrypted EBS
3. enable backup and restore for frontdoor state
4. enable CloudTrail for AWS control-plane audit
5. preserve frontdoor PHI-poor logging posture
6. preserve the current frontdoor host filesystem contract:
   - `/opt/nexus/frontdoor`
   - `/opt/nexus/frontdoor/packages`
   - `/var/lib/nexus-frontdoor/frontdoor.db`
   - `/etc/nexus-frontdoor/frontdoor.config.json`

### Concrete live steps

1. import the `nexus-operator` SSH public key as an EC2 key pair
2. create the security groups needed for:
   - AWS frontdoor host ingress
   - compliant runtime private access from frontdoor
3. create the EC2 role / instance profile for the AWS frontdoor host so it can
   provision compliant servers
4. launch a temporary ARM64 image-builder instance
5. install the current hosted Nex runtime image contract on that builder
6. create an AMI from the builder
7. launch the AWS frontdoor host with encrypted EBS and the frontdoor role
8. deploy frontdoor onto that host under the canonical filesystem layout
9. wire the compliant-provider env vars on the AWS frontdoor host
10. wire the frontdoor `internalBaseUrl` to the AWS-private frontdoor address
11. enable CloudTrail in the AWS account before calling the live proof

### Concrete resource outputs

This phase must leave behind:

1. one AWS frontdoor host instance id
2. one compliant-runtime AMI id
3. one frontdoor-host security group id
4. one compliant-runtime security group id
5. one EC2 key-pair name
6. one frontdoor-host instance profile name or arn
7. concrete values for:
   - `AWS_FRONTDOOR_REGION`
   - `AWS_FRONTDOOR_SUBNET_ID`
   - `AWS_FRONTDOOR_SECURITY_GROUP_IDS`
   - `AWS_FRONTDOOR_AMI_ID`
   - `AWS_FRONTDOOR_INSTANCE_PROFILE_ARN` or
     `AWS_FRONTDOOR_INSTANCE_PROFILE_NAME`
   - `AWS_FRONTDOOR_SSH_KEY_NAME`
   - `FRONTDOOR_INTERNAL_BASE_URL`

### Live proof findings discovered during execution

The first live compliant create exposed two concrete gaps that must be closed
as part of Phase 2 / Phase 4:

1. the frontdoor-host security group originally allowed `4789` only from the
   operator public IP; compliant bootstrap needs `4789` allowed from the
   compliant-runtime security group as well
2. bootstrap private-IP detection was Hetzner-shaped and only matched `10.x`;
   AWS private addresses like `172.31.x.x` must also be accepted
3. bootstrap swallowed transient `nexus init` failure and still sent the
   provision callback after a health timeout; compliant bootstrap must retry
   initialization, require `/opt/nex/state/config.json`, and fail hard on
   health timeout instead of reporting false `running`
4. bootstrap health probing used trusted-token audience `runtime-api`, but the
   hosted runtime `/health` contract expects `aud=nexus-runtime`
5. the first baked compliant AMI currently under test is stale against the
   current hosted trusted-token runtime contract and must be replaced
6. AWS destroy and timeout-cleanup must clear termination protection before
   terminate; otherwise cleanup can fail with `OperationNotPermitted`

### Exit Criteria

1. frontdoor runs from AWS in production
2. current customer-facing UX remains intact
3. frontdoor state survives reboot/redeploy through the expected restore path

## Phase 3: Server Class Persistence And API Cutover

### Goal

Make `standard` and `compliant` first-class hosted objects.

### Changes

1. add `server_class` to frontdoor persistence
2. project `server_class` through public APIs
3. add `deployment_class` to frontdoor persistence and APIs
4. add install-policy checks for `required_server_class` and
   `deployment_class`
5. add UI badges and guardrails

### Exit Criteria

1. every hosted server has an explicit class
2. every hosted server has an explicit deployment class
3. compliant-required install attempts are blocked on standard servers
4. product-control-plane packages are blocked on customer servers
5. the UI teaches class policy without exposing cloud vendors

Current progress:

1. `server_class` now exists in frontdoor persistence with SQLite migration
2. public server APIs now project `server_class`
3. manual server-record creation accepts explicit `standard` / `compliant`
4. `deployment_class` now exists in frontdoor persistence with SQLite migration
5. public server APIs now project `deployment_class`
6. package release publish validation now enforces `hosting.required_server_class` and `hosting.deployment_class`
7. app and adapter install flows now block `required_server_class` and `deployment_class` mismatches before runtime/operator work begins
8. `create_server_and_install` now rejects compliant and product-control-plane requests on the Hetzner-only provisioning path
9. GlowBot clinic app + HIPAA-sensitive clinic adapters are now explicitly `compliant`
10. GlowBot admin and hub are now explicitly `product_control_plane`
11. UI badges and UI guardrails are still pending

**Status:** partially complete

## Phase 4: AWS Provider Implementation

### Goal

Add AWS as the compliant provider path.

### Changes

1. add AWS provider implementation parallel to Hetzner
2. support compliant-server provisioning on AWS
3. support lifecycle operations on AWS under the same durable server contract
4. preserve `server_id` / `tenant_id` as durable identity

### Exit Criteria

1. frontdoor can provision and manage compliant servers on AWS
2. AWS provider honors the durable server lifecycle semantics already proven on
   Hetzner

Current progress:

1. frontdoor no longer assumes one global managed cloud provider for all
   lifecycle operations
2. lifecycle and recovery dispatch now resolve from the persisted server
   record provider
3. an AWS EC2 provider now exists in parallel with Hetzner
4. compliant-server provisioning can now dispatch to AWS
5. focused provider and server tests for the AWS dispatch path are green
6. live AWS proof has created a real frontdoor host and a real private
   compliant tenant instance
7. the current live blocker is stale compliant AMI drift, not frontdoor
   bootstrap wiring
8. automatic compliant backup coverage is still pending

**Status:** partially complete

## Phase 5: Tailscale Operator Overlay

### Goal

Preserve secure operator access from AWS-hosted frontdoor to Hetzner standard
servers.

### Changes

1. join frontdoor to the operator tailnet
2. join standard servers to the operator tailnet
3. switch operator SSH/package-staging/runtime-operator paths to Tailscale
   addressing for standard servers
4. remove reliance on public operator paths
5. hard-cut the Tailscale identity model for service machines to tags:
   - `tag:frontdoor`
   - `tag:nex-standard-server`
6. remove proof-era user-scoped bootstrap auth keys from the standard-server
   bootstrap path

### Exit Criteria

1. AWS frontdoor can manage Hetzner standard servers without public operator
   exposure
2. operator install/upgrade/recovery flows remain functional
3. frontdoor and standard servers no longer rely on user-scoped Tailscale
   identities

## Phase 6: Validation

### Goal

Prove the new model end to end.

### Changes

1. add focused tests for `server_class` persistence and policy checks
2. add focused tests for AWS provider behavior
3. add focused tests for compliant-only install enforcement
4. run live proof:
   - standard server on Hetzner
   - compliant server on AWS
   - frontdoor hosted in AWS
   - package install guardrails
   - Tailscale-backed operator actions for standard servers

### Exit Criteria

1. one frontdoor manages both server classes correctly
2. the user-facing experience stays unified
3. compliant workloads remain AWS-only
4. standard workloads remain available at Hetzner cost structure

Current progress:

1. focused TypeScript validation is green for the current slice
2. focused frontdoor tests for `server_class` + `deployment_class` persistence and API projection are green
3. focused frontdoor tests for compliant-only and product-control-plane install enforcement are green
4. focused publish tests for install-policy manifest validation are green
5. focused AWS provider and compliant provisioning dispatch tests are green
6. live mixed-provider proof is green for runtime bootstrap and health
7. package publish to the AWS frontdoor host is green
8. fresh compliant package-install proof is blocked only by stale compliant AMI
   drift during first-time runtime install

**Status:** partially complete

## Immediate Next Cut

The next execution slice is:

1. patch AWS destroy to clear protection before terminate
2. rebake the compliant ARM64 runtime AMI from the current Nex runtime tree
3. repoint the AWS frontdoor host at the new AMI
4. rerun fresh live compliant provisioning proof
5. prove fresh compliant package install against the AWS host
6. rotate Tailscale bootstrap to the tagged server-device key
7. clean up the proof auth surface on the AWS frontdoor host
8. write the DNS cutover and old-frontdoor retirement plan

## File-Level Delta

### Frontdoor docs

1. `docs/specs/FRONTDOOR_AWS_HOSTING_AND_SERVER_CLASS_MODEL.md`
2. `docs/specs/FRONTDOOR_ARCHITECTURE.md`
3. `docs/specs/CLOUD_PROVISIONING_ARCHITECTURE_2026-03-04.md`
4. `docs/workplans/index.md`
5. new validation ladder for this slice

### Frontdoor code

1. `src/frontdoor-store.ts`
2. `src/server.ts`
3. `src/cloud-provider.ts`
4. any new AWS provider module under `src/`
5. any operator-network helper changes needed for Tailscale-backed paths

## Validation Target

1. frontdoor backend runs in AWS
2. `standard` and `compliant` are first-class hosted server classes
3. compliant-required installs are blocked on standard servers
4. compliant servers provision on AWS
5. standard servers remain on Hetzner
6. AWS frontdoor can still manage Hetzner standard servers over the operator
   overlay
