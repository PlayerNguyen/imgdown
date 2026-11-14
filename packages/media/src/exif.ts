/**
 * Minimal EXIF read / patch / embed pipeline.
 *
 * Bun.Image decodes pixels and drops metadata, so this module carries the
 * original EXIF block across when the user asks for it:
 *
 *  - JPEG: APP1 "Exif\0\0" segment
 *  - WebP: VP8X + EXIF chunk
 *  - PNG:  eXIf chunk
 *
 * Because Bun.Image applies EXIF orientation while decoding, the copied
 * Orientation tag is rewritten to 1 so viewers do not rotate twice.
 * GPS can be stripped independently from the rest of the metadata.
 */

import { crc32 } from "./zip";

// "Exif\0\0"
const EXIF_HEADER = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]);
const TYPE_SIZES: Record<number, number> = {
  1: 1,
  2: 1,
  3: 2,
  4: 4,
  5: 8,
  6: 1,
  7: 1,
  8: 2,
  9: 4,
  10: 8,
  11: 4,
  12: 8,
};

const ORIENTATION = 0x0112;
const IMAGE_WIDTH = 0x0100;
const IMAGE_HEIGHT = 0x0101;
const EXIF_IFD = 0x8769;
const GPS_IFD = 0x8825;
const PIXEL_X = 0xa002;
const PIXEL_Y = 0xa003;

function readU16(bytes: Uint8Array, offset: number, little: boolean): number {
  return little
    ? bytes[offset]! | (bytes[offset + 1]! << 8)
    : (bytes[offset]! << 8) | bytes[offset + 1]!;
}

function readU32(bytes: Uint8Array, offset: number, little: boolean): number {
  return little
    ? (bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16) | (bytes[offset + 3]! << 24)) >>> 0
    : ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0;
}

function writeU16(bytes: Uint8Array, offset: number, value: number, little: boolean): void {
  if (little) {
    bytes[offset] = value & 0xff;
    bytes[offset + 1] = (value >>> 8) & 0xff;
  } else {
    bytes[offset] = (value >>> 8) & 0xff;
    bytes[offset + 1] = value & 0xff;
  }
}

function writeU32(bytes: Uint8Array, offset: number, value: number, little: boolean): void {
  if (little) {
    bytes[offset] = value & 0xff;
    bytes[offset + 1] = (value >>> 8) & 0xff;
    bytes[offset + 2] = (value >>> 16) & 0xff;
    bytes[offset + 3] = (value >>> 24) & 0xff;
  } else {
    bytes[offset] = (value >>> 24) & 0xff;
    bytes[offset + 1] = (value >>> 16) & 0xff;
    bytes[offset + 2] = (value >>> 8) & 0xff;
    bytes[offset + 3] = value & 0xff;
  }
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let out = "";
  for (let i = 0; i < length && offset + i < bytes.length; i++) out += String.fromCodePoint(bytes[offset + i]!);
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

type TiffInfo = { little: boolean; ifd0: number };

function tiffInfo(tiff: Uint8Array): TiffInfo | null {
  if (tiff.length < 8) return null;
  let little: boolean;
  if (tiff[0] === 0x49 && tiff[1] === 0x49) little = true;
  else if (tiff[0] === 0x4d && tiff[1] === 0x4d) little = false;
  else return null;
  if (readU16(tiff, 2, little) !== 42) return null;
  const ifd0 = readU32(tiff, 4, little);
  if (ifd0 < 8 || ifd0 + 2 > tiff.length) return null;
  return { little, ifd0 };
}

function findEntry(tiff: Uint8Array, ifdOffset: number, little: boolean, tag: number): number | null {
  if (ifdOffset < 0 || ifdOffset + 2 > tiff.length) return null;
  const count = readU16(tiff, ifdOffset, little);
  if (count > 1024) return null;
  for (let i = 0; i < count; i++) {
    const entry = ifdOffset + 2 + i * 12;
    if (entry + 12 > tiff.length) return null;
    if (readU16(tiff, entry, little) === tag) return entry;
  }
  return null;
}

function setScalar(tiff: Uint8Array, entry: number, value: number, little: boolean): void {
  const type = readU16(tiff, entry + 2, little);
  const count = readU32(tiff, entry + 4, little);
  if (count < 1) return;
  if (type === 3) writeU16(tiff, entry + 8, value, little);
  else if (type === 4) writeU32(tiff, entry + 8, value, little);
}

export type ExifPatchOptions = {
  keepLocation: boolean;
  width?: number;
  height?: number;
};

/** Rewrites orientation to 1, refreshes dimensions and optionally removes GPS. */
export function patchExif(tiffInput: Uint8Array, options: ExifPatchOptions): Uint8Array {
  const tiff = tiffInput.slice();
  const info = tiffInfo(tiff);
  if (!info) return tiff;
  const { little, ifd0 } = info;

  const orientation = findEntry(tiff, ifd0, little, ORIENTATION);
  if (orientation) setScalar(tiff, orientation, 1, little);

  if (options.width && options.height) {
    const widthEntry = findEntry(tiff, ifd0, little, IMAGE_WIDTH);
    if (widthEntry) setScalar(tiff, widthEntry, options.width, little);
    const heightEntry = findEntry(tiff, ifd0, little, IMAGE_HEIGHT);
    if (heightEntry) setScalar(tiff, heightEntry, options.height, little);

    const exifIfdEntry = findEntry(tiff, ifd0, little, EXIF_IFD);
    if (exifIfdEntry) {
      const exifIfd = readU32(tiff, exifIfdEntry + 8, little);
      if (exifIfd + 2 <= tiff.length) {
        const x = findEntry(tiff, exifIfd, little, PIXEL_X);
        if (x) setScalar(tiff, x, options.width, little);
        const y = findEntry(tiff, exifIfd, little, PIXEL_Y);
        if (y) setScalar(tiff, y, options.height, little);
      }
    }
  }

  if (!options.keepLocation) stripGps(tiff, info);
  return tiff;
}

function stripGps(tiff: Uint8Array, info: TiffInfo): void {
  const entry = findEntry(tiff, info.ifd0, info.little, GPS_IFD);
  if (!entry) return;

  const gpsOffset = readU32(tiff, entry + 8, info.little);
  const ranges: [number, number][] = [];

  if (gpsOffset >= 8 && gpsOffset + 2 <= tiff.length) {
    const count = readU16(tiff, gpsOffset, info.little);
    const ifdSize = 2 + count * 12;
    if (count <= 1024 && gpsOffset + ifdSize <= tiff.length) {
      ranges.push([gpsOffset, ifdSize]);
      for (let i = 0; i < count; i++) {
        const gpsEntry = gpsOffset + 2 + i * 12;
        const type = readU16(tiff, gpsEntry + 2, info.little);
        const valueCount = readU32(tiff, gpsEntry + 4, info.little);
        const size = (TYPE_SIZES[type] ?? 0) * valueCount;
        if (size > 4) {
          const dataOffset = readU32(tiff, gpsEntry + 8, info.little);
          if (dataOffset > 0 && dataOffset + size <= tiff.length) ranges.push([dataOffset, size]);
        }
      }
    }
  }

  for (const [offset, size] of ranges) tiff.fill(0, offset, offset + size);

  writeU16(tiff, entry, 0xea1c, info.little);
  writeU16(tiff, entry + 2, 1, info.little);
  writeU32(tiff, entry + 4, 1, info.little);
  writeU32(tiff, entry + 8, 0, info.little);
}

function stripExifPrefix(payload: Uint8Array): Uint8Array {
  if (
    payload.length > 6 &&
    payload[0] === EXIF_HEADER[0] &&
    payload[1] === EXIF_HEADER[1] &&
    payload[2] === EXIF_HEADER[2] &&
    payload[3] === EXIF_HEADER[3] &&
    payload[4] === 0 &&
    payload[5] === 0
  ) {
    return payload.subarray(6);
  }
  return payload;
}

function extractJpeg(data: Uint8Array): Uint8Array | null {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 4 <= data.length) {
    if (data[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = data[offset + 1]!;
    if (marker === 0xff) {
      offset++;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (marker === 0xda || marker === 0xd9) break;
    const length = readU16(data, offset + 2, false);
    if (length < 2 || offset + 2 + length > data.length) break;
    if (marker === 0xe1 && length >= 8) {
      const header = offset + 4;
      if (ascii(data, header, 6) === "Exif\u0000\u0000") {
        return data.slice(header + 6, offset + 2 + length);
      }
    }
    offset += 2 + length;
  }
  return null;
}

function extractPng(data: Uint8Array): Uint8Array | null {
  if (data.length < 33) return null;
  if (data[0] !== 0x89 || data[1] !== 0x50 || data[2] !== 0x4e || data[3] !== 0x47) return null;
  let offset = 8;
  while (offset + 12 <= data.length) {
    const size = readU32(data, offset, false);
    if (offset + 12 + size > data.length) return null;
    const type = ascii(data, offset + 4, 4);
    if (type === "eXIf") return stripExifPrefix(data.slice(offset + 8, offset + 8 + size));
    offset += 12 + size;
  }
  return null;
}

function extractWebp(data: Uint8Array): Uint8Array | null {
  if (data.length < 16 || ascii(data, 0, 4) !== "RIFF" || ascii(data, 8, 4) !== "WEBP") return null;
  let offset = 12;
  while (offset + 8 <= data.length) {
    const size = readU32(data, offset + 4, true);
    if (offset + 8 + size > data.length) return null;
    if (ascii(data, offset, 4) === "EXIF") return stripExifPrefix(data.slice(offset + 8, offset + 8 + size));
    offset += 8 + size + (size & 1);
  }
  return null;
}

/** Returns a TIFF/EXIF block (without the "Exif\0\0" prefix) for JPEG, PNG or WebP input. */
export function extractExif(data: Uint8Array, format: string): Uint8Array | null {
  switch (format.toLowerCase()) {
    case "jpeg":
    case "jpg":
      return extractJpeg(data);
    case "png":
      return extractPng(data);
    case "webp":
      return extractWebp(data);
    default:
      return null;
  }
}

function injectJpeg(jpeg: Uint8Array, tiff: Uint8Array): Uint8Array {
  if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return jpeg;

  const segmentLength = 2 + EXIF_HEADER.length + tiff.length;
  const app1 = new Uint8Array(2 + segmentLength);
  app1[0] = 0xff;
  app1[1] = 0xe1;
  writeU16(app1, 2, segmentLength, false);
  app1.set(EXIF_HEADER, 4);
  app1.set(tiff, 4 + EXIF_HEADER.length);

  const parts: Uint8Array[] = [jpeg.subarray(0, 2)];
  let inserted = false;
  let offset = 2;
  while (offset + 4 <= jpeg.length) {
    if (jpeg[offset] !== 0xff) break;
    const marker = jpeg[offset + 1]!;
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(jpeg.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }
    const length = readU16(jpeg, offset + 2, false);
    if (length < 2 || offset + 2 + length > jpeg.length) break;
    const end = offset + 2 + length;
    const isExif = marker === 0xe1 && ascii(jpeg, offset + 4, 6) === "Exif\u0000\u0000";
    if (isExif) {
      offset = end;
      continue;
    }
    if (!inserted && marker !== 0xe0) {
      parts.push(app1);
      inserted = true;
    }
    parts.push(jpeg.subarray(offset, end));
    offset = end;
  }
  if (!inserted) parts.push(app1);
  parts.push(jpeg.subarray(offset));
  return concat(parts);
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const chunk = new Uint8Array(12 + data.length);
  writeU32(chunk, 0, data.length, false);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  writeU32(chunk, 8 + data.length, crc32(chunk.subarray(4, 8 + data.length)), false);
  return chunk;
}

function injectPng(png: Uint8Array, tiff: Uint8Array): Uint8Array {
  if (png.length < 33 || png[0] !== 0x89 || ascii(png, 1, 3) !== "PNG") return png;

  let hasExif = false;
  let scan = 8;
  while (scan + 12 <= png.length) {
    const size = readU32(png, scan, false);
    if (scan + 12 + size > png.length) break;
    if (ascii(png, scan + 4, 4) === "eXIf") {
      hasExif = true;
      break;
    }
    scan += 12 + size;
  }

  const exifChunk = pngChunk("eXIf", tiff);
  const parts: Uint8Array[] = [png.subarray(0, 8)];
  let offset = 8;
  let inserted = false;
  while (offset + 12 <= png.length) {
    const size = readU32(png, offset, false);
    const end = offset + 12 + size;
    if (end > png.length) return png;
    const type = ascii(png, offset + 4, 4);
    if (type === "eXIf") {
      parts.push(exifChunk);
      inserted = true;
    } else {
      parts.push(png.subarray(offset, end));
      if (type === "IHDR" && !hasExif) {
        parts.push(exifChunk);
        inserted = true;
      }
    }
    offset = end;
  }
  if (!inserted) return png;
  return concat(parts);
}

function webpChunk(type: string, data: Uint8Array): Uint8Array {
  const size = data.length;
  const out = new Uint8Array(8 + size + (size & 1));
  out.set(new TextEncoder().encode(type), 0);
  writeU32(out, 4, size, true);
  out.set(data, 8);
  return out;
}

function webpCanvas(
  chunkType: string,
  data: Uint8Array,
): { width: number; height: number; alpha: boolean } | null {
  if (chunkType === "VP8 ") {
    if (data.length < 10 || data[3] !== 0x9d || data[4] !== 0x01 || data[5] !== 0x2a) return null;
    return {
      width: (data[6]! | (data[7]! << 8)) & 0x3fff,
      height: (data[8]! | (data[9]! << 8)) & 0x3fff,
      alpha: false,
    };
  }
  if (chunkType === "VP8L") {
    if (data.length < 5 || data[0] !== 0x2f) return null;
    const bits = readU32(data, 1, true);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >>> 14) & 0x3fff) + 1,
      alpha: ((bits >>> 28) & 1) === 1,
    };
  }
  return null;
}

function injectWebp(webp: Uint8Array, tiff: Uint8Array): Uint8Array {
  if (webp.length < 16 || ascii(webp, 0, 4) !== "RIFF" || ascii(webp, 8, 4) !== "WEBP") return webp;

  type Chunk = { type: string; data: Uint8Array; raw: Uint8Array };
  const chunks: Chunk[] = [];
  let offset = 12;
  while (offset + 8 <= webp.length) {
    const size = readU32(webp, offset + 4, true);
    const end = offset + 8 + size;
    if (end > webp.length) return webp;
    chunks.push({
      type: ascii(webp, offset, 4),
      data: webp.subarray(offset + 8, end),
      raw: webp.subarray(offset, Math.min(webp.length, end + (size & 1))),
    });
    offset = end + (size & 1);
  }

  const existingVp8x = chunks.find((chunk) => chunk.type === "VP8X");
  let vp8xData: Uint8Array;
  if (existingVp8x) {
    vp8xData = existingVp8x.data.slice();
    vp8xData[0] = vp8xData[0]! | 0x08;
  } else {
    const hasAlpha = chunks.some((chunk) => chunk.type === "ALPH");
    const imageChunk = chunks.find((chunk) => chunk.type === "VP8 " || chunk.type === "VP8L");
    if (!imageChunk) return webp;
    const canvas = webpCanvas(imageChunk.type, imageChunk.data);
    if (!canvas) return webp;
    vp8xData = new Uint8Array(10);
    vp8xData[0] = 0x08 | (canvas.alpha || hasAlpha ? 0x10 : 0);
    const width = Math.max(0, canvas.width - 1);
    const height = Math.max(0, canvas.height - 1);
    vp8xData[4] = width & 0xff;
    vp8xData[5] = (width >>> 8) & 0xff;
    vp8xData[6] = (width >>> 16) & 0xff;
    vp8xData[7] = height & 0xff;
    vp8xData[8] = (height >>> 8) & 0xff;
    vp8xData[9] = (height >>> 16) & 0xff;
  }

  const exifChunk = webpChunk("EXIF", tiff);
  const parts: Uint8Array[] = [webpChunk("VP8X", vp8xData)];
  let exifInserted = false;

  for (const chunk of chunks) {
    if (chunk.type === "VP8X" || chunk.type === "EXIF") continue;
    if (!exifInserted && chunk.type === "XMP ") {
      parts.push(exifChunk);
      exifInserted = true;
    }
    parts.push(chunk.raw);
  }
  if (!exifInserted) parts.push(exifChunk);

  const body = concat(parts);
  const out = new Uint8Array(12 + body.length);
  out.set(new TextEncoder().encode("RIFF"), 0);
  writeU32(out, 4, 4 + body.length, true);
  out.set(new TextEncoder().encode("WEBP"), 8);
  out.set(body, 12);
  return out;
}

/** Embeds a TIFF/EXIF block into an encoded JPEG, WebP or PNG. */
export function injectExif(encoded: Uint8Array, tiff: Uint8Array, format: string): Uint8Array {
  switch (format.toLowerCase()) {
    case "jpeg":
    case "jpg":
      return injectJpeg(encoded, tiff);
    case "png":
      return injectPng(encoded, tiff);
    case "webp":
      return injectWebp(encoded, tiff);
    default:
      return encoded;
  }
}
