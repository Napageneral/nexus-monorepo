import fs from "node:fs";
import path from "node:path";
import type { Command } from "commander";

import {
  getSkillMetadata,
  hasBinary,
  loadWorkspaceSkillEntries,
} from "../agents/skills.js";
import { DEFAULT_AGENT_WORKSPACE_DIR } from "../agents/workspace.js";
import { loadConfig } from "../config/config.js";
import {
  ensureCredentialIndexSync,
  type CredentialIndexService,
} from "../credentials/store.js";
import { verifyCredentials } from "../commands/credential.js";
import { resolveUserPath } from "../utils.js";

function resolveBinaryPath(bin: string): string | null {
  const pathEnv = process.env.PATH ?? "";
  const parts = pathEnv.split(path.delimiter).filter(Boolean);
  for (const part of parts) {
    const candidate = path.join(part, bin);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // continue
    }
  }
  return null;
}

export function registerToolConnectorCli(program: Command) {
  const tool = program
    .command("tool")
    .description("Tool verification and paths");
  const connector = program
    .command("connector")
    .description("Connector verification and accounts");

  tool
    .command("verify [name]")
    .description("Verify tool dependencies")
    .option("--json", "Output as JSON")
    .action((name: string | undefined, opts) => {
      const config = loadConfig();
      const workspaceDir = resolveUserPath(
        config.agent?.workspace ?? DEFAULT_AGENT_WORKSPACE_DIR,
      );
      const entries = loadWorkspaceSkillEntries(workspaceDir);
      const tools = entries.filter(
        (entry) => getSkillMetadata(entry)?.type === "tool",
      );
      const scoped =
        name?.trim() && name.trim().length > 0
          ? tools.filter(
              (entry) => entry.skill.name.toLowerCase() === name.toLowerCase(),
            )
          : tools;
      if (name && scoped.length === 0) {
        console.error(`Tool skill not found: ${name}`);
        process.exit(1);
      }
      const results = scoped.map((entry) => {
        const meta = getSkillMetadata(entry);
        const bins = meta?.requires?.bins ?? [];
        const missing = bins.filter((bin) => !hasBinary(bin));
        return {
          skill: entry.skill.name,
          bins,
          missing,
          ok: missing.length === 0,
        };
      });

      if (opts.json) {
        console.log(JSON.stringify(results, null, 2));
        return;
      }
      if (results.length === 0) {
        console.log("No tool skills found.");
        return;
      }
      for (const result of results) {
        const status = result.ok ? "✅" : "📥";
        console.log(
          `${status} ${result.skill} (${result.bins.join(", ") || "no bins"})`,
        );
      }
    });

  tool
    .command("path <name>")
    .description("Resolve binary path for a tool skill or bin")
    .action((name: string) => {
      const config = loadConfig();
      const workspaceDir = resolveUserPath(
        config.agent?.workspace ?? DEFAULT_AGENT_WORKSPACE_DIR,
      );
      const entries = loadWorkspaceSkillEntries(workspaceDir);
      const match = entries.find(
        (entry) => entry.skill.name.toLowerCase() === name.toLowerCase(),
      );
      if (match) {
        const meta = getSkillMetadata(match);
        const bins = meta?.requires?.bins ?? [];
        if (bins.length === 0) {
          console.error(`No binaries listed for tool: ${match.skill.name}`);
          process.exit(1);
        }
        const resolvedBins = bins.map((bin) => ({
          bin,
          path: resolveBinaryPath(bin),
        }));
        const missing = resolvedBins.filter((item) => !item.path);
        if (missing.length > 0) {
          console.error(
            `Missing binaries: ${missing.map((item) => item.bin).join(", ")}`,
          );
          process.exit(1);
        }
        for (const item of resolvedBins) {
          if (item.path) console.log(item.path);
        }
        return;
      }

      const resolved = resolveBinaryPath(name);
      if (!resolved) {
        console.error(`Binary not found: ${name}`);
        process.exit(1);
      }
      console.log(resolved);
    });

  connector
    .command("verify [name]")
    .description("Verify connector credentials")
    .option("--json", "Output as JSON")
    .action(async (name: string | undefined, opts) => {
      const config = loadConfig();
      const workspaceDir = resolveUserPath(
        config.agent?.workspace ?? DEFAULT_AGENT_WORKSPACE_DIR,
      );
      const entries = loadWorkspaceSkillEntries(workspaceDir);
      const connectors = entries.filter(
        (entry) => getSkillMetadata(entry)?.type === "connector",
      );
      const scoped =
        name?.trim() && name.trim().length > 0
          ? connectors.filter(
              (entry) => entry.skill.name.toLowerCase() === name.toLowerCase(),
            )
          : connectors;
      if (name && scoped.length === 0) {
        console.error(`Connector skill not found: ${name}`);
        process.exit(1);
      }
      const index = ensureCredentialIndexSync();
      const services = new Set(
        Object.keys(index.services ?? {}).map((id) => id.toLowerCase()),
      );

      const results = await Promise.all(
        scoped.map(async (entry) => {
        const meta = getSkillMetadata(entry);
        const provides = meta?.provides ?? [];
        const requires = meta?.requires?.credentials ?? [];
        const hints = [...requires, entry.skill.name].map((value) =>
          value.toLowerCase(),
        );
        const hasCredential = hints.some((hint) => services.has(hint));
        const verified = hasCredential
          ? await Promise.all(
              hints.map((hint) =>
                verifyCredentials({ service: hint }).catch(() => null),
              ),
            )
          : [];
        const ok = hasCredential
          ? verified.every((result) => result?.ok !== false)
          : false;
        return {
          skill: entry.skill.name,
          provides,
          requires,
          ok,
          verified,
        };
      }),
      );

      if (opts.json) {
        console.log(JSON.stringify(results, null, 2));
        return;
      }
      if (results.length === 0) {
        console.log("No connector skills found.");
        return;
      }
      for (const result of results) {
        const status = result.ok ? "✅" : "🔧";
        console.log(`${status} ${result.skill}`);
      }
    });

  connector
    .command("accounts [service]")
    .description("List credential accounts")
    .option("--json", "Output as JSON")
    .action((service: string | undefined, opts) => {
      const index = ensureCredentialIndexSync();
      const filter = service?.trim();
      if (opts.json) {
        if (!filter) {
          console.log(JSON.stringify(index, null, 2));
          return;
        }
        const entry = index.services?.[filter];
        if (!entry) {
          console.error(`Service not found: ${filter}`);
          process.exit(1);
        }
        console.log(JSON.stringify({ [filter]: entry }, null, 2));
        return;
      }
      const entries: Array<[string, CredentialIndexService]> = filter
        ? index.services?.[filter]
          ? [[filter, index.services[filter]]]
          : []
        : (Object.entries(index.services ?? {}) as Array<
            [string, CredentialIndexService]
          >);
      for (const [serviceId, info] of entries) {
        if (!info) continue;
        console.log(serviceId);
        for (const account of info.accounts ?? []) {
          console.log(`  - ${account.id}`);
        }
      }
    });
}
