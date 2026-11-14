import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Capabilities, Settings } from "@imgdown/shared";
import { extractExif, injectExif, patchExif } from "./exif";
import { extensionFor, resolveFormat, type ResolvedFormat } from "./settings";

const MAX_FILE_MB = positiveNumber(process.env.MAX_FILE_MB, 60);
const MAX_FILES = Math.max(1, Math.round(positiveNumber(process.env.MAX_FILES, 100)));
const MAX_TOTAL_MB = Math.max(1, Math.round(positiveNumber(process.env.MAX_TOTAL_MB, 1024)));
const RETENTION_DAYS = Math.max(1, Math.round(positiveNumber(process.env.RETENTION_DAYS, 7)));
const MAX_PIXELS_MP = Math.max(1, Math.round(positiveNumber(process.env.MAX_PIXELS_MP, 50)));

export const LIMITS = {
  maxFiles: MAX_FILES,
  maxFileMB: MAX_FILE_MB,
  maxTotalMB: MAX_TOTAL_MB,
  retentionDays: RETENTION_DAYS,
  maxPixelsMP: MAX_PIXELS_MP,
} as const;

export const MAX_PIXELS = MAX_PIXELS_MP * 1_000_000;
export const MAX_TOTAL_BYTES = MAX_TOTAL_MB * 1024 * 1024;

function positiveNumber(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const PROBE_PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  ),
  (c) => c.codePointAt(0) ?? 0,
);

let capabilitiesPromise: Promise<Capabilities> | null = null;

/** Detects once which OS-backed encoders (AVIF/HEIC) are available.
 * @returns Resolved encoder capabilities.
 */
export function getCapabilities(): Promise<Capabilities> {
  capabilitiesPromise ??= detectCapabilities();
  return capabilitiesPromise;
}

async function detectCapabilities(): Promise<Capabilities> {
  const [avif, heic] = await Promise.all([probeFormat("avif"), probeFormat("heic")]);
  return {
    avif,
    heic,
    note:
      avif || heic
        ? null
        : "Máy chủ này không có codec hệ thống cho AVIF/HEIC nên hai định dạng đó bị tắt. WebP, JPEG và PNG luôn sẵn sàng.",
  };
}

async function probeFormat(format: "avif" | "heic"): Promise<boolean> {
  try {
    const image = new Bun.Image(PROBE_PNG, { maxPixels: 4 });
    if (format === "avif") await image.avif({ quality: 60 }).bytes();
    else await image.heic({ quality: 60 }).bytes();
    return true;
  } catch {
    return false;
  }
}

export type ImageMeta = {
  width: number;
  height: number;
  format: string;
};

/** Error thrown when an uploaded image cannot be decoded. */
export class ImageValidationError extends Error {
  /**
   * Creates a validation error with a user-facing message.
   * @param message - Human-readable error message.
   */
  constructor(message: string) {
    super(message);
    this.name = "ImageValidationError";
  }
}

/**
 * Reads metadata and rejects files that are not decodable images.
 * @param data - Decoded image or binary bytes.
 * @returns The decoded image metadata.
 */
export async function inspectImage(data: Uint8Array): Promise<ImageMeta> {
  try {
    const meta = await new Bun.Image(data, { maxPixels: MAX_PIXELS }).metadata();
    if (!meta.width || !meta.height) throw new Error("missing dimensions");
    return { width: meta.width, height: meta.height, format: meta.format };
  } catch (error: unknown) {
    const code = (error as { code?: string }).code;
    if (code === "ERR_IMAGE_MAX_PIXELS") {
      throw new ImageValidationError(
        `Ảnh vượt giới hạn ${MAX_PIXELS_MP} megapixel. Hãy thu nhỏ ảnh trước khi tải lên.`,
      );
    }
    if (code === "ERR_IMAGE_FORMAT_UNSUPPORTED") {
      throw new ImageValidationError("Định dạng ảnh này chưa được hỗ trợ trên máy chủ.");
    }
    throw new ImageValidationError(
      "Không đọc được tệp này như một ảnh hợp lệ (hỗ trợ JPEG, PNG, WebP, GIF, BMP, TIFF).",
    );
  }
}

export type CompressResult = {
  bytes: Uint8Array;
  format: ResolvedFormat;
  ext: string;
  width: number;
  height: number;
  quality: number | null;
};

type EncodeResult = {
  bytes: Uint8Array;
  width: number;
  height: number;
  quality: number;
};

/**
 * Resizes, encodes and (optionally) re-embeds EXIF for one image.
 * @param data - Decoded image or binary bytes.
 * @param source - Source image metadata.
 * @param settings - Compression settings.
 * @param capabilities - Encoder capabilities for this host.
 * @returns The compressed image result.
 */
export async function compressImage(
  data: Uint8Array,
  source: ImageMeta,
  settings: Settings,
  capabilities: Capabilities,
): Promise<CompressResult> {
  const format = resolveFormat(settings.format, source.format, capabilities);
  const boxWidth = settings.maxWidth > 0 ? settings.maxWidth : source.width;
  const boxHeight = settings.maxHeight > 0 ? settings.maxHeight : source.height;
  const needsResize =
    (settings.maxWidth > 0 || settings.maxHeight > 0) &&
    (source.width > boxWidth || source.height > boxHeight);

  const encode = (quality: number) =>
    encodeImage(data, format, quality, settings, needsResize ? [boxWidth, boxHeight] : null);

  const honorsQuality = format !== "png" || settings.pngPalette;
  let result: EncodeResult | null = null;

  if (settings.targetKB && honorsQuality) {
    const targetBytes = settings.targetKB * 1024;
    let low = 5;
    let high = Math.max(5, Math.min(100, settings.quality));
    let best: EncodeResult | null = null;
    let smallest: EncodeResult | null = null;

    for (let attempt = 0; attempt < 7 && low <= high; attempt++) {
      const quality = Math.round((low + high) / 2);
      const encoded = await encode(quality);
      if (!smallest || encoded.bytes.length < smallest.bytes.length) smallest = encoded;
      if (encoded.bytes.length <= targetBytes) {
        best = encoded;
        low = quality + 1;
      } else {
        high = quality - 1;
      }
    }
    result = best ?? smallest;
  }

  result ??= await encode(settings.quality);

  let bytes = result.bytes;
  if (settings.keepMetadata && format !== "avif" && format !== "heic") {
    const tiff = extractExif(data, source.format);
    if (tiff) {
      const patched = patchExif(tiff, {
        keepLocation: settings.keepLocation,
        width: result.width,
        height: result.height,
      });
      bytes = injectExif(bytes, patched, format);
    }
  }

  return {
    bytes,
    format,
    ext: extensionFor(format),
    width: result.width,
    height: result.height,
    quality: honorsQuality ? result.quality : null,
  };
}

async function encodeImage(
  data: Uint8Array,
  format: ResolvedFormat,
  quality: number,
  settings: Settings,
  box: [number, number] | null,
): Promise<EncodeResult> {
  const image = new Bun.Image(data, { maxPixels: MAX_PIXELS, autoOrient: true });
  if (box) {
    image.resize(box[0], box[1], { fit: "inside", withoutEnlargement: true });
  }

  let bytes: Uint8Array;
  switch (format) {
    case "jpeg":
      bytes = await image.jpeg({ quality, progressive: settings.progressive }).bytes();
      break;
    case "png": {
      if (settings.pngPalette) {
        const colors = Math.max(8, Math.min(256, Math.round(16 + (quality / 100) * 240)));
        bytes = await image
          .png({ palette: true, colors, dither: true, compressionLevel: 9 })
          .bytes();
      } else {
        bytes = await image.png({ compressionLevel: 9 }).bytes();
      }
      break;
    }
    case "avif":
      bytes = await image.avif({ quality }).bytes();
      break;
    case "heic":
      bytes = await image.heic({ quality }).bytes();
      break;
    default:
      bytes = await image.webp({ quality }).bytes();
  }

  return {
    bytes,
    width: image.width > 0 ? image.width : (box?.[0] ?? 0),
    height: image.height > 0 ? image.height : (box?.[1] ?? 0),
    quality,
  };
}

/**
 * Writes a small WebP thumbnail for previews.
 * @param data - Decoded image or binary bytes.
 * @param targetPath - Thumbnail output path.
 * @param size - Maximum thumbnail edge in pixels.
 */
export async function writeThumbnail(data: Uint8Array, targetPath: string, size = 420): Promise<void> {
  await mkdir(dirname(targetPath), { recursive: true });
  await new Bun.Image(data, { maxPixels: MAX_PIXELS, autoOrient: true })
    .resize(size, size, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 72 })
    .write(targetPath);
}

/**
 * Converts pipeline errors into user-facing Vietnamese messages.
 * @param error - The caught error.
 * @returns A user-facing error message.
 */
export function formatError(error: unknown): string {
  if (error instanceof ImageValidationError) return error.message;
  const code = (error as { code?: string }).code;
  if (code === "ERR_IMAGE_FORMAT_UNSUPPORTED") return "Định dạng này không được hỗ trợ trên máy chủ.";
  if (code === "ERR_IMAGE_DECODE_FAILED") return "Ảnh bị lỗi hoặc không đọc được dữ liệu.";
  if (error instanceof Error && error.message) return error.message;
  return "Không xử lý được ảnh này.";
}
