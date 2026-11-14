import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { extractExif, injectExif, patchExif } from "../src/exif";
import { compressImage, getCapabilities, inspectImage } from "../src/image";
import { normalizeSettings } from "../src/settings";
import { containsAscii, readIfdTag } from "./helpers";

const fixture = new Uint8Array(await Bun.file(join(import.meta.dir, "fixtures", "exif.jpg")).arrayBuffer());

describe("EXIF preservation", () => {
  test("extracts camera, lens and GPS metadata from a JPEG", () => {
    const exif = extractExif(fixture, "jpeg");
    expect(exif).not.toBeNull();
    expect(containsAscii(exif!, "Canon")).toBe(true);
    expect(containsAscii(exif!, "EOS R5")).toBe(true);
    expect(containsAscii(exif!, "RF24-70mm F2.8 L IS USM")).toBe(true);
    expect(readIfdTag(exif!, 0x8825)).not.toBeNull();
  });

  test("resets orientation and strips GPS when requested", () => {
    const exif = extractExif(fixture, "jpeg")!;
    expect(readIfdTag(exif, 0x0112)).toBe(6);

    const stripped = patchExif(exif, { keepLocation: false, width: 300, height: 400 });
    expect(readIfdTag(stripped, 0x0112)).toBe(1);
    expect(readIfdTag(stripped, 0x8825)).toBeNull();
    expect(containsAscii(stripped, "RF24-70mm")).toBe(true);

    const withLocation = patchExif(exif, { keepLocation: true });
    expect(readIfdTag(withLocation, 0x8825)).not.toBeNull();
  });

  test("injects EXIF into JPEG, WebP and PNG outputs", async () => {
    const capabilities = await getCapabilities();
    const meta = await inspectImage(fixture);

    for (const format of ["jpeg", "webp", "png"] as const) {
      const settings = normalizeSettings({
        format,
        quality: 78,
        maxWidth: 320,
        keepMetadata: true,
        keepLocation: false,
      });
      const result = await compressImage(fixture, meta, settings, capabilities);
      const embedded = extractExif(result.bytes, format);

      expect(embedded).not.toBeNull();
      expect(containsAscii(embedded!, "EOS R5")).toBe(true);
      expect(containsAscii(embedded!, "RF24-70mm")).toBe(true);
      expect(readIfdTag(embedded!, 0x0112)).toBe(1);
      expect(readIfdTag(embedded!, 0x8825)).toBeNull();

      const decoded = await new Bun.Image(result.bytes).metadata();
      expect(decoded.width).toBe(result.width);
      expect(decoded.height).toBe(result.height);
    }
  });

  test("keeps the GPS pointer when location is enabled", async () => {
    const capabilities = await getCapabilities();
    const meta = await inspectImage(fixture);
    const settings = normalizeSettings({ format: "webp", keepMetadata: true, keepLocation: true });
    const result = await compressImage(fixture, meta, settings, capabilities);
    const embedded = extractExif(result.bytes, "webp")!;
    expect(readIfdTag(embedded, 0x8825)).not.toBeNull();
  });

  test("skips metadata when the option is off", async () => {
    const capabilities = await getCapabilities();
    const meta = await inspectImage(fixture);
    const settings = normalizeSettings({ format: "webp", keepMetadata: false });
    const result = await compressImage(fixture, meta, settings, capabilities);
    expect(extractExif(result.bytes, "webp")).toBeNull();
  });

  test("leaves corrupt EXIF untouched without breaking output", () => {
    const broken = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(Array.from(patchExif(broken, { keepLocation: false }))).toEqual(Array.from(broken));
    expect(injectExif(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), new Uint8Array([0]), "jpeg")).not.toBeNull();
  });
});
