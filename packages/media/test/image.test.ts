import { describe, expect, test } from "bun:test";
import { LIMITS, compressImage, getCapabilities, inspectImage } from "../src/image";
import { normalizeSettings } from "../src/settings";
import { makePng } from "./helpers";

const source = makePng(900, 600);

describe("Bun.Image pipeline", () => {
  test("reads metadata from a valid PNG", async () => {
    await expect(inspectImage(source)).resolves.toEqual({ width: 900, height: 600, format: "png" });
  });

  test("rejects bytes that are not an image", async () => {
    await expect(inspectImage(new TextEncoder().encode("not an image"))).rejects.toMatchObject({
      code: "invalid-image",
    });
  });

  test("downscales while keeping the aspect ratio", async () => {
    const capabilities = await getCapabilities();
    const settings = normalizeSettings({ format: "webp", quality: 72, maxWidth: 300, maxHeight: 300 });
    const meta = await inspectImage(source);
    const result = await compressImage(source, meta, settings, capabilities);

    expect(result.format).toBe("webp");
    expect(result.width).toBe(300);
    expect(result.height).toBe(200);
    expect(result.bytes.length).toBeLessThan(source.length);
    expect(new TextDecoder().decode(result.bytes.subarray(0, 4))).toBe("RIFF");
    expect(new TextDecoder().decode(result.bytes.subarray(8, 12))).toBe("WEBP");
  });

  test("hits a target size by searching quality", async () => {
    const capabilities = await getCapabilities();
    const settings = normalizeSettings({
      format: "webp",
      quality: 92,
      targetKB: 22,
      maxWidth: 900,
      maxHeight: 600,
    });
    const meta = await inspectImage(source);
    const result = await compressImage(source, meta, settings, capabilities);

    expect(result.bytes.length).toBeLessThanOrEqual(22 * 1024);
    expect(result.quality).not.toBeNull();
    expect(result.quality!).toBeLessThanOrEqual(92);
  });

  test("produces an indexed PNG when palette mode is on", async () => {
    const capabilities = await getCapabilities();
    const settings = normalizeSettings({ format: "png", quality: 80, pngPalette: true });
    const meta = await inspectImage(source);
    const result = await compressImage(source, meta, settings, capabilities);

    expect(result.format).toBe("png");
    expect(Array.from(result.bytes.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(result.bytes[25]).toBe(3);
  });

  test("enforces a 1 GB default total limit", () => {
    expect(LIMITS.maxTotalMB).toBe(1024);
    expect(LIMITS.maxFiles).toBe(100);
  });
});
