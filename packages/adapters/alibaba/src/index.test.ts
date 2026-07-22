import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

const PACKAGE_ROOT = resolve(import.meta.dirname, "..");
const FIXTURE_ROOT = resolve(PACKAGE_ROOT, "testdata/snapshots/alibaba-2026-07-17");
const RECORD_COUNT = 512;
const EXPECTED_OUTPUT_COUNT = RECORD_COUNT + 1;

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

test("the executable drains a pipe before exiting a large backfill", async () => {
  const root = mkdtempSync(resolve(tmpdir(), "nexus-alibaba-pipe-drain-"));
  try {
    const snapshotsRoot = resolve(root, "snapshots");
    const snapshotRoot = resolve(snapshotsRoot, "alibaba-2026-07-17");
    cpSync(FIXTURE_ROOT, snapshotRoot, { recursive: true });

    const messagesPath = resolve(snapshotRoot, "adapter/messages.jsonl");
    const seed = JSON.parse(readFileSync(messagesPath, "utf8")) as Record<string, unknown>;
    const messages = Array.from({ length: RECORD_COUNT }, (_, index) => ({
      ...seed,
      messageId: `pipe-drain-${String(index).padStart(4, "0")}`,
      sendTime: 1_784_300_300_000 + index,
      text: `Pipe drain record ${index} ${"x".repeat(2048)}`,
    }));
    writeFileSync(messagesPath, `${messages.map((row) => JSON.stringify(row)).join("\n")}\n`);

    const completePath = resolve(snapshotRoot, "adapter/complete.json");
    const complete = JSON.parse(readFileSync(completePath, "utf8")) as Record<string, unknown>;
    const projection = complete.adapterProjection as Record<string, unknown>;
    complete.messageCount = RECORD_COUNT;
    projection.messagesSha256 = sha256(messagesPath);
    const completeBytes = `${JSON.stringify(complete, null, 2)}\n`;
    writeFileSync(completePath, completeBytes);
    writeFileSync(resolve(snapshotRoot, "complete.json"), completeBytes);

    const summaryPath = resolve(snapshotRoot, "summary.json");
    const summary = JSON.parse(readFileSync(summaryPath, "utf8")) as Record<string, unknown>;
    summary.messageCount = RECORD_COUNT;
    writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);

    const contextPath = resolve(root, "context.json");
    writeFileSync(
      contextPath,
      JSON.stringify({
        platform: "alibaba",
        connection_id: "pipe-drain-alibaba",
        config: {
          snapshot_root: snapshotsRoot,
          account_label: "MoonSleep Alibaba",
          account_id: "moonsleep-alibaba",
        },
      }),
    );

    const build = spawnSync("npm", ["run", "build"], {
      cwd: PACKAGE_ROOT,
      encoding: "utf8",
    });
    assert.equal(build.status, 0, build.stderr || build.stdout);

    const child = spawn(
      process.execPath,
      [
        resolve(PACKAGE_ROOT, "dist/index.js"),
        "records.backfill",
        "--connection",
        "pipe-drain-alibaba",
        "--since",
        "2026-07-17T00:00:00.000Z",
        "--to",
        "2026-07-18T00:00:00.000Z",
        "--format",
        "jsonl",
      ],
      {
        cwd: PACKAGE_ROOT,
        env: {
          ...process.env,
          NEXUS_ADAPTER_CONTEXT_PATH: contextPath,
          NEXUS_ADAPTER_STATE_DIR: resolve(root, "state"),
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    child.stdout.pause();
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    setTimeout(() => child.stdout.resume(), 150);

    const exitCode = await new Promise<number | null>((resolvePromise, rejectPromise) => {
      child.once("error", rejectPromise);
      child.once("close", resolvePromise);
    });
    assert.equal(exitCode, 0, stderr);
    const lines = stdout.trim().split("\n").filter(Boolean);
    assert.equal(lines.length, EXPECTED_OUTPUT_COUNT);
    assert.equal(
      new Set(lines.map((line) => JSON.parse(line).payload.external_record_id)).size,
      EXPECTED_OUTPUT_COUNT,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
