import { deflateSync } from "node:zlib";
import { crc32 } from "../src/zip";

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const typeAndData = new Uint8Array(typeBytes.length + data.length);
  typeAndData.set(typeBytes);
  typeAndData.set(data, typeBytes.length);

  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(typeAndData, 4);
  view.setUint32(8 + data.length, crc32(typeAndData));
  return out;
}

/**
 * Generates a deterministic gradient PNG for pipeline tests.
 * @param width - Image width in pixels.
 * @param height - Image height in pixels.
 * @returns The generated PNG bytes.
 */
export function makePng(width: number, height: number): Uint8Array {
  const rowLength = width * 3 + 1;
  const raw = new Uint8Array(rowLength * height);
  for (let y = 0; y < height; y++) {
    const row = y * rowLength;
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const offset = row + 1 + x * 3;
      raw[offset] = (x * 255) / width;
      raw[offset + 1] = (y * 255) / height;
      raw[offset + 2] = (x * y) % 251;
    }
  }

  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 2;

  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", new Uint8Array()),
  ];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const png = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }
  return png;
}

/**
 * Finds and returns a numeric IFD0 tag value from a TIFF/EXIF block.
 * @param tiff - EXIF TIFF block.
 * @param tag - EXIF tag identifier.
 * @returns The numeric tag value, or `null` when absent.
 */
export function readIfdTag(tiff: Uint8Array, tag: number): number | null {
  if (tiff.length < 8) return null;
  const little = tiff[0] === 0x49;
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const ifd0 = view.getUint32(4, little);
  const count = view.getUint16(ifd0, little);
  for (let i = 0; i < count; i++) {
    const entry = ifd0 + 2 + i * 12;
    if (view.getUint16(entry, little) !== tag) continue;
    const type = view.getUint16(entry + 2, little);
    if (type === 3) return view.getUint16(entry + 8, little);
    if (type === 4) return view.getUint32(entry + 8, little);
    return -1;
  }
  return null;
}

/**
 * Checks whether a byte sequence contains an ASCII needle.
 * @param bytes - Byte sequence.
 * @param needle - ASCII string to search for.
 * @returns `true` when the needle is present.
 */
export function containsAscii(bytes: Uint8Array, needle: string): boolean {
  const target = new TextEncoder().encode(needle);
  outer: for (let i = 0; i <= bytes.length - target.length; i++) {
    for (let j = 0; j < target.length; j++) {
      if (bytes[i + j] !== target[j]) continue outer;
    }
    return true;
  }
  return false;
}
