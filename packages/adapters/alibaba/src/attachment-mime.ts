const JPEG = "image/jpeg";
const PNG = "image/png";
const WEBP = "image/webp";
const HEIC = "image/heic";
const GIF = "image/gif";
const PDF = "application/pdf";
const MP4 = "video/mp4";
const QUICKTIME = "video/quicktime";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const DOC = "application/msword";
const XLS = "application/vnd.ms-excel";
const PPT = "application/vnd.ms-powerpoint";
const OLE_STORAGE = "application/x-ole-storage";
const OCTET_STREAM = "application/octet-stream";

export type AlibabaAttachmentMime =
  | typeof JPEG
  | typeof PNG
  | typeof WEBP
  | typeof HEIC
  | typeof PDF
  | typeof MP4
  | typeof QUICKTIME
  | typeof DOCX
  | typeof XLSX
  | typeof GIF
  | typeof DOC
  | typeof XLS
  | typeof PPT
  | typeof OLE_STORAGE
  | typeof OCTET_STREAM;

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

/**
 * The MIME type of one sealed attachment. Never throws.
 *
 * By the time this runs the adapter has already proved the bytes against the
 * sealed digest and byte count, so the type is a label on evidence, never a
 * gate on it. The capture keeps every file the provider's download endpoint
 * serves, including formats it cannot profile (its "opaque" custody class);
 * a file this module cannot name, or whose container it cannot parse, is
 * emitted as application/octet-stream. One unrecognized file must never fail
 * a backfill: a backfill re-reads every published snapshot, so a throw here
 * stops the whole capture until a person intervenes (2026-11-17: one legacy
 * .xls stopped MoonSleep's Alibaba capture for 16 hours).
 */
export function normalizeAlibabaAttachmentMime(
  bytes: Buffer,
  _providerContentType: string | null | undefined,
): AlibabaAttachmentMime {
  // Alibaba download metadata is advisory and is known to mislabel valid
  // sealed evidence, so the adapter emits the byte-derived MIME without
  // letting transport metadata veto or rename immutable evidence.
  try {
    return detectAlibabaAttachmentMime(bytes) ?? OCTET_STREAM;
  } catch {
    return OCTET_STREAM;
  }
}

export function detectAlibabaAttachmentMime(bytes: Buffer): AlibabaAttachmentMime | undefined {
  if (hasPrefix(bytes, Buffer.from([0xff, 0xd8, 0xff]))) return JPEG;
  if (hasPrefix(bytes, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return PNG;
  }
  if (hasPrefix(bytes, Buffer.from("%PDF-", "ascii"))) return PDF;
  if (hasPrefix(bytes, Buffer.from("GIF87a", "ascii")) || hasPrefix(bytes, Buffer.from("GIF89a", "ascii"))) {
    return GIF;
  }
  if (hasPrefix(bytes, OLE_MAGIC)) return detectOleCompoundFileMime(bytes);
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

const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const OLE_MAX_REGULAR_SECTOR = 0xfffffffa;
const OLE_END_OF_CHAIN = 0xfffffffe;
const OLE_NO_STREAM = 0xffffffff;
const OLE_MAX_DIRECTORY_ENTRIES = 16_384;

/**
 * Legacy Office files (.doc, .xls, .ppt) are OLE2 compound files. The magic
 * proves the container; the application is named by a stream in the root
 * storage. Only the root's own children are read, so a workbook embedded in a
 * Word document does not make the document a spreadsheet. A compound file
 * whose directory cannot be walked is still a compound file.
 */
function detectOleCompoundFileMime(bytes: Buffer): AlibabaAttachmentMime {
  const names = readOleRootEntryNames(bytes);
  if (!names) return OLE_STORAGE;
  if (names.has("worddocument")) return DOC;
  if (names.has("workbook") || names.has("book")) return XLS;
  if (names.has("powerpoint document")) return PPT;
  return OLE_STORAGE;
}

function readOleRootEntryNames(bytes: Buffer): Set<string> | undefined {
  if (bytes.length < 512) return undefined;
  const sectorShift = bytes.readUInt16LE(30);
  if (sectorShift !== 9 && sectorShift !== 12) return undefined;
  const sectorSize = 1 << sectorShift;
  const sectorCount = Math.floor((bytes.length - sectorSize) / sectorSize);
  if (sectorCount < 1) return undefined;
  const sectorOffset = (sector: number): number | undefined =>
    sector < sectorCount ? (sector + 1) * sectorSize : undefined;
  const idsPerSector = sectorSize / 4;

  // The first 109 FAT sector ids sit in the header; more follow in DIFAT sectors.
  // Unused slots (FREESECT) only ever trail the used ones, so the list stays
  // positional: fatSectors[n] holds the ids of sectors n * idsPerSector onward.
  // A FAT sector past maxFatSectors could only describe sectors beyond the end
  // of the file, so the list (and the memory a crafted DIFAT loop can claim)
  // is bounded by the file's own size.
  const maxFatSectors = Math.ceil(sectorCount / idsPerSector);
  const fatSectors: number[] = [];
  for (let index = 0; index < 109 && fatSectors.length < maxFatSectors; index += 1) {
    const sector = bytes.readUInt32LE(76 + index * 4);
    if (sector > OLE_MAX_REGULAR_SECTOR) break;
    fatSectors.push(sector);
  }
  let difatSector = bytes.readUInt32LE(68);
  while (difatSector <= OLE_MAX_REGULAR_SECTOR && fatSectors.length < maxFatSectors) {
    const offset = sectorOffset(difatSector);
    if (offset === undefined) return undefined;
    // Every pass adds at least one FAT sector or ends the walk, so it terminates.
    const before = fatSectors.length;
    for (let index = 0; index < idsPerSector - 1 && fatSectors.length < maxFatSectors; index += 1) {
      const sector = bytes.readUInt32LE(offset + index * 4);
      if (sector > OLE_MAX_REGULAR_SECTOR) break;
      fatSectors.push(sector);
    }
    if (fatSectors.length === before) break;
    difatSector = bytes.readUInt32LE(offset + sectorSize - 4);
  }
  const nextSector = (sector: number): number | undefined => {
    const fatSector = fatSectors[Math.floor(sector / idsPerSector)];
    const fatOffset = fatSector === undefined ? undefined : sectorOffset(fatSector);
    return fatOffset === undefined
      ? undefined
      : bytes.readUInt32LE(fatOffset + (sector % idsPerSector) * 4);
  };

  type Entry = { name: string; type: number; left: number; right: number; child: number };
  const entries: Entry[] = [];
  let directorySector = bytes.readUInt32LE(48);
  for (let hops = 0; directorySector !== OLE_END_OF_CHAIN; hops += 1) {
    const offset = sectorOffset(directorySector);
    if (offset === undefined || hops > sectorCount) return undefined;
    for (let entryOffset = offset; entryOffset < offset + sectorSize; entryOffset += 128) {
      if (entries.length >= OLE_MAX_DIRECTORY_ENTRIES) return undefined;
      const nameBytes = bytes.readUInt16LE(entryOffset + 64);
      const nameLength = nameBytes >= 2 && nameBytes <= 64 ? nameBytes - 2 : 0;
      entries.push({
        name: bytes.subarray(entryOffset, entryOffset + nameLength).toString("utf16le").toLowerCase(),
        type: bytes.readUInt8(entryOffset + 66),
        left: bytes.readUInt32LE(entryOffset + 68),
        right: bytes.readUInt32LE(entryOffset + 72),
        child: bytes.readUInt32LE(entryOffset + 76),
      });
    }
    const next = nextSector(directorySector);
    if (next === undefined) return undefined;
    directorySector = next;
  }
  const root = entries[0];
  if (!root || root.type !== 5) return undefined;

  // The root's children are one sibling tree; storages below them are not entered.
  const names = new Set<string>();
  const seen = new Set<number>();
  const pending = [root.child];
  while (pending.length) {
    const index = pending.pop() as number;
    if (index === OLE_NO_STREAM) continue;
    const entry = entries[index];
    if (!entry || seen.has(index)) return undefined;
    seen.add(index);
    if (entry.type === 2) names.add(entry.name);
    pending.push(entry.left, entry.right);
  }
  return names;
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
