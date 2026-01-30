#!/usr/bin/env bash
# rebrand-nexus.sh - Complete openclaw/moltbot/clawdbot → nexus rebrand (one-shot)
#
# This script performs a COMPLETE rebrand of openclaw/moltbot/clawdbot to nexus.
# It must handle everything automatically with zero manual intervention.
# After running: pnpm install && pnpm build && pnpm test must pass.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

echo "=== Nexus Complete Rebrand Script ==="
echo "Working directory: $ROOT_DIR"
echo ""

# Cross-platform sed in-place
sedi() {
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "$@"
  else
    sed -i "$@"
  fi
}

list_files() {
  rg --files \
    -g "*.ts" -g "*.tsx" -g "*.js" -g "*.json" -g "*.md" -g "*.sh" \
    -g "*.swift" -g "*.kt" -g "*.yml" -g "*.yaml" -g "*.xml" -g "*.plist" \
    -g "*.css" -g "*.html" -g "*.txt" \
    -g "!scripts/rebrand-nexus.sh"
}

apply_replacements() {
  local pattern="$1"
  local replacement="$2"
  local file_list="$3"
  while IFS= read -r file; do
    sedi "s|$pattern|$replacement|g" "$file"
  done < "$file_list"
}

# ============================================================================
# PHASE 1: Rename files containing openclaw/moltbot/clawdbot (basenames only)
# ============================================================================
echo "[Phase 1] Renaming files..."

rename_files() {
  local glob="$1"
  local from="$2"
  local to="$3"
  rg --files -g "$glob" -g "!scripts/rebrand-nexus.sh" | while IFS= read -r file; do
    local dir
    local base
    local newbase
    dir="$(dirname "$file")"
    base="$(basename "$file")"
    newbase="${base//$from/$to}"
    if [[ "$base" != "$newbase" ]]; then
      mv "$file" "$dir/$newbase"
    fi
  done
}

rename_files "*clawdbot*" "clawdbot" "nexus"
rename_files "*Clawdbot*" "Clawdbot" "Nexus"
rename_files "*moltbot*" "moltbot" "nexus"
rename_files "*Moltbot*" "Moltbot" "Nexus"
rename_files "*openclaw*" "openclaw" "nexus"
rename_files "*Openclaw*" "Openclaw" "Nexus"
rename_files "*OPENCLAW*" "OPENCLAW" "NEXUS"

echo "  Done renaming files"

# ============================================================================
# PHASE 2: Global replacements (code + tests + docs)
# ============================================================================
echo "[Phase 2] Global replacements..."

FILE_LIST="$(mktemp)"
list_files > "$FILE_LIST"

apply_replacements "Moltbot" "Nexus" "$FILE_LIST"
apply_replacements "Clawdbot" "Nexus" "$FILE_LIST"
apply_replacements "Openclaw" "Nexus" "$FILE_LIST"
apply_replacements "moltbot" "nexus" "$FILE_LIST"
apply_replacements "clawdbot" "nexus" "$FILE_LIST"
apply_replacements "openclaw" "nexus" "$FILE_LIST"
apply_replacements "MOLTBOT_" "NEXUS_" "$FILE_LIST"
apply_replacements "CLAWDBOT_" "NEXUS_" "$FILE_LIST"
apply_replacements "OPENCLAW_" "NEXUS_" "$FILE_LIST"

# Fix path strings: ~/.nexus → ~/nexus/state (including prefixes)
apply_replacements "~/.nexus/" "~/nexus/state/" "$FILE_LIST"
apply_replacements "~/.nexus" "~/nexus/state" "$FILE_LIST"
apply_replacements "/.nexus/" "/nexus/state/" "$FILE_LIST"
apply_replacements "/.nexus" "/nexus/state" "$FILE_LIST"
apply_replacements "\".nexus\"" "\"nexus/state\"" "$FILE_LIST"
apply_replacements "'\\.nexus'" "'nexus/state'" "$FILE_LIST"
apply_replacements "\"/.nexus\"" "\"/nexus/state\"" "$FILE_LIST"
apply_replacements "'/.nexus'" "'/nexus/state'" "$FILE_LIST"
apply_replacements "\"~/.nexus\"" "\"~/nexus/state\"" "$FILE_LIST"
apply_replacements "'~/.nexus'" "'~/nexus/state'" "$FILE_LIST"

rm -f "$FILE_LIST"
echo "  Done with global replacements"

# ============================================================================
# PHASE 3: Fix regex/path edge cases
# ============================================================================
echo "[Phase 3] Fixing regex/path edge cases..."

node <<'NODE'
const fs = require("fs");

const logsPath = "src/gateway/server-methods/logs.ts";
if (fs.existsSync(logsPath)) {
  let data = fs.readFileSync(logsPath, "utf8");
  data = data.replace(
    /const ROLLING_LOG_RE = .*?;\n/,
    "const ROLLING_LOG_RE = /nexus-\\d{4}-\\d{2}-\\d{2}\\.log$/;\n",
  );
  fs.writeFileSync(logsPath, data);
}

const bonjourPath = "src/infra/bonjour-discovery.ts";
if (fs.existsSync(bonjourPath)) {
  let data = fs.readFileSync(bonjourPath, "utf8");
  data = data.replace(
    "line.match(/nexus/state-gw\\._tcp\\.?\\s+(.+)$/);",
    "line.match(/_nexus-gw\\._tcp\\.?\\s+(.+)$/);",
  );
  fs.writeFileSync(bonjourPath, data);
}

const httpUtilsPath = "src/gateway/http-utils.ts";
if (fs.existsSync(httpUtilsPath)) {
  let data = fs.readFileSync(httpUtilsPath, "utf8");
  data = data.replace(
    "raw.match(/nexus/state[:/](?<agentId>[a-z0-9][a-z0-9_-]{0,63})$/i)",
    "raw.match(/nexus[:/](?<agentId>[a-z0-9][a-z0-9_-]{0,63})$/i)",
  );
  fs.writeFileSync(httpUtilsPath, data);
}

const daemonPaths = "src/daemon/paths.ts";
if (fs.existsSync(daemonPaths)) {
  let data = fs.readFileSync(daemonPaths, "utf8");
  data = data.replace("`.nexus${suffix}`", "`nexus/state${suffix}`");
  fs.writeFileSync(daemonPaths, data);
}

const cliProfile = "src/cli/profile.ts";
if (fs.existsSync(cliProfile)) {
  let data = fs.readFileSync(cliProfile, "utf8");
  data = data.replace("`.nexus${suffix}`", "`nexus/state${suffix}`");
  fs.writeFileSync(cliProfile, data);
}

const daemonPathsTest = "src/daemon/paths.test.ts";
if (fs.existsSync(daemonPathsTest)) {
  let data = fs.readFileSync(daemonPathsTest, "utf8");
  data = data.replace(".nexus-rescue", "nexus/state-rescue");
  fs.writeFileSync(daemonPathsTest, data);
}

const schtasksTest = "src/daemon/schtasks.test.ts";
if (fs.existsSync(schtasksTest)) {
  let data = fs.readFileSync(schtasksTest, "utf8");
  data = data.replaceAll(".nexus-", "nexus/state-");
  fs.writeFileSync(schtasksTest, data);
}

const profileTest = "src/cli/profile.test.ts";
if (fs.existsSync(profileTest)) {
  let data = fs.readFileSync(profileTest, "utf8");
  data = data.replace(".nexus-dev", "nexus/state-dev");
  fs.writeFileSync(profileTest, data);
}

const mediaStoreTest = "src/media/store.test.ts";
if (fs.existsSync(mediaStoreTest)) {
  let data = fs.readFileSync(mediaStoreTest, "utf8");
  data = data.replace(
    "${path.sep}.nexus${path.sep}media",
    "${path.sep}nexus${path.sep}state${path.sep}media",
  );
  fs.writeFileSync(mediaStoreTest, data);
}

const nixConfigTest = "src/config/config.nix-integration-u3-u5-u9.test.ts";
if (fs.existsSync(nixConfigTest)) {
  let data = fs.readFileSync(nixConfigTest, "utf8");
  data = data.replace(
    "expect(STATE_DIR).toMatch(/\\.nexus$/);",
    "expect(STATE_DIR).toMatch(/nexus[\\\\/]state$/);",
  );
  data = data.replace(
    "expect(CONFIG_PATH).toMatch(/\\.nexus[\\\\/nexus/state\\.json$/);",
    "expect(CONFIG_PATH).toMatch(/nexus[\\\\/]state[\\\\/]nexus\\.json$/);",
  );
  data = data.replace(
    '{ NEXUS_STATE_DIR: "/custom/new", NEXUS_STATE_DIR: "/custom/legacy" }',
    '{ NEXUS_STATE_DIR: "/custom/new", MOLTBOT_STATE_DIR: "/custom/legacy" }',
  );
  data = data.replace(
    '{ NEXUS_CONFIG_PATH: "/nix/store/new/nexus.json", NEXUS_CONFIG_PATH: "/nix/store/legacy/nexus.json" }',
    '{ NEXUS_CONFIG_PATH: "/nix/store/new/nexus.json", MOLTBOT_CONFIG_PATH: "/nix/store/legacy/moltbot.json" }',
  );
  data = data.replace(
    'NEXUS_CONFIG_PATH: "/nix/store/new/nexus.json",\n          NEXUS_CONFIG_PATH: "/nix/store/legacy/nexus.json"',
    'NEXUS_CONFIG_PATH: "/nix/store/new/nexus.json",\n          MOLTBOT_CONFIG_PATH: "/nix/store/legacy/moltbot.json"',
  );
  fs.writeFileSync(nixConfigTest, data);
}

const doctorConfigFlow = "src/commands/doctor-config-flow.ts";
if (fs.existsSync(doctorConfigFlow)) {
  let data = fs.readFileSync(doctorConfigFlow, "utf8");
  data = data.replace(
    "function moveLegacyConfigFile(legacyPath: string, canonicalPath: string) {",
    [
      "function moveLegacyConfigFile(legacyPath: string, canonicalPath: string) {",
      "  const resolvedLegacy = path.resolve(legacyPath);",
      "  const resolvedCanonical = path.resolve(canonicalPath);",
      "  if (resolvedLegacy === resolvedCanonical) return;",
      "  if (!fs.existsSync(legacyPath)) return;",
    ].join("\n"),
  );
  fs.writeFileSync(doctorConfigFlow, data);
}

const stateMigrationsTest = "src/commands/doctor-state-migrations.test.ts";
if (fs.existsSync(stateMigrationsTest)) {
  let data = fs.readFileSync(stateMigrationsTest, "utf8");
  data = data.replaceAll(
    'const legacyDir = path.join(root, "nexus/state");',
    'const legacyDir = path.join(root, ".moltbot");',
  );
  fs.writeFileSync(stateMigrationsTest, data);
}

const stateMigrations = "src/infra/state-migrations.ts";
if (fs.existsSync(stateMigrations)) {
  let data = fs.readFileSync(stateMigrations, "utf8");
  data = data.replace(
    "  try {\n    fs.renameSync(legacyDir, targetDir);\n  } catch (err) {",
    "  try {\n    fs.mkdirSync(path.dirname(targetDir), { recursive: true });\n    fs.renameSync(legacyDir, targetDir);\n  } catch (err) {",
  );
  fs.writeFileSync(stateMigrations, data);
}

const legacyNamesPath = "src/compat/legacy-names.ts";
if (fs.existsSync(legacyNamesPath)) {
  const content = [
    'export const LEGACY_PROJECT_NAME = "moltbot" as const;',
    "",
    "export const LEGACY_MANIFEST_KEY = LEGACY_PROJECT_NAME;",
    "",
    "export const LEGACY_PLUGIN_MANIFEST_FILENAME = `${LEGACY_PROJECT_NAME}.plugin.json` as const;",
    "",
    "export const LEGACY_CANVAS_HANDLER_NAME = `${LEGACY_PROJECT_NAME}CanvasA2UIAction` as const;",
    "",
    'export const LEGACY_MACOS_APP_SOURCES_DIR = "apps/macos/Sources/Moltbot" as const;',
    "",
    'export const MACOS_APP_SOURCES_DIR = "apps/macos/Sources/Nexus" as const;',
    "",
  ].join("\n");
  fs.writeFileSync(legacyNamesPath, content);
}
NODE

echo "  Done fixing regex/path edge cases"

# ============================================================================
# PHASE 4: Normalize package.json bins (dedupe keys)
# ============================================================================
echo "[Phase 4] Normalizing package.json..."

node <<'NODE'
const fs = require("fs");
const path = "package.json";
const raw = fs.readFileSync(path, "utf8");
const pkg = JSON.parse(raw);
if (pkg.bin && typeof pkg.bin === "object") {
  const fallback = Object.values(pkg.bin)[0];
  pkg.bin = { nexus: pkg.bin.nexus || fallback };
}
fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
NODE

echo "  Done normalizing package.json"

# ============================================================================
# PHASE 5: Fix duplicate plugin SDK alias
# ============================================================================
echo "[Phase 5] Fixing plugin SDK alias..."

node <<'NODE'
const fs = require("fs");
const path = "src/plugins/loader.ts";
if (fs.existsSync(path)) {
  let data = fs.readFileSync(path, "utf8");
  data = data.replace(
    /("nexus\/plugin-sdk": pluginSdkAlias,\n)\s*"nexus\/plugin-sdk": pluginSdkAlias,\n/,
    "$1",
  );
  fs.writeFileSync(path, data);
}
NODE

echo "  Done fixing plugin SDK alias"

# ============================================================================
# PHASE 6: Add A2UI source fallback for MoltbotKit
# ============================================================================
echo "[Phase 6] Adding A2UI source fallback..."

node <<'NODE'
const fs = require("fs");
const path = "scripts/bundle-a2ui.sh";
if (fs.existsSync(path)) {
  let data = fs.readFileSync(path, "utf8");
  data = data.replace(
    /A2UI_APP_DIR="[^"]*"\n/,
    [
      'A2UI_APP_DIR="$ROOT_DIR/apps/shared/NexusKit/Tools/CanvasA2UI"',
      'LEGACY_A2UI_APP_DIR="$ROOT_DIR/apps/shared/MoltbotKit/Tools/CanvasA2UI"',
      'if [[ ! -d "$A2UI_APP_DIR" && -d "$LEGACY_A2UI_APP_DIR" ]]; then',
      '  A2UI_APP_DIR="$LEGACY_A2UI_APP_DIR"',
      'fi',
      "",
    ].join("\n"),
  );
  fs.writeFileSync(path, data);
}
NODE

echo "  Done adding A2UI source fallback"

# ============================================================================
# PHASE 7: Rewrite config IO tests (nexus-only)
# ============================================================================
echo "[Phase 7] Rewriting config IO tests..."

cat > src/config/io.compat.test.ts << 'IO_COMPAT_EOF'
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { createConfigIO } from "./io.js";

async function withTempHome(run: (home: string) => Promise<void>): Promise<void> {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "nexus-config-"));
  try {
    await run(home);
  } finally {
    await fs.rm(home, { recursive: true, force: true });
  }
}

async function writeConfig(
  home: string,
  port: number,
  dirname: string = "nexus/state",
  filename: string = "nexus.json",
) {
  const dir = path.join(home, dirname);
  await fs.mkdir(dir, { recursive: true });
  const configPath = path.join(dir, filename);
  await fs.writeFile(configPath, JSON.stringify({ gateway: { port } }, null, 2));
  return configPath;
}

describe("config io", () => {
  it("uses config from nexus/state when present", async () => {
    await withTempHome(async (home) => {
      const configPath = await writeConfig(home, 19001);

      const io = createConfigIO({
        env: {} as NodeJS.ProcessEnv,
        homedir: () => home,
      });

      expect(io.configPath).toBe(configPath);
      expect(io.loadConfig().gateway?.port).toBe(19001);
    });
  });

  it("honors NEXUS_CONFIG_PATH override", async () => {
    await withTempHome(async (home) => {
      await writeConfig(home, 19002);
      const overridePath = await writeConfig(home, 20002, "custom", "nexus.json");

      const io = createConfigIO({
        env: { NEXUS_CONFIG_PATH: overridePath } as NodeJS.ProcessEnv,
        homedir: () => home,
      });

      expect(io.configPath).toBe(overridePath);
      expect(io.loadConfig().gateway?.port).toBe(20002);
    });
  });

  it("honors NEXUS_STATE_DIR override", async () => {
    await withTempHome(async (home) => {
      const overrideDir = path.join(home, "override-state");
      const overridePath = await writeConfig(home, 21001, "override-state", "nexus.json");

      const io = createConfigIO({
        env: { NEXUS_STATE_DIR: overrideDir } as NodeJS.ProcessEnv,
        homedir: () => home,
      });

      expect(io.configPath).toBe(overridePath);
      expect(io.loadConfig().gateway?.port).toBe(21001);
    });
  });
});
IO_COMPAT_EOF

echo "  Done rewriting config IO tests"

# ============================================================================
# PHASE 8: Rewrite paths.ts (nexus-only)
# ============================================================================
echo "[Phase 8] Rewriting paths.ts..."

cat > src/config/paths.ts << 'PATHS_EOF'
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { NexusConfig } from "./types.js";

export function resolveIsNixMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NEXUS_NIX_MODE === "1" || env.MOLTBOT_NIX_MODE === "1" || env.CLAWDBOT_NIX_MODE === "1";
}

export const isNixMode = resolveIsNixMode();

const NEW_STATE_DIRNAME = "nexus/state";
const LEGACY_MOLTBOT_DIRNAME = ".moltbot";
const LEGACY_CLAWDBOT_DIRNAME = ".clawdbot";
const CONFIG_FILENAME = "nexus.json";
const LEGACY_MOLTBOT_CONFIG = "moltbot.json";
const LEGACY_CLAWDBOT_CONFIG = "clawdbot.json";

function newStateDir(homedir: () => string = os.homedir): string {
  return path.join(homedir(), NEW_STATE_DIRNAME);
}

function legacyMoltbotDir(homedir: () => string = os.homedir): string {
  return path.join(homedir(), LEGACY_MOLTBOT_DIRNAME);
}

function legacyClawdbotDir(homedir: () => string = os.homedir): string {
  return path.join(homedir(), LEGACY_CLAWDBOT_DIRNAME);
}

export function resolveNewStateDir(homedir: () => string = os.homedir): string {
  return newStateDir(homedir);
}

export function resolveLegacyStateDir(homedir: () => string = os.homedir): string {
  return legacyMoltbotDir(homedir);
}

function resolveUserPath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("~")) {
    const expanded = trimmed.replace(/^~(?=$|[\\/])/, os.homedir());
    return path.resolve(expanded);
  }
  return path.resolve(trimmed);
}

export function resolveStateDir(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir,
): string {
  const override =
    env.NEXUS_STATE_DIR?.trim() || env.MOLTBOT_STATE_DIR?.trim() || env.CLAWDBOT_STATE_DIR?.trim();
  if (override) return resolveUserPath(override);

  const nexusDir = newStateDir(homedir);
  const moltbotDir = legacyMoltbotDir(homedir);
  const clawdbotDir = legacyClawdbotDir(homedir);

  if (fs.existsSync(nexusDir)) return nexusDir;
  if (fs.existsSync(moltbotDir)) return moltbotDir;
  if (fs.existsSync(clawdbotDir)) return clawdbotDir;

  return nexusDir;
}

export const STATE_DIR = resolveStateDir();

export function resolveCanonicalConfigPath(
  env: NodeJS.ProcessEnv = process.env,
  stateDir: string = resolveStateDir(env, os.homedir),
): string {
  const override =
    env.NEXUS_CONFIG_PATH?.trim() ||
    env.MOLTBOT_CONFIG_PATH?.trim() ||
    env.CLAWDBOT_CONFIG_PATH?.trim();
  if (override) return resolveUserPath(override);
  return path.join(stateDir, CONFIG_FILENAME);
}

export function resolveConfigPathCandidate(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir,
): string {
  const candidates = resolveDefaultConfigCandidates(env, homedir);
  const existing = candidates.find((c) => {
    try {
      return fs.existsSync(c);
    } catch {
      return false;
    }
  });
  if (existing) return existing;
  return resolveCanonicalConfigPath(env, resolveStateDir(env, homedir));
}

export function resolveConfigPath(
  env: NodeJS.ProcessEnv = process.env,
  stateDir: string = resolveStateDir(env, os.homedir),
  homedir: () => string = os.homedir,
): string {
  const override =
    env.NEXUS_CONFIG_PATH?.trim() ||
    env.MOLTBOT_CONFIG_PATH?.trim() ||
    env.CLAWDBOT_CONFIG_PATH?.trim();
  if (override) return resolveUserPath(override);

  const stateOverride =
    env.NEXUS_STATE_DIR?.trim() || env.MOLTBOT_STATE_DIR?.trim() || env.CLAWDBOT_STATE_DIR?.trim();
  const candidates = [
    path.join(stateDir, CONFIG_FILENAME),
    path.join(stateDir, LEGACY_MOLTBOT_CONFIG),
    path.join(stateDir, LEGACY_CLAWDBOT_CONFIG),
  ];
  const existing = candidates.find((c) => {
    try {
      return fs.existsSync(c);
    } catch {
      return false;
    }
  });
  if (existing) return existing;
  if (stateOverride) return path.join(stateDir, CONFIG_FILENAME);
  const defaultStateDir = resolveStateDir(env, homedir);
  if (path.resolve(stateDir) === path.resolve(defaultStateDir)) {
    return resolveConfigPathCandidate(env, homedir);
  }
  return path.join(stateDir, CONFIG_FILENAME);
}

export const CONFIG_PATH = resolveConfigPathCandidate();

export function resolveDefaultConfigCandidates(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir,
): string[] {
  const explicit =
    env.NEXUS_CONFIG_PATH?.trim() ||
    env.MOLTBOT_CONFIG_PATH?.trim() ||
    env.CLAWDBOT_CONFIG_PATH?.trim();
  if (explicit) return [resolveUserPath(explicit)];

  const candidates: string[] = [];
  for (const envKey of ["NEXUS_STATE_DIR", "MOLTBOT_STATE_DIR", "CLAWDBOT_STATE_DIR"]) {
    const override = env[envKey]?.trim();
    if (override) {
      const dir = resolveUserPath(override);
      candidates.push(path.join(dir, CONFIG_FILENAME));
      candidates.push(path.join(dir, LEGACY_MOLTBOT_CONFIG));
      candidates.push(path.join(dir, LEGACY_CLAWDBOT_CONFIG));
    }
  }

  for (const dir of [newStateDir(homedir), legacyMoltbotDir(homedir), legacyClawdbotDir(homedir)]) {
    candidates.push(path.join(dir, CONFIG_FILENAME));
    candidates.push(path.join(dir, LEGACY_MOLTBOT_CONFIG));
    candidates.push(path.join(dir, LEGACY_CLAWDBOT_CONFIG));
  }

  return candidates;
}

export const DEFAULT_GATEWAY_PORT = 18789;

export function resolveGatewayLockDir(tmpdir: () => string = os.tmpdir): string {
  const base = tmpdir();
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  const suffix = uid != null ? `nexus-${uid}` : "nexus";
  return path.join(base, suffix);
}

const OAUTH_FILENAME = "oauth.json";

export function resolveOAuthDir(
  env: NodeJS.ProcessEnv = process.env,
  stateDir: string = resolveStateDir(env, os.homedir),
): string {
  const override =
    env.NEXUS_OAUTH_DIR?.trim() ||
    env.MOLTBOT_OAUTH_DIR?.trim() ||
    env.CLAWDBOT_OAUTH_DIR?.trim();
  if (override) return resolveUserPath(override);
  return path.join(stateDir, "credentials");
}

export function resolveOAuthPath(
  env: NodeJS.ProcessEnv = process.env,
  stateDir: string = resolveStateDir(env, os.homedir),
): string {
  return path.join(resolveOAuthDir(env, stateDir), OAUTH_FILENAME);
}

export function resolveGatewayPort(
  cfg?: NexusConfig,
  env: NodeJS.ProcessEnv = process.env,
): number {
  const envRaw =
    env.NEXUS_GATEWAY_PORT?.trim() ||
    env.MOLTBOT_GATEWAY_PORT?.trim() ||
    env.CLAWDBOT_GATEWAY_PORT?.trim();
  if (envRaw) {
    const parsed = Number.parseInt(envRaw, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const configPort = cfg?.gateway?.port;
  if (typeof configPort === "number" && Number.isFinite(configPort)) {
    if (configPort > 0) return configPort;
  }
  return DEFAULT_GATEWAY_PORT;
}
PATHS_EOF

echo "  Done rewriting paths.ts"

# ============================================================================
# PHASE 9: Rewrite paths.test.ts
# ============================================================================
echo "[Phase 9] Rewriting paths.test.ts..."

cat > src/config/paths.test.ts << 'PATHS_TEST_EOF'
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  resolveDefaultConfigCandidates,
  resolveConfigPath,
  resolveOAuthDir,
  resolveOAuthPath,
  resolveStateDir,
} from "./paths.js";

describe("oauth paths", () => {
  it("prefers NEXUS_OAUTH_DIR over state dir", () => {
    const env = {
      NEXUS_OAUTH_DIR: "/custom/oauth",
      NEXUS_STATE_DIR: "/custom/state",
    } as NodeJS.ProcessEnv;

    expect(resolveOAuthDir(env, "/custom/state")).toBe(path.resolve("/custom/oauth"));
    expect(resolveOAuthPath(env, "/custom/state")).toBe(
      path.join(path.resolve("/custom/oauth"), "oauth.json"),
    );
  });

  it("derives oauth path from state dir when unset", () => {
    const env = {
      NEXUS_STATE_DIR: "/custom/state",
    } as NodeJS.ProcessEnv;

    expect(resolveOAuthDir(env, "/custom/state")).toBe(path.join("/custom/state", "credentials"));
    expect(resolveOAuthPath(env, "/custom/state")).toBe(
      path.join("/custom/state", "credentials", "oauth.json"),
    );
  });
});

describe("state + config path candidates", () => {
  it("uses NEXUS_STATE_DIR when set", () => {
    const env = { NEXUS_STATE_DIR: "/nexus/state" } as NodeJS.ProcessEnv;
    expect(resolveStateDir(env, () => "/home/test")).toBe(path.resolve("/nexus/state"));
  });

  it("orders default config candidates", () => {
    const home = "/home/test";
    const candidates = resolveDefaultConfigCandidates({} as NodeJS.ProcessEnv, () => home);
    expect(candidates[0]).toBe(path.join(home, "nexus/state", "nexus.json"));
  });

  it("respects state dir overrides when config is missing", () => {
    const root = os.tmpdir();
    const overrideDir = path.join(root, "override");
    const env = { NEXUS_STATE_DIR: overrideDir } as NodeJS.ProcessEnv;
    const resolved = resolveConfigPath(env, overrideDir, () => root);
    expect(resolved).toBe(path.join(overrideDir, "nexus.json"));
  });
});
PATHS_TEST_EOF

echo "  Done rewriting paths.test.ts"

# ============================================================================
# DONE
# ============================================================================
echo ""
echo "=== Rebrand Complete ==="
echo ""
echo "Next: pnpm install && pnpm build && pnpm test"
