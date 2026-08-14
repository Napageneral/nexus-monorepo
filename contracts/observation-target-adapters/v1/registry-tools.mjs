#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const registryPath = resolve(here, "registry.json");
const objectRegistryPath = resolve(here, "../../object-registry/v1/registry.json");

function fail(message) {
  throw new Error(`[observation-target-adapters] ${message}`);
}

function assertNoForbiddenField(value, path = "$") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenField(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [field, child] of Object.entries(value)) {
    if (field === "kind") fail(`forbidden field name at ${path}.${field}`);
    assertNoForbiddenField(child, `${path}.${field}`);
  }
}

function requireText(value, path) {
  if (typeof value !== "string" || value.trim() === "") fail(`${path} must be non-empty text`);
}

const registry = JSON.parse(await readFile(registryPath, "utf8"));
const objectRegistry = JSON.parse(await readFile(objectRegistryPath, "utf8"));
assertNoForbiddenField(registry);

const objectEntries = new Map(objectRegistry.entries.map((entry) => [entry.object_id, entry]));
const contractIds = new Set();
const objectIds = new Set();
const allowedDecisions = new Set(["reuse", "generalize", "create"]);
const allowedCardinalities = new Set(["one", "optional_one", "set_valued"]);
const allowedPrivacy = new Set(["internal", "restricted_identity", "restricted_communications", "restricted_finance"]);

if (registry.protocol?.target_domain !== "nex.resource-target-adapter") fail("target domain differs");
if (registry.protocol?.projection_type !== "observation-target") fail("projection type differs");
if (registry.protocol?.projection_version !== "1.0.0") fail("projection version differs");
if (registry.protocol?.unknown_target !== "fail_closed") fail("unknown targets must fail closed");
if (registry.protocol?.writer !== "append_custody_only") fail("protocol writer must be custody-only");

for (const entry of registry.entries ?? []) {
  requireText(entry.adapter_contract_id, "adapter_contract_id");
  requireText(entry.canonical_object_id, `${entry.adapter_contract_id}.canonical_object_id`);
  if (contractIds.has(entry.adapter_contract_id)) fail(`duplicate contract ${entry.adapter_contract_id}`);
  if (objectIds.has(entry.canonical_object_id)) fail(`duplicate adapter object ${entry.canonical_object_id}`);
  contractIds.add(entry.adapter_contract_id);
  objectIds.add(entry.canonical_object_id);
  const objectEntry = objectEntries.get(entry.canonical_object_id);
  if (!objectEntry) fail(`${entry.adapter_contract_id} references unknown object ${entry.canonical_object_id}`);
  if (!allowedDecisions.has(entry.decision)) fail(`${entry.adapter_contract_id} has invalid decision`);
  if (entry.projection_writer !== "append_custody_only") fail(`${entry.adapter_contract_id} writer is unsafe`);
  if (!allowedPrivacy.has(entry.privacy_default)) fail(`${entry.adapter_contract_id} privacy is invalid`);
  if (entry.authority?.resource_mutation !== false || entry.authority?.implicit_creation !== false || entry.authority?.action !== false) {
    fail(`${entry.adapter_contract_id} grants forbidden authority`);
  }
  if (entry.authority?.projection !== objectEntry.projection_authority) {
    fail(`${entry.adapter_contract_id} projection authority differs from object registry`);
  }
  if (objectEntry.action_authority !== false) fail(`${entry.adapter_contract_id} targets an action-authoritative object`);
  const paths = entry.allowed_attribute_paths ?? [];
  if (new Set(paths).size !== paths.length || paths.some((path) => typeof path !== "string" || path.trim() === "")) {
    fail(`${entry.adapter_contract_id} attribute paths are invalid`);
  }
  const relationshipIds = new Set();
  for (const relationship of entry.allowed_relationships ?? []) {
    if (relationshipIds.has(relationship.relationship_id)) fail(`${entry.adapter_contract_id} repeats relationship ${relationship.relationship_id}`);
    relationshipIds.add(relationship.relationship_id);
    if (!allowedCardinalities.has(relationship.cardinality)) fail(`${entry.adapter_contract_id}.${relationship.relationship_id} cardinality is invalid`);
    for (const target of relationship.target_object_ids ?? []) {
      if (!objectEntries.has(target)) fail(`${entry.adapter_contract_id}.${relationship.relationship_id} targets unknown ${target}`);
    }
  }
  if (!Array.isArray(entry.deployment_receipts)) fail(`${entry.adapter_contract_id} deployment receipts must be an array`);
}

console.log(`[observation-target-adapters] validated ${registry.entries.length} adapters and ${registry.compatibility_rules.length} compatibility rules`);
