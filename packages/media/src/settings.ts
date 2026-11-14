import { OUTPUT_FORMATS, stripControlChars, type Capabilities, type OutputFormat, type Settings } from "@imgdown/shared";

export const DEFAULT_SETTINGS: Settings = {
  format: "auto",
  quality: 80,
  maxWidth: 0,
  maxHeight: 0,
  targetKB: null,
  pngPalette: true,
  progressive: true,
  suffix: "",
  keepMetadata: true,
  keepLocation: false,
};

/** Error thrown when input settings are invalid. */
export class ValidationError extends Error {
  /**
   * Creates a validation error with a user-facing message.
   * @param message - Human-readable error message.
   */
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

function toInt(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.round(n);
}

function toBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === 1 || value === "1") return true;
  if (value === "false" || value === 0 || value === "0") return false;
  return fallback;
}

/**
 * Cleans a user-supplied filename suffix while keeping a leading "-" or "_" separator.
 * @param value - Input value.
 * @returns The sanitized filename suffix.
 */
export function sanitizeSuffix(value: unknown): string {
  if (typeof value !== "string") return "";
  return stripControlChars(value)
    .normalize("NFC")
    .trim()
    .replaceAll(/[\\/:*?"<>|]/gu, "")
    .replaceAll(/\s+/gu, "-")
    .replaceAll(/-{2,}/gu, "-")
    .replaceAll(/\.+$/gu, "")
    .slice(0, 24);
}

/**
 * Clamps and validates settings coming from the client or SQLite.
 * @param input - Input value.
 * @returns The normalized settings.
 */
export function normalizeSettings(input: unknown): Settings {
  const raw = (input ?? {}) as Record<string, unknown>;
  const format = OUTPUT_FORMATS.includes(raw.format as OutputFormat)
    ? (raw.format as OutputFormat)
    : DEFAULT_SETTINGS.format;

  const quality = Math.min(100, Math.max(1, toInt(raw.quality, DEFAULT_SETTINGS.quality)));
  const maxWidth = Math.min(12000, Math.max(0, toInt(raw.maxWidth, 0)));
  const maxHeight = Math.min(12000, Math.max(0, toInt(raw.maxHeight, 0)));

  let targetKB: number | null = null;
  if (raw.targetKB !== null && raw.targetKB !== undefined && raw.targetKB !== "") {
    const n = toInt(raw.targetKB, 0);
    if (n > 0) targetKB = Math.min(50000, Math.max(5, n));
  }

  const keepMetadata = toBool(raw.keepMetadata, DEFAULT_SETTINGS.keepMetadata);

  return {
    format,
    quality,
    maxWidth,
    maxHeight,
    targetKB,
    pngPalette: toBool(raw.pngPalette, DEFAULT_SETTINGS.pngPalette),
    progressive: toBool(raw.progressive, DEFAULT_SETTINGS.progressive),
    suffix: sanitizeSuffix(raw.suffix),
    keepMetadata,
    keepLocation: keepMetadata && toBool(raw.keepLocation, DEFAULT_SETTINGS.keepLocation),
  };
}

/**
 * Throws when the requested AVIF/HEIC encoder is missing on this host.
 * @param settings - Compression settings.
 * @param capabilities - Encoder capabilities for this host.
 */
export function assertFormatAvailable(settings: Settings, capabilities: Capabilities): void {
  if (settings.format === "avif" && !capabilities.avif) {
    throw new ValidationError(
      "AVIF chưa được hỗ trợ trên máy chủ này (cần codec AV1 của hệ điều hành). Hãy chọn WebP, JPEG hoặc PNG.",
    );
  }
  if (settings.format === "heic" && !capabilities.heic) {
    throw new ValidationError(
      "HEIC chưa được hỗ trợ trên máy chủ này (cần codec HEIC của hệ điều hành). Hãy chọn WebP, JPEG hoặc PNG.",
    );
  }
}

export type ResolvedFormat = "jpeg" | "png" | "webp" | "avif" | "heic";

/**
 * Maps the requested output option and source format to an actual encoder.
 * @param requested - Requested output format.
 * @param sourceFormat - Source image format.
 * @param capabilities - Encoder capabilities for this host.
 * @returns The encoder chosen for the output.
 */
export function resolveFormat(
  requested: OutputFormat,
  sourceFormat: string,
  capabilities: Capabilities,
): ResolvedFormat {
  const source = sourceFormat.toLowerCase();
  const keepable = source === "jpeg" || source === "png" || source === "webp";

  if (requested === "auto") return "webp";
  if (requested === "original") {
    if (keepable) return source as ResolvedFormat;
    return "webp";
  }
  if (requested === "avif" && !capabilities.avif) return "webp";
  if (requested === "heic" && !capabilities.heic) return "webp";
  return requested;
}

const EXT_BY_FORMAT: Record<ResolvedFormat, string> = {
  jpeg: "jpg",
  png: "png",
  webp: "webp",
  avif: "avif",
  heic: "heic",
};

/**
 * Returns the file extension for an encoder.
 * @param format - Output format.
 * @returns The file extension without a leading dot.
 */
export function extensionFor(format: ResolvedFormat): string {
  return EXT_BY_FORMAT[format];
}

export const FORMAT_LABELS: Record<ResolvedFormat, string> = {
  jpeg: "JPEG",
  png: "PNG",
  webp: "WebP",
  avif: "AVIF",
  heic: "HEIC",
};
