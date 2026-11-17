#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";
import { create as createTar, extract as extractTar } from "tar";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const UMBRELLA_ROOT = resolve(ROOT_DIR, "../../../..");
const CORE_ROOT = join(UMBRELLA_ROOT, "nex");
const RELEASE_CONTRACT_PATH = join(ROOT_DIR, "contracts/partner-production-release.v1.json");
const CANONICAL_CONTRACT_PATH = join(ROOT_DIR, "contracts/partner-canonical-profiles.v1.json");
const APP_MANIFEST_PATH = join(ROOT_DIR, "app.nexus.json");
const RELEASE_MANIFEST_PATH = join(ROOT_DIR, "dist/partner-production-release-manifest.v1.json");
const DORMANT_UPGRADE_INPUT_PATH = join(
  ROOT_DIR,
  "dist/moonsleep-partner-desk-0.3.2.dormant-upgrade.json",
);

function fail(message) {
  throw new Error(message);
}

function command(commandName, args, options = {}) {
  const result = spawnSync(commandName, args, {
    cwd: options.cwd ?? UMBRELLA_ROOT,
    encoding: "utf8",
    stdio: options.inherit ? "inherit" : "pipe",
    env: process.env,
  });
  if (result.status !== 0) {
    fail(
      `${commandName} ${args.join(" ")} failed: ${
        result.stderr?.trim() || result.stdout?.trim() || `exit ${result.status}`
      }`,
    );
  }
  return result.stdout?.trim() ?? "";
}

function sha256Buffer(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256File(path) {
  return sha256Buffer(readFileSync(path));
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalValue(nested)]),
    );
  }
  return value;
}

function writeCanonicalJson(path, value) {
  const bytes = `${JSON.stringify(canonicalValue(value), null, 2)}\n`;
  writeFileSync(path, bytes, { encoding: "utf8", mode: 0o600 });
  return sha256Buffer(bytes);
}

function assertNoProhibitedSchemaField(value, path = "$") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoProhibitedSchemaField(entry, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [field, nested] of Object.entries(value)) {
    if (field === "kind") fail(`prohibited schema field found at ${path}.${field}`);
    assertNoProhibitedSchemaField(nested, `${path}.${field}`);
  }
}

function regularFile(path, label) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${label} must be a regular file`);
  return stat;
}

function sortedArchiveEntries(stageDir) {
  const entries = [];
  const visit = (relativeDir) => {
    const absoluteDir = relativeDir ? join(stageDir, relativeDir) : stageDir;
    for (const name of readdirSync(absoluteDir).sort((left, right) => left.localeCompare(right))) {
      const relativePath = relativeDir ? join(relativeDir, name) : name;
      const stat = lstatSync(join(stageDir, relativePath));
      if (stat.isSymbolicLink()) fail(`release archive contains a symbolic link: ${relativePath}`);
      if (stat.isDirectory()) {
        entries.push(`${relativePath}/`);
        visit(relativePath);
      } else if (stat.isFile()) {
        entries.push(relativePath);
      } else {
        fail(`release archive contains an unsupported entry: ${relativePath}`);
      }
    }
  };
  visit("");
  return entries;
}

async function canonicalizeArchive(artifactPath) {
  const stageDir = mkdtempSync(join(tmpdir(), "partner-production-release-"));
  try {
    await extractTar({
      file: artifactPath,
      cwd: stageDir,
      preservePaths: false,
      strict: true,
    });
    const entries = sortedArchiveEntries(stageDir);
    await createTar(
      {
        file: artifactPath,
        cwd: stageDir,
        gzip: { portable: true },
        mtime: new Date(0),
        noDirRecurse: true,
        noPax: true,
        portable: true,
        strict: true,
      },
      entries,
    );
  } finally {
    rmSync(stageDir, { recursive: true, force: true });
  }
}

const sourceStatus = command("git", [
  "-C",
  UMBRELLA_ROOT,
  "status",
  "--porcelain=v1",
  "--untracked-files=all",
]);
if (sourceStatus) fail("production release source worktree must be clean");

const sourceCommit = command("git", ["-C", UMBRELLA_ROOT, "rev-parse", "HEAD"]);
const sourceTree = command("git", ["-C", UMBRELLA_ROOT, "rev-parse", "HEAD^{tree}"]);
const coreCommit = command("git", ["-C", CORE_ROOT, "rev-parse", "HEAD"]);
const coreTree = command("git", ["-C", CORE_ROOT, "rev-parse", "HEAD^{tree}"]);
const releaseContract = JSON.parse(readFileSync(RELEASE_CONTRACT_PATH, "utf8"));
const canonicalContract = JSON.parse(readFileSync(CANONICAL_CONTRACT_PATH, "utf8"));
const appManifest = JSON.parse(readFileSync(APP_MANIFEST_PATH, "utf8"));

assertNoProhibitedSchemaField(releaseContract);
if (
  releaseContract.app.app_id !== appManifest.id ||
  releaseContract.app.app_version !== appManifest.version
) {
  fail("release contract and app manifest identity differ");
}
if (
  releaseContract.governing_core.commit !== coreCommit ||
  releaseContract.governing_core.tree !== coreTree ||
  canonicalContract.governing_core.commit !== coreCommit ||
  canonicalContract.governing_core.tree !== coreTree
) {
  fail("release source is not bound to the exact governed Nex core");
}
const canonicalContractSha256 = sha256File(CANONICAL_CONTRACT_PATH);
if (releaseContract.canonical_evidence_contract.sha256 !== canonicalContractSha256) {
  fail("canonical evidence contract digest differs from the release contract");
}

rmSync(RELEASE_MANIFEST_PATH, { force: true });
rmSync(DORMANT_UPGRADE_INPUT_PATH, { force: true });
command("npm", ["run", "build"], { cwd: ROOT_DIR, inherit: true });
command("nexus", ["package", "validate", ROOT_DIR], { inherit: true });
command("nexus", ["package", "release", ROOT_DIR], { inherit: true });

const artifactPath = join(ROOT_DIR, releaseContract.app.artifact_relative_path);
await canonicalizeArchive(artifactPath);
chmodSync(artifactPath, 0o600);
const artifactStat = regularFile(artifactPath, "release artifact");
const artifactSha256 = sha256File(artifactPath);
const archiveEntries = command("tar", ["-tzf", artifactPath], { cwd: ROOT_DIR })
  .split("\n")
  .filter(Boolean);
if (
  archiveEntries.length === 0 ||
  archiveEntries.some(
    (entry) =>
      entry.startsWith("/") ||
      entry.split("/").includes("..") ||
      entry.includes("/node_modules/"),
  )
) {
  fail("release archive contains an invalid path");
}
for (const required of [
  "app.nexus.json",
  "hooks/install.ts",
  "hooks/deactivate.ts",
  "hooks/uninstall.ts",
  "contracts/partner-canonical-profiles.v1.json",
  "contracts/partner-production-release.v1.json",
  "ui/dist/index.html",
]) {
  if (!archiveEntries.map((entry) => entry.replace(/^\.\//, "")).includes(required)) {
    fail(`release archive is missing ${required}`);
  }
}

const packageDirectory = releaseContract.staging.package_directory_template.replace(
  "${ARTIFACT_SHA256}",
  artifactSha256,
);
const manifest = {
  contract_id: "moonsleep.partner.production-release-manifest.v1",
  contract_version: 1,
  source: {
    commit: sourceCommit,
    tree: sourceTree,
    clean: true,
  },
  governing_core: {
    commit: coreCommit,
    tree: coreTree,
  },
  package: {
    app_id: appManifest.id,
    app_version: appManifest.version,
    app_manifest_sha256: sha256File(APP_MANIFEST_PATH),
    canonical_evidence_contract_sha256: canonicalContractSha256,
    production_release_contract_sha256: sha256File(RELEASE_CONTRACT_PATH),
  },
  artifact: {
    relative_path: relative(ROOT_DIR, artifactPath),
    sha256: artifactSha256,
    size_bytes: artifactStat.size,
    archive_entry_count: archiveEntries.length,
  },
  dormant_upgrade_input: {
    relative_path: `dist/moonsleep-partner-desk-${appManifest.version}.dormant-upgrade.json`,
  },
  authority: releaseContract.authority,
};
const releaseManifestSha256 = writeCanonicalJson(RELEASE_MANIFEST_PATH, manifest);
const dormantUpgradeInputPath = join(ROOT_DIR, manifest.dormant_upgrade_input.relative_path);
if (dormantUpgradeInputPath !== DORMANT_UPGRADE_INPUT_PATH) {
  fail("dormant upgrade input path differs from the release builder contract");
}
const dormantUpgradeInput = {
  contract_id: "moonsleep.partner.dormant-upgrade-input.v1",
  contract_version: 1,
  release_manifest: {
    relative_path: relative(ROOT_DIR, RELEASE_MANIFEST_PATH),
    sha256: releaseManifestSha256,
  },
  artifact: {
    relative_path: relative(ROOT_DIR, artifactPath),
    sha256: artifactSha256,
    size_bytes: artifactStat.size,
  },
  staging: {
    package_directory: packageDirectory,
    artifact_mode: releaseContract.staging.artifact_mode,
    package_directory_mode: releaseContract.staging.package_directory_mode,
  },
  upgrade: {
    http_method: releaseContract.dormant_upgrade.http_method,
    endpoint: releaseContract.dormant_upgrade.endpoint,
    request: {
      appId: appManifest.id,
      targetVersion: appManifest.version,
      packageRef: packageDirectory,
    },
  },
  rollback: releaseContract.rollback,
  expected_postflight: releaseContract.dormant_upgrade,
  authority: releaseContract.authority,
};
assertNoProhibitedSchemaField(dormantUpgradeInput);
const dormantUpgradeInputSha256 = writeCanonicalJson(
  dormantUpgradeInputPath,
  dormantUpgradeInput,
);

process.stdout.write(
  `${JSON.stringify(
    canonicalValue({
      ok: true,
      source_commit: sourceCommit,
      source_tree: sourceTree,
      core_commit: coreCommit,
      core_tree: coreTree,
      artifact_path: artifactPath,
      artifact_sha256: artifactSha256,
      artifact_size_bytes: artifactStat.size,
      release_manifest_path: RELEASE_MANIFEST_PATH,
      release_manifest_sha256: releaseManifestSha256,
      dormant_upgrade_input_path: dormantUpgradeInputPath,
      dormant_upgrade_input_sha256: dormantUpgradeInputSha256,
      provider_calls: 0,
      production_action: false,
    }),
  )}\n`,
);
