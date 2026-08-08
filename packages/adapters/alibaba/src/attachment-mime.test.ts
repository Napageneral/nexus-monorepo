import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import test from "node:test";
import {
  detectAlibabaAttachmentMime,
  normalizeAlibabaAttachmentMime,
} from "./attachment-mime.ts";

const REAL_CORPUS_MANIFEST_SHA256 =
  "0e89657ec3eeb65bd768f7578382ac4078c0952232ab015dd152dc10251b80a6";

function isoBaseMedia(majorBrand: string, compatibleBrand: string): Buffer {
  const bytes = Buffer.alloc(24);
  bytes.writeUInt32BE(bytes.length, 0);
  bytes.write("ftyp", 4, "ascii");
  bytes.write(majorBrand, 8, "ascii");
  bytes.writeUInt32BE(0, 12);
  bytes.write(compatibleBrand, 16, "ascii");
  bytes.write(majorBrand, 20, "ascii");
  return bytes;
}

function storedZip(entryNames: string[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;
  for (const entryName of entryNames) {
    const name = Buffer.from(entryName, "utf8");
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    localParts.push(local);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(localOffset, 42);
    name.copy(central, 46);
    centralParts.push(central);
    localOffset += local.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entryNames.length, 8);
  eocd.writeUInt16LE(entryNames.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, centralDirectory, eocd]);
}

const FIXTURES = [
  {
    name: "JPEG",
    bytes: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
    provider: "image/jpeg",
    expected: "image/jpeg",
  },
  {
    name: "PNG",
    bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    provider: "image/png; charset=binary",
    expected: "image/png",
  },
  {
    name: "WebP",
    bytes: Buffer.from("RIFF\u0008\u0000\u0000\u0000WEBPVP8 ", "binary"),
    provider: "image/webp",
    expected: "image/webp",
  },
  {
    name: "PDF",
    bytes: Buffer.from("%PDF-1.7\n%%EOF\n", "ascii"),
    provider: "application/pdf",
    expected: "application/pdf",
  },
  {
    name: "MP4",
    bytes: isoBaseMedia("isom", "mp42"),
    provider: "video/mp4",
    expected: "video/mp4",
  },
  {
    name: "QuickTime",
    bytes: isoBaseMedia("qt  ", "qt  "),
    provider: "video/mp4",
    expected: "video/quicktime",
  },
  {
    name: "DOCX",
    bytes: storedZip(["[Content_Types].xml", "word/document.xml"]),
    provider: "application/zip",
    expected: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  {
    name: "XLSX",
    bytes: storedZip(["[Content_Types].xml", "xl/workbook.xml"]),
    provider: "application/octet-stream",
    expected: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
] as const;

test("recognized attachment signatures deterministically normalize provider MIME", () => {
  for (const fixture of FIXTURES) {
    assert.equal(detectAlibabaAttachmentMime(fixture.bytes), fixture.expected, fixture.name);
    assert.equal(
      normalizeAlibabaAttachmentMime(fixture.bytes, fixture.provider),
      fixture.expected,
      fixture.name,
    );
    assert.equal(
      normalizeAlibabaAttachmentMime(fixture.bytes, "application/octet-stream"),
      fixture.expected,
      `${fixture.name} generic provider MIME`,
    );
    assert.equal(
      normalizeAlibabaAttachmentMime(fixture.bytes, ""),
      fixture.expected,
      `${fixture.name} blank provider MIME`,
    );
  }
});

test("contradictory provider MIME and malformed containers fail closed", () => {
  assert.throws(
    () => normalizeAlibabaAttachmentMime(FIXTURES[0].bytes, "image/png"),
    /contradicts sealed bytes/,
  );
  assert.throws(
    () => normalizeAlibabaAttachmentMime(Buffer.from("not an attachment"), "application/pdf"),
    /unsupported sealed byte signature/,
  );
  const truncatedOffice = FIXTURES[6].bytes.subarray(0, FIXTURES[6].bytes.length - 1);
  assert.throws(
    () => normalizeAlibabaAttachmentMime(truncatedOffice, "application/zip"),
    /ZIP container is truncated/,
  );
  const contradictoryOffice = Buffer.from(FIXTURES[6].bytes);
  contradictoryOffice[30] = "x".charCodeAt(0);
  assert.throws(
    () => normalizeAlibabaAttachmentMime(contradictoryOffice, "application/zip"),
    /local and central entry names disagree/,
  );
  const malformedMedia = Buffer.from(FIXTURES[4].bytes);
  malformedMedia.writeUInt32BE(malformedMedia.length + 4, 0);
  assert.throws(
    () => normalizeAlibabaAttachmentMime(malformedMedia, "video/mp4"),
    /media container is malformed/,
  );
});

type CorpusEntry = {
  byte_count: number;
  capture_status: string;
  content_sha256: string;
  content_type?: string | null;
  relative_path: string;
};

const realManifestPath = process.env.NEXUS_ALIBABA_REAL_CORPUS_MANIFEST;
const realCorpusRoot = process.env.NEXUS_ALIBABA_REAL_CORPUS_ROOT;

test(
  "reviewed 1,148-file corpus has exact byte-derived MIME inventory",
  { skip: !realManifestPath || !realCorpusRoot },
  () => {
    assert.ok(realManifestPath);
    assert.ok(realCorpusRoot);
    const manifestBytes = readFileSync(realManifestPath);
    assert.equal(
      createHash("sha256").update(manifestBytes).digest("hex"),
      REAL_CORPUS_MANIFEST_SHA256,
    );
    const manifest = JSON.parse(manifestBytes.toString("utf8")) as {
      attachment_count: number;
      business_mutation_enabled: boolean;
      entries: CorpusEntry[];
      provider_read_count: number;
      remote_mutation_enabled: boolean;
    };
    assert.equal(manifest.attachment_count, 1_148);
    assert.equal(manifest.entries.length, 1_148);
    assert.equal(manifest.provider_read_count, 0);
    assert.equal(manifest.remote_mutation_enabled, false);
    assert.equal(manifest.business_mutation_enabled, false);

    const root = resolve(realCorpusRoot);
    const inventory = new Map<string, number>();
    const captureStatuses = new Map<string, number>();
    for (const entry of manifest.entries) {
      captureStatuses.set(
        entry.capture_status,
        (captureStatuses.get(entry.capture_status) ?? 0) + 1,
      );
      const evidencePath = resolve(root, entry.relative_path);
      const pathFromRoot = relative(root, evidencePath);
      assert.ok(pathFromRoot && !pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot));
      const evidenceBytes = readFileSync(evidencePath);
      assert.equal(evidenceBytes.length, entry.byte_count, entry.relative_path);
      assert.equal(
        createHash("sha256").update(evidenceBytes).digest("hex"),
        entry.content_sha256,
        entry.relative_path,
      );
      const normalized = normalizeAlibabaAttachmentMime(evidenceBytes, entry.content_type);
      assert.notEqual(normalized, "application/octet-stream");
      if (normalized === "video/mp4" || normalized === "video/quicktime") {
        assert.match(normalized, /^video\//);
      }
      inventory.set(normalized, (inventory.get(normalized) ?? 0) + 1);
    }

    assert.deepEqual(Object.fromEntries([...inventory].sort()), {
      "application/pdf": 94,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": 1,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": 3,
      "image/jpeg": 548,
      "image/png": 373,
      "image/webp": 7,
      "video/mp4": 121,
      "video/quicktime": 1,
    });
    assert.deepEqual(Object.fromEntries([...captureStatuses].sort()), {
      downloaded: 745,
      exists: 403,
    });
  },
);
