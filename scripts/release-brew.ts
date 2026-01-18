#!/usr/bin/env bun
import { execSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Options = {
  packageName: string;
  version: string;
  formulaName: string;
  binName: string;
  tarballUrl?: string;
  sha256?: string;
  outputPath?: string;
  homepage?: string;
};

function resolveRepoRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..");
}

function readArgValue(args: string[], key: string): string | undefined {
  const direct = args.find((arg) => arg.startsWith(`${key}=`));
  if (direct) return direct.slice(`${key}=`.length);
  const idx = args.indexOf(key);
  if (idx >= 0) return args[idx + 1];
  return undefined;
}

function pickBinName(pkg: { name?: string; bin?: string | Record<string, string> }): {
  name: string;
  path?: string;
} {
  const bin = pkg.bin;
  if (!bin) return { name: pkg.name ?? "nexus" };
  if (typeof bin === "string") {
    return { name: pkg.name ?? "nexus", path: bin };
  }
  const entries = Object.entries(bin);
  if (entries.length === 0) return { name: pkg.name ?? "nexus" };
  return { name: entries[0][0], path: entries[0][1] };
}

function toClassName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join("");
}

async function fetchSha256(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch tarball (${res.status} ${res.statusText})`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function resolveTarballUrl(pkgName: string, version: string): string {
  const env = process.env.NEXUS_NPM_TARBALL?.trim();
  if (env) return env;
  const raw = execSync(`npm view ${pkgName}@${version} dist.tarball`, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  if (!raw) {
    throw new Error("npm view returned empty dist.tarball");
  }
  return raw;
}

function resolveOutputPath(
  formulaName: string,
  repoRoot: string,
): string {
  const direct = process.env.NEXUS_BREW_FORMULA_PATH?.trim();
  if (direct) return direct;
  const tapDir = process.env.NEXUS_BREW_TAP_DIR?.trim();
  if (tapDir) return path.join(tapDir, "Formula", `${formulaName}.rb`);
  return path.join(repoRoot, "Formula", `${formulaName}.rb`);
}

function parseOptions(args: string[]): Options {
  const repoRoot = resolveRepoRoot();
  const pkgPath = path.join(repoRoot, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {
    name?: string;
    version?: string;
    description?: string;
    homepage?: string;
    license?: string;
    bin?: string | Record<string, string>;
  };

  const packageName =
    readArgValue(args, "--package") ??
    process.env.NEXUS_NPM_PACKAGE ??
    pkg.name ??
    "nexus";
  const version =
    readArgValue(args, "--version") ??
    process.env.NEXUS_RELEASE_VERSION ??
    pkg.version ??
    "0.0.0";
  const bin = pickBinName(pkg);
  const formulaName =
    readArgValue(args, "--formula") ??
    process.env.NEXUS_BREW_FORMULA ??
    bin.name;
  const outputPath =
    readArgValue(args, "--output") ?? resolveOutputPath(formulaName, repoRoot);
  const tarballUrl =
    readArgValue(args, "--tarball") ?? process.env.NEXUS_NPM_TARBALL;
  const sha256 =
    readArgValue(args, "--sha256") ?? process.env.NEXUS_NPM_SHA256;
  const homepage =
    readArgValue(args, "--homepage") ??
    process.env.NEXUS_HOMEPAGE ??
    pkg.homepage ??
    "https://nexus.com";

  return {
    packageName,
    version,
    formulaName,
    binName: bin.name,
    tarballUrl,
    sha256,
    outputPath,
    homepage,
  };
}

async function main() {
  const opts = parseOptions(process.argv.slice(2));
  const repoRoot = resolveRepoRoot();

  const tarballUrl =
    opts.tarballUrl ?? resolveTarballUrl(opts.packageName, opts.version);
  const sha256 = opts.sha256 ?? (await fetchSha256(tarballUrl));

  const pkg = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "package.json"), "utf-8"),
  ) as { description?: string; license?: string };

  const className = toClassName(opts.formulaName);
  const formula = `class ${className} < Formula
  desc "${pkg.description ?? "Nexus CLI"}"
  homepage "${opts.homepage}"
  url "${tarballUrl}"
  sha256 "${sha256}"
  license "${pkg.license ?? "MIT"}"

  depends_on "node"

  def install
    libexec.install Dir["*"]
    system "npm", "install", "--production", *std_npm_args(prefix: libexec)
    bin.install_symlink libexec/"bin/${opts.binName}" => "${opts.binName}"
  end

  test do
    system "#{bin}/${opts.binName}", "--version"
  end
end
`;

  if (!opts.outputPath) {
    throw new Error("Missing output path for brew formula");
  }
  fs.mkdirSync(path.dirname(opts.outputPath), { recursive: true });
  fs.writeFileSync(opts.outputPath, formula, "utf-8");

  console.log(`Wrote formula: ${opts.outputPath}`);
  console.log(`Package: ${opts.packageName}@${opts.version}`);
  console.log(`Tarball: ${tarballUrl}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
