#!/usr/bin/env node
import { execFile } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import fs from "node:fs";
import { createServer as createNetServer, type AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { createPasswordHash } from "../src/crypto.js";
import { FrontdoorStore } from "../src/frontdoor-store.js";
import { publishAdapterRelease } from "../src/publish-adapter-release.js";
import { DockerSandboxProvider } from "../src/sandbox-provider.js";
import { createFrontdoorServer } from "../src/server.js";
import type { FrontdoorConfig } from "../src/types.js";

const execFileAsync = promisify(execFile);
const OWNER_USER_ID = "u-owner";
const OWNER_ACCOUNT_ID = "config-account:tenant-dev";

async function reservePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("port_reservation_failed")));
        return;
      }
      const port = address.port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function listenOnPort(server: ReturnType<typeof createFrontdoorServer>["server"], port: number) {
  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function boolEnv(name: string, defaultValue = false): boolean {
  const raw = text(process.env[name]).toLowerCase();
  if (!raw) {
    return defaultValue;
  }
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function buildConfig(params: { origin: string; frontdoorStorePath: string }): FrontdoorConfig {
  const user = {
    id: OWNER_USER_ID,
    username: "owner",
    passwordHash: createPasswordHash("changeme"),
    tenantId: "tenant-dev",
    entityId: "entity-owner",
    displayName: "Owner",
    email: "owner@example.com",
    roles: ["operator"],
    scopes: ["*"],
    disabled: false,
  };
  return {
    host: "127.0.0.1",
    port: Number(new URL(params.origin).port || "0"),
    baseUrl: params.origin,
    internalBaseUrl: params.origin,
    passwordAuthEnabled: true,
    sessionCookieName: "nexus_fd_session",
    sessionTtlSeconds: 3600,
    sessionStorePath: undefined,
    frontdoorStorePath: params.frontdoorStorePath,
    operatorUserIds: new Set([OWNER_USER_ID]),
    devCreatorEmails: new Set<string>(),
    inviteTtlSeconds: 7 * 24 * 60 * 60,
    runtimeTokenIssuer: "https://frontdoor.test",
    runtimeTokenAudience: "runtime-api",
    runtimeTokenSecret: "frontdoor-secret-test",
    runtimeTokenActiveKid: undefined,
    runtimeTokenSecretsByKid: new Map(),
    runtimeTokenTtlSeconds: 600,
    runtimeRefreshTtlSeconds: 86400,
    rateLimits: {
      loginAttempts: {
        windowSeconds: 60,
        maxAttempts: 30,
        blockSeconds: 60,
      },
      loginFailures: {
        windowSeconds: 15 * 60,
        maxAttempts: 8,
        blockSeconds: 15 * 60,
      },
      tokenEndpoints: {
        windowSeconds: 60,
        maxAttempts: 120,
        blockSeconds: 60,
      },
      proxyRequests: {
        windowSeconds: 60,
        maxAttempts: 1000,
        blockSeconds: 30,
      },
    },
    tenants: new Map([
      [
        "tenant-dev",
        {
          id: "tenant-dev",
          runtimeUrl: params.origin,
          runtimePublicBaseUrl: params.origin,
        },
      ],
    ]),
    usersByUsername: new Map([[user.username, user]]),
    usersById: new Map([[user.id, user]]),
    oidcEnabled: false,
    oidcProviders: new Map(),
    oidcMappings: [],
    autoProvision: {
      enabled: false,
      storePath: undefined,
      providers: [],
      tenantIdPrefix: "tenant",
      defaultRoles: ["operator"],
      defaultScopes: ["operator.admin"],
      command: undefined,
      commandTimeoutMs: 120000,
    },
    billing: {
      provider: "mock",
      webhookSecret: "billing-webhook-secret-test",
      checkoutSuccessUrl: "https://frontdoor.test/billing/success",
      checkoutCancelUrl: "https://frontdoor.test/billing/cancel",
      stripeSecretKey: undefined,
      stripeApiBaseUrl: "https://api.stripe.com",
      stripePriceIdsByPlan: new Map(),
    },
    vpsAccess: {
      sshKeyPath: "/tmp/test-ssh-key",
      sshUser: "root",
    },
    appStoragePath: path.join(os.tmpdir(), `frontdoor-local-sandbox-slack-${randomUUID()}`),
  };
}

async function ensureRuntimeSandboxImage(params: { imageName: string; nexRoot: string }): Promise<void> {
  const forceRebuild = boolEnv("FRONTDOOR_LOCAL_SANDBOX_FORCE_RUNTIME_IMAGE_REBUILD", false);
  if (forceRebuild) {
    await execFileAsync("docker", ["image", "rm", "-f", params.imageName], {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    }).catch(() => {});
  }
  try {
    await execFileAsync("docker", ["image", "inspect", params.imageName], {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });
    return;
  } catch {}
  await execFileAsync(
    "docker",
    [
      "build",
      "-t",
      params.imageName,
      "-f",
      path.join(params.nexRoot, "scripts/e2e/Dockerfile"),
      params.nexRoot,
    ],
    {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    },
  );
}

function seedApiToken(config: FrontdoorConfig): string {
  if (!config.frontdoorStorePath) {
    throw new Error("missing_frontdoor_store_path");
  }
  const token = `nex_t_${randomBytes(24).toString("base64url")}`;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const store = new FrontdoorStore(config.frontdoorStorePath);
  try {
    const account = store.getAccountsForUser(OWNER_USER_ID)[0];
    if (!account) {
      throw new Error("missing_owner_account");
    }
    store.addCredits({
      accountId: account.accountId,
      amountCents: 500,
      type: "deposit",
      description: "local sandbox slack pilot credits",
    });
    store.createApiToken({
      tokenId: `tok-${randomUUID()}`,
      tokenHash,
      userId: OWNER_USER_ID,
      accountId: OWNER_ACCOUNT_ID,
      displayName: "Local Sandbox Slack Pilot",
    });
  } finally {
    store.close();
  }
  return token;
}

function parseJsonObjects(raw: string): Array<Record<string, unknown>> {
  const items: Array<Record<string, unknown>> = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) {
      continue;
    }
    try {
      items.push(JSON.parse(trimmed) as Record<string, unknown>);
    } catch {}
  }
  return items;
}

function readPackageMetadata(packageRoot: string): { packageId: string; version: string; tarballPath: string } {
  const manifestPath = path.join(packageRoot, "adapter.nexus.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { id?: unknown; version?: unknown };
  const packageId = text(manifest.id);
  const version = text(manifest.version);
  if (!packageId || !version) {
    throw new Error(`invalid_adapter_manifest:${manifestPath}`);
  }
  return {
    packageId,
    version,
    tarballPath: path.join(packageRoot, "dist", `${packageId}-${version}.tar.gz`),
  };
}

async function ensurePackageTarball(packageRoot: string): Promise<{ packageId: string; version: string; tarballPath: string }> {
  const metadata = readPackageMetadata(packageRoot);
  const explicitTarball = text(process.env.FRONTDOOR_LOCAL_SANDBOX_PACKAGE_TARBALL);
  if (explicitTarball) {
    if (!fs.existsSync(explicitTarball)) {
      throw new Error(`missing_explicit_package_tarball:${explicitTarball}`);
    }
    return {
      packageId: metadata.packageId,
      version: metadata.version,
      tarballPath: explicitTarball,
    };
  }
  if (!boolEnv("FRONTDOOR_LOCAL_SANDBOX_FORCE_PACKAGE_RELEASE", true) && fs.existsSync(metadata.tarballPath)) {
    return metadata;
  }
  const scriptPath = path.join(packageRoot, "scripts", "package-release.sh");
  const child = await execFileAsync("bash", [scriptPath], {
    cwd: packageRoot,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  const payload = [...parseJsonObjects(child.stdout)].reverse().find((item) => text(item.archive_path));
  const archivePath = text(payload?.archive_path) || metadata.tarballPath;
  if (!fs.existsSync(archivePath)) {
    throw new Error(`package_release_missing_archive:${archivePath}`);
  }
  return {
    packageId: metadata.packageId,
    version: metadata.version,
    tarballPath: archivePath,
  };
}

async function publishLocalAdapterRelease(params: {
  config: FrontdoorConfig;
  packageRoot: string;
  tarballPath: string;
}) {
  if (!params.config.frontdoorStorePath) {
    throw new Error("missing_frontdoor_store_path");
  }
  const store = new FrontdoorStore(params.config.frontdoorStorePath);
  try {
    return await publishAdapterRelease({
      store,
      packageRoot: params.packageRoot,
      tarballPath: params.tarballPath,
      targetOs: "linux",
      targetArch: "arm64",
    });
  } finally {
    store.close();
  }
}

async function resolveLocalSlackCredentials(nexRoot: string, connectionId: string) {
  const storageModule = await import(
    pathToFileURL(path.join(nexRoot, "src/storage/index.ts")).href
  );
  const credentialsModule = await import(
    pathToFileURL(path.join(nexRoot, "src/runtime/domains/adapters/connection-credentials.ts")).href
  );
  const { openInitializedLedger } = storageModule as {
    openInitializedLedger: (domain: string, env: NodeJS.ProcessEnv) => any;
  };
  const { resolveConnectionCredential } = credentialsModule as {
    resolveConnectionCredential: (input: { env: NodeJS.ProcessEnv; credentialRef: string }) => {
      fields: Record<string, string>;
    };
  };

  const db = openInitializedLedger("identity", process.env);
  try {
    const row = db
      .prepare(
        [
          "SELECT connection_id, adapter_id, credential_ref",
          "FROM adapter_connections WHERE connection_id = ? LIMIT 1",
        ].join(" "),
      )
      .get(connectionId);
    if (!row || row.connection_id !== connectionId) {
      throw new Error(`local Slack connection not found: ${connectionId}`);
    }
    if (row.adapter_id !== "slack") {
      throw new Error(`connection ${connectionId} is not a Slack connection`);
    }
    const credentialRef =
      typeof row.credential_ref === "string" && row.credential_ref.trim().length > 0
        ? row.credential_ref.trim()
        : `slack/${connectionId}`;
    const credential = resolveConnectionCredential({
      env: process.env,
      credentialRef,
    });
    const botToken = credential.fields.bot_token?.trim();
    const appToken = credential.fields.app_token?.trim();
    if (!botToken || !appToken) {
      throw new Error(`Slack credential ${credentialRef} is missing bot_token/app_token fields`);
    }
    return { botToken, appToken };
  } finally {
    db.close();
  }
}

async function main(): Promise<void> {
  const frontdoorDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const repoRoot = path.resolve(frontdoorDir, "..");
  const nexRoot = path.join(repoRoot, "nex");
  const defaultPackageRoot = path.join(repoRoot, "packages", "adapters", "slack");
  const packageRoot = path.resolve(text(process.env.FRONTDOOR_LOCAL_SANDBOX_PACKAGE_ROOT) || defaultPackageRoot);
  const runtimeImage =
    text(process.env.FRONTDOOR_LOCAL_SANDBOX_RUNTIME_IMAGE) ||
    "frontdoor-sandbox-target:local";
  const proofBundleDir =
    text(process.env.NEXUS_CLEANROOM_PROOF_BUNDLE_DIR) ||
    fs.mkdtempSync(path.join(os.tmpdir(), "frontdoor-local-sandbox-slack-proof-"));
  const hostStateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "frontdoor-local-sandbox-state-"));
  const keepState = boolEnv("FRONTDOOR_LOCAL_SANDBOX_KEEP_STATE", false);
  const frontdoorStorePath = path.join(os.tmpdir(), `frontdoor-local-sandbox-${randomUUID()}.db`);
  const port = await reservePort();
  const origin = `http://127.0.0.1:${port}`;
  const config = buildConfig({ origin, frontdoorStorePath });

  const sourceConnectionId = text(process.env.SLACK_SOURCE_CONNECTION_ID) || "vrtly-slack";
  const channelId = text(process.env.SLACK_CHANNEL_ID);
  if (!channelId) {
    throw new Error("missing SLACK_CHANNEL_ID");
  }

  const botToken = text(process.env.SLACK_BOT_TOKEN);
  const appToken = text(process.env.SLACK_APP_TOKEN);
  const resolvedSecrets =
    botToken && appToken
      ? { botToken, appToken }
      : await resolveLocalSlackCredentials(nexRoot, sourceConnectionId);

  await ensureRuntimeSandboxImage({
    imageName: runtimeImage,
    nexRoot,
  });

  const packageRelease = await ensurePackageTarball(packageRoot);
  const publishResult = await publishLocalAdapterRelease({
    config,
    packageRoot,
    tarballPath: packageRelease.tarballPath,
  });

  const frontdoor = createFrontdoorServer({
    config,
    namedCloudProviders: {
      sandbox: new DockerSandboxProvider({
        imageName: runtimeImage,
        hostStateRoot,
      }),
    },
    standardProvisionProviderName: "sandbox",
  });

  let wrapperStdout = "";
  let wrapperStderr = "";
  try {
    const liveOrigin = await listenOnPort(frontdoor.server, port);
    const apiToken = seedApiToken(frontdoor.config);
    const wrapper = await execFileAsync(
      "bash",
      [
        path.join(frontdoorDir, "scripts/frontdoor-cleanroom-docker-executor.sh"),
        "node",
        "./scripts/frontdoor-fresh-server-adapter-cleanroom-smoke.mjs",
      ],
      {
        cwd: frontdoorDir,
        env: {
          ...process.env,
          FRONTDOOR_SMOKE_ORIGIN: liveOrigin,
          FRONTDOOR_SMOKE_API_TOKEN: apiToken,
          FRONTDOOR_SMOKE_CLEANUP_MODE:
            text(process.env.FRONTDOOR_SMOKE_CLEANUP_MODE) || "destroy",
          FRONTDOOR_SMOKE_ADAPTERS: packageRelease.packageId,
          FRONTDOOR_SMOKE_ADAPTER_PROOF_COMMAND: "pnpm smoke:proof:slack-adapter",
          FRONTDOOR_CLEANROOM_FORCE_REBUILD:
            text(process.env.FRONTDOOR_CLEANROOM_FORCE_REBUILD) || "1",
          SLACK_BOT_TOKEN: resolvedSecrets.botToken,
          SLACK_APP_TOKEN: resolvedSecrets.appToken,
          SLACK_CHANNEL_ID: channelId,
          SLACK_THREAD_TS: text(process.env.SLACK_THREAD_TS),
          SLACK_PROOF_MESSAGE: text(process.env.SLACK_PROOF_MESSAGE),
          NEXUS_CLEANROOM_PROOF_BUNDLE_DIR: proofBundleDir,
        },
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
      },
    );
    wrapperStdout = wrapper.stdout;
    wrapperStderr = wrapper.stderr;

    const proofPath = path.join(proofBundleDir, "proof/fresh-server-adapter-cleanroom-smoke.json");
    const proof = JSON.parse(fs.readFileSync(proofPath, "utf8"));
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          origin: liveOrigin,
          runtime_image: runtimeImage,
          package_root: packageRoot,
          package_release: packageRelease,
          publish: publishResult,
          proof_bundle_dir: proofBundleDir,
          wrapper_stdout: wrapperStdout.trim() || null,
          wrapper_stderr: wrapperStderr.trim() || null,
          proof,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    frontdoor.server.close();
    if (!keepState) {
      fs.rmSync(frontdoorStorePath, { force: true });
      fs.rmSync(hostStateRoot, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        keep_state: boolEnv("FRONTDOOR_LOCAL_SANDBOX_KEEP_STATE", false),
      },
      null,
      2,
    )}\n`,
  );
  process.exit(1);
});
