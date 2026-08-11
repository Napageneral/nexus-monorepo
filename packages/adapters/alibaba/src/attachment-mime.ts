const JPEG = "image/jpeg";
const PNG = "image/png";
const WEBP = "image/webp";
const HEIC = "image/heic";
const PDF = "application/pdf";
const MP4 = "video/mp4";
const QUICKTIME = "video/quicktime";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type AlibabaAttachmentMime =
  | typeof JPEG
  | typeof PNG
  | typeof WEBP
  | typeof HEIC
  | typeof PDF
  | typeof MP4
  | typeof QUICKTIME
  | typeof DOCX
  | typeof XLSX;

const GENERIC_PROVIDER_MIME = new Set([
  "application/octet-stream",
  "application/binary",
  "application/x-binary",
  "binary/octet-stream",
]);

const COMPATIBLE_PROVIDER_MIME: Record<AlibabaAttachmentMime, ReadonlySet<string>> = {
  [JPEG]: new Set([JPEG, "image/jpg", "image/pjpeg"]),
  [PNG]: new Set([PNG]),
  [WEBP]: new Set([WEBP]),
  [HEIC]: new Set([HEIC, "image/heif", "image/heic-sequence", "image/heif-sequence"]),
  [PDF]: new Set([PDF, "application/x-pdf"]),
  [MP4]: new Set([MP4, "application/mp4"]),
  // The reviewed Alibaba corpus labels one QuickTime ftyp container video/mp4.
  // Treat that broad video-family label as compatible, then emit the exact
  // byte-derived QuickTime type.
  [QUICKTIME]: new Set([QUICKTIME, MP4, "application/quicktime"]),
  [DOCX]: new Set([DOCX, "application/zip"]),
  [XLSX]: new Set([XLSX, "application/zip"]),
};

const MP4_BRANDS = new Set([
  "avc1",
  "iso2",
  "iso3",
  "iso4",
  "iso5",
  "iso6",
  "isom",
  "m4v ",
  "mp41",
  "mp42",
]);

const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "mif1", "msf1"]);

export function normalizeAlibabaAttachmentMime(
  bytes: Buffer,
  providerContentType: string | null | undefined,
): AlibabaAttachmentMime {
  const detected = detectAlibabaAttachmentMime(bytes);
  if (!detected) {
    throw new Error("Alibaba attachment has an unsupported sealed byte signature");
  }
  const providerMime = normalizeProviderMime(providerContentType);
  if (!providerMime || GENERIC_PROVIDER_MIME.has(providerMime)) return detected;
  if (!COMPATIBLE_PROVIDER_MIME[detected].has(providerMime)) {
    throw new Error(
      `Alibaba attachment provider content type contradicts sealed bytes: ${providerMime} != ${detected}`,
    );
  }
  return detected;
}

export function detectAlibabaAttachmentMime(bytes: Buffer): AlibabaAttachmentMime | undefined {
  if (hasPrefix(bytes, Buffer.from([0xff, 0xd8, 0xff]))) return JPEG;
  if (hasPrefix(bytes, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return PNG;
  }
  if (hasPrefix(bytes, Buffer.from("%PDF-", "ascii"))) return PDF;
  if (
    bytes.length >= 12
    && bytes.subarray(0, 4).toString("ascii") === "RIFF"
    && bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    if (bytes.readUInt32LE(4) + 8 !== bytes.length) {
      throw new Error("Alibaba attachment WebP container size is malformed");
    }
    return WEBP;
  }
  if (bytes.length >= 8 && bytes.subarray(4, 8).toString("ascii") === "ftyp") {
    return detectIsoBaseMediaMime(bytes);
  }
  if (hasPrefix(bytes, Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
    return detectOfficeZipMime(bytes);
  }
  return undefined;
}

function normalizeProviderMime(value: string | null | undefined): string | undefined {
  const normalized = String(value ?? "")
    .split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  return normalized || undefined;
}

function hasPrefix(bytes: Buffer, prefix: Buffer): boolean {
  return bytes.length >= prefix.length && bytes.subarray(0, prefix.length).equals(prefix);
}

function detectIsoBaseMediaMime(bytes: Buffer): AlibabaAttachmentMime {
  if (bytes.length < 16) throw new Error("Alibaba attachment media container is truncated");
  const boxSize = bytes.readUInt32BE(0);
  if (boxSize < 16 || boxSize > bytes.length || boxSize % 4 !== 0) {
    throw new Error("Alibaba attachment media container is malformed");
  }
  const brands = new Set<string>();
  brands.add(bytes.subarray(8, 12).toString("ascii").toLowerCase());
  for (let offset = 16; offset + 4 <= boxSize; offset += 4) {
    brands.add(bytes.subarray(offset, offset + 4).toString("ascii").toLowerCase());
  }
  if ([...brands].some((brand) => HEIC_BRANDS.has(brand))) return HEIC;
  if (brands.has("qt  ")) return QUICKTIME;
  if ([...brands].some((brand) => MP4_BRANDS.has(brand))) return MP4;
  throw new Error("Alibaba attachment media container brand is unsupported");
}

function detectOfficeZipMime(bytes: Buffer): AlibabaAttachmentMime | undefined {
  const entryNames = readZipCentralDirectoryEntryNames(bytes);
  if (!entryNames.has("[Content_Types].xml")) return undefined;
  if (entryNames.has("word/document.xml")) return DOCX;
  if (entryNames.has("xl/workbook.xml")) return XLSX;
  return undefined;
}

function readZipCentralDirectoryEntryNames(bytes: Buffer): Set<string> {
  const eocdOffset = findZipEndOfCentralDirectory(bytes);
  if (eocdOffset < 0) throw new Error("Alibaba attachment ZIP container is truncated");
  const diskNumber = bytes.readUInt16LE(eocdOffset + 4);
  const centralDirectoryDisk = bytes.readUInt16LE(eocdOffset + 6);
  const entriesOnDisk = bytes.readUInt16LE(eocdOffset + 8);
  const entryCount = bytes.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize = bytes.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = bytes.readUInt32LE(eocdOffset + 16);
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
  if (
    diskNumber !== 0
    || centralDirectoryDisk !== 0
    || entriesOnDisk !== entryCount
    || entryCount === 0xffff
    || centralDirectoryOffset === 0xffffffff
    || centralDirectorySize === 0xffffffff
    || centralDirectoryEnd > eocdOffset
  ) {
    throw new Error("Alibaba attachment ZIP container custody is unsupported");
  }

  const names = new Set<string>();
  let offset = centralDirectoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > centralDirectoryEnd || bytes.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error("Alibaba attachment ZIP central directory is malformed");
    }
    const fileNameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const diskStart = bytes.readUInt16LE(offset + 34);
    const localHeaderOffset = bytes.readUInt32LE(offset + 42);
    const entryEnd = offset + 46 + fileNameLength + extraLength + commentLength;
    if (diskStart !== 0 || entryEnd > centralDirectoryEnd) {
      throw new Error("Alibaba attachment ZIP central directory is truncated");
    }
    const fileName = bytes.subarray(offset + 46, offset + 46 + fileNameLength).toString("utf8");
    if (!fileName || fileName.includes("\u0000")) {
      throw new Error("Alibaba attachment ZIP entry name is malformed");
    }
    const normalizedName = fileName.replaceAll("\\", "/");
    if (names.has(normalizedName)) {
      throw new Error("Alibaba attachment ZIP entry name is duplicated");
    }
    validateZipLocalEntry(bytes, localHeaderOffset, centralDirectoryOffset, fileName, offset);
    names.add(normalizedName);
    offset = entryEnd;
  }
  if (offset !== centralDirectoryEnd) {
    throw new Error("Alibaba attachment ZIP central directory size disagrees");
  }
  return names;
}

function validateZipLocalEntry(
  bytes: Buffer,
  localHeaderOffset: number,
  centralDirectoryOffset: number,
  centralName: string,
  centralEntryOffset: number,
): void {
  if (
    localHeaderOffset + 30 > centralDirectoryOffset
    || bytes.readUInt32LE(localHeaderOffset) !== 0x04034b50
  ) {
    throw new Error("Alibaba attachment ZIP local entry is malformed");
  }
  const centralFlags = bytes.readUInt16LE(centralEntryOffset + 8);
  const centralCompression = bytes.readUInt16LE(centralEntryOffset + 10);
  const compressedSize = bytes.readUInt32LE(centralEntryOffset + 20);
  const localFlags = bytes.readUInt16LE(localHeaderOffset + 6);
  const localCompression = bytes.readUInt16LE(localHeaderOffset + 8);
  const localNameLength = bytes.readUInt16LE(localHeaderOffset + 26);
  const localExtraLength = bytes.readUInt16LE(localHeaderOffset + 28);
  const localNameStart = localHeaderOffset + 30;
  const localDataStart = localNameStart + localNameLength + localExtraLength;
  if (
    (centralFlags & 0x1) !== 0
    || centralFlags !== localFlags
    || centralCompression !== localCompression
    || localDataStart + compressedSize > centralDirectoryOffset
  ) {
    throw new Error("Alibaba attachment ZIP local entry custody disagrees");
  }
  const localName = bytes.subarray(localNameStart, localNameStart + localNameLength).toString("utf8");
  if (localName !== centralName) {
    throw new Error("Alibaba attachment ZIP local and central entry names disagree");
  }
}

function findZipEndOfCentralDirectory(bytes: Buffer): number {
  if (bytes.length < 22) return -1;
  const minimum = Math.max(0, bytes.length - 22 - 0xffff);
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (bytes.readUInt32LE(offset) !== 0x06054b50) continue;
    const commentLength = bytes.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === bytes.length) return offset;
  }
  return -1;
}
