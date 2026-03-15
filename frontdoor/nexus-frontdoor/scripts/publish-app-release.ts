import path from "node:path";
import { FrontdoorStore } from "../src/frontdoor-store.js";
import { loadConfig } from "../src/config.js";
import { publishAppRelease } from "../src/publish-app-release.js";

type Args = {
  packageRoot: string;
  tarballPath: string;
  frontdoorDbPath?: string;
  configPath?: string;
  targetOs?: string;
  targetArch?: string;
  channel?: string;
};

function usage(): string {
  return [
    "Usage:",
    "  pnpm exec tsx ./scripts/publish-app-release.ts \\",
    "    --package-root /abs/path/to/app-root \\",
    "    --tarball /abs/path/to/dist/pkg.tar.gz \\",
    "    [--frontdoor-db /abs/path/to/frontdoor.db] \\",
    "    [--config /abs/path/to/frontdoor.config.json] \\",
    "    [--target-os linux] [--target-arch arm64] [--channel stable]",
  ].join("\n");
}

function readArg(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return args[index + 1];
}

function requireArg(args: string[], name: string): string {
  const value = readArg(args, name)?.trim();
  if (!value) {
    throw new Error(`missing required argument ${name}\n\n${usage()}`);
  }
  return value;
}

function parseArgs(argv: string[]): Args {
  return {
    packageRoot: requireArg(argv, "--package-root"),
    tarballPath: requireArg(argv, "--tarball"),
    frontdoorDbPath: readArg(argv, "--frontdoor-db")?.trim() || undefined,
    configPath: readArg(argv, "--config")?.trim() || undefined,
    targetOs: readArg(argv, "--target-os")?.trim() || undefined,
    targetArch: readArg(argv, "--target-arch")?.trim() || undefined,
    channel: readArg(argv, "--channel")?.trim() || undefined,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const frontdoorDbPath =
    args.frontdoorDbPath ||
    loadConfig({
      ...process.env,
      ...(args.configPath ? { FRONTDOOR_CONFIG_PATH: args.configPath } : {}),
    }).frontdoorStorePath;
  if (!frontdoorDbPath) {
    throw new Error("could not resolve Frontdoor store path");
  }

  const store = new FrontdoorStore(frontdoorDbPath);
  try {
    const result = await publishAppRelease({
      store,
      packageRoot: path.resolve(args.packageRoot),
      tarballPath: path.resolve(args.tarballPath),
      targetOs: args.targetOs,
      targetArch: args.targetArch,
      channel: args.channel,
    });
    process.stdout.write(`${JSON.stringify({ frontdoor_db: frontdoorDbPath, ...result }, null, 2)}\n`);
  } finally {
    store.close();
  }
}

await main();
