import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { flexportAdapter } from "./adapter.ts";

const PACKAGE_ROOT = resolve(import.meta.dirname, "..");
const METHOD_NAMES = [
  "flexport.status",
  "flexport.shipments.list",
  "flexport.shipments.bundle",
  "flexport.network.get",
  "flexport.products.create",
  "flexport.products.update",
  "flexport.bookings.create",
  "flexport.documents.create",
];

function readJson(path: string) {
  return JSON.parse(readFileSync(resolve(PACKAGE_ROOT, path), "utf8"));
}

async function reflectedInfo() {
  return await flexportAdapter.operations["adapter.info"]!({
    runtime: null,
    signal: new AbortController().signal,
    stdout: process.stdout,
    stderr: process.stderr,
    log: { debug() {}, info() {}, error() {} },
  });
}

test("package manifest is the stable Flexport adapter identity", () => {
  const { methods, ...identity } = readJson("adapter.nexus.json");
  assert.deepEqual(identity, {
    id: "flexport",
    version: "0.1.0",
    displayName: "Flexport",
    description:
      "Flexport API v2 adapter: shipment bundles, final documents and the network as Records, plus four guarded writes.",
    platform: "flexport",
    command: "./dist/index.js",
    skill: "./SKILL.md",
  });
  assert.deepEqual(Object.keys(methods), METHOD_NAMES);
});

test("manifest methods equal the reflected adapter.info methods exactly", async () => {
  const { methods } = readJson("adapter.nexus.json");
  const info = await reflectedInfo();
  assert.deepEqual(info.methods.map((entry) => entry.name), METHOD_NAMES);
  for (const reflected of info.methods) {
    const declared = methods[reflected.name];
    assert.deepEqual(
      declared,
      {
        description: reflected.description,
        action: reflected.action,
        connection_required: reflected.connection_required,
        mutates_remote: reflected.mutates_remote,
        params: reflected.params,
        response: reflected.response,
      },
      reflected.name,
    );
    // The runtime reads connection_required as `=== true` and maps action "write" to IAM write.
    assert.equal(declared.connection_required, true, reflected.name);
    assert.equal(declared.mutates_remote, declared.action === "write", reflected.name);
  }
});

test("manifest, package.json, lockfile and adapter.info carry one version", async () => {
  const info = await reflectedInfo();
  const versions = [
    readJson("adapter.nexus.json").version,
    readJson("package.json").version,
    readJson("package-lock.json").version,
    info.version,
  ];
  assert.deepEqual(versions, ["0.1.0", "0.1.0", "0.1.0", "0.1.0"]);
  assert.equal(info.platform, readJson("adapter.nexus.json").platform);
});

test("the published OpenAPI contract lists every method with its action", () => {
  const openapi = readFileSync(resolve(PACKAGE_ROOT, "api/openapi.yaml"), "utf8");
  assert.match(openapi, /^openapi: 3\.1\.0$/m);
  assert.match(openapi, /^  version: 0\.1\.0$/m);
  const { methods } = readJson("adapter.nexus.json");
  for (const name of METHOD_NAMES) {
    const block = openapi.split(`  /operations/${name}:\n`)[1]?.split(/\n  \/operations\//)[0];
    assert.ok(block, `${name} is published`);
    assert.match(block, new RegExp(`x-nexus-action: ${methods[name].action}\\n`), name);
    assert.match(block, new RegExp(`x-nexus-mutates-remote: ${methods[name].mutates_remote}\\n`), name);
  }
  assert.deepEqual(readJson("api/openapi.lock.json"), {
    contract: "packages/adapters/flexport/api",
    generator: "nex/scripts/contracts/generate-openapi.ts",
    sources: [
      "packages/adapters/flexport/src/adapter.ts",
      "packages/adapters/nexus-adapter-sdks/nexus-adapter-sdk-ts/src/protocol.ts",
      "packages/adapters/nexus-adapter-sdks/nexus-adapter-sdk-ts/src/define.ts",
    ],
  });
});
