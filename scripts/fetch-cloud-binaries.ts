#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import fssync from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

type PlatformSpec = {
  id: string;
  asset: string;
  archive: "tar.gz" | "zip";
  binary: string;
};

const PLATFORMS: PlatformSpec[] = [
  {
    id: "darwin-arm64",
    asset: "nexus-cloud-rs-darwin-arm64.tar.gz",
    archive: "tar.gz",
    binary: "nexus-cloud-rs",
  },
  {
    id: "darwin-x64",
    asset: "nexus-cloud-rs-darwin-x64.tar.gz",
    archive: "tar.gz",
    binary: "nexus-cloud-rs",
  },
  {
    id: "linux-x64",
    asset: "nexus-cloud-rs-linux-x64.tar.gz",
    archive: "tar.gz",
    binary: "nexus-cloud-rs",
  },
  {
    id: "linux-arm64",
    asset: "nexus-cloud-rs-linux-arm64.tar.gz",
    archive: "tar.gz",
    binary: "nexus-cloud-rs",
  },
  {
    id: "win32-x64",
    asset: "nexus-cloud-rs-win32-x64.zip",
    archive: "zip",
    binary: "nexus-cloud-rs.exe",
  },
];

function resolveRepoRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..");
}

function run(cmd: string, args: string[], cwd?: string) {
  const res = spawnSync(cmd, args, { stdio: "inherit", cwd });
  if (typeof res.status === "number" && res.status !== 0) {
    throw new Error(`${cmd} failed with exit ${res.status}`);
  }
  if (res.error) {
    throw res.error;
  }
}

async function downloadTo(url: string, outPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download ${url} (${res.status})`);
  }
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  const file = await fs.open(outPath, "w");
  try {
    for await (const chunk of res.body) {
      await file.write(chunk as Buffer);
    }
  } finally {
    await file.close();
  }
}

async function extractArchive(
  archivePath: string,
  destDir: string,
  format: "tar.gz" | "zip",
) {
  await fs.mkdir(destDir, { recursive: true });
  if (format === "tar.gz") {
    run("tar", ["-xzf", archivePath, "-C", destDir]);
    return;
  }
  if (process.platform === "win32") {
    run("powershell", [
      "-Command",
      `Expand-Archive -Path "${archivePath}" -DestinationPath "${destDir}" -Force`,
    ]);
    return;
  }
  run("unzip", ["-q", archivePath, "-d", destDir]);
}

async function locateBinary(
  dir: string,
  binaryName: string,
): Promise<string> {
  const direct = path.join(dir, binaryName);
  if (fssync.existsSync(direct)) return direct;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const nested = path.join(dir, entry.name, binaryName);
    if (fssync.existsSync(nested)) return nested;
  }
  throw new Error(`Binary ${binaryName} not found in ${dir}`);
}

async function installBinary(
  repoRoot: string,
  spec: PlatformSpec,
  archivePath: string,
) {
  const extractDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "nexus-cloud-bin-"),
  );
  try {
    await extractArchive(archivePath, extractDir, spec.archive);
    const source = await locateBinary(extractDir, spec.binary);
    const outPath = path.join(
      repoRoot,
      "dist",
      "native",
      "nexus-cloud",
      spec.id,
      spec.binary,
    );
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.copyFile(source, outPath);
    if (!spec.binary.endsWith(".exe")) {
      await fs.chmod(outPath, 0o755);
    }
  } finally {
    await fs.rm(extractDir, { recursive: true, force: true });
  }
}

async function buildLocalBinary(repoRoot: string) {
  run("bun", ["scripts/build-cloud-binary.ts"], repoRoot);
}

async function main() {
  const repoRoot = resolveRepoRoot();
  const pkg = JSON.parse(
    await fs.readFile(path.join(repoRoot, "package.json"), "utf-8"),
  ) as { version: string };
  const tag =
    process.env.NEXUS_CLOUD_RELEASE_TAG?.trim() || `v${pkg.version}`;
  const baseUrl =
    process.env.NEXUS_CLOUD_RELEASE_BASE_URL?.trim() ||
    `https://github.com/Napageneral/nexus/releases/download/${tag}`;
  const localOnly = process.env.NEXUS_CLOUD_LOCAL_ONLY === "1";
  const allowMissing = process.env.NEXUS_CLOUD_ALLOW_MISSING === "1";

  if (localOnly) {
    await buildLocalBinary(repoRoot);
    return;
  }

  const failures: string[] = [];
  for (const spec of PLATFORMS) {
    const url = `${baseUrl}/${spec.asset}`;
    const archivePath = path.join(repoRoot, ".tmp", "cloud", spec.asset);
    try {
      await downloadTo(url, archivePath);
      await installBinary(repoRoot, spec, archivePath);
    } catch (err) {
      failures.push(`${spec.id}: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (failures.length > 0) {
    if (!allowMissing) {
      throw new Error(
        `Missing cloud binaries:\n${failures.map((f) => `- ${f}`).join("\n")}`,
      );
    }
    console.warn(
      `Continuing despite missing cloud binaries:\n${failures.map((f) => `- ${f}`).join("\n")}`,
    );
    await buildLocalBinary(repoRoot);
  }
}

main().catch((err) => {
  console.error(String(err));
  process.exit(1);
});
