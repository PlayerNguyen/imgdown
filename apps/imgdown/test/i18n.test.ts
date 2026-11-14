import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { DEFAULT_SETTINGS } from "@imgdown/media";
import {
  formatBytes,
  formatDate,
  formatDimensions,
  savedPercent,
  settingsSummary,
} from "../src/lib/format";
import { parseLocale, translate } from "../src/lib/messages";

describe("localized formatting", () => {
  test("formats sizes, dates and dimensions", () => {
    expect(formatBytes(1024, "en")).toBe("1 KB");
    expect(formatBytes(1024 * 1024, "vi")).toBe("1 MB");
    expect(savedPercent(1000, 250)).toBe(75);
    expect(formatDimensions(100, 50)).toBe("100 × 50");
    expect(formatDate(0, "en")).toBe("—");
  });

  test("builds locale-aware settings summaries", () => {
    expect(settingsSummary({ ...DEFAULT_SETTINGS, keepMetadata: true }, "en")).toContain("EXIF");
    expect(settingsSummary({ ...DEFAULT_SETTINGS, keepMetadata: false }, "en")).not.toContain("EXIF");
    expect(settingsSummary({ ...DEFAULT_SETTINGS, format: "webp", keepMetadata: false }, "vi")).toBe("WebP · chất lượng 80");
  });
});

describe("message catalog", () => {
  test("translates and falls back to English", () => {
    expect(parseLocale("vi")).toBe("vi");
    expect(parseLocale("fr")).toBe("en");
    expect(translate("en", "status.done")).toBe("Done");
    expect(translate("vi", "status.done")).toBe("Hoàn tất");
    expect(translate("en", "home.compressCta", { count: 3 })).toBe(
      "Compress 3 images & download ZIP",
    );
    expect(translate("en", "history.days", { count: 7 })).toBe("7 days");
  });
});

describe("boundaries", () => {
  test("packages contain no Vietnamese UI text", async () => {
    const root = join(import.meta.dir, "../../..");
    const glob = new Bun.Glob("packages/*/src/**/*.{ts,tsx}");
    const vietnamese = /[àáảãạăâđêôơưýÀÁẢÃẠĂÂĐÊÔƠƯÝ]/;
    const offenders: string[] = [];

    for await (const path of glob.scan({ cwd: root })) {
      const content = await Bun.file(join(root, path)).text();
      if (vietnamese.test(content)) offenders.push(path);
    }

    expect(offenders).toEqual([]);
  });
});
