import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DockerSandboxProvider } from "./sandbox-provider.js";

describe("DockerSandboxProvider", () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    for (const root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  function makeTempRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "frontdoor-sandbox-provider-test-"));
    tempRoots.push(root);
    return root;
  }

  it("writes bootstrap assets and launches a mapped sandbox container", async () => {
    const hostStateRoot = makeTempRoot();
    const calls: string[][] = [];
    const provider = new DockerSandboxProvider({
      imageName: "nex-cleanroom:local",
      hostStateRoot,
      containerRoot: "/cleanroom",
      frontdoorHostAlias: "frontdoor-host",
      allocatePort: async () => 19123,
      runner: async (args) => {
        calls.push(args);
        return { stdout: "", stderr: "" };
      },
    });

    const created = await provider.createServer({
      tenantId: "tenant-cleanroom",
      planId: "cax11",
      serverName: "Fresh Hosted Sandbox",
      hostedBootstrap: {
        tenantId: "tenant-cleanroom",
        serverId: "srv-cleanroom-001",
        runtimeAuthToken: "rt-cleanroom",
        provisionToken: "prov-cleanroom",
        frontdoorUrl: "http://127.0.0.1:4040/",
        runtimeTokenIssuer: "http://127.0.0.1:4040",
        runtimeTokenSecret: "sandbox-secret",
        runtimeTokenActiveKid: "kid-v1",
        bootstrapSeedYaml: 'owner:\n  name: "Owner"\n',
      },
    });

    expect(created).toEqual({
      providerServerId: "sandbox-srv-cleanroom-001",
      publicIp: "",
      privateIp: "127.0.0.1",
      backupEnabled: false,
      deleteProtectionEnabled: false,
      rebuildProtectionEnabled: false,
    });

    expect(calls).toEqual([
      ["rm", "-f", "sandbox-srv-cleanroom-001"],
      expect.arrayContaining([
        "run",
        "-d",
        "--name",
        "sandbox-srv-cleanroom-001",
        "--hostname",
        "nex-srv-cleanroom-001",
        "--add-host",
        "frontdoor-host:host-gateway",
        "-p",
        "127.0.0.1:19123:18789",
        "-v",
        `${path.join(hostStateRoot, "sandbox-srv-cleanroom-001")}:/cleanroom`,
        "-w",
        "/app",
        "nex-cleanroom:local",
        "bash",
        "/cleanroom/frontdoor-sandbox-bootstrap.sh",
      ]),
    ]);

    const hostServerRoot = path.join(hostStateRoot, "sandbox-srv-cleanroom-001");
    const seed = fs.readFileSync(path.join(hostServerRoot, "bootstrap-seed.source.yml"), "utf8");
    const script = fs.readFileSync(path.join(hostServerRoot, "frontdoor-sandbox-bootstrap.sh"), "utf8");

    expect(seed).toContain('name: "Owner"');
    expect(script).toContain("export ROOT RUNTIME_PORT RUNTIME_HOST_PORT FRONTDOOR_URL RUNTIME_AUTH_TOKEN PROVISION_TOKEN");
    expect(script).toContain("FRONTDOOR_URL='http://frontdoor-host:4040'");
    expect(script).toContain("RUNTIME_HOST_PORT=19123");
    expect(script).toContain("cp /cleanroom/bootstrap-seed.source.yml /cleanroom/config/bootstrap-seed.yml");
    expect(script).toContain("node nexus.mjs init --workspace \"$ROOT\"");
    expect(script).toContain("NEXUS_BOOTSTRAP_SEED_FILE=\"$ROOT/config/bootstrap-seed.yml\" node nexus.mjs runtime run");
    expect(script).toContain("node nexus.mjs runtime run --workspace \"$ROOT\" --port \"$RUNTIME_PORT\" --bind lan");
    expect(script).toContain("runtime_port: Number(process.env.RUNTIME_HOST_PORT)");
    expect(script).toContain("authorization: `Bearer ${process.env.PROVISION_TOKEN}`");
  });

  it("maps docker status and lifecycle commands cleanly", async () => {
    const hostStateRoot = makeTempRoot();
    fs.mkdirSync(path.join(hostStateRoot, "sandbox-srv-1"), { recursive: true });
    const calls: string[][] = [];
    const provider = new DockerSandboxProvider({
      imageName: "nex-cleanroom:local",
      hostStateRoot,
      runner: async (args) => {
        calls.push(args);
        if (args[0] === "inspect") {
          return { stdout: JSON.stringify({ State: { Status: "running" } }), stderr: "" };
        }
        return { stdout: "", stderr: "" };
      },
    });

    await expect(provider.getServerStatus("sandbox-srv-1")).resolves.toEqual({
      state: "running",
      privateIp: "127.0.0.1",
    });
    await provider.archiveServer("sandbox-srv-1");
    await provider.restoreServer("sandbox-srv-1");
    await provider.destroyServer("sandbox-srv-1");
    await expect(provider.createRecoveryPoint("sandbox-srv-1", "snapshot")).rejects.toThrow(
      "sandbox_recovery_not_supported",
    );

    expect(calls).toEqual([
      ["inspect", "sandbox-srv-1", "--format", "{{json .}}"],
      ["stop", "sandbox-srv-1"],
      ["start", "sandbox-srv-1"],
      ["rm", "-f", "sandbox-srv-1"],
    ]);
    expect(fs.existsSync(path.join(hostStateRoot, "sandbox-srv-1"))).toBe(false);
  });
});
