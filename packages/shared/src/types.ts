import type { Locale } from "./i18n";

export const OUTPUT_FORMATS = ["auto", "webp", "jpeg", "png", "original", "avif", "heic"] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

export const BATCH_STATUSES = ["queued", "processing", "done", "partial", "error"] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];

export const ITEM_STATUSES = ["pending", "processing", "done", "error"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export type Settings = {
  format: OutputFormat;
  /** 1..100. For PNG this controls the palette size. */
  quality: number;
  /** 0 = keep original. */
  maxWidth: number;
  /** 0 = keep original. */
  maxHeight: number;
  /** Optional per-image target size in KB. */
  targetKB: number | null;
  /** Quantize PNG output to an indexed palette. */
  pngPalette: boolean;
  /** Progressive JPEG output. */
  progressive: boolean;
  /** Appended to the output file name, e.g. "-min". */
  suffix: string;
  /** Keep camera/lens EXIF metadata (default on). */
  keepMetadata: boolean;
  /** Keep GPS coordinates when metadata is preserved. */
  keepLocation: boolean;
};

export type Capabilities = {
  avif: boolean;
  heic: boolean;
  note: string | null;
};

export type Limits = {
  maxFiles: number;
  maxFileMB: number;
  maxTotalMB: number;
  retentionDays: number;
  maxPixelsMP: number;
};

export type Stats = {
  batches: number;
  files: number;
  savedBytes: number;
  outputBytes: number;
};

export type AssetDTO = {
  id: string;
  name: string;
  size: number;
  width: number;
  height: number;
  format: string;
  thumbUrl: string;
};

export type BatchItemDTO = {
  id: string;
  assetId: string | null;
  name: string;
  outputName: string | null;
  status: ItemStatus;
  inputBytes: number;
  outputBytes: number | null;
  inputWidth: number | null;
  inputHeight: number | null;
  outputWidth: number | null;
  outputHeight: number | null;
  outputFormat: string | null;
  quality: number | null;
  durationMs: number | null;
  error: string | null;
  thumbUrl: string | null;
};

export type BatchDTO = {
  id: string;
  status: BatchStatus;
  settings: Settings;
  fileCount: number;
  totalInput: number;
  totalOutput: number | null;
  zipBytes: number | null;
  zipUrl: string | null;
  createdAt: number;
  finishedAt: number | null;
  error: string | null;
  items: BatchItemDTO[];
};

export type Page = "home" | "history" | "batch";

export type BootData = {
  page: Page;
  locale: Locale;
  stats: Stats;
  batches: BatchDTO[];
  settings: Settings;
  capabilities: Capabilities;
  limits: Limits;
  batch?: BatchDTO;
};

export type ApiError = {
  error: string;
};
