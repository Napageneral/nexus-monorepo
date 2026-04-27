import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installPackageViaRuntimeHttp } from "./ssh-helper.js";

describe("ssh-helper direct runtime delivery", () => {
  let tempRoot: string | null = null;

  afterEach(() => {
    if (tempRoot) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
      tempRoot = null;
    }
  });

  it("uploads package artifacts to non-loopback runtimes before install", async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "frontdoor-ssh-helper-"));
    const tarballPath = path.join(tempRoot, "website-input-0.1.0.tar.gz");
    const payload = Buffer.from("package-tarball-payload", "utf8");
    fs.writeFileSync(tarballPath, payload);

    const expectedSha = createHash("sha256").update(payload).digest("hex");
    let uploadUrl = "";
    let uploadBodyText = "";
    let installBody: Record<string, unknown> | null = null;

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (url.startsWith("http://runtime-host.test:18789/api/operator/packages/upload")) {
        uploadUrl = url;
        const requestBody = init?.body;
        uploadBodyText = Buffer.isBuffer(requestBody)
          ? requestBody.toString("utf8")
          : requestBody instanceof Uint8Array
            ? Buffer.from(requestBody).toString("utf8")
            : String(requestBody ?? "");
        return new Response(JSON.stringify({
          ok: true,
          staged_artifact: {
            server_path: "/opt/nex/state/packages/staging/op-test/website-input-0.1.0.tar.gz",
            sha256: expectedSha,
            size_bytes: payload.byteLength,
          },
        }), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      }
      if (url === "http://runtime-host.test:18789/api/operator/packages/install") {
        installBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("not found", { status: 404 });
    });

    try {
      const result = await installPackageViaRuntimeHttp({
        runtimeUrl: "http://runtime-host.test:18789",
        localTarballPath: tarballPath,
        kind: "app",
        packageId: "website-input",
        version: "0.1.0",
        runtimeBearerToken: "runtime-bearer-token",
      });

      expect(result).toEqual({ ok: true });
      expect(uploadUrl).toContain("/api/operator/packages/upload");
      expect(uploadUrl).toContain("filename=website-input-0.1.0.tar.gz");
      expect(uploadBodyText).toBe(payload.toString("utf8"));
      expect(installBody).toMatchObject({
        kind: "app",
        package_id: "website-input",
        version: "0.1.0",
        staged_artifact: {
          server_path: "/opt/nex/state/packages/staging/op-test/website-input-0.1.0.tar.gz",
          sha256: expectedSha,
          size_bytes: payload.byteLength,
        },
      });
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
