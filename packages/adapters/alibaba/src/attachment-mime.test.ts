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

type OleEntry = {
  name: string;
  /** 1 storage, 2 stream, 5 root. */
  type: 1 | 2 | 5;
  left?: number;
  right?: number;
  child?: number;
};

const OLE_FREE = 0xffffffff;

/** A minimal OLE2 compound file: header, one FAT sector, then the directory chain. */
function oleCompoundFile(entries: OleEntry[]): Buffer {
  const sectorSize = 512;
  const directorySectors = Math.max(1, Math.ceil(entries.length / 4));
  const header = Buffer.alloc(sectorSize);
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(header, 0);
  header.writeUInt16LE(0x003e, 24);
  header.writeUInt16LE(0x0003, 26);
  header.writeUInt16LE(0xfffe, 28);
  header.writeUInt16LE(9, 30);
  header.writeUInt16LE(6, 32);
  header.writeUInt32LE(1, 44);
  header.writeUInt32LE(1, 48);
  header.writeUInt32LE(0x1000, 56);
  header.writeUInt32LE(0xfffffffe, 60);
  header.writeUInt32LE(0xfffffffe, 68);
  header.fill(0xff, 76);
  header.writeUInt32LE(0, 76);

  const fat = Buffer.alloc(sectorSize, 0xff);
  fat.writeUInt32LE(0xfffffffd, 0);
  for (let sector = 1; sector <= directorySectors; sector += 1) {
    fat.writeUInt32LE(sector === directorySectors ? 0xfffffffe : sector + 1, sector * 4);
  }

  const directory = Buffer.alloc(directorySectors * sectorSize);
  for (let index = 0; index < directorySectors * 4; index += 1) {
    const offset = index * 128;
    const entry = entries[index];
    directory.writeUInt32LE(entry?.left ?? OLE_FREE, offset + 68);
    directory.writeUInt32LE(entry?.right ?? OLE_FREE, offset + 72);
    directory.writeUInt32LE(entry?.child ?? OLE_FREE, offset + 76);
    if (!entry) continue;
    const name = Buffer.from(`${entry.name}\u0000`, "utf16le");
    name.copy(directory, offset);
    directory.writeUInt16LE(name.length, offset + 64);
    directory.writeUInt8(entry.type, offset + 66);
  }
  return Buffer.concat([header, fat, directory]);
}

const LEGACY_XLS = oleCompoundFile([
  { name: "Root Entry", type: 5, child: 1 },
  { name: "Workbook", type: 2, right: 2 },
  { name: "\u0005SummaryInformation", type: 2 },
]);

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
    name: "HEIC",
    bytes: isoBaseMedia("heic", "mif1"),
    provider: "application/octet-stream",
    expected: "image/heic",
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
  {
    name: "GIF",
    bytes: Buffer.from("GIF89a\u0001\u0000\u0001\u0000\u0000\u0000\u0000;", "latin1"),
    provider: "image/gif",
    expected: "image/gif",
  },
  {
    name: "legacy XLS",
    bytes: LEGACY_XLS,
    provider: "application/octet-stream",
    expected: "application/vnd.ms-excel",
  },
  {
    name: "Excel 5 XLS",
    bytes: oleCompoundFile([
      { name: "Root Entry", type: 5, child: 1 },
      { name: "Book", type: 2 },
    ]),
    provider: "application/vnd.ms-excel",
    expected: "application/vnd.ms-excel",
  },
  {
    // The Word stream sits in the second directory sector, reached through the
    // FAT, and an embedded workbook below a storage must not rename the file.
    name: "legacy DOC with an embedded workbook",
    bytes: oleCompoundFile([
      { name: "Root Entry", type: 5, child: 1 },
      { name: "1Table", type: 2, left: 2, right: 5 },
      { name: "ObjectPool", type: 1, child: 3 },
      { name: "Workbook", type: 2 },
      { name: "\u0005SummaryInformation", type: 2 },
      { name: "WordDocument", type: 2 },
    ]),
    provider: "application/msword",
    expected: "application/msword",
  },
  {
    name: "legacy PPT",
    bytes: oleCompoundFile([
      { name: "Root Entry", type: 5, child: 1 },
      { name: "PowerPoint Document", type: 2 },
    ]),
    provider: "application/octet-stream",
    expected: "application/vnd.ms-powerpoint",
  },
  {
    name: "other compound file",
    bytes: oleCompoundFile([
      { name: "Root Entry", type: 5, child: 1 },
      { name: "__properties_version1.0", type: 2 },
    ]),
    provider: "application/octet-stream",
    expected: "application/x-ole-storage",
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

test("misleading provider MIME cannot veto or rename sealed bytes", () => {
  assert.equal(
    normalizeAlibabaAttachmentMime(FIXTURES[0].bytes, "image/png"),
    "image/jpeg",
  );
  assert.equal(
    normalizeAlibabaAttachmentMime(Buffer.from("not an attachment"), "application/pdf"),
    "application/octet-stream",
  );
});

test("a file the adapter cannot name is kept as opaque bytes, never refused", () => {
  // The capture's own custody classes the adapter has no profile for: an
  // opaque provider-bound file and validated UTF-8 text.
  for (const bytes of [
    Buffer.from("not an attachment"),
    Buffer.from("sku,qty\nMS-1,2\n"),
    Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00]),
    storedZip(["mimetype", "content.xml"]),
    Buffer.alloc(1),
  ]) {
    assert.equal(detectAlibabaAttachmentMime(bytes), undefined);
    assert.equal(normalizeAlibabaAttachmentMime(bytes, "application/octet-stream"), "application/octet-stream");
    assert.equal(normalizeAlibabaAttachmentMime(bytes, null), "application/octet-stream");
  }
});

test("a recognized container the adapter cannot parse is kept as opaque bytes", () => {
  const truncatedOffice = FIXTURES[7].bytes.subarray(0, FIXTURES[7].bytes.length - 1);
  assert.throws(() => detectAlibabaAttachmentMime(truncatedOffice), /ZIP container is truncated/);
  const contradictoryOffice = Buffer.from(FIXTURES[7].bytes);
  contradictoryOffice[30] = "x".charCodeAt(0);
  assert.throws(
    () => detectAlibabaAttachmentMime(contradictoryOffice),
    /local and central entry names disagree/,
  );
  const malformedMedia = Buffer.from(FIXTURES[5].bytes);
  malformedMedia.writeUInt32BE(malformedMedia.length + 4, 0);
  assert.throws(() => detectAlibabaAttachmentMime(malformedMedia), /media container is malformed/);
  const unknownBrand = isoBaseMedia("zzzz", "zzzz");
  assert.throws(() => detectAlibabaAttachmentMime(unknownBrand), /media container brand is unsupported/);
  const malformedWebp = Buffer.from("RIFF\u0000\u0000\u0000\u0000WEBPVP8 ", "latin1");
  assert.throws(() => detectAlibabaAttachmentMime(malformedWebp), /WebP container size is malformed/);
  for (const bytes of [truncatedOffice, contradictoryOffice, malformedMedia, unknownBrand, malformedWebp]) {
    assert.equal(normalizeAlibabaAttachmentMime(bytes, "application/zip"), "application/octet-stream");
  }
});

test("a damaged compound file is still a compound file and never loops", () => {
  const magicOnly = LEGACY_XLS.subarray(0, 8);
  const headerOnly = LEGACY_XLS.subarray(0, 512);
  const directoryCut = LEGACY_XLS.subarray(0, 1024 + 128);
  const strangeSectorSize = Buffer.from(LEGACY_XLS);
  strangeSectorSize.writeUInt16LE(31, 30);
  const directoryOutOfRange = Buffer.from(LEGACY_XLS);
  directoryOutOfRange.writeUInt32LE(900, 48);
  const directoryChainLoop = Buffer.from(LEGACY_XLS);
  directoryChainLoop.writeUInt32LE(1, 512 + 4);
  const siblingLoop = oleCompoundFile([
    { name: "Root Entry", type: 5, child: 1 },
    { name: "Workbook", type: 2, left: 1 },
  ]);
  const childOutOfRange = oleCompoundFile([{ name: "Root Entry", type: 5, child: 40 }]);
  const noRoot = oleCompoundFile([{ name: "Workbook", type: 2 }]);
  for (const bytes of [
    magicOnly,
    headerOnly,
    directoryCut,
    strangeSectorSize,
    directoryOutOfRange,
    directoryChainLoop,
    siblingLoop,
    childOutOfRange,
    noRoot,
  ]) {
    assert.equal(detectAlibabaAttachmentMime(bytes), "application/x-ole-storage");
    assert.equal(normalizeAlibabaAttachmentMime(bytes, "application/octet-stream"), "application/x-ole-storage");
  }
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
