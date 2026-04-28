#!/usr/bin/env node
import fs from "node:fs";

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) {
    throw new Error(`empty JSON file: ${filePath}`);
  }
  try {
    return JSON.parse(raw);
  } catch {
    const firstJsonLine = raw.split(/\r?\n/u).find((line) => line.trim().startsWith("{"));
    if (!firstJsonLine) {
      throw new Error(`failed to parse JSON file: ${filePath}`);
    }
    return JSON.parse(firstJsonLine);
  }
}

function trimString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requireString(value, label) {
  const trimmed = trimString(value);
  if (!trimmed) {
    throw new Error(`${label} is required`);
  }
  return trimmed;
}

function asRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function stringArray(value) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const values = value.map(trimString).filter(Boolean);
  return values.length > 0 ? values : undefined;
}

function normalizeOptions(value, label) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const options = value.map((entry, index) => {
    const record = asRecord(entry, `${label}.options[${index}]`);
    return {
      label: requireString(record.label, `${label}.options[${index}].label`),
      value: requireString(record.value, `${label}.options[${index}].value`),
    };
  });
  return options.length > 0 ? options : undefined;
}

function normalizeFields(value, label) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const fields = value.map((entry, index) => {
    const record = asRecord(entry, `${label}.fields[${index}]`);
    const fieldType = requireString(record.type, `${label}.fields[${index}].type`);
    if (fieldType !== "secret" && fieldType !== "text" && fieldType !== "select") {
      throw new Error(`${label}.fields[${index}].type is unsupported`);
    }
    const field = {
      name: requireString(record.name, `${label}.fields[${index}].name`),
      label: requireString(record.label, `${label}.fields[${index}].label`),
      type: fieldType,
      required: Boolean(record.required),
    };
    const placeholder = trimString(record.placeholder);
    const options = normalizeOptions(record.options, `${label}.fields[${index}]`);
    if (placeholder) {
      field.placeholder = placeholder;
    }
    if (options) {
      field.options = options;
    }
    return field;
  });
  return fields.length > 0 ? fields : undefined;
}

function normalizeMethod(value, label) {
  const record = asRecord(value, label);
  const methodType = requireString(record.type, `${label}.type`);
  if (
    methodType !== "oauth2" &&
    methodType !== "api_key" &&
    methodType !== "file_upload" &&
    methodType !== "custom_flow"
  ) {
    throw new Error(`${label}.type is unsupported`);
  }

  const method = {
    id: requireString(record.id, `${label}.id`),
    type: methodType,
    label: requireString(record.label, `${label}.label`),
    icon: requireString(record.icon, `${label}.icon`),
  };
  const service = trimString(record.service);
  const scopes = stringArray(record.scopes);
  const platformCredentialUrl = trimString(record.platformCredentialUrl);
  const fields = normalizeFields(record.fields, label);
  const accept = stringArray(record.accept);
  const templateUrl = trimString(record.templateUrl);
  if (service) {
    method.service = service;
  }
  if (scopes) {
    method.scopes = scopes;
  }
  if (typeof record.platformCredentials === "boolean") {
    method.platformCredentials = record.platformCredentials;
  }
  if (platformCredentialUrl) {
    method.platformCredentialUrl = platformCredentialUrl;
  }
  if (fields) {
    method.fields = fields;
  }
  if (accept) {
    method.accept = accept;
  }
  if (templateUrl) {
    method.templateUrl = templateUrl;
  }
  if (Number.isInteger(record.maxSize) && record.maxSize > 0) {
    method.maxSize = record.maxSize;
  }
  return method;
}

function normalizeAuth(auth, allowMissing) {
  if (!auth || typeof auth !== "object" || Array.isArray(auth)) {
    if (allowMissing) {
      return { methods: [] };
    }
    throw new Error("adapter.info auth is required for published catalog setup metadata");
  }
  if (!Array.isArray(auth.methods) || auth.methods.length === 0) {
    if (allowMissing) {
      return { methods: [] };
    }
    throw new Error("adapter.info auth.methods must contain at least one setup method");
  }
  const normalized = {
    methods: auth.methods.map((method, index) => normalizeMethod(method, `auth.methods[${index}]`)),
  };
  const setupGuide = trimString(auth.setupGuide);
  if (setupGuide) {
    normalized.setupGuide = setupGuide;
  }
  return normalized;
}

const [manifestPath, infoPath, outputPath] = process.argv.slice(2);
if (!manifestPath || !infoPath || !outputPath) {
  throw new Error("usage: build-catalog-descriptor.mjs <adapter.nexus.json> <adapter.info.json> <output>");
}

const manifest = asRecord(readJson(manifestPath), "adapter manifest");
const info = asRecord(readJson(infoPath), "adapter.info output");
const adapterId = requireString(manifest.id, "adapter manifest id");
const displayName = requireString(manifest.displayName ?? manifest.name ?? info.name ?? adapterId, "display name");
const allowMissing = process.env.ADAPTER_PACKAGE_ALLOW_MISSING_SETUP_DESCRIPTOR === "1";
const descriptor = {
  schemaVersion: "adapter-catalog-setup.v1",
  adapterId,
  displayName,
  auth: normalizeAuth(info.auth, allowMissing),
};

const description = trimString(manifest.description);
const version = trimString(manifest.version ?? info.version);
const platform = trimString(info.platform ?? manifest.platform);
const name = trimString(info.name);
const credentialService = trimString(info.credential_service);
if (description) {
  descriptor.description = description;
}
if (version) {
  descriptor.version = version;
}
if (platform) {
  descriptor.platform = platform;
}
if (name) {
  descriptor.name = name;
}
if (credentialService) {
  descriptor.credentialService = credentialService;
}

fs.writeFileSync(outputPath, `${JSON.stringify(descriptor, null, 2)}\n`, "utf8");
