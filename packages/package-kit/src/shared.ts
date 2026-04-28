import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  parseAdapterManifest,
  validateAdapterManifest,
} from "../../../nex/src/runtime/domains/apps/adapter-manifest.ts";
import { parseManifest, validateManifest } from "../../../nex/src/runtime/domains/apps/manifest.ts";

export type PackageKind = "app" | "adapter";
export type PackageLanguage = "ts" | "go";
export type PackageProfile = "default" | "canonical-openapi";

export type DetectedPackage = {
  kind: PackageKind;
  rootDir: string;
  manifestPath: string;
  manifest: Record<string, unknown>;
  id: string;
  version: string;
};

const EMPTY_OPENAPI_WARNING =
  "adapter openapi contract is empty; materialize the upstream contract before release";
const NARROW_OPENAPI_WARNING =
  "adapter provider config still narrows the openapi operation set; remove includeOperationIds, excludeOperationIds, and renameOperationIds before release";
const EMPTY_GRAPHQL_WARNING =
  "adapter graphql catalog is empty; materialize the upstream schema into a method catalog before release";

export function packageDisplayName(id: string): string {
  return id
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export async function ensureDir(dirPath: string): Promise<void> {
  await fsp.mkdir(dirPath, { recursive: true });
}

export async function writeFileIfMissing(
  filePath: string,
  contents: string,
  mode?: number,
): Promise<void> {
  await ensureDir(path.dirname(filePath));
  try {
    await fsp.access(filePath, fs.constants.F_OK);
  } catch {
    await fsp.writeFile(filePath, contents, "utf8");
    if (mode !== undefined) {
      await fsp.chmod(filePath, mode);
    }
  }
}

export async function writeFile(filePath: string, contents: string, mode?: number): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fsp.writeFile(filePath, contents, "utf8");
  if (mode !== undefined) {
    await fsp.chmod(filePath, mode);
  }
}

type OpenApiSummary = {
  pathCount: number;
  operationCount: number;
};

type AdapterSetupFieldOption = {
  label: string;
  value: string;
};

type AdapterSetupField = {
  name: string;
  label: string;
  type: string;
  required: boolean;
  placeholder?: string;
  options?: AdapterSetupFieldOption[];
};

type AdapterSetupMethod = {
  id?: string;
  type: string;
  label: string;
  icon: string;
  service?: string;
  scopes?: string[];
  platformCredentials?: boolean;
  platformCredentialUrl?: string;
  fields?: AdapterSetupField[];
  accept?: string[];
  templateUrl?: string;
  maxSize?: number;
};

type AdapterSetupDescriptor = {
  schemaVersion: "adapter-catalog-setup.v1";
  adapterId: string;
  displayName: string;
  auth: {
    methods: AdapterSetupMethod[];
    setupGuide?: string;
  };
  description?: string;
  version?: string;
  platform?: string;
  name?: string;
  credentialService?: string;
};

function summarizeOpenApiDocument(raw: string): OpenApiSummary | null {
  const normalized = raw.replaceAll("\r\n", "\n");
  const pathMatches = normalized.match(/^  \/[^:\n]+:\s*$/gm) ?? [];
  const operationMatches = normalized.match(/^\s{6}operationId:\s+\S.*$/gm) ?? [];
  if (pathMatches.length === 0 && operationMatches.length === 0) {
    return null;
  }
  return {
    pathCount: pathMatches.length,
    operationCount: operationMatches.length,
  };
}

function validateAdapterOpenApiSurface(rootDir: string): {
  errors: string[];
  warnings: string[];
  summary: OpenApiSummary | null;
} {
  const openApiPath = path.join(rootDir, "api/openapi.yaml");
  const lockPath = path.join(rootDir, "api/openapi.lock.json");
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!fs.existsSync(openApiPath)) {
    return { errors, warnings, summary: null };
  }

  let summary: OpenApiSummary | null = null;
  try {
    const raw = fs.readFileSync(openApiPath, "utf8");
    summary = summarizeOpenApiDocument(raw);
    if (!summary || summary.pathCount === 0 || summary.operationCount === 0) {
      warnings.push(EMPTY_OPENAPI_WARNING);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`adapter openapi contract could not be inspected: ${message}`);
    return { errors, warnings, summary: null };
  }

  if (!fs.existsSync(lockPath)) {
    const configWarnings = validateAdapterOpenApiConfig(rootDir);
    warnings.push(...configWarnings.warnings);
    errors.push(...configWarnings.errors);
    return { errors, warnings, summary };
  }

  try {
    const lock = JSON.parse(fs.readFileSync(lockPath, "utf8")) as Record<string, unknown>;
    const generator = typeof lock.generator === "string" ? lock.generator.trim() : "";
    if (!generator) {
      errors.push("adapter openapi lockfile missing generator");
    }
    const lockPathCount = typeof lock.pathCount === "number" ? lock.pathCount : null;
    const lockOperationCount = typeof lock.operationCount === "number" ? lock.operationCount : null;
    if (summary && lockPathCount !== null && lockPathCount !== summary.pathCount) {
      errors.push(
        `adapter openapi lockfile pathCount ${lockPathCount} does not match materialized pathCount ${summary.pathCount}`,
      );
    }
    if (summary && lockOperationCount !== null && lockOperationCount !== summary.operationCount) {
      errors.push(
        `adapter openapi lockfile operationCount ${lockOperationCount} does not match materialized operationCount ${summary.operationCount}`,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`adapter openapi lockfile is not valid JSON: ${message}`);
  }

  const configWarnings = validateAdapterOpenApiConfig(rootDir);
  warnings.push(...configWarnings.warnings);
  errors.push(...configWarnings.errors);
  return { errors, warnings, summary };
}

function validateAdapterOpenApiConfig(rootDir: string): { errors: string[]; warnings: string[] } {
  const configPath = path.join(rootDir, "raw/provider.config.json");
  if (!fs.existsSync(configPath)) {
    return { errors: [], warnings: [] };
  }

  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as Record<string, unknown>;
    const includeOperationIds = Array.isArray(config.includeOperationIds)
      ? config.includeOperationIds.filter((value) => typeof value === "string" && value.trim() !== "")
      : [];
    const excludeOperationIds = Array.isArray(config.excludeOperationIds)
      ? config.excludeOperationIds.filter((value) => typeof value === "string" && value.trim() !== "")
      : [];
    const renameOperationIds = config.renameOperationIds &&
      typeof config.renameOperationIds === "object" &&
      !Array.isArray(config.renameOperationIds)
      ? Object.entries(config.renameOperationIds as Record<string, unknown>).filter(
          ([, value]) => typeof value === "string" && value.trim() !== "",
        )
      : [];

    if (includeOperationIds.length > 0 || excludeOperationIds.length > 0 || renameOperationIds.length > 0) {
      return { errors: [], warnings: [NARROW_OPENAPI_WARNING] };
    }
    return { errors: [], warnings: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { errors: [`adapter provider config is not valid JSON: ${message}`], warnings: [] };
  }
}

function validateAdapterGraphqlSurface(
  rootDir: string,
  documentPathValue?: string,
): {
  errors: string[];
  warnings: string[];
} {
  const documentPath = path.resolve(
    rootDir,
    documentPathValue?.trim() || "api/graphql.catalog.json",
  );
  if (!fs.existsSync(documentPath)) {
    return {
      errors: [`adapter graphql catalog not found: ${path.relative(rootDir, documentPath)}`],
      warnings: [],
    };
  }

  try {
    const raw = fs.readFileSync(documentPath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const methods = Array.isArray(parsed.methods) ? parsed.methods : [];
    if (methods.length === 0) {
      return { errors: [], warnings: [EMPTY_GRAPHQL_WARNING] };
    }
    return { errors: [], warnings: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { errors: [`adapter graphql catalog is not valid JSON: ${message}`], warnings: [] };
  }
}

export function renderTemplate(input: string, values: Record<string, string>): string {
  let result = input;
  for (const [key, value] of Object.entries(values)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

export function detectPackage(targetPath: string): DetectedPackage {
  const rootDir = path.resolve(targetPath);
  const appManifestPath = path.join(rootDir, "app.nexus.json");
  const adapterManifestPath = path.join(rootDir, "adapter.nexus.json");

  if (fs.existsSync(appManifestPath)) {
    const manifest = parseManifest(appManifestPath);
    return {
      kind: "app",
      rootDir,
      manifestPath: appManifestPath,
      manifest: manifest as unknown as Record<string, unknown>,
      id: manifest.id,
      version: manifest.version,
    };
  }

  if (fs.existsSync(adapterManifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(adapterManifestPath, "utf8")) as Record<string, unknown>;
    return {
      kind: "adapter",
      rootDir,
      manifestPath: adapterManifestPath,
      manifest,
      id: typeof manifest.id === "string" ? manifest.id : "",
      version: typeof manifest.version === "string" ? manifest.version : "",
    };
  }

  throw new Error(`No app.nexus.json or adapter.nexus.json found in ${rootDir}`);
}

export function validatePackageRoot(targetPath: string): {
  errors: string[];
  warnings: string[];
  detected: DetectedPackage;
} {
  const detected = detectPackage(targetPath);
  const docsErrors: string[] = [];

  for (const relative of [
    "README.md",
    "TESTING.md",
    "docs/specs",
    "docs/workplans",
    "docs/validation",
    "scripts/package-release.sh",
  ]) {
    if (!fs.existsSync(path.join(detected.rootDir, relative))) {
      docsErrors.push(`required package artifact missing: ${relative}`);
    }
  }

  if (detected.kind === "app") {
    const manifest = detected.manifest as Record<string, unknown>;
    if (!fs.existsSync(path.join(detected.rootDir, "SKILL.md"))) {
      docsErrors.push("required package artifact missing: SKILL.md");
    }
    const skillPath = typeof manifest.skill === "string" ? manifest.skill.trim() : "";
    if (!skillPath) {
      docsErrors.push("app manifest missing required skill field");
    } else {
      const resolvedSkillPath = path.resolve(detected.rootDir, skillPath);
      if (!fs.existsSync(resolvedSkillPath)) {
        docsErrors.push(`skill does not exist: ${skillPath}`);
      }
    }
    const result = validateManifest(detected.manifest as any, detected.rootDir);
    return {
      errors: [...result.errors, ...docsErrors],
      warnings: result.warnings,
      detected,
    };
  }

  const manifest = detected.manifest as {
    skill?: string;
    command?: string;
    methodCatalog?: {
      source?: string;
    };
    hooks?: {
      onInstall?: string;
      onUninstall?: string;
      onUpgrade?: string;
      onActivate?: string;
      onDeactivate?: string;
    };
  };
  if (!fs.existsSync(path.join(detected.rootDir, "SKILL.md"))) {
    docsErrors.push("required package artifact missing: SKILL.md");
  }
  const skillPath = typeof manifest.skill === "string" ? manifest.skill.trim() : "";
  if (!skillPath) {
    docsErrors.push("adapter manifest missing required skill field");
  } else {
    const resolvedSkillPath = path.resolve(detected.rootDir, skillPath);
    if (!fs.existsSync(resolvedSkillPath)) {
      docsErrors.push(`skill does not exist: ${skillPath}`);
    }
  }
  const pathErrors: string[] = [];
  const pathWarnings: string[] = [];
  const isExecutable = (resolved: string): boolean => {
    try {
      const stat = fs.statSync(resolved);
      return (stat.mode & 0o111) !== 0;
    } catch {
      return false;
    }
  };
  const checkPathExists = (relativePath: string | undefined, label: string) => {
    if (!relativePath) {
      return;
    }
    if (label === "command" && !relativePath.startsWith(".") && !path.isAbsolute(relativePath)) {
      const lookup = spawnSync("which", [relativePath], { encoding: "utf8" });
      if (lookup.status !== 0) {
        pathErrors.push(`${label} not found on PATH: ${relativePath}`);
      }
      return;
    }
    const resolved = path.resolve(detected.rootDir, relativePath);
    if (!fs.existsSync(resolved)) {
      pathErrors.push(`${label} does not exist: ${relativePath}`);
      return;
    }
    if (label === "command" && !isExecutable(resolved)) {
      pathErrors.push(`${label} is not executable: ${relativePath}`);
    }
  };

  checkPathExists(manifest.command, "command");
  checkPathExists(manifest.hooks?.onInstall, "hooks.onInstall");
  checkPathExists(manifest.hooks?.onUninstall, "hooks.onUninstall");
  checkPathExists(manifest.hooks?.onUpgrade, "hooks.onUpgrade");
  checkPathExists(manifest.hooks?.onActivate, "hooks.onActivate");
  checkPathExists(manifest.hooks?.onDeactivate, "hooks.onDeactivate");

  if (manifest.methodCatalog?.source === "openapi") {
    for (const relative of ["api/openapi.yaml", "api/openapi.lock.json"]) {
      if (!fs.existsSync(path.join(detected.rootDir, relative))) {
        docsErrors.push(`required package artifact missing: ${relative}`);
      }
    }
    const openApiValidation = validateAdapterOpenApiSurface(detected.rootDir);
    pathErrors.push(...openApiValidation.errors);
    pathWarnings.push(...openApiValidation.warnings);
  }
  if (manifest.methodCatalog?.source === "graphql") {
    const graphQlValidation = validateAdapterGraphqlSurface(
      detected.rootDir,
      manifest.methodCatalog?.document,
    );
    pathErrors.push(...graphQlValidation.errors);
    pathWarnings.push(...graphQlValidation.warnings);
  }

  const result = validateAdapterManifest(detected.manifest as any, detected.rootDir);
  return {
    errors: [...result.errors, ...pathErrors, ...docsErrors],
    warnings: [...result.warnings, ...pathWarnings],
    detected,
  };
}

function shouldExcludeFromArchive(rootDir: string, absolutePath: string): boolean {
  const relative = path.relative(rootDir, absolutePath).replaceAll("\\", "/");
  if (!relative || relative === "") {
    return false;
  }
  const segments = relative.split("/");
  const first = segments[0] ?? "";

  if (
    first === ".git" ||
    first === "node_modules" ||
    first === ".turbo" ||
    first === ".next" ||
    first === "coverage" ||
    first === ".nex-package-stage" ||
    first === "docs"
  ) {
    return true;
  }

  if (segments.includes("__tests__") || first === "tests" || first === "test") {
    return true;
  }

  if (first === "dist") {
    const last = segments[segments.length - 1] ?? "";
    if (last.endsWith(".tar.gz") || last.endsWith(".sha256")) {
      return true;
    }
    if (last.endsWith(".adapter.catalog.json")) {
      return true;
    }
  }

  const base = path.basename(relative);
  return (
    base.endsWith(".test.ts") ||
    base.endsWith(".spec.ts") ||
    base.endsWith(".test.js") ||
    base.endsWith(".spec.js") ||
    base.endsWith(".test.go")
  );
}

function optionalCatalogString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function requiredCatalogString(value: unknown, label: string): string {
  const trimmed = optionalCatalogString(value);
  if (!trimmed) {
    throw new Error(`${label} is required`);
  }
  return trimmed;
}

function catalogStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const values = value
    .map((entry) => optionalCatalogString(entry))
    .filter((entry): entry is string => Boolean(entry));
  return values.length > 0 ? values : undefined;
}

function catalogRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function parseFirstJsonObject(raw: string, label: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error(`${label} produced no JSON output`);
  }
  try {
    return catalogRecord(JSON.parse(trimmed), label);
  } catch {
    const line = trimmed.split(/\r?\n/u).find((entry) => entry.trim().startsWith("{"));
    if (!line) {
      throw new Error(`${label} produced no JSON object`);
    }
    return catalogRecord(JSON.parse(line), label);
  }
}

function normalizeAdapterSetupFields(value: unknown, label: string): AdapterSetupField[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const fields = value.map((entry, index) => {
    const record = catalogRecord(entry, `${label}.fields[${index}]`);
    const fieldType = requiredCatalogString(record.type, `${label}.fields[${index}].type`);
    if (fieldType !== "secret" && fieldType !== "text" && fieldType !== "select") {
      throw new Error(`${label}.fields[${index}].type is unsupported`);
    }
    const field: AdapterSetupField = {
      name: requiredCatalogString(record.name, `${label}.fields[${index}].name`),
      label: requiredCatalogString(record.label, `${label}.fields[${index}].label`),
      type: fieldType,
      required: Boolean(record.required),
    };
    const placeholder = optionalCatalogString(record.placeholder);
    if (placeholder) {
      field.placeholder = placeholder;
    }
    if (Array.isArray(record.options)) {
      field.options = record.options.map((option, optionIndex) => {
        const optionRecord = catalogRecord(option, `${label}.fields[${index}].options[${optionIndex}]`);
        return {
          label: requiredCatalogString(optionRecord.label, `${label}.fields[${index}].options[${optionIndex}].label`),
          value: requiredCatalogString(optionRecord.value, `${label}.fields[${index}].options[${optionIndex}].value`),
        };
      });
    }
    return field;
  });
  return fields.length > 0 ? fields : undefined;
}

function normalizeAdapterSetupMethod(value: unknown, label: string): AdapterSetupMethod {
  const record = catalogRecord(value, label);
  const methodType = requiredCatalogString(record.type, `${label}.type`);
  if (
    methodType !== "oauth2" &&
    methodType !== "api_key" &&
    methodType !== "file_upload" &&
    methodType !== "custom_flow"
  ) {
    throw new Error(`${label}.type is unsupported`);
  }
  const method: AdapterSetupMethod = {
    type: methodType,
    label: requiredCatalogString(record.label, `${label}.label`),
    icon: requiredCatalogString(record.icon, `${label}.icon`),
  };
  const id = optionalCatalogString(record.id);
  const service = optionalCatalogString(record.service);
  const scopes = catalogStringArray(record.scopes);
  const platformCredentialUrl = optionalCatalogString(record.platformCredentialUrl);
  const fields = normalizeAdapterSetupFields(record.fields, label);
  const accept = catalogStringArray(record.accept);
  const templateUrl = optionalCatalogString(record.templateUrl);
  if (id) {
    method.id = id;
  }
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
  if (typeof record.maxSize === "number" && Number.isInteger(record.maxSize) && record.maxSize > 0) {
    method.maxSize = record.maxSize;
  }
  return method;
}

function runAdapterInfo(detected: DetectedPackage): Record<string, unknown> {
  const manifest = detected.manifest as { command?: string; args?: unknown };
  const command = requiredCatalogString(manifest.command, "adapter manifest command");
  const commandPath = command.startsWith(".") ? path.resolve(detected.rootDir, command) : command;
  const commandArgs = Array.isArray(manifest.args)
    ? manifest.args.filter((arg): arg is string => typeof arg === "string")
    : [];
  const result = spawnSync(commandPath, [...commandArgs, "adapter.info"], {
    cwd: detected.rootDir,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    env: {
      ...process.env,
      NO_COLOR: "1",
    },
  });
  if (result.error) {
    throw new Error(`adapter.info failed for ${detected.id}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `adapter.info failed for ${detected.id}: ${result.stderr?.trim() || result.stdout?.trim() || "adapter exited non-zero"}`,
    );
  }
  return parseFirstJsonObject(result.stdout, `${detected.id} adapter.info`);
}

function buildAdapterSetupDescriptor(detected: DetectedPackage): AdapterSetupDescriptor {
  const manifest = detected.manifest;
  const info = runAdapterInfo(detected);
  const auth = catalogRecord(info.auth, `${detected.id} adapter.info auth`);
  if (!Array.isArray(auth.methods) || auth.methods.length === 0) {
    if (process.env.ADAPTER_PACKAGE_ALLOW_MISSING_SETUP_DESCRIPTOR === "1") {
      auth.methods = [];
    } else {
      throw new Error(`${detected.id} adapter.info auth.methods must contain at least one setup method`);
    }
  }
  const descriptor: AdapterSetupDescriptor = {
    schemaVersion: "adapter-catalog-setup.v1",
    adapterId: detected.id,
    displayName: requiredCatalogString(
      manifest.displayName ?? manifest.name ?? info.name ?? detected.id,
      `${detected.id} displayName`,
    ),
    auth: {
      methods: auth.methods.map((method, index) =>
        normalizeAdapterSetupMethod(method, `${detected.id} adapter.info auth.methods[${index}]`),
      ),
    },
  };
  const setupGuide = optionalCatalogString(auth.setupGuide);
  const description = optionalCatalogString(manifest.description);
  const version = optionalCatalogString(manifest.version ?? info.version);
  const platform = optionalCatalogString(info.platform ?? manifest.platform);
  const name = optionalCatalogString(info.name);
  const credentialService = optionalCatalogString(info.credential_service);
  if (setupGuide) {
    descriptor.auth.setupGuide = setupGuide;
  }
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
  return descriptor;
}

async function copyPackageTree(sourceDir: string, stageDir: string): Promise<void> {
  async function visit(currentSource: string) {
    const relative = path.relative(sourceDir, currentSource);
    const currentStage = relative ? path.join(stageDir, relative) : stageDir;
    const stat = await fsp.stat(currentSource);

    if (shouldExcludeFromArchive(sourceDir, currentSource)) {
      return;
    }

    if (stat.isDirectory()) {
      await ensureDir(currentStage);
      const entries = await fsp.readdir(currentSource);
      for (const entry of entries) {
        await visit(path.join(currentSource, entry));
      }
      return;
    }

    await ensureDir(path.dirname(currentStage));
    await fsp.copyFile(currentSource, currentStage);
    await fsp.chmod(currentStage, stat.mode);
  }

  await visit(sourceDir);
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = fs.createReadStream(filePath);
  return await new Promise((resolve, reject) => {
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

function createTarArchive(stageDir: string, archivePath: string): void {
  const result = spawnSync("tar", ["-czf", archivePath, "-C", stageDir, "."], {
    encoding: "utf8",
    env: {
      ...process.env,
      COPYFILE_DISABLE: "1",
      COPY_EXTENDED_ATTRIBUTES_DISABLE: "1",
    },
  });
  if (result.status !== 0) {
    throw new Error(
      `failed to create package archive: ${result.stderr?.trim() || result.stdout?.trim() || "tar exited non-zero"}`,
    );
  }
}

export async function createPackageArchive(targetPath: string): Promise<{
  archivePath: string;
  sha256Path: string;
  sha256: string;
  detected: DetectedPackage;
}> {
  const validation = validatePackageRoot(targetPath);
  if (validation.errors.length > 0) {
    throw new Error(`package validation failed:\n- ${validation.errors.join("\n- ")}`);
  }
  const openApiBlockingWarnings = validation.warnings.filter((warning) =>
    warning.includes(EMPTY_OPENAPI_WARNING) || warning.includes(NARROW_OPENAPI_WARNING),
  );
  if (openApiBlockingWarnings.length > 0) {
    throw new Error(`package validation failed:\n- ${openApiBlockingWarnings.join("\n- ")}`);
  }

  const { detected } = validation;
  const stageDir = await fsp.mkdtemp(path.join(os.tmpdir(), "nex-package-stage-"));
  const distDir = path.join(detected.rootDir, "dist");
  const archivePath = path.join(distDir, `${detected.id}-${detected.version}.tar.gz`);
  const sha256Path = `${archivePath}.sha256`;
  const adapterCatalogJson = detected.kind === "adapter"
    ? `${JSON.stringify(buildAdapterSetupDescriptor(detected), null, 2)}\n`
    : null;

  await ensureDir(distDir);
  if (adapterCatalogJson) {
    await fsp.writeFile(
      path.join(distDir, `${detected.id}-${detected.version}.adapter.catalog.json`),
      adapterCatalogJson,
      "utf8",
    );
  }
  try {
    await copyPackageTree(detected.rootDir, stageDir);
    if (adapterCatalogJson) {
      await fsp.writeFile(path.join(stageDir, "adapter.catalog.json"), adapterCatalogJson, "utf8");
    }
    createTarArchive(stageDir, archivePath);
    const sha256 = await sha256File(archivePath);
    await fsp.writeFile(sha256Path, `${sha256}  ${path.basename(archivePath)}\n`, "utf8");
    return { archivePath, sha256Path, sha256, detected };
  } finally {
    await fsp.rm(stageDir, { recursive: true, force: true });
  }
}

export function packageInstallStatusPath(
  kind: PackageKind,
  serverId: string,
  packageId: string,
): string {
  return kind === "app"
    ? `/api/servers/${encodeURIComponent(serverId)}/apps/${encodeURIComponent(packageId)}/install-status`
    : `/api/servers/${encodeURIComponent(serverId)}/adapters/${encodeURIComponent(packageId)}/install-status`;
}

export function packageInstallPath(kind: PackageKind, serverId: string, packageId: string): string {
  return kind === "app"
    ? `/api/servers/${encodeURIComponent(serverId)}/apps/${encodeURIComponent(packageId)}/install`
    : `/api/servers/${encodeURIComponent(serverId)}/adapters/${encodeURIComponent(packageId)}/install`;
}

export function packageUpgradePath(kind: PackageKind, serverId: string, packageId: string): string {
  return kind === "app"
    ? `/api/servers/${encodeURIComponent(serverId)}/apps/${encodeURIComponent(packageId)}/upgrade`
    : `/api/servers/${encodeURIComponent(serverId)}/adapters/${encodeURIComponent(packageId)}/upgrade`;
}
