import { exec, execFile } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { resolveCredentialsDir } from "../config/paths.js";

export { resolveCredentialsDir };

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

export type CredentialOwner = "shared" | "user" | `agent:${string}`;
export type CredentialType = "api_key" | "oauth" | "token" | "config";

export type CredentialStorage =
  | {
      provider: "1password";
      vault: string;
      item: string;
      fields: Record<string, string>;
      format?: "raw" | "json";
      jsonPath?: string;
    }
  | {
      provider: "keychain";
      service: string;
      account: string;
      format?: "raw" | "json";
      jsonPath?: string;
    }
  | {
      provider: "env";
      var: string;
      format?: "raw" | "json";
      jsonPath?: string;
    }
  | {
      provider: "external";
      command?: string;
      syncCommand?: string;
      format?: "raw" | "json";
      jsonPath?: string;
    };

export type CredentialRecord = {
  owner: CredentialOwner;
  type: CredentialType;
  configuredAt?: string;
  lastVerified?: string;
  lastUsed?: string;
  lastError?: string | null;
  storage: CredentialStorage;
  metadata?: Record<string, unknown>;
  key?: string;
  token?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string | number;
};

export type CredentialEntry = {
  service: string;
  account: string;
  authId: string;
  filePath: string;
  record: CredentialRecord;
};

export type CredentialUsageStats = {
  lastUsed?: number;
  cooldownUntil?: number;
  errorCount?: number;
};

export type CredentialIndexAccount = {
  id: string;
  owner?: CredentialOwner;
  auths: string[];
  status?: "active" | "ready" | "broken";
  lastUsed?: string;
  lastError?: string | null;
};

export type CredentialIndexService = {
  type?: string;
  hasConfig?: boolean;
  accounts: CredentialIndexAccount[];
};

export type CredentialIndex = {
  version: number;
  lastUpdated: string;
  services: Record<string, CredentialIndexService>;
  order?: Record<string, string[]>;
  lastGood?: Record<string, string>;
  usageStats?: Record<string, CredentialUsageStats>;
};

export function resolveCredentialIndexPath(): string {
  return path.join(resolveCredentialsDir(), "index.json");
}

export function resolveCredentialPath(
  service: string,
  account: string,
  authId: string,
): string {
  return path.join(
    resolveCredentialsDir(),
    service,
    "accounts",
    account,
    "auth",
    `${authId}.json`,
  );
}

export function readCredentialRecordSync(
  filePath: string,
): CredentialRecord | null {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as CredentialRecord;
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.type || !parsed.storage) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function readCredentialRecord(
  filePath: string,
): Promise<CredentialRecord | null> {
  try {
    const raw = await fsp.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as CredentialRecord;
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.type || !parsed.storage) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCredentialRecordSync(
  service: string,
  account: string,
  authId: string,
  record: CredentialRecord,
) {
  const filePath = resolveCredentialPath(service, account, authId);
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(record, null, 2)}\n`, "utf-8");
  fs.chmodSync(filePath, 0o600);
}

export async function writeCredentialRecord(
  service: string,
  account: string,
  authId: string,
  record: CredentialRecord,
) {
  const filePath = resolveCredentialPath(service, account, authId);
  const dir = path.dirname(filePath);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(
    filePath,
    `${JSON.stringify(record, null, 2)}\n`,
    "utf-8",
  );
}

function isDirentDirectory(entry: fs.Dirent | string): entry is fs.Dirent {
  return typeof entry !== "string";
}

export function listCredentialEntriesSync(): CredentialEntry[] {
  const root = resolveCredentialsDir();
  if (!fs.existsSync(root)) return [];
  const services = fs.readdirSync(root, { withFileTypes: true });
  const entries: CredentialEntry[] = [];
  for (const serviceEntry of services) {
    if (!isDirentDirectory(serviceEntry) || !serviceEntry.isDirectory())
      continue;
    const service = serviceEntry.name;
    const accountsDir = path.join(root, service, "accounts");
    if (!fs.existsSync(accountsDir)) continue;
    const accounts = fs.readdirSync(accountsDir, { withFileTypes: true });
    for (const accountEntry of accounts) {
      if (!isDirentDirectory(accountEntry) || !accountEntry.isDirectory())
        continue;
      const account = accountEntry.name;
      const authDir = path.join(accountsDir, account, "auth");
      if (!fs.existsSync(authDir)) continue;
      const authFiles = fs.readdirSync(authDir, { withFileTypes: true });
      for (const authEntry of authFiles) {
        if (!isDirentDirectory(authEntry) || authEntry.isDirectory()) continue;
        if (!authEntry.name.endsWith(".json")) continue;
        const authId = authEntry.name.replace(/\.json$/, "");
        const filePath = path.join(authDir, authEntry.name);
        const record = readCredentialRecordSync(filePath);
        if (!record) continue;
        entries.push({ service, account, authId, filePath, record });
      }
    }
  }
  return entries;
}

export async function listCredentialEntries(): Promise<CredentialEntry[]> {
  const root = resolveCredentialsDir();
  if (!fs.existsSync(root)) return [];
  const services = await fsp.readdir(root, { withFileTypes: true });
  const entries: CredentialEntry[] = [];
  for (const serviceEntry of services) {
    if (!isDirentDirectory(serviceEntry) || !serviceEntry.isDirectory())
      continue;
    const service = serviceEntry.name;
    const accountsDir = path.join(root, service, "accounts");
    if (!fs.existsSync(accountsDir)) continue;
    const accounts = await fsp.readdir(accountsDir, { withFileTypes: true });
    for (const accountEntry of accounts) {
      if (!isDirentDirectory(accountEntry) || !accountEntry.isDirectory())
        continue;
      const account = accountEntry.name;
      const authDir = path.join(accountsDir, account, "auth");
      if (!fs.existsSync(authDir)) continue;
      const authFiles = await fsp.readdir(authDir, { withFileTypes: true });
      for (const authEntry of authFiles) {
        if (!isDirentDirectory(authEntry) || authEntry.isDirectory()) continue;
        if (!authEntry.name.endsWith(".json")) continue;
        const authId = authEntry.name.replace(/\.json$/, "");
        const filePath = path.join(authDir, authEntry.name);
        const record = await readCredentialRecord(filePath);
        if (!record) continue;
        entries.push({ service, account, authId, filePath, record });
      }
    }
  }
  return entries;
}

export function buildCredentialIndex(
  entries: CredentialEntry[],
): CredentialIndex {
  const services: Record<string, CredentialIndexService> = {};
  for (const entry of entries) {
    const service = services[entry.service] ?? { accounts: [] };
    const account = service.accounts.find((acc) => acc.id === entry.account);
    const status: CredentialIndexAccount["status"] = entry.record.lastError
      ? "broken"
      : entry.record.lastUsed
        ? "active"
        : "ready";
    if (account) {
      if (!account.auths.includes(entry.authId))
        account.auths.push(entry.authId);
      if (entry.record.lastError) {
        account.status = "broken";
        account.lastError = entry.record.lastError;
      } else if (account.status !== "broken" && entry.record.lastUsed) {
        account.status = "active";
        account.lastUsed = entry.record.lastUsed;
      }
    } else {
      service.accounts.push({
        id: entry.account,
        owner: entry.record.owner,
        auths: [entry.authId],
        status,
        lastUsed: entry.record.lastUsed,
        lastError: entry.record.lastError ?? null,
      });
    }
    services[entry.service] = service;
  }
  return {
    version: 1,
    lastUpdated: new Date().toISOString(),
    services,
  };
}

export function readCredentialIndexSync(): CredentialIndex | null {
  const indexPath = resolveCredentialIndexPath();
  try {
    const raw = fs.readFileSync(indexPath, "utf-8");
    const parsed = JSON.parse(raw) as CredentialIndex;
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.services || typeof parsed.services !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function readCredentialIndex(): Promise<CredentialIndex | null> {
  const indexPath = resolveCredentialIndexPath();
  try {
    const raw = await fsp.readFile(indexPath, "utf-8");
    const parsed = JSON.parse(raw) as CredentialIndex;
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.services || typeof parsed.services !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCredentialIndexSync(index: CredentialIndex) {
  const indexPath = resolveCredentialIndexPath();
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf-8");
}

export async function writeCredentialIndex(index: CredentialIndex) {
  const indexPath = resolveCredentialIndexPath();
  await fsp.mkdir(path.dirname(indexPath), { recursive: true });
  await fsp.writeFile(
    indexPath,
    `${JSON.stringify(index, null, 2)}\n`,
    "utf-8",
  );
}

export function ensureCredentialIndexSync(): CredentialIndex {
  const existing = readCredentialIndexSync();
  if (existing) return existing;
  const index = buildCredentialIndex(listCredentialEntriesSync());
  writeCredentialIndexSync(index);
  return index;
}

function resolveStorageField(
  storage: CredentialStorage,
  field: string,
): string | null {
  if (storage.provider !== "1password") return null;
  const exact = storage.fields?.[field];
  if (exact) return exact;
  if (field === "key")
    return storage.fields?.apiKey ?? storage.fields?.token ?? null;
  if (field === "accessToken")
    return storage.fields?.accessToken ?? storage.fields?.token ?? null;
  return null;
}

async function readRawFromStorage(
  storage: CredentialStorage,
  field: "key" | "token" | "accessToken",
): Promise<string | null> {
  if (storage.provider === "keychain") {
    try {
      const { stdout } = await execFileAsync("security", [
        "find-generic-password",
        "-s",
        storage.service,
        "-a",
        storage.account,
        "-w",
      ]);
      const trimmed = stdout.trim();
      return trimmed ? trimmed : null;
    } catch {
      return null;
    }
  }
  if (storage.provider === "env") {
    const envValue = process.env[storage.var];
    if (typeof envValue !== "string") return null;
    const trimmed = envValue.trim();
    return trimmed ? trimmed : null;
  }
  if (storage.provider === "1password") {
    const fieldName = resolveStorageField(storage, field);
    if (!fieldName) return null;
    const itemRef = `op://${storage.vault}/${storage.item}/${fieldName}`;
    try {
      const { stdout } = await execFileAsync("op", ["read", itemRef]);
      const trimmed = stdout.trim();
      return trimmed ? trimmed : null;
    } catch {
      return null;
    }
  }
  if (storage.provider === "external") {
    try {
      const command = storage.command ?? storage.syncCommand;
      if (!command) return null;
      const { stdout } = await execAsync(command);
      const trimmed = stdout.trim();
      return trimmed ? trimmed : null;
    } catch {
      return null;
    }
  }
  return null;
}

async function readSecretFromStorage(
  record: CredentialRecord,
  field: "key" | "token" | "accessToken",
): Promise<string | null> {
  const storage = record.storage;
  const raw = await readRawFromStorage(storage, field);
  if (!raw) return null;
  const wantsJson = storage.format === "json" || Boolean(storage.jsonPath);
  if (!wantsJson) return raw;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const pathSpec = storage.jsonPath ?? field;
    const resolved = resolveJsonPath(parsed, pathSpec);
    if (typeof resolved === "string") return resolved.trim() || null;
    if (typeof resolved === "number") return String(resolved);
    return null;
  } catch {
    return null;
  }
}

function resolveJsonPath(value: unknown, pathSpec: string): unknown {
  const parts = pathSpec.split(".").filter(Boolean);
  let current: unknown = value;
  for (const part of parts) {
    if (!current || typeof current !== "object") return undefined;
    const match = /^(.+?)\[(\d+)\]$/.exec(part);
    if (match) {
      const [, key, indexRaw] = match;
      const index = Number.parseInt(indexRaw, 10);
      if (Number.isNaN(index)) return undefined;
      const next = (current as Record<string, unknown>)[key ?? ""];
      if (!Array.isArray(next)) return undefined;
      current = next[index];
      continue;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function resolveDefaultEnvVar(params: {
  service: string;
  type: CredentialType;
}): string {
  const service = params.service.toLowerCase();
  const type = params.type;
  const known: Record<string, Partial<Record<CredentialType, string>>> = {
    anthropic: {
      api_key: "ANTHROPIC_API_KEY",
      token: "ANTHROPIC_OAUTH_TOKEN",
      oauth: "ANTHROPIC_OAUTH_TOKEN",
    },
    openai: { api_key: "OPENAI_API_KEY" },
    gemini: { api_key: "GEMINI_API_KEY" },
    "brave-search": { api_key: "BRAVE_API_KEY" },
    github: { token: "GITHUB_TOKEN" },
    "github-copilot": { token: "COPILOT_GITHUB_TOKEN" },
    discord: { token: "DISCORD_BOT_TOKEN" },
    slack: { token: "SLACK_BOT_TOKEN" },
    openrouter: { api_key: "OPENROUTER_API_KEY" },
    zai: { api_key: "ZAI_API_KEY" },
    minimax: { api_key: "MINIMAX_API_KEY", token: "MINIMAX_API_KEY" },
    "openai-codex": { oauth: "NEXUS_OPENAI_CODEX_TOKEN" },
    "google-antigravity": { oauth: "NEXUS_GOOGLE_ANTIGRAVITY_TOKEN" },
    chutes: { oauth: "NEXUS_CHUTES_TOKEN" },
    "nexus-cloud": { token: "NEXUS_CLOUD_TOKEN" },
    "nexus-hub": { token: "NEXUS_HUB_TOKEN" },
  };
  const mapped = known[service]?.[type];
  if (mapped) return mapped;
  const suffix =
    type === "api_key"
      ? "API_KEY"
      : type === "oauth"
        ? "OAUTH_TOKEN"
        : type === "token"
          ? "TOKEN"
          : "CONFIG";
  const normalized = service.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  return `NEXUS_${normalized}_${suffix}`;
}

export async function resolveOAuthBundle(record: CredentialRecord): Promise<{
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string | number;
}> {
  if (record.type !== "oauth") return {};
  const raw = await readRawFromStorage(record.storage, "accessToken");
  if (!raw) return {};
  const wantsJson =
    record.storage.format === "json" || Boolean(record.storage.jsonPath);
  if (!wantsJson) {
    return { accessToken: raw, expiresAt: record.expiresAt };
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (record.storage.jsonPath) {
      const access = resolveJsonPath(parsed, record.storage.jsonPath);
      if (typeof access === "string") {
        return { accessToken: access };
      }
    }
    const accessToken =
      typeof parsed.accessToken === "string"
        ? parsed.accessToken
        : typeof parsed.access_token === "string"
          ? parsed.access_token
          : undefined;
    const refreshToken =
      typeof parsed.refreshToken === "string"
        ? parsed.refreshToken
        : typeof parsed.refresh_token === "string"
          ? parsed.refresh_token
          : undefined;
    const expiresAt =
      typeof parsed.expiresAt === "number" || typeof parsed.expiresAt === "string"
        ? parsed.expiresAt
        : typeof parsed.expires_at === "number" || typeof parsed.expires_at === "string"
          ? parsed.expires_at
          : undefined;
    return { accessToken, refreshToken, expiresAt };
  } catch {
    return {};
  }
}

export async function storeKeychainSecret(params: {
  service: string;
  account: string;
  value: string;
}): Promise<boolean> {
  try {
    await execFileAsync("security", [
      "add-generic-password",
      "-U",
      "-s",
      params.service,
      "-a",
      params.account,
      "-w",
      params.value,
    ]);
    return true;
  } catch {
    return false;
  }
}

export async function resolveCredentialValue(
  record: CredentialRecord,
): Promise<{ value: string; field: "key" | "token" | "accessToken" } | null> {
  if (record.type === "api_key") {
    const value = await readSecretFromStorage(record, "key");
    if (!value) return null;
    return { value, field: "key" };
  }
  if (record.type === "token") {
    const value = await readSecretFromStorage(record, "token");
    if (!value) return null;
    return { value, field: "token" };
  }
  if (record.type === "oauth") {
    const value = await readSecretFromStorage(record, "accessToken");
    if (!value) return null;
    return { value, field: "accessToken" };
  }
  return null;
}
