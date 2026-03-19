# Frontdoor Hosted Package Install Policy And Deployment Classes

**Status:** CANONICAL
**Last Updated:** 2026-03-17
**Related:** FRONTDOOR_AWS_HOSTING_AND_SERVER_CLASS_MODEL.md, FRONTDOOR_PACKAGE_REGISTRY_AND_LIFECYCLE.md, FRONTDOOR_SERVER_ADAPTER_INSTALL_API.md, `/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/hosted-package-install-policy-and-deployment-classes.md`

---

## 1) Purpose

This document defines how Frontdoor enforces hosted package install policy.

It covers:

1. hosted server policy objects
2. package policy facts
3. customer-facing install behavior
4. operator-facing product control plane placement
5. the exact Frontdoor API entrypoints that must enforce the policy

---

## 2) Customer Experience

The customer-facing experience remains:

1. one frontdoor
2. one app catalog
3. one server list
4. one `standard` vs `compliant` choice

The customer should experience policy as:

1. compliant-required apps and adapters cannot land on `standard`
2. Frontdoor clearly explains why the package is blocked
3. zero-server flows create the right class automatically

Customers should not see:

1. raw provider selection
2. product control plane package topology
3. install-planner internals

---

## 3) Hosted Policy Objects

Frontdoor enforces package policy against two server facts:

### 3.1 `server_class`

Allowed values:

1. `standard`
2. `compliant`

### 3.2 `deployment_class`

Allowed values:

1. `customer_server`
2. `product_control_plane`

Canonical defaults:

1. customer-created servers default to `customer_server`
2. zero-server customer install flows create `customer_server`
3. dedicated product control plane infrastructure uses
   `deployment_class = product_control_plane`

---

## 4) Package Policy Contract

Frontdoor reads package install policy from published package manifests.

Canonical manifest fields:

```json
{
  "hosting": {
    "required_server_class": "standard" | "compliant",
    "deployment_class": "customer_server" | "product_control_plane"
  }
}
```

Canonical defaults:

1. `required_server_class = standard`
2. `deployment_class = customer_server`

---

## 5) Enforcement Rules

### 5.1 `required_server_class`

Frontdoor must enforce:

1. `standard` packages may install on `standard` or `compliant`
2. `compliant` packages may install only on `compliant`

### 5.2 `deployment_class`

Frontdoor must enforce:

1. `customer_server` packages may install only on `customer_server`
2. `product_control_plane` packages may install only on
   `product_control_plane`

### 5.3 Dependency rule

Dependency planning does not bypass placement policy.

That means:

1. if a top-level package depends on a package whose policy is incompatible with
   the target server, planning must fail
2. Frontdoor must fail before runtime operator install begins

---

## 6) Canonical Frontdoor Entry Points

Frontdoor must enforce this policy in all hosted install surfaces:

1. `POST /api/apps/:appId/purchase`
2. `POST /api/servers/:serverId/apps/:appId/install`
3. `POST /api/servers/:serverId/adapters/:adapterId/install`
4. `POST /api/entry/execute`
5. any internal purchase-and-install or create-server-and-install helper

`POST /api/entry/execute` has one additional responsibility:

1. if the top-level app requires `compliant` and no server exists, the created
   server must use `server_class = compliant`

---

## 7) Relationship To Visibility

`product.visibility` remains separate.

Visibility answers:

1. who may discover and launch a product

Install policy answers:

1. where the package may be installed

Implications:

1. `glowbot-admin` stays operator-only through visibility
2. `glowbot-admin` stays off clinic servers through `deployment_class`
3. `glowbot` stays off `standard` through `required_server_class`

---

## 8) Grounded GlowBot Mapping

The active GlowBot target state under Frontdoor is:

1. `glowbot`
   - `required_server_class = compliant`
   - `deployment_class = customer_server`
2. `glowbot-admin`
   - `required_server_class = compliant`
   - `deployment_class = product_control_plane`
3. `glowbot-hub`
   - `required_server_class = compliant`
   - `deployment_class = product_control_plane`
4. `zenoti-emr`
   - `required_server_class = compliant`
   - `deployment_class = customer_server`
5. `patient-now-emr`
   - `required_server_class = compliant`
   - `deployment_class = customer_server`

---

## 9) Validation Target

Frontdoor is correct when:

1. `glowbot` cannot install on a `standard` server
2. `zenoti-emr` cannot install on a `standard` server
3. `create_server_and_install` for `glowbot` provisions a `compliant`
   customer server
4. `glowbot-admin` cannot install on a clinic server even for an operator
5. `glowbot-admin` can install on a `compliant` product control plane server
6. all policy failures happen before runtime operator install
