import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { type IncomingMessage, createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const PACKAGE_ROOT = resolve(import.meta.dirname, "..");
const REAL_CURL = spawnSync("sh", ["-c", "command -v curl"], { encoding: "utf8" }).stdout.trim();
const HAS_TOOLS = ["jq", "curl", "install"].every(
  (name) => spawnSync("sh", ["-c", `command -v ${name}`], { encoding: "utf8" }).status === 0,
);

type Seen = { path: string; authorization: string | undefined; body: Buffer };

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

/** A loopback stand-in for the three Nex runtime routes the scripts call. */
async function startFakeRuntime() {
  const seen: Seen[] = [];
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const body = await readBody(request);
    seen.push({ path: url.pathname, authorization: request.headers.authorization, body });
    const reply = (value: unknown) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(value));
    };
    if (url.pathname === "/runtime/operations/adapters.connections.create") {
      const parsed = JSON.parse(body.toString("utf8"));
      reply({ ok: true, payload: { status: "connected", connectionId: parsed.connectionId, account: "moonsleep", service: "flexport" } });
    } else if (url.pathname === "/api/operator/packages/upload") {
      reply({
        ok: true,
        staged_artifact: {
          server_path: "/var/lib/nex/staged/flexport-0.1.0.tar.gz",
          sha256: createHash("sha256").update(body).digest("hex"),
          size_bytes: body.length,
        },
      });
    } else if (url.pathname === "/api/operator/packages/install") {
      reply({ ok: true, package_id: "flexport", version: "0.1.0", status: "active", active_release_path: "/opt/x" });
    } else {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    seen,
    close: async () => await new Promise<void>((resolvePromise) => server.close(() => resolvePromise())),
  };
}

function runScript(script: string, args: string[], env: NodeJS.ProcessEnv) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolvePromise, rejectPromise) => {
    const child = spawn("bash", [resolve(PACKAGE_ROOT, "scripts", script), ...args], { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += String(chunk)));
    child.stderr.on("data", (chunk) => (stderr += String(chunk)));
    child.once("error", rejectPromise);
    child.once("close", (code) => resolvePromise({ code, stdout, stderr }));
  });
}

test(
  "the install and registration scripts never put the runtime token on a command line",
  { skip: HAS_TOOLS ? false : "jq, curl or install is not on PATH" },
  async () => {
    const runtime = await startFakeRuntime();
    const root = mkdtempSync(join(tmpdir(), "nexus-flexport-scripts-"));
    try {
      // A curl shim on PATH records the exact argv each script hands curl, then runs the real one.
      const shimDir = join(root, "bin");
      mkdirSync(shimDir);
      const argvLog = join(root, "curl-argv.log");
      writeFileSync(join(shimDir, "curl"), `#!/bin/sh\nprintf '%s\\n' "$*" >> "$CURL_ARGV_LOG"\nexec ${REAL_CURL} "$@"\n`);
      chmodSync(join(shimDir, "curl"), 0o755);
      const scratch = join(root, "tmp");
      mkdirSync(scratch, { mode: 0o700 });
      const token = `nex_rt_${randomBytes(24).toString("hex")}`;
      const tokenFile = join(root, "runtime-token");
      writeFileSync(tokenFile, `${token}\n`, { mode: 0o600 });
      const env = { ...process.env, PATH: `${shimDir}:${process.env.PATH}`, CURL_ARGV_LOG: argvLog, TMPDIR: scratch };

      const bodyFile = join(root, "connection.json");
      writeFileSync(
        bodyFile,
        JSON.stringify({
          adapter: "flexport",
          authMethodId: "flexport_client_credentials",
          connectionId: "moonsleep-flexport",
          fields: { client_id: "fake-client-id", client_secret: "fake-client-secret", account: "moonsleep" },
        }),
        { mode: 0o600 },
      );
      chmodSync(bodyFile, 0o600);
      const registered = await runScript(
        "register-connection.sh",
        [runtime.url, tokenFile, bodyFile, join(root, "register-receipts")],
        env,
      );
      assert.equal(registered.code, 0, registered.stderr);
      assert.deepEqual(JSON.parse(registered.stdout), {
        status: "connected",
        connectionId: "moonsleep-flexport",
        account: "moonsleep",
        service: "flexport",
      });

      const artifact = join(root, "flexport-0.1.0.tar.gz");
      writeFileSync(artifact, randomBytes(4096));
      const artifactSha256 = createHash("sha256").update(readFileSync(artifact)).digest("hex");
      const installed = await runScript(
        "install-runtime-package.sh",
        [artifact, artifactSha256, "a".repeat(40), "flexport-install-test", runtime.url, tokenFile, join(root, "install-receipts")],
        env,
      );
      assert.equal(installed.code, 0, installed.stderr);
      assert.equal(JSON.parse(installed.stdout).status, "active");

      assert.deepEqual(
        runtime.seen.map((entry) => [entry.path, entry.authorization]),
        [
          ["/runtime/operations/adapters.connections.create", `Bearer ${token}`],
          ["/api/operator/packages/upload", `Bearer ${token}`],
          ["/api/operator/packages/install", `Bearer ${token}`],
        ],
        "every call still carries the runtime token",
      );
      const argv = readFileSync(argvLog, "utf8");
      assert.equal(argv.trim().split("\n").length, 3);
      assert.ok(!argv.includes(token), "the runtime token never appears in curl's argv");
      assert.ok(!argv.includes("fake-client-secret"), "the connection body is sent from its file");
      assert.deepEqual(readdirSync(scratch), [], "the private header file is removed");
      for (const output of [registered, installed]) {
        assert.ok(!output.stdout.includes(token) && !output.stderr.includes(token));
      }

      writeFileSync(tokenFile, "two tokens\n", { mode: 0o600 });
      const refused = await runScript(
        "register-connection.sh",
        [runtime.url, tokenFile, bodyFile, join(root, "register-receipts")],
        env,
      );
      assert.equal(refused.code, 64);
      assert.match(refused.stderr, /runtime token file must hold exactly one token/);
      assert.equal(runtime.seen.length, 3, "a malformed token file sends nothing");
      assert.deepEqual(readdirSync(scratch), []);
    } finally {
      await runtime.close();
      rmSync(root, { recursive: true, force: true });
    }
  },
);

/** A shipment Record as records.scan returns it (nexcore mapImmutableRecord / immutableRecordRuntimeView). */
function scannedShipmentRecord(sha256: string, sourceUrl: string | null) {
  return [
    {
      provider_record_id: "shipment:1234567",
      provider_version_ref: `bundle:sha256:${"b".repeat(64)}`,
      source_record_type: "flexport_shipment_bundle",
      // The runtime view projects only these attachment fields: there is no url.
      attachments: [{ id: "document:D1", mime_type: "application/pdf", filename: "CI.pdf", size: 110, content_hash: sha256 }],
      payload: {
        // The stored descriptor keeps the nex-artifact URL as source_url.
        attachments: [
          {
            id: "document:D1",
            content_type: "application/pdf",
            filename: "CI.pdf",
            byte_count: 110,
            content_sha256: sha256,
            source_url: sourceUrl,
            metadata: {},
          },
        ],
        source_metadata: { provider_payload: { contract: "moonsleep.flexport_shipment_bundle.v1" } },
      },
    },
  ];
}

test(
  "the runtime cleanroom checks the stored nex-artifact descriptor of the shipment attachment",
  { skip: HAS_TOOLS ? false : "jq is not on PATH" },
  () => {
    for (const script of readdirSync(resolve(PACKAGE_ROOT, "scripts"))) {
      const syntax = spawnSync("bash", ["-n", resolve(PACKAGE_ROOT, "scripts", script)], { encoding: "utf8" });
      assert.equal(syntax.status, 0, `${script}: ${syntax.stderr}`);
    }
    const proof = readFileSync(resolve(PACKAGE_ROOT, "scripts/runtime-cleanroom-proof.sh"), "utf8");
    const filter = /jq -e --arg sha256 "\$\{document_sha256\}" --argjson size "\$\{document_size\}" '\n([\s\S]*?)\n' <<<"\$\{shipment_record\}"/.exec(
      proof,
    )?.[1];
    assert.ok(filter, "the shipment Record check is in the script");
    const sha256 = "c".repeat(64);
    const check = (record: unknown) =>
      spawnSync("jq", ["-e", "--arg", "sha256", sha256, "--argjson", "size", "110", filter], {
        input: JSON.stringify(record),
        encoding: "utf8",
      });
    const stored = check(scannedShipmentRecord(sha256, "nex-artifact:flexport/abc"));
    assert.equal(stored.status, 0, stored.stderr || stored.stdout);
    assert.equal(stored.stdout.trim(), "true");
    assert.notEqual(check(scannedShipmentRecord(sha256, "file:///var/lib/nex/x")).status, 0);
    assert.notEqual(check(scannedShipmentRecord(sha256, null)).status, 0);
    assert.ok(!/runtime_(get|post|exec)[^\n]*Authorization: Bearer/.test(proof), "no curl carries the token in its argv");
  },
);
