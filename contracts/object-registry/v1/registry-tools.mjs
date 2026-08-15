#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const registryPath = resolve(here, "registry.json");
const guidePath = resolve(here, "../../../docs/object-registry.md");
const targetAdapterRegistryPath = resolve(here, "../../observation-target-adapters/v1/registry.json");

function fail(message) {
  throw new Error(`[object-registry] ${message}`);
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

function requireString(value, path) {
  if (typeof value !== "string" || value.trim() === "") fail(`${path} must be a non-empty string`);
}

function requireBoolean(value, path) {
  if (typeof value !== "boolean") fail(`${path} must be a boolean`);
}

function requireArray(value, path) {
  if (!Array.isArray(value)) fail(`${path} must be an array`);
}

function validate(registry, targetAdapterRegistry) {
  assertNoForbiddenField(registry);
  requireString(registry.registry_id, "registry_id");
  requireString(registry.schema_version, "schema_version");
  if (!Array.isArray(registry.entries) || registry.entries.length === 0) fail("entries must be non-empty");

  const repositoryIds = new Set();
  for (const repository of registry.repositories ?? []) {
    requireString(repository.repository_id, "repositories[].repository_id");
    if (repositoryIds.has(repository.repository_id)) fail(`duplicate repository_id ${repository.repository_id}`);
    repositoryIds.add(repository.repository_id);
  }

  const entryIds = new Set();
  const aliases = new Map();
  const registryClasses = new Set(["nex_primitive", "business_resource", "typed_supporting_object", "evidence_custody", "read_model", "workflow_candidate", "compatibility_alias"]);
  const lifecycleStatuses = new Set(["planned", "implemented", "deployed", "compatibility", "legacy", "retired"]);
  const observationTargets = new Set(["direct", "through_owner_adapter", "not_applicable", "compatibility_only"]);
  const requiredEntryFields = ["object_id", "display_name", "registry_class", "domain", "lifecycle_status", "canonical_owner", "definition", "stable_identity", "canonical_storage", "key_fields", "relationships", "observation_target", "projection_authority", "action_authority", "source_contracts", "legacy_aliases", "forbidden_parallel_objects", "open_questions"];
  for (const entry of registry.entries) {
    for (const field of requiredEntryFields) {
      if (!(field in entry)) fail(`${entry.object_id ?? "entries[]"}.${field} is required`);
    }
    requireString(entry.object_id, "entries[].object_id");
    requireString(entry.display_name, `${entry.object_id}.display_name`);
    requireString(entry.domain, `${entry.object_id}.domain`);
    requireString(entry.canonical_owner, `${entry.object_id}.canonical_owner`);
    requireString(entry.definition, `${entry.object_id}.definition`);
    requireString(entry.stable_identity, `${entry.object_id}.stable_identity`);
    if (!registryClasses.has(entry.registry_class)) fail(`${entry.object_id}.registry_class is invalid`);
    if (!lifecycleStatuses.has(entry.lifecycle_status)) fail(`${entry.object_id}.lifecycle_status is invalid`);
    if (!observationTargets.has(entry.observation_target)) fail(`${entry.object_id}.observation_target is invalid`);
    requireBoolean(entry.projection_authority, `${entry.object_id}.projection_authority`);
    requireBoolean(entry.action_authority, `${entry.object_id}.action_authority`);
    if (entry.registry_class === "compatibility_alias" && entry.projection_authority !== false) {
      fail(`${entry.object_id}.projection_authority must be false for a compatibility alias`);
    }
    for (const field of ["canonical_storage", "key_fields", "relationships", "source_contracts", "legacy_aliases", "forbidden_parallel_objects", "open_questions"]) {
      requireArray(entry[field], `${entry.object_id}.${field}`);
    }
    if (entryIds.has(entry.object_id)) fail(`duplicate object_id ${entry.object_id}`);
    entryIds.add(entry.object_id);
    for (const pointer of entry.source_contracts ?? []) {
      if (!repositoryIds.has(pointer.repository_id)) {
        fail(`${entry.object_id} references unknown repository ${pointer.repository_id}`);
      }
    }
    for (const alias of entry.legacy_aliases ?? []) {
      const prior = aliases.get(alias);
      if (prior && prior !== entry.object_id) fail(`alias ${alias} is claimed by ${prior} and ${entry.object_id}`);
      aliases.set(alias, entry.object_id);
    }
  }

  const targetAdapterContracts = new Set(
    (targetAdapterRegistry.entries ?? []).map((entry) => entry.adapter_contract_id),
  );
  for (const entry of registry.entries) {
    for (const contractId of entry.target_adapter_contracts ?? []) {
      if (!targetAdapterContracts.has(contractId)) {
        fail(`${entry.object_id} references unknown target adapter ${contractId}`);
      }
    }
  }

  for (const entry of registry.entries) {
    for (const relationship of entry.relationships ?? []) {
      if (!entryIds.has(relationship.target_object_id)) {
        fail(`${entry.object_id}.${relationship.relationship_id} targets unknown ${relationship.target_object_id}`);
      }
    }
  }

  for (const gap of registry.open_gaps ?? []) {
    for (const objectId of gap.affected_object_ids ?? []) {
      if (!entryIds.has(objectId)) fail(`${gap.gap_id} references unknown object ${objectId}`);
    }
  }

  return registry;
}

function escapeCell(value) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function render(registry) {
  const byDomain = new Map();
  for (const entry of registry.entries) {
    const rows = byDomain.get(entry.domain) ?? [];
    rows.push(entry);
    byDomain.set(entry.domain, rows);
  }

  const lines = [
    "# Nex and MoonSleep canonical object registry",
    "",
    `Status: **${registry.status}**`,
    `Schema version: **${registry.schema_version}**`,
    `Registry ID: \`${registry.registry_id}\``,
    "",
    "> This document is generated from `contracts/object-registry/v1/registry.json`.",
    "> Edit the registry, then run `node contracts/object-registry/v1/registry-tools.mjs --write`.",
    "",
    "## Scope and decision rule",
    "",
    registry.scope,
    "",
    `Lookup order: ${registry.decision_contract.lookup_order.map((item) => `\`${item}\``).join(" → ")}.`,
    "",
    "A proposal may conclude only `reuse`, `generalize`, or `create`. A new object is valid only after the registry search, owner and identity distinction, relationship review, and alias or migration plan are recorded.",
    "",
    "## Reading the catalog",
    "",
    "- **Canonical owner** says who controls identity and business truth.",
    "- **Canonical storage** names the real owning table or runtime surface; a projection or reference never becomes a second owner.",
    "- **Observation target** says whether reviewed Observations may address the object directly, through an owner adapter, or not at all.",
    "- **Action authority** is separate from evidence and semantic acceptance. It is explicit per object and never inherited merely because an Observation or projection was accepted.",
    "",
  ];

  for (const [domain, entries] of [...byDomain.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`## ${domain}`, "", "| Object | Class | Status | Canonical owner | Stable identity | Observation target |", "| --- | --- | --- | --- | --- | --- |");
    for (const entry of entries.sort((a, b) => a.display_name.localeCompare(b.display_name))) {
      lines.push(`| [${escapeCell(entry.display_name)}](#${entry.object_id.replaceAll(".", "")}) | ${escapeCell(entry.registry_class)} | ${escapeCell(entry.lifecycle_status)} | ${escapeCell(entry.canonical_owner)} | ${escapeCell(entry.stable_identity)} | ${escapeCell(entry.observation_target)} |`);
    }
    lines.push("");
    for (const entry of entries) {
      lines.push(`<a id="${entry.object_id.replaceAll(".", "")}"></a>`, "", `### ${entry.display_name}`, "", `\`${entry.object_id}\` · ${entry.registry_class} · ${entry.lifecycle_status}`, "", entry.definition, "", `**Stable identity:** ${entry.stable_identity}`, "");
      if (entry.revision_identity) lines.push(`**Revision identity:** ${entry.revision_identity}`, "");
      if (entry.canonical_storage.length) {
        lines.push("**Canonical storage/read custody:**", "");
        for (const storage of entry.canonical_storage) {
          const identity = storage.identity_field ? `; identity \`${storage.identity_field}\`` : "";
          const note = storage.note ? ` — ${storage.note}` : "";
          lines.push(`- ${storage.system}: \`${storage.surface}\` (${storage.status}${identity})${note}`);
        }
        lines.push("");
      }
      if (entry.key_fields.length) lines.push(`**Key fields:** ${entry.key_fields.map((field) => `\`${field}\``).join(", ")}.`, "");
      if (entry.relationships.length) {
        lines.push("**Relationships:**", "");
        for (const relationship of entry.relationships) {
          lines.push(`- \`${relationship.relationship_id}\` → \`${relationship.target_object_id}\` (${relationship.cardinality}; owner: ${relationship.owner})${relationship.note ? ` — ${relationship.note}` : ""}`);
        }
        lines.push("");
      }
      lines.push(`**Projection/action boundary:** Observation target \`${entry.observation_target}\`; projection authority \`${entry.projection_authority}\`; implicit action authority \`${entry.action_authority}\`.`, "");
      if (entry.legacy_aliases.length) lines.push(`**Aliases and legacy names:** ${entry.legacy_aliases.map((alias) => `\`${alias}\``).join(", ")}.`, "");
      if (entry.forbidden_parallel_objects.length) lines.push(`**Do not recreate:** ${entry.forbidden_parallel_objects.join("; ")}.`, "");
      if (entry.open_questions.length) lines.push(`**Open questions:** ${entry.open_questions.join("; ")}.`, "");
      if (entry.source_contracts.length) {
        lines.push("**Source contracts:**", "");
        for (const pointer of entry.source_contracts) lines.push(`- \`${pointer.repository_id}:${pointer.path}\`${pointer.note ? ` — ${pointer.note}` : ""}`);
        lines.push("");
      }
    }
  }

  lines.push("## Open gap register", "", "| Gap | Status | Owner | Decision | Affected objects |", "| --- | --- | --- | --- | --- |");
  for (const gap of registry.open_gaps) {
    lines.push(`| \`${gap.gap_id}\` ${escapeCell(gap.title)} | ${gap.status} | ${escapeCell(gap.owner)} | ${escapeCell(gap.decision)} | ${(gap.affected_object_ids ?? []).map((id) => `\`${id}\``).join(", ")} |`);
  }
  lines.push("");
  return `${lines.join("\n").trimEnd()}\n`;
}

const targetAdapterRegistry = JSON.parse(await readFile(targetAdapterRegistryPath, "utf8"));
const registry = validate(JSON.parse(await readFile(registryPath, "utf8")), targetAdapterRegistry);
const rendered = render(registry);
if (process.argv.includes("--write")) {
  await writeFile(guidePath, rendered, "utf8");
  console.log(`[object-registry] wrote ${guidePath}`);
} else {
  const existing = await readFile(guidePath, "utf8").catch(() => "");
  if (existing !== rendered) fail("generated guide is stale; run with --write");
  console.log(`[object-registry] validated ${registry.entries.length} entries and ${registry.open_gaps.length} gaps`);
}
