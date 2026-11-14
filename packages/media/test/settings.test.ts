import { describe, expect, test } from "bun:test";
import {
  DEFAULT_SETTINGS,
  extensionFor,
  normalizeSettings,
  resolveFormat,
  sanitizeSuffix,
} from "../src/settings";
import { LIMITS } from "../src/image";

const linuxCaps = { avif: false, heic: false };
const macCaps = { avif: true, heic: true };

describe("normalizeSettings", () => {
  test("fills defaults and clamps values", () => {
    const settings = normalizeSettings({
      format: "webp",
      quality: 999,
      maxWidth: -20,
      maxHeight: 99999,
      targetKB: 0,
      suffix: "  My   small  ",
    });
    expect(settings.format).toBe("webp");
    expect(settings.quality).toBe(100);
    expect(settings.maxWidth).toBe(0);
    expect(settings.maxHeight).toBe(12000);
    expect(settings.targetKB).toBeNull();
    expect(settings.suffix).toBe("My-small");
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

});

describe("limits", () => {
  test("the batch budget is 100 files and 1 GB", () => {
    expect(LIMITS.maxFiles).toBe(100);
    expect(LIMITS.maxTotalMB).toBe(1024);
    expect(LIMITS.maxFileMB).toBe(60);
  });

});
