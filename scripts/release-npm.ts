#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Options = {
  tag: string;
  access: string;
  dryRun: boolean;
  skipBuild: boolean;
  skipCheck: boolean;
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

function hasFlag(args: string[], key: string): boolean {
  return args.includes(key);
}

function parseArgs(args: string[]): Options {
  const tag =
    readArgValue(args, "--tag") ?? process.env.NEXUS_NPM_TAG ?? "latest";
  const access =
    readArgValue(args, "--access") ?? process.env.NEXUS_NPM_ACCESS ?? "public";
  return {
    tag,
    access,
    dryRun: hasFlag(args, "--dry-run"),
    skipBuild: hasFlag(args, "--skip-build"),
    skipCheck: hasFlag(args, "--skip-check"),
  };
}

function run(cmd: string, args: string[]) {
  const res = spawnSync(cmd, args, { stdio: "inherit" });
  if (typeof res.status === "number" && res.status !== 0) {
    process.exit(res.status);
  }
  if (res.error) {
    throw res.error;
  }
}

function main() {
  const repoRoot = resolveRepoRoot();
  process.chdir(repoRoot);

  const opts = parseArgs(process.argv.slice(2));

  if (!opts.skipBuild) {
    run("npm", ["run", "build"]);
  }

  run("bun", ["scripts/fetch-cloud-binaries.ts"]);

  if (!opts.skipCheck) {
    run("npm", ["run", "release:check"]);
  }

  const publishArgs = [
    "publish",
    "--access",
    opts.access,
    "--tag",
    opts.tag,
  ];
  if (opts.dryRun) {
    publishArgs.push("--dry-run");
  }

  run("npm", publishArgs);
}

main();
