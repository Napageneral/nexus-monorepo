import { describe, expect, it } from "vitest";
import { createPasswordHash, signHs256Jwt, verifyPasswordHash } from "./crypto.js";

describe("crypto helpers", () => {
  it("hashes and verifies passwords", () => {
    const hash = createPasswordHash("secret-123");
    expect(hash.startsWith("scrypt-sha256-v1$")).toBe(true);
    expect(verifyPasswordHash({ password: "secret-123", encoded: hash })).toBe(true);
    expect(verifyPasswordHash({ password: "wrong", encoded: hash })).toBe(false);
  });

  it("creates hs256 jwt tokens", () => {
    const token = signHs256Jwt({
      claims: { sub: "entity-owner", aud: "runtime-api" },
      secret: "top-secret",
    });
    const parts = token.split(".");
    expect(parts).toHaveLength(3);
  });
});
