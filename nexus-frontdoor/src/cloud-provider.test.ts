import { afterEach, describe, expect, it, vi } from "vitest";
import { HetznerProvider } from "./cloud-provider.js";

describe("HetznerProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("enables backup and protection when creating a server", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            server: {
              id: 123,
              public_net: { ipv4: { ip: "203.0.113.10" } },
              private_net: [{ ip: "10.0.0.10" }],
            },
          }),
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ action: { id: 1, command: "enable_backup", status: "success" } }), {
          status: 201,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ action: { id: 2, command: "change_protection", status: "success" } }),
          { status: 201 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new HetznerProvider({
      apiToken: "token",
      networkId: "7",
      firewallId: "9",
      sshKeyIds: ["11"],
      snapshotId: "13",
    });

    const created = await provider.createServer({
      tenantId: "tenant-durable",
      planId: "cax11",
      cloudInitScript: "#!/bin/sh\n",
      imageId: "snapshot-recovery-77",
      serverName: "nex-tenant-durable-recover",
    });

    expect(created).toEqual({
      providerServerId: "123",
      publicIp: "203.0.113.10",
      privateIp: "10.0.0.10",
      backupEnabled: true,
      deleteProtectionEnabled: true,
      rebuildProtectionEnabled: true,
    });
    const createCall = fetchMock.mock.calls[0];
    expect(createCall?.[0]).toBe("https://api.hetzner.cloud/v1/servers");
    const createRequest = createCall?.[1] as RequestInit | undefined;
    expect(createRequest?.method).toBe("POST");
    expect(JSON.parse(String(createRequest?.body))).toMatchObject({
      name: "nex-tenant-durable-recover",
      image: "snapshot-recovery-77",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.hetzner.cloud/v1/servers/123/actions/enable_backup",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://api.hetzner.cloud/v1/servers/123/actions/change_protection",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ delete: true, rebuild: true }),
      }),
    );
  });

  it("supports archive, restore, recovery point creation, protection changes, and destroy", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ action: { id: 1, command: "poweroff", status: "success" } }), {
          status: 201,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            server: {
              id: 123,
              status: "off",
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ action: { id: 2, command: "poweron", status: "success" } }), {
          status: 201,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            server: {
              id: 123,
              status: "running",
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            action: { id: 3, command: "create_image", status: "success" },
            image: { id: 456, type: "snapshot" },
          }),
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ action: { id: 4, command: "change_protection", status: "success" } }),
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new HetznerProvider({
      apiToken: "token",
      networkId: "7",
      firewallId: "9",
      sshKeyIds: ["11"],
      snapshotId: "13",
    });

    await provider.archiveServer("123");
    await provider.restoreServer("123");
    const recoveryPoint = await provider.createRecoveryPoint("123", "Before upgrade");
    await provider.setProtection("123", { delete: false, rebuild: false });
    await provider.destroyServer("123");

    expect(recoveryPoint).toEqual({
      providerArtifactId: "456",
      captureType: "snapshot",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      "https://api.hetzner.cloud/v1/servers/123/actions/create_image",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          type: "snapshot",
          description: "Before upgrade",
          labels: {
            "managed-by": "nexus-frontdoor",
            "recovery-point": "true",
          },
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      "https://api.hetzner.cloud/v1/servers/123/actions/change_protection",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ delete: false, rebuild: false }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      7,
      "https://api.hetzner.cloud/v1/servers/123",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
