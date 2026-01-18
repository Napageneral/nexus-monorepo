#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type BuildResult = {
  ok: boolean;
  message: string;
};

function resolveRepoRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..");
}

function platformId(): string {
  return `${process.platform}-${process.arch}`;
}

function resolveSourceBinary(nativeRoot: string): string {
  const ext = process.platform === "win32" ? ".exe" : "";
  return path.join(nativeRoot, "target", "release", `cli${ext}`);
}

function resolveOutputBinary(repoRoot: string): string {
  const ext = process.platform === "win32" ? ".exe" : "";
  return path.join(
    repoRoot,
    "dist",
    "native",
    "nexus-cloud",
    platformId(),
    `nexus-cloud-rs${ext}`,
  );
}

function runCargoBuild(nativeRoot: string): BuildResult {
  const res = spawnSync(
    "cargo",
    ["build", "--release", "--package", "cli"],
    {
      cwd: nativeRoot,
      stdio: "inherit",
    },
  );
  if (res.status === 0) {
    return { ok: true, message: "built" };
  }
  return { ok: false, message: "cargo build failed" };
}

function main() {
  if (process.env.NEXUS_SKIP_CLOUD_BIN === "1") {
    console.log("Skipping cloud binary build (NEXUS_SKIP_CLOUD_BIN=1).");
    return;
  }

  const repoRoot = resolveRepoRoot();
  const nativeRoot = path.join(repoRoot, "native", "nexus-cloud");
  const cargoToml = path.join(nativeRoot, "Cargo.toml");
  if (!fs.existsSync(cargoToml)) {
    console.log("Cloud native sources not found; skipping cloud binary build.");
    return;
  }

  const sourceBinary = resolveSourceBinary(nativeRoot);
  if (!fs.existsSync(sourceBinary)) {
    const result = runCargoBuild(nativeRoot);
    if (!result.ok) {
      throw new Error(result.message);
    }
  }

  const outputBinary = resolveOutputBinary(repoRoot);
  fs.mkdirSync(path.dirname(outputBinary), { recursive: true });
  fs.copyFileSync(sourceBinary, outputBinary);
  if (process.platform !== "win32") {
    fs.chmodSync(outputBinary, 0o755);
  }
  console.log(`Wrote cloud binary: ${outputBinary}`);
}

main();
