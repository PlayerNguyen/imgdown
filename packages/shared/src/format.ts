import type { BatchDTO, Settings } from "./types";

const numberFormat = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });
const dateFormat = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh",
});

/**
 * Formats a byte count using Vietnamese units (B, KB, MB, GB).
 * @param bytes - Byte sequence.
 * @returns The formatted size string.
 */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${numberFormat.format(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${numberFormat.format(bytes / (1024 * 1024))} MB`;
  return `${numberFormat.format(bytes / (1024 * 1024 * 1024))} GB`;
}

/**
 * Formats a Unix timestamp in the Asia/Ho_Chi_Minh timezone.
 * @param timestamp - Unix timestamp in milliseconds.
 * @returns The formatted date and time.
 */
export function formatDate(timestamp: number | null | undefined): string {
  if (!timestamp) return "—";
  return dateFormat.format(new Date(timestamp));
}

/**
 * Returns the percentage saved between input and output sizes, or null when unknown.
 * @param input - Input value.
 * @param output - Output value.
 * @returns The savings percentage, or `null` when unknown.
 */
export function savedPercent(input: number, output: number | null | undefined): number | null {
  if (!input || output === null || output === undefined) return null;
  return Math.max(0, Math.round((1 - output / input) * 100));
}

/**
 * Formats an image dimension pair, e.g. "2400 × 1600".
 * @param width - Image width in pixels.
 * @param height - Image height in pixels.
 * @returns The formatted dimension pair.
 */
export function formatDimensions(width: number | null, height: number | null): string {
  if (!width || !height) return "—";
  return `${width} × ${height}`;
}

export const FORMAT_NAMES: Record<string, string> = {
  auto: "Tự động",
  original: "Giữ định dạng",
  webp: "WebP",
  jpeg: "JPEG",
  png: "PNG",
  avif: "AVIF",
  heic: "HEIC",
};

export const FORMAT_HINTS: Record<string, string> = {
  auto: "WebP nhỏ nhất",
  original: "Giữ như gốc",
  webp: "Nhỏ, có alpha",
  jpeg: "Không alpha",
  png: "Sắc nét",
  avif: "Nhỏ nhất",
  heic: "Apple",
};

/**
 * Builds the short settings summary shown under batch headers.
 * @param settings - Compression settings.
 * @param count - Number of images.
 * @returns A compact summary of the selected settings.
 */
export function settingsSummary(settings: Settings, count = 0): string {
  const parts: string[] = [FORMAT_NAMES[settings.format] ?? settings.format];
  if (settings.format !== "original") {
    if (settings.format === "png" && settings.pngPalette) {
      const colors = Math.max(8, Math.min(256, Math.round(16 + (settings.quality / 100) * 240)));
      parts.push(`palette ${colors} màu`);
    } else if (settings.format !== "png") {
      parts.push(`chất lượng ${settings.quality}`);
    }
  }
  if (settings.maxWidth > 0 || settings.maxHeight > 0) {
    parts.push(`tối đa ${settings.maxWidth || "∞"}×${settings.maxHeight || "∞"}`);
  }
  if (settings.targetKB) parts.push(`mục tiêu ${settings.targetKB} KB`);
  if (settings.keepMetadata) parts.push(settings.keepLocation ? "EXIF + GPS" : "EXIF");
  if (count > 0) parts.push(`${count} ảnh`);
  return parts.join(" · ");
}

/**
 * Returns the savings percentage of a completed batch, or null while unknown.
 * @param batch - Batch creation payload.
 * @returns The batch savings percentage, or `null` when unknown.
 */
export function batchSavings(batch: BatchDTO): number | null {
  if (batch.totalOutput === null) return null;
  return savedPercent(batch.totalInput, batch.totalOutput);
}
