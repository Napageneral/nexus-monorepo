import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("package manifest is a stable WWEX SpeedShip adapter", () => {
  const manifest = JSON.parse(readFileSync(resolve("adapter.nexus.json"), "utf8"));
  assert.deepEqual(manifest, {
    id: "wwex-speedship",
    version: "0.1.0",
    displayName: "WWEX SpeedShip Invoices",
    description: "Read-only external-capture registration adapter for WWEX SpeedShip invoice evidence.",
    platform: "speedship",
    command: "./dist/index.js",
    skill: "./SKILL.md",
  });
});
