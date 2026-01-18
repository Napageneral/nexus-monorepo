import type { Command } from "commander";

import { logCommand } from "../commands/log.js";
import { defaultRuntime } from "../runtime.js";

export function registerLogCli(program: Command) {
  program
    .command("log")
    .description("Show Nexus event or skill usage logs")
    .option("--json", "Output as JSON")
    .option("--errors", "Only include error events")
    .option("--since <time>", "Only include events after time (e.g. 24h)")
    .option("--limit <n>", "Limit entries", (value) => Number.parseInt(value, 10))
    .option("--skill <name>", "Show usage log for a skill")
    .option("--source <source>", "Filter by event source")
    .option("--command <path>", "Filter by command path")
    .action(async (opts) => {
      await logCommand(
        {
          json: Boolean(opts.json),
          errors: Boolean(opts.errors),
          since: typeof opts.since === "string" ? opts.since : undefined,
          limit: Number.isFinite(opts.limit) ? opts.limit : undefined,
          skill: typeof opts.skill === "string" ? opts.skill : undefined,
          source: typeof opts.source === "string" ? opts.source : undefined,
          command: typeof opts.command === "string" ? opts.command : undefined,
        },
        defaultRuntime,
      );
    });
}
