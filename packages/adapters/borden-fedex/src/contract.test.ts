import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("package manifest is a stable Borden FedEx adapter", () => {
  const manifest = JSON.parse(readFileSync(resolve("adapter.nexus.json"), "utf8"));
  assert.deepEqual(manifest, {
    id: "borden-fedex",
    version: "0.1.1",
    displayName: "Borden FedEx Billing",
    description: "Read-only external-capture registration adapter for Borden FedEx invoice evidence.",
    platform: "fedex_billing_online",
    command: "./dist/index.js",
    skill: "./SKILL.md",
  });
});
