import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  parseAdapterManifest,
  validateAdapterManifest,
} from "../../../nex/src/apps/adapter-manifest.js";
import { parseManifest, validateManifest } from "../../../nex/src/apps/manifest.js";

export type PackageKind = "app" | "adapter";
export type PackageLanguage = "ts" | "go";

export type DetectedPackage = {
  kind: PackageKind;
  rootDir: string;
  manifestPath: string;
  manifest: Record<string, unknown>;
  id: string;
  version: string;
};

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
    "api/openapi.yaml",
    "api/openapi.lock.json",
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
  const checkPathExists = (relativePath: string | undefined, label: string) => {
    if (!relativePath) {
      return;
    }
    const resolved = path.resolve(detected.rootDir, relativePath);
    if (!fs.existsSync(resolved)) {
      pathErrors.push(`${label} does not exist: ${relativePath}`);
    }
  };

  checkPathExists(manifest.command, "command");
  checkPathExists(manifest.hooks?.onInstall, "hooks.onInstall");
  checkPathExists(manifest.hooks?.onUninstall, "hooks.onUninstall");
  checkPathExists(manifest.hooks?.onUpgrade, "hooks.onUpgrade");
  checkPathExists(manifest.hooks?.onActivate, "hooks.onActivate");
  checkPathExists(manifest.hooks?.onDeactivate, "hooks.onDeactivate");

  const result = validateAdapterManifest(detected.manifest as any, detected.rootDir);
  return {
    errors: [...result.errors, ...pathErrors, ...docsErrors],
    warnings: result.warnings,
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

  const { detected } = validation;
  const stageDir = await fsp.mkdtemp(path.join(os.tmpdir(), "nex-package-stage-"));
  const distDir = path.join(detected.rootDir, "dist");
  const archivePath = path.join(distDir, `${detected.id}-${detected.version}.tar.gz`);
  const sha256Path = `${archivePath}.sha256`;

  await ensureDir(distDir);
  try {
    await copyPackageTree(detected.rootDir, stageDir);
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
