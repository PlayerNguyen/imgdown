import type { BatchDTO, Settings } from "@imgdown/shared";
import { DEFAULT_LOCALE, translate, type Locale, type MessageKey } from "./messages";

const TIME_ZONES: Record<Locale, string> = { en: "UTC", vi: "Asia/Ho_Chi_Minh" };
const INTL_LOCALES: Record<Locale, string> = { en: "en-US", vi: "vi-VN" };

const numberFormats = new Map<Locale, Intl.NumberFormat>();
const dateFormats = new Map<Locale, Intl.DateTimeFormat>();

function getNumberFormat(locale: Locale): Intl.NumberFormat {
  let formatter = numberFormats.get(locale);
  if (!formatter) {
    formatter = new Intl.NumberFormat(INTL_LOCALES[locale], { maximumFractionDigits: 1 });
    numberFormats.set(locale, formatter);
  }
  return formatter;
}

function getDateFormat(locale: Locale): Intl.DateTimeFormat {
  let formatter = dateFormats.get(locale);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(INTL_LOCALES[locale], {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: TIME_ZONES[locale],
    });
    dateFormats.set(locale, formatter);
  }
  return formatter;
}

/**
 * Formats a byte count using locale-aware units (B, KB, MB, GB).
 * @param bytes - Byte sequence.
 * @param locale - Locale used for the decimal separator.
 * @returns The formatted size string.
 */
export function formatBytes(bytes: number | null | undefined, locale: Locale = DEFAULT_LOCALE): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return "—";
  const number = getNumberFormat(locale);
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${number.format(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${number.format(bytes / (1024 * 1024))} MB`;
  return `${number.format(bytes / (1024 * 1024 * 1024))} GB`;
}

/**
 * Formats an integer using the grouping rules of a locale.
 * @param value - Numeric value.
 * @param locale - Locale used for grouping.
 * @returns The formatted number.
 */
export function formatNumber(value: number, locale: Locale = DEFAULT_LOCALE): string {
  return getNumberFormat(locale).format(value);
}

/**
 * Formats a Unix timestamp in the locale's display timezone.
 * @param timestamp - Unix timestamp in milliseconds.
 * @param locale - Locale used for the date format and timezone.
 * @returns The formatted date and time.
 */
export function formatDate(
  timestamp: number | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string {
  if (!timestamp) return "—";
  return getDateFormat(locale).format(new Date(timestamp));
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

const FORMAT_NAME_KEYS: Record<string, MessageKey> = {
  auto: "format.auto",
  original: "format.original",
  webp: "format.webp",
  jpeg: "format.jpeg",
  png: "format.png",
  avif: "format.avif",
  heic: "format.heic",
};

const FORMAT_HINT_KEYS: Record<string, MessageKey> = {
  auto: "format.hint.auto",
  original: "format.hint.original",
  webp: "format.hint.webp",
  jpeg: "format.hint.jpeg",
  png: "format.hint.png",
  avif: "format.hint.avif",
  heic: "format.hint.heic",
};

/**
 * Returns the localized display name of an output format.
 * @param locale - Target locale.
 * @param format - Output format identifier.
 * @returns The localized format name.
 */
export function formatName(locale: Locale, format: string): string {
  const key = FORMAT_NAME_KEYS[format];
  return key ? translate(locale, key) : format.toUpperCase();
}

/**
 * Returns the localized short hint for an output format.
 * @param locale - Target locale.
 * @param format - Output format identifier.
 * @returns The localized format hint.
 */
export function formatHint(locale: Locale, format: string): string {
  const key = FORMAT_HINT_KEYS[format];
  return key ? translate(locale, key) : "";
}

/**
 * Builds the short settings summary shown under batch headers.
 * @param settings - Compression settings.
 * @param locale - Target locale.
 * @param count - Number of images.
 * @returns A compact summary of the selected settings.
 */
export function settingsSummary(
  settings: Settings,
  locale: Locale = DEFAULT_LOCALE,
  count = 0,
): string {
  const parts: string[] = [formatName(locale, settings.format)];
  if (settings.format !== "original") {
    if (settings.format === "png" && settings.pngPalette) {
      const colors = Math.max(8, Math.min(256, Math.round(16 + (settings.quality / 100) * 240)));
      parts.push(translate(locale, "summary.palette", { count: colors }));
    } else if (settings.format !== "png") {
      parts.push(translate(locale, "summary.quality", { quality: settings.quality }));
    }
  }
  if (settings.maxWidth > 0 || settings.maxHeight > 0) {
    parts.push(
      translate(locale, "summary.max", {
        width: settings.maxWidth || "∞",
        height: settings.maxHeight || "∞",
      }),
    );
  }
  if (settings.targetKB) parts.push(translate(locale, "summary.target", { kb: settings.targetKB }));
  if (settings.keepMetadata) {
    parts.push(translate(locale, settings.keepLocation ? "summary.exifLocation" : "summary.exif"));
  }
  if (count > 0) parts.push(translate(locale, "summary.images", { count }));
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
