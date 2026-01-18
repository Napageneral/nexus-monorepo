import fs from "node:fs";
import path from "node:path";

import { parseDurationMs } from "../cli/parse-duration.js";
import { readSkillUsageEntries } from "../agents/skill-usage.js";
import { resolveEventLogDir, type NexusEventLogEntry } from "../infra/event-log.js";
import type { RuntimeEnv } from "../runtime.js";
import { defaultRuntime } from "../runtime.js";

export type LogCommandOptions = {
  json?: boolean;
  errors?: boolean;
  since?: string;
  limit?: number;
  skill?: string;
  source?: string;
  command?: string;
};

function parseSince(raw?: string): number | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const parsedDate = Date.parse(trimmed);
  if (!Number.isNaN(parsedDate)) {
    return parsedDate;
  }
  const ms = parseDurationMs(trimmed, { defaultUnit: "h" });
  return Date.now() - ms;
}

function readEventFiles(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.startsWith("events-") &&
          entry.name.endsWith(".jsonl"),
      )
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

function parseEventLine(line: string): NexusEventLogEntry | null {
  try {
    const parsed = JSON.parse(line) as NexusEventLogEntry;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.ts !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function loadEventLogEntries(opts: {
  sinceMs?: number;
  errors?: boolean;
  source?: string;
  command?: string;
  limit?: number;
}): NexusEventLogEntry[] {
  const dir = resolveEventLogDir();
  const files = readEventFiles(dir);
  const events: NexusEventLogEntry[] = [];
  for (const file of files) {
    const filePath = path.join(dir, file);
    let raw = "";
    try {
      raw = fs.readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const event = parseEventLine(line);
      if (!event) continue;
      if (opts.sinceMs && event.ts < opts.sinceMs) continue;
      if (opts.source && event.source !== opts.source) continue;
      if (opts.command && event.command_path !== opts.command) continue;
      if (opts.errors) {
        const isError =
          event.status === "error" ||
          event.event_type === "command_failed" ||
          event.event_type === "cli_session_end";
        if (!isError) continue;
      }
      events.push(event);
    }
  }
  if (opts.limit && opts.limit > 0 && events.length > opts.limit) {
    return events.slice(-opts.limit);
  }
  return events;
}

export async function logCommand(
  opts: LogCommandOptions,
  runtime: RuntimeEnv = defaultRuntime,
) {
  const sinceMs = parseSince(opts.since);
  const limit = opts.limit && opts.limit > 0 ? opts.limit : undefined;

  if (opts.skill) {
    const entries = readSkillUsageEntries(opts.skill, {
      sinceMs,
      limit,
    });
    if (opts.json) {
      runtime.log(JSON.stringify({ skill: opts.skill, entries }, null, 2));
      return;
    }
    if (entries.length === 0) {
      runtime.log("No skill usage found.");
      return;
    }
    for (const entry of entries) {
      const time = new Date(entry.ts).toISOString();
      const status = entry.ok ? "ok" : "error";
      const duration =
        typeof entry.durationMs === "number"
          ? ` ${entry.durationMs}ms`
          : "";
      runtime.log(`${time} ${entry.event} ${status}${duration}`);
    }
    return;
  }

  const events = loadEventLogEntries({
    sinceMs,
    errors: opts.errors,
    source: opts.source,
    command: opts.command,
    limit,
  });
  if (opts.json) {
    runtime.log(JSON.stringify({ events }, null, 2));
    return;
  }
  if (events.length === 0) {
    runtime.log("No events found.");
    return;
  }
  for (const event of events) {
    const time = new Date(event.ts).toISOString();
    const status = event.status ?? "-";
    const command = event.command_path ?? event.event_type ?? "-";
    runtime.log(`${time} ${event.source}:${command} ${status}`);
  }
}
