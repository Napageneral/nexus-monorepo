#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const registryPath = resolve(here, "registry.json");
const compiledPath = resolve(here, "registry.compiled.json");
const identifier = /^[a-z0-9][a-z0-9._-]*$/;
const cardinalities = new Set(["optional_one", "required_one", "optional_many", "required_many"]);

function fail(message) {
  throw new Error(`[canonical-object-registry] ${message}`);
}

function canonicalize(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => value[key] !== undefined)
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  fail(`canonical JSON does not support ${typeof value}`);
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function requiredText(value, path) {
  if (typeof value !== "string" || !value.trim()) fail(`${path} must be non-empty`);
  return value.trim();
}

function requiredIdentifier(value, path) {
  const text = requiredText(value, path);
  if (!identifier.test(text)) fail(`${path} must be a lowercase stable identifier`);
  return text;
}

function requiredArray(value, path) {
  if (!Array.isArray(value)) fail(`${path} must be an array`);
  return value;
}

function exactFields(value, allowed, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${path} must be an object`);
  }
  for (const field of Object.keys(value)) {
    if (!allowed.includes(field)) fail(`${path}.${field} is not declared by the contract`);
  }
}

function requiredClosedObjectSchema(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${path} must be a JSON Schema object`);
  }
  if (value.type !== "object" || value.additionalProperties !== false) {
    fail(`${path} must declare a closed object schema`);
  }
}

function rejectForbiddenField(value, path = "$") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectForbiddenField(entry, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [field, child] of Object.entries(value)) {
    if (field === "kind") fail(`forbidden schema field at ${path}.${field}`);
    rejectForbiddenField(child, `${path}.${field}`);
  }
}

export function compileRegistry(registry) {
  rejectForbiddenField(registry);
  exactFields(registry, ["registry_id", "schema_version", "entries"], "$");
  requiredIdentifier(registry.registry_id, "registry_id");
  if (!/^\d+\.\d+\.\d+$/.test(registry.schema_version ?? "")) {
    fail("schema_version must use semantic version syntax");
  }
  const entries = requiredArray(registry.entries, "entries");
  const byType = new Map();
  const acceptedTerms = new Map();

  for (const entry of entries) {
    const objectTypeId = requiredIdentifier(entry.object_type_id, "entries[].object_type_id");
    if (byType.has(objectTypeId)) fail(`duplicate object type ${objectTypeId}`);
    exactFields(
      entry,
      [
        "object_type_id",
        "names",
        "owner_domain",
        "identity_contract_id",
        "identity_schema",
        "attributes_schema",
        "relationship_slots",
        "accepted_input_terms",
        "search_terms",
        "resolution_binding",
      ],
      objectTypeId,
    );
    exactFields(entry.names, ["singular", "plural"], `${objectTypeId}.names`);
    requiredText(entry.names?.singular, `${objectTypeId}.names.singular`);
    requiredText(entry.names?.plural, `${objectTypeId}.names.plural`);
    requiredIdentifier(entry.owner_domain, `${objectTypeId}.owner_domain`);
    requiredIdentifier(entry.identity_contract_id, `${objectTypeId}.identity_contract_id`);
    requiredIdentifier(entry.resolution_binding, `${objectTypeId}.resolution_binding`);
    requiredClosedObjectSchema(entry.identity_schema, `${objectTypeId}.identity_schema`);
    requiredClosedObjectSchema(entry.attributes_schema, `${objectTypeId}.attributes_schema`);

    const relationshipIds = new Set();
    for (const slot of requiredArray(
      entry.relationship_slots,
      `${objectTypeId}.relationship_slots`,
    )) {
      exactFields(
        slot,
        ["relationship_id", "cardinality", "target_object_type_ids"],
        `${objectTypeId}.relationship_slots[]`,
      );
      const relationshipId = requiredIdentifier(
        slot.relationship_id,
        `${objectTypeId}.relationship_slots[].relationship_id`,
      );
      if (relationshipIds.has(relationshipId)) {
        fail(`duplicate relationship ${objectTypeId}.${relationshipId}`);
      }
      relationshipIds.add(relationshipId);
      if (!cardinalities.has(slot.cardinality)) {
        fail(`${objectTypeId}.${relationshipId} has invalid cardinality`);
      }
      const targets = requiredArray(
        slot.target_object_type_ids,
        `${objectTypeId}.${relationshipId}.target_object_type_ids`,
      );
      if (!targets.length) fail(`${objectTypeId}.${relationshipId} requires a target type`);
      const uniqueTargets = new Set(
        targets.map((target) =>
          requiredIdentifier(target, `${objectTypeId}.${relationshipId}.target_object_type_ids[]`),
        ),
      );
      if (uniqueTargets.size !== targets.length) {
        fail(`${objectTypeId}.${relationshipId} repeats a target type`);
      }
    }

    for (const term of requiredArray(
      entry.accepted_input_terms,
      `${objectTypeId}.accepted_input_terms`,
    )) {
      const normalized = requiredText(term, `${objectTypeId}.accepted_input_terms[]`).toLowerCase();
      if (acceptedTerms.has(normalized)) {
        fail(`accepted input term ${term} is already claimed by ${acceptedTerms.get(normalized)}`);
      }
      acceptedTerms.set(normalized, objectTypeId);
    }
    const searchTerms = requiredArray(entry.search_terms, `${objectTypeId}.search_terms`);
    searchTerms.forEach((term) => requiredText(term, `${objectTypeId}.search_terms[]`));
    if (new Set(searchTerms.map((term) => term.toLowerCase())).size !== searchTerms.length) {
      fail(`${objectTypeId}.search_terms contains duplicates`);
    }
    byType.set(objectTypeId, entry);
  }

  for (const [objectTypeId, entry] of byType) {
    for (const slot of entry.relationship_slots) {
      for (const target of slot.target_object_type_ids) {
        if (!byType.has(target)) {
          fail(`${objectTypeId}.${slot.relationship_id} targets unregistered ${target}`);
        }
      }
    }
  }

  return {
    compiler_contract_id: "nex.canonical-object-registry-compiler.v1",
    registry_digest: sha256(registry),
    registry,
    declarations: entries
      .map((entry) => ({
        object_type_id: entry.object_type_id,
        declaration_sha256: sha256(entry),
      }))
      .sort((left, right) => left.object_type_id.localeCompare(right.object_type_id)),
  };
}

function syntheticEntry(objectTypeId, term) {
  return {
    object_type_id: objectTypeId,
    names: { singular: term, plural: `${term}s` },
    owner_domain: objectTypeId,
    identity_contract_id: `${objectTypeId}.identity.v1`,
    identity_schema: {
      type: "object",
      additionalProperties: false,
      required: ["source_id"],
      properties: { source_id: { type: "string" } },
    },
    attributes_schema: {
      type: "object",
      additionalProperties: false,
      properties: { label: { type: "string" } },
    },
    relationship_slots: [],
    accepted_input_terms: [term],
    search_terms: [`${term} object`],
    resolution_binding: "nex.canonical-object-kernel.v1",
  };
}

function runSelfTest() {
  const source = {
    registry_id: "test.two_types",
    schema_version: "1.0.0",
    entries: [syntheticEntry("test.alpha", "Alpha"), syntheticEntry("test.beta", "Beta")],
  };
  const first = compileRegistry(source);
  const second = compileRegistry(JSON.parse(JSON.stringify(source)));
  if (canonicalJson(first) !== canonicalJson(second)) fail("compiler output is not deterministic");
  if (first.declarations.length !== 2) fail("compiler did not preserve both unrelated types");
  const conflicting = JSON.parse(JSON.stringify(source));
  conflicting.entries[1].accepted_input_terms = ["alpha"];
  try {
    compileRegistry(conflicting);
    fail("compiler admitted a duplicate accepted input term");
  } catch (error) {
    if (!String(error).includes("already claimed")) throw error;
  }
  console.log("[canonical-object-registry] two-type self-test passed");
}

if (process.argv.includes("--self-test")) {
  runSelfTest();
} else {
  const registry = JSON.parse(await readFile(registryPath, "utf8"));
  delete registry.$schema;
  const compiled = compileRegistry(registry);
  const rendered = `${JSON.stringify(compiled, null, 2)}\n`;
  if (process.argv.includes("--write")) {
    await writeFile(compiledPath, rendered, "utf8");
    console.log(`[canonical-object-registry] wrote ${compiledPath}`);
  } else {
    const current = await readFile(compiledPath, "utf8").catch(() => "");
    if (current !== rendered) fail("compiled registry is stale; run with --write");
    console.log(
      `[canonical-object-registry] validated ${compiled.registry.entries.length} declarations`,
    );
  }
}
