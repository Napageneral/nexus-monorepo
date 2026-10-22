import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { FAKE_CLIENT_ID, FAKE_CLIENT_SECRET, startFakeFlexport } from "../testdata/fake-flexport.mjs";

const PACKAGE_ROOT = resolve(import.meta.dirname, "..");
const CONNECTION_ID = "binary-flexport";

type Run = { code: number | null; stdout: string; stderr: string };

function run(args: string[], env: NodeJS.ProcessEnv, pauseMs = 0): Promise<Run> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [resolve(PACKAGE_ROOT, "dist/index.js"), ...args], {
      cwd: PACKAGE_ROOT,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    if (pauseMs > 0) {
      child.stdout.pause();
      setTimeout(() => child.stdout.resume(), pauseMs);
    }
    child.stdout.on("data", (chunk: string) => (stdout += chunk));
    child.stderr.on("data", (chunk: string) => (stderr += chunk));
    child.once("error", rejectPromise);
    child.once("close", (code) => resolvePromise({ code, stdout, stderr }));
  });
}

test("the built executable backfills, shares one token across processes and guards writes", async () => {
  const build = spawnSync("npm", ["run", "build"], { cwd: PACKAGE_ROOT, encoding: "utf8" });
  assert.equal(build.status, 0, build.stderr || build.stdout);

  const fake = await startFakeFlexport();
  const root = mkdtempSync(join(tmpdir(), "nexus-flexport-binary-"));
  try {
    const stateDir = join(root, "state");
    const contextPath = join(root, "runtime-context.json");
    writeFileSync(
      contextPath,
      JSON.stringify({
        version: 2,
        platform: "flexport",
        connection_id: CONNECTION_ID,
        config: { base_url: fake.url },
        checkpoints: {},
        credential: {
          kind: "api_key",
          value: FAKE_CLIENT_SECRET,
          fields: { client_id: FAKE_CLIENT_ID, client_secret: FAKE_CLIENT_SECRET, account: "moonsleep" },
          ref: `flexport/${CONNECTION_ID}`,
          service: "flexport",
          account: CONNECTION_ID,
          auth_id: "api_key",
          type: "api_key",
        },
      }),
      { mode: 0o600 },
    );
    const env = { ...process.env, NEXUS_ADAPTER_CONTEXT_PATH: contextPath, NEXUS_ADAPTER_STATE_DIR: stateDir };

    const health = await run(["adapter.health", "--connection", CONNECTION_ID], env);
    assert.equal(health.code, 0, health.stderr);
    assert.equal(JSON.parse(health.stdout).connected, true);
    assert.equal(fake.requests.length, 0, "health never calls Flexport");

    const backfill = await run(
      ["records.backfill", "--connection", CONNECTION_ID, "--since", "2001-01-01", "--format", "jsonl"],
      env,
      150,
    );
    assert.equal(backfill.code, 0, backfill.stderr);
    const records = backfill.stdout.trim().split("\n").map((line) => JSON.parse(line));
    assert.deepEqual(records.map((record) => record.payload.external_record_id), ["shipment:1234567", "network:me"]);
    const attachment = records[0].payload.attachments[0];
    assert.equal(attachment.id, "document:D1");
    assert.ok(attachment.local_path.startsWith(realpathSync(stateDir)));

    const lists = await Promise.all(
      Array.from({ length: 3 }, () => run(["flexport.shipments.list", "--connection", CONNECTION_ID, "--payload-json", "{}"], env)),
    );
    for (const list of lists) {
      assert.equal(list.code, 0, list.stderr);
      assert.equal(JSON.parse(list.stdout).shipments[0].id, "1234567");
    }
    assert.equal(fake.tokenRequests, 1);

    const bodyJson = '{"name":"S3",  "cargo":{"b":1,"a":2}}';
    const refused = await run(
      ["flexport.bookings.create", "--connection", CONNECTION_ID, "--payload-json", JSON.stringify({ body_json: bodyJson, body_sha256: "0".repeat(64), go: "Tyler: go", confirm: "SEND_TO_FLEXPORT" })],
      env,
    );
    assert.equal(refused.code, 1);
    assert.match(refused.stderr, /body_sha256 does not match body_json/);
    assert.ok(!refused.stderr.includes('"S3"'));
    assert.equal(fake.requests.filter((request) => request.path === "/bookings").length, 0);

    const sent = await run(
      [
        "flexport.bookings.create",
        "--connection",
        CONNECTION_ID,
        "--payload-json",
        JSON.stringify({
          body_json: bodyJson,
          body_sha256: createHash("sha256").update(bodyJson).digest("hex"),
          go: "Tyler: go",
          confirm: "SEND_TO_FLEXPORT",
        }),
      ],
      env,
    );
    assert.equal(sent.code, 0, sent.stderr);
    assert.deepEqual(JSON.parse(sent.stdout), {
      status: "sent",
      path: "/bookings",
      flexport_id: "BK-1001",
      object: { _object: "/booking", id: "BK-1001", name: "S3", status: "submitted" },
    });
    assert.ok(fake.requests.at(-1)!.body.equals(Buffer.from(bodyJson)));

    // A real commercial invoice is well over 128 KiB once base64'd into body_json: past the Linux
    // limit on the one argv string the runtime would put an inline --payload-json in. The runtime
    // writes such a payload to a 0600 file and passes --payload-file because adapter.info says so.
    const info = await run(["adapter.info"], env);
    assert.equal(info.code, 0, info.stderr);
    assert.equal(JSON.parse(info.stdout).supports_payload_file, true);
    const documentJson = JSON.stringify({
      shipment_id: "1234567",
      document_type: "commercial_invoice",
      file_name: "CI-SWRC26012-S3.pdf",
      file: randomBytes(160 * 1024).toString("base64"),
    });
    const payloadPath = join(root, "payload.json");
    writeFileSync(
      payloadPath,
      JSON.stringify({
        body_json: documentJson,
        body_sha256: createHash("sha256").update(documentJson).digest("hex"),
        go: "Tyler: upload the CI",
        confirm: "SEND_TO_FLEXPORT",
      }),
      { mode: 0o600 },
    );
    assert.ok(statSync(payloadPath).size > 200 * 1024, "the payload is over 200 KiB");
    const uploaded = await run(
      ["flexport.documents.create", "--connection", CONNECTION_ID, "--payload-file", payloadPath],
      env,
    );
    assert.equal(uploaded.code, 0, uploaded.stderr);
    assert.deepEqual(JSON.parse(uploaded.stdout), {
      status: "sent",
      path: "/documents",
      flexport_id: "DOC-2001",
      object: { _object: "/document", id: "DOC-2001", file_name: "CI-SWRC26012-S3.pdf", document_type: "commercial_invoice" },
    });
    const upload = fake.requests.at(-1)!;
    assert.equal(upload.method, "POST");
    assert.equal(upload.path, "/documents");
    assert.ok(upload.body.equals(Buffer.from(documentJson)), "the document body is sent byte for byte");
    assert.ok(!uploaded.stderr.includes(documentJson.slice(200, 260)), "the body is never logged");
    assert.equal(fake.tokenRequests, 1);

    for (const output of [health, backfill, ...lists, refused, sent, info, uploaded]) {
      assert.ok(!output.stdout.includes(FAKE_CLIENT_SECRET) && !output.stderr.includes(FAKE_CLIENT_SECRET));
      assert.ok(!output.stderr.includes("Bearer"));
    }
  } finally {
    await fake.close();
    rmSync(root, { recursive: true, force: true });
  }
});
