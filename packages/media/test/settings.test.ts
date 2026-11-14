import { describe, expect, test } from "bun:test";
import {
  DEFAULT_SETTINGS,
  assertFormatAvailable,
  extensionFor,
  normalizeSettings,
  resolveFormat,
  sanitizeSuffix,
} from "../src/settings";
import { LIMITS } from "../src/image";
import { formatBytes, savedPercent, settingsSummary } from "@imgdown/shared";

const linuxCaps = { avif: false, heic: false, note: "no system codecs" };
const macCaps = { avif: true, heic: true, note: null };

describe("normalizeSettings", () => {
  test("fills defaults and clamps values", () => {
    const settings = normalizeSettings({
      format: "webp",
      quality: 999,
      maxWidth: -20,
      maxHeight: 99999,
      targetKB: 0,
      suffix: "  Ảnh   nhỏ  ",
    });
    expect(settings.format).toBe("webp");
    expect(settings.quality).toBe(100);
    expect(settings.maxWidth).toBe(0);
    expect(settings.maxHeight).toBe(12000);
    expect(settings.targetKB).toBeNull();
    expect(settings.suffix).toBe("Ảnh-nhỏ");
  });

  test("keeps a leading separator in the suffix", () => {
    expect(sanitizeSuffix("-min")).toBe("-min");
    expect(sanitizeSuffix("_small")).toBe("_small");
    expect(sanitizeSuffix("a/b\\c")).toBe("abc");
  });

  test("keeps EXIF on and location off by default", () => {
    expect(DEFAULT_SETTINGS.keepMetadata).toBe(true);
    expect(DEFAULT_SETTINGS.keepLocation).toBe(false);
    expect(normalizeSettings({})).toMatchObject({ keepMetadata: true, keepLocation: false });
    expect(normalizeSettings({ keepMetadata: false, keepLocation: true })).toMatchObject({
      keepMetadata: false,
      keepLocation: false,
    });
  });
});

describe("format resolution", () => {
  test("auto picks WebP and original keeps portable formats", () => {
    expect(resolveFormat("auto", "png", linuxCaps)).toBe("webp");
    expect(resolveFormat("original", "jpeg", linuxCaps)).toBe("jpeg");
    expect(resolveFormat("original", "png", linuxCaps)).toBe("png");
    expect(resolveFormat("original", "gif", linuxCaps)).toBe("webp");
  });

  test("falls back when system codecs are missing", () => {
    expect(resolveFormat("avif", "jpeg", linuxCaps)).toBe("webp");
    expect(resolveFormat("heic", "jpeg", linuxCaps)).toBe("webp");
    expect(resolveFormat("avif", "jpeg", macCaps)).toBe("avif");
  });

  test("extensions match encoders", () => {
    expect(extensionFor("jpeg")).toBe("jpg");
    expect(extensionFor("webp")).toBe("webp");
    expect(extensionFor("avif")).toBe("avif");
  });

  test("unavailable formats are rejected early", () => {
    expect(() => assertFormatAvailable({ ...DEFAULT_SETTINGS, format: "avif" }, linuxCaps)).toThrow(/AVIF/);
    expect(() => assertFormatAvailable({ ...DEFAULT_SETTINGS, format: "heic" }, linuxCaps)).toThrow(/HEIC/);
    expect(() => assertFormatAvailable({ ...DEFAULT_SETTINGS, format: "webp" }, linuxCaps)).not.toThrow();
  });
});

describe("limits and formatting", () => {
  test("the batch budget is 100 files and 1 GB", () => {
    expect(LIMITS.maxFiles).toBe(100);
    expect(LIMITS.maxTotalMB).toBe(1024);
    expect(LIMITS.maxFileMB).toBe(60);
  });

  test("formats sizes, savings and metadata summaries", () => {
    expect(formatBytes(1024)).toBe("1 KB");
    expect(savedPercent(1000, 250)).toBe(75);
    expect(settingsSummary({ ...DEFAULT_SETTINGS, keepMetadata: true })).toContain("EXIF");
    expect(settingsSummary({ ...DEFAULT_SETTINGS, keepMetadata: false })).not.toContain("EXIF");
  });
});
