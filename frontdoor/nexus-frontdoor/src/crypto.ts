import { createHash, createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";

const PASSWORD_HASH_ALGO = "scrypt-sha256-v1";

export function base64UrlEncode(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

export function base64UrlDecode(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

export function signHs256Jwt(params: {
  claims: Record<string, unknown>;
  secret: string;
  kid?: string;
}): string {
  const header: Record<string, unknown> = {
    alg: "HS256",
    typ: "JWT",
  };
  if (params.kid && params.kid.trim()) {
    header.kid = params.kid.trim();
  }
  const headerPart = base64UrlEncode(JSON.stringify(header));
  const payloadPart = base64UrlEncode(JSON.stringify(params.claims));
  const signingInput = `${headerPart}.${payloadPart}`;
  const signature = createHmac("sha256", params.secret).update(signingInput, "utf8").digest("base64url");
  return `${signingInput}.${signature}`;
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function tokenHash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function createPasswordHash(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 32);
  return `${PASSWORD_HASH_ALGO}$${base64UrlEncode(salt)}$${base64UrlEncode(key)}`;
}

export function verifyPasswordHash(params: {
  password: string;
  encoded: string;
}): boolean {
  const [algo, saltPart, hashPart] = params.encoded.split("$");
  if (algo !== PASSWORD_HASH_ALGO || !saltPart || !hashPart) {
    return false;
  }
  const salt = base64UrlDecode(saltPart);
  const expected = base64UrlDecode(hashPart);
  const actual = scryptSync(params.password, salt, expected.length);
  if (actual.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(actual, expected);
}

export function nowEpochSeconds(nowMs = Date.now()): number {
  return Math.floor(nowMs / 1000);
}

export function newJwtId(): string {
  return randomUUID();
}
