# Frontdoor IAM Review Validation 2026-03-25

## Scope

This validation covers the final least-privilege review for the live frontdoor
EC2 role.

It validates:

- the current inline policy shape on `nexus-frontdoor-ec2-role`
- which permissions remain broad and why
- whether any obviously safe further tightening remains

## Customer Experience

This pass must not change the hosted customer surface.

Customers should still experience:

- one Frontdoor
- working `compliant` provisioning on AWS
- working `standard` management from the same control plane

## Live Role Shape

Verified live:

- role:
  - `nexus-frontdoor-ec2-role`
- attached managed policies:
  - none
- inline policies:
  - `nexus-frontdoor-ec2-provisioning`

## Policy Review Result

### Broad read permissions

Allowed on `*`:

- `ec2:DescribeInstances`
- `ec2:DescribeImages`
- `ec2:DescribeSubnets`
- `ec2:DescribeVpcs`
- `ec2:DescribeSecurityGroups`
- `ec2:DescribeInstanceStatus`
- `ec2:DescribeKeyPairs`

Assessment:

- these remain broad because the EC2 describe APIs used by the provider are
  read-only and are commonly evaluated at `*`
- no obviously safe narrowing was identified without risking brittle provider
  behavior

### Scoped mutation permissions

Verified scoped:

- `ec2:RunInstances`
  - limited to the live compliant subnet, security group, key pair, AMI,
    instance types, and `MetadataHttpTokens=required`
- `ec2:CreateTags`
  - limited to create-time tagging for `RunInstances` and `CreateImage`
- `ec2:StartInstances`
- `ec2:StopInstances`
- `ec2:TerminateInstances`
- `ec2:ModifyInstanceAttribute`
- `ec2:CreateImage`
  - limited to instances tagged:
    - `managed-by=nexus-frontdoor`

## Simulation Results

Verified live with IAM simulation:

- describe actions:
  - `allowed`
- lifecycle actions on a managed frontdoor instance:
  - `allowed`

Validated actions:

- `ec2:DescribeInstances`
- `ec2:DescribeImages`
- `ec2:DescribeSubnets`
- `ec2:DescribeVpcs`
- `ec2:DescribeSecurityGroups`
- `ec2:DescribeInstanceStatus`
- `ec2:DescribeKeyPairs`
- `ec2:StartInstances`
- `ec2:StopInstances`
- `ec2:TerminateInstances`
- `ec2:ModifyInstanceAttribute`
- `ec2:CreateImage`

## Result

Pass.

This proves:

1. the live frontdoor role is materially least-privilege for its mutation path
2. the remaining broad permissions are limited to EC2 describe reads
3. no obvious further safe tightening remains without increasing provisioning
   brittleness
