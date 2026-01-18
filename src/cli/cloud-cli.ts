import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Command } from "commander";

import { scanCredentials } from "../commands/credential.js";
import { openUrl } from "../commands/onboard-helpers.js";
import {
  type CredentialRecord,
  resolveDefaultEnvVar,
  storeKeychainSecret,
  writeCredentialRecord,
} from "../credentials/store.js";
import { NEXUS_ROOT, sleep } from "../utils.js";

type CliTokenStatus =
  | { status: "pending" }
  | { status: "not_found" }
  | { status: "expired" }
  | { status: "error"; message?: string }
  | {
      status: "authorized";
      token: string;
      workspaceId: string;
      cloudUrl?: string;
    };

type CloudLoginArgs = {
  baseUrl: string;
  timeoutMs: number;
  pollMs: number;
  apiToken?: string;
  showHelp: boolean;
  extraArgs: string[];
};

type CloudRunner = {
  command: string;
  args: string[];
  cwd?: string;
  env: NodeJS.ProcessEnv;
};

const DEFAULT_CLOUD_TIMEOUT_MS = 120_000;
const DEFAULT_CLOUD_POLL_MS = 2_000;

function getHubBaseUrl(): string {
  return (
    process.env.NEXUS_HUB_URL ||
    process.env.NEXUS_WEBSITE_URL ||
    "https://getnexus.sh"
  );
}

function createCliAuthCode(): string {
  return crypto.randomBytes(16).toString("hex");
}

async function fetchCliTokenStatus(
  baseUrl: string,
  code: string,
): Promise<CliTokenStatus> {
  const url = new URL("/api/cli/token", baseUrl);
  url.searchParams.set("code", code);
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  const status = typeof data?.status === "string" ? data.status : "error";
  if (status === "pending") return { status: "pending" };
  if (status === "not_found") return { status: "not_found" };
  if (status === "expired") return { status: "expired" };
  if (status === "authorized" && data?.token) {
    return {
      status: "authorized",
      token: data.token,
      workspaceId: data.workspaceId ?? "unknown",
      cloudUrl: data.cloudUrl,
    };
  }
  return { status: "error", message: data?.message };
}

async function waitForCliToken(params: {
  baseUrl: string;
  code: string;
  timeoutMs?: number;
  pollMs?: number;
}): Promise<{ token: string; workspaceId: string; cloudUrl?: string }> {
  const timeoutMs = params.timeoutMs ?? DEFAULT_CLOUD_TIMEOUT_MS;
  const pollMs = params.pollMs ?? DEFAULT_CLOUD_POLL_MS;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await fetchCliTokenStatus(params.baseUrl, params.code);
    if (status.status === "authorized") {
      return {
        token: status.token,
        workspaceId: status.workspaceId,
        cloudUrl: status.cloudUrl,
      };
    }
    if (status.status === "expired") {
      throw new Error("Authorization expired. Please retry.");
    }
    if (status.status === "error" && status.message) {
      throw new Error(status.message);
    }
    await sleep(pollMs);
  }
  throw new Error("Authorization timed out. Please retry.");
}

async function storeHubToken(params: {
  token: string;
  workspaceId?: string;
}): Promise<{ storedInKeychain: boolean; account: string; envVar?: string }> {
  const account = params.workspaceId
    ? `workspace:${params.workspaceId}`
    : "default";
  const service = "nexus-cloud";
  const authId = "token";
  const now = new Date().toISOString();
  let storedInKeychain = false;
  let record: CredentialRecord;

  if (process.platform === "darwin") {
    storedInKeychain = await storeKeychainSecret({
      service: `nexus.${service}`,
      account,
      value: params.token,
    });
  }

  let envVar: string | undefined;
  if (storedInKeychain) {
    record = {
      owner: "user",
      type: "token",
      configuredAt: now,
      storage: { provider: "keychain", service: `nexus.${service}`, account },
    };
  } else {
    envVar = resolveDefaultEnvVar({ service, type: "token" });
    process.env[envVar] = params.token;
    record = {
      owner: "user",
      type: "token",
      configuredAt: now,
      storage: { provider: "env", var: envVar },
    };
  }

  await writeCredentialRecord(service, account, authId, record);
  await scanCredentials();
  return { storedInKeychain, account, envVar };
}

function parseCloudLoginArgs(args: string[]): CloudLoginArgs {
  let baseUrl = getHubBaseUrl();
  let timeoutMs = DEFAULT_CLOUD_TIMEOUT_MS;
  let pollMs = DEFAULT_CLOUD_POLL_MS;
  let apiToken: string | undefined;
  let showHelp = false;
  const extraArgs: string[] = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      showHelp = true;
      continue;
    }
    if (arg === "--base" || arg === "--website-url" || arg === "--hub-url") {
      const next = args[i + 1];
      if (next) {
        baseUrl = next;
        i += 1;
      }
      continue;
    }
    if (arg === "--timeout") {
      const next = args[i + 1];
      const seconds = next ? Number(next) : Number.NaN;
      if (Number.isFinite(seconds)) {
        timeoutMs = seconds * 1000;
        i += 1;
      }
      continue;
    }
    if (arg === "--poll") {
      const next = args[i + 1];
      const seconds = next ? Number(next) : Number.NaN;
      if (Number.isFinite(seconds)) {
        pollMs = seconds * 1000;
        i += 1;
      }
      continue;
    }
    if (arg === "--api-token") {
      const next = args[i + 1];
      if (next) {
        apiToken = next;
        i += 1;
      }
      continue;
    }
    extraArgs.push(arg);
  }

  return {
    baseUrl,
    timeoutMs,
    pollMs,
    apiToken,
    showHelp,
    extraArgs,
  };
}

function printCloudLoginHelp() {
  console.log(`Usage: nexus cloud login [options]

Options:
  --base <url>          Website base URL (default getnexus.sh)
  --website-url <url>   Alias for --base
  --timeout <seconds>   Auth timeout in seconds (default 120)
  --poll <seconds>      Polling interval in seconds (default 2)
  --api-token <token>   Use an existing token (skip browser auth)
  --help                Show this help message
`);
}

function getCloudPassthroughArgs(): string[] {
  const argv = process.argv.slice(2);
  const cloudIndex = argv.indexOf("cloud");
  if (cloudIndex === -1) return [];
  return argv.slice(cloudIndex + 1);
}

function hasNativeCloudRoot(root: string): boolean {
  return fs.existsSync(path.join(root, "native", "nexus-cloud", "Cargo.toml"));
}

function resolveRepoRoot(
  argv1: string | undefined = process.argv[1],
): string | null {
  if (!argv1) return null;
  const normalized = path.resolve(argv1);
  const parts = normalized.split(path.sep);
  const srcIndex = parts.lastIndexOf("src");
  const distIndex = parts.lastIndexOf("dist");
  if (srcIndex !== -1) {
    const root = parts.slice(0, srcIndex).join(path.sep);
    if (hasNativeCloudRoot(root)) return root;
  }
  if (distIndex !== -1) {
    const root = parts.slice(0, distIndex).join(path.sep);
    if (hasNativeCloudRoot(root)) return root;
  }

  let dir = path.dirname(normalized);
  for (let i = 0; i < 8; i += 1) {
    if (hasNativeCloudRoot(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function resolveModuleRoot(): string | null {
  try {
    let dir = path.dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 6; i += 1) {
      if (fs.existsSync(path.join(dir, "package.json"))) return dir;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    return null;
  }
  return null;
}

function resolvePackageRoot(
  argv1: string | undefined = process.argv[1],
): string | null {
  const moduleRoot = resolveModuleRoot();
  if (moduleRoot) return moduleRoot;
  if (!argv1) return null;
  let normalized = path.resolve(argv1);
  try {
    normalized = fs.realpathSync(normalized);
  } catch {
    // ignore
  }
  const parts = normalized.split(path.sep);
  const distIndex = parts.lastIndexOf("dist");
  if (distIndex !== -1) {
    return parts.slice(0, distIndex).join(path.sep);
  }
  return null;
}

function resolveBundledCloudBinary(packageRoot: string): string | null {
  const ext = process.platform === "win32" ? ".exe" : "";
  const platformId = `${process.platform}-${process.arch}`;
  const candidates = [
    path.join(
      packageRoot,
      "dist",
      "native",
      "nexus-cloud",
      platformId,
      `nexus-cloud-rs${ext}`,
    ),
    path.join(
      packageRoot,
      "dist",
      "native",
      "nexus-cloud",
      `nexus-cloud-rs${ext}`,
    ),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function resolveCloudRunner(args: string[]): CloudRunner {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (!env.NEXUS_HOME && NEXUS_ROOT) {
    env.NEXUS_HOME = NEXUS_ROOT;
  }
  const override = env.NEXUS_CLOUD_BIN?.trim();
  if (override) {
    return { command: override, args, env };
  }

  const packageRoot = resolvePackageRoot();
  if (packageRoot) {
    const bundled = resolveBundledCloudBinary(packageRoot);
    if (bundled) {
      return { command: bundled, args, env };
    }
  }

  const repoRoot = resolveRepoRoot();
  if (repoRoot) {
    const nativeRoot = path.join(repoRoot, "native", "nexus-cloud");
    const releaseBin = path.join(nativeRoot, "target", "release", "cli");
    const debugBin = path.join(nativeRoot, "target", "debug", "cli");
    if (fs.existsSync(releaseBin) || fs.existsSync(debugBin)) {
      return {
        command: fs.existsSync(releaseBin) ? releaseBin : debugBin,
        args,
        cwd: nativeRoot,
        env,
      };
    }
    return {
      command: "cargo",
      args: ["run", "--package", "cli", "--", ...args],
      cwd: nativeRoot,
      env,
    };
  }

  return { command: "nexus-cloud-rs", args, env };
}

async function runCloudCommand(args: string[]) {
  const runner = resolveCloudRunner(args);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(runner.command, runner.args, {
      cwd: runner.cwd,
      env: runner.env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `Cloud command failed (exit ${code ?? "unknown"}${signal ? `, ${signal}` : ""})`,
        ),
      );
    });
  });
}

async function handleCloudLogin(rawArgs: string[]) {
  const parsed = parseCloudLoginArgs(rawArgs);
  if (parsed.showHelp) {
    printCloudLoginHelp();
    return;
  }

  let token = parsed.apiToken?.trim();
  let workspaceId: string | undefined;
  let cloudUrl: string | undefined;

  if (!token) {
    const code = createCliAuthCode();
    const authUrl = new URL("/auth/cli", parsed.baseUrl);
    authUrl.searchParams.set("code", code);

    console.log(`Open this URL to authorize:\n${authUrl.toString()}\n`);
    const opened = await openUrl(authUrl.toString());
    if (!opened) {
      console.log("Tip: open the URL manually if it didn't open.");
    }

    console.log("Waiting for authorization...");
    const result = await waitForCliToken({
      baseUrl: parsed.baseUrl,
      code,
      timeoutMs: parsed.timeoutMs,
      pollMs: parsed.pollMs,
    });
    token = result.token;
    workspaceId = result.workspaceId;
    cloudUrl = result.cloudUrl;
  }

  if (!token) {
    throw new Error("Missing token for cloud login.");
  }

  const stored = await storeHubToken({ token, workspaceId });
  if (workspaceId) {
    console.log(`✅ CLI authorized for workspace ${workspaceId}`);
  } else {
    console.log("✅ CLI authorized");
  }
  console.log(
    stored.storedInKeychain
      ? "   Token stored in keychain"
      : `   Token stored in env var ${stored.envVar ?? ""}`.trim(),
  );
  if (!stored.storedInKeychain && stored.envVar) {
    console.log(`   Persist it in your shell: export ${stored.envVar}=...`);
  }
  if (cloudUrl) {
    console.log(`   Cloud URL: ${cloudUrl}`);
  }

  await runCloudCommand([
    "login",
    "--api-token",
    token,
    "--website-url",
    parsed.baseUrl,
    ...parsed.extraArgs,
  ]);
}

export function registerCloudCommand(program: Command) {
  program
    .command("cloud")
    .description("Nexus Cloud (Rust)")
    .helpOption(false)
    .allowUnknownOption()
    .argument("[args...]", "Arguments forwarded to the Rust cloud CLI")
    .action(async () => {
      const passthrough = getCloudPassthroughArgs();
      if (passthrough.length === 0) {
        await runCloudCommand(["--help"]);
        return;
      }
      if (passthrough[0] === "login") {
        const hasHelp = passthrough.some(
          (arg) => arg === "--help" || arg === "-h",
        );
        if (hasHelp) {
          printCloudLoginHelp();
          return;
        }
        await handleCloudLogin(passthrough.slice(1));
        return;
      }
      await runCloudCommand(passthrough);
    });
}
