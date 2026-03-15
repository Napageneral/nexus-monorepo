import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  buildLinkedInOrganicPostPayload,
  normalizeLinkedInOrganizationUrn,
  resolveLinkedInOrganizationInput,
} from "../src/adapter.js";

type SpawnResult = {
  status: number | null;
  stdout: string;
  stderr: string;
};

function runLinkedInAdapter(args: string[], env: NodeJS.ProcessEnv = process.env): SpawnResult {
  const result = spawnSync(process.execPath, ["dist/index.js", ...args], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function readFirstOutputLine(output: string): string {
  const line = output
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find(Boolean);
  if (!line) {
    throw new Error(`expected output line, received: ${output}`);
  }
  return line;
}

describe("linkedin adapter contract smoke", () => {
  it("prints adapter.info with oauth auth manifest", () => {
    const result = runLinkedInAdapter(["adapter.info"]);
    expect(result.status).toBe(0);

    const payload = JSON.parse(readFirstOutputLine(result.stdout)) as Record<string, unknown>;
    expect(payload.platform).toBe("linkedin");

    const operations = Array.isArray(payload.operations) ? payload.operations : [];
    expect(operations).toContain("channels.send");

    const auth = (payload.auth ?? {}) as Record<string, unknown>;
    const methods = Array.isArray(auth.methods) ? auth.methods : [];
    expect(methods.length).toBeGreaterThan(0);

    const firstMethod = methods[0] as Record<string, unknown>;
    expect(firstMethod.type).toBe("oauth2");
    expect(firstMethod.service).toBe("linkedin");

    const declaredMethods = Array.isArray(payload.methods) ? payload.methods : [];
    const methodNames = declaredMethods
      .map((entry) => (entry as Record<string, unknown>).name)
      .filter((entry): entry is string => typeof entry === "string");
    expect(methodNames).toContain("linkedin.posts.create");
    expect(methodNames).toContain("linkedin.organizations.list");
  });

  it("lists accounts when runtime context is present", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "linkedin-adapter-test-"));
    const contextPath = path.join(tempDir, "runtime-context.json");
    fs.writeFileSync(
      contextPath,
      JSON.stringify(
        {
          version: 1,
          platform: "linkedin",
          connection_id: "default",
          config: {
            organizationUrn: "urn:li:organization:2414183",
          },
          credential: {
            kind: "oauth",
            value: "token-test",
            ref: "linkedin/default",
            service: "linkedin",
            account: "default",
            fields: {
              accessToken: "token-test",
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    try {
      const result = runLinkedInAdapter(["adapter.accounts.list", "--connection", "default"], {
        ...process.env,
        NEXUS_ADAPTER_CONTEXT_PATH: contextPath,
      });
      expect(result.status).toBe(0);

      const payload = JSON.parse(readFirstOutputLine(result.stdout)) as unknown[];
      expect(Array.isArray(payload)).toBe(true);
      expect(payload.length).toBeGreaterThan(0);

      const first = payload[0] as Record<string, unknown>;
      expect(first.id).toBe("default");
      expect(first.credential_ref).toBe("linkedin/default");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("linkedin helper behavior", () => {
  it("normalizes numeric organization ids into LinkedIn URNs", () => {
    expect(normalizeLinkedInOrganizationUrn("2414183")).toBe("urn:li:organization:2414183");
  });

  it("resolves organization input in payload-target-config order", () => {
    expect(
      resolveLinkedInOrganizationInput({
        payloadOrganizationUrn: "111",
        targetContainerId: "222",
        configOrganizationUrn: "333",
      }),
    ).toBe("urn:li:organization:111");
    expect(
      resolveLinkedInOrganizationInput({
        targetContainerId: "222",
        configOrganizationUrn: "333",
      }),
    ).toBe("urn:li:organization:222");
    expect(
      resolveLinkedInOrganizationInput({
        configOrganizationUrn: "333",
      }),
    ).toBe("urn:li:organization:333");
  });

  it("builds a LinkedIn image post payload without inventing extra fields", () => {
    const payload = buildLinkedInOrganicPostPayload({
      organizationUrn: "urn:li:organization:2414183",
      commentary: "hello world",
      imageUrn: "urn:li:image:abc123",
      imageAltText: "alt copy",
    });
    expect(payload).toMatchObject({
      author: "urn:li:organization:2414183",
      commentary: "hello world",
      visibility: "PUBLIC",
      lifecycleState: "PUBLISHED",
      content: {
        media: {
          id: "urn:li:image:abc123",
          altText: "alt copy",
        },
      },
    });
  });
});
