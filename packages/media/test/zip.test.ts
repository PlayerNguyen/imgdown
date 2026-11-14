import { describe, expect, test } from "bun:test";
import { crc32, ZipWriter } from "../src/zip";

describe("crc32", () => {
  test("matches the standard check vector", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  test("is stable for binary data", () => {
    expect(crc32(new Uint8Array([0, 1, 2, 255]))).toBe(crc32(new Uint8Array([0, 1, 2, 255])));
  });
});

describe("ZipWriter", () => {
  test("streams multiple entries to disk", async () => {
    const path = `/tmp/imgdown-zip-test-${crypto.randomUUID()}.zip`;
    const writer = new ZipWriter(path);
    await Promise.all([
      writer.add("mot.webp", new Uint8Array([1, 2, 3])),
      writer.add("hai.webp", new Uint8Array([4, 5, 6, 7])),
    ]);
    await writer.close();

    const file = Bun.file(path);
    expect(await file.exists()).toBe(true);
    expect(file.size).toBeGreaterThan(100);

    const unzip = Bun.which("unzip");
    if (unzip) {
      expect(Bun.spawnSync([unzip, "-t", path]).exitCode).toBe(0);
      const listing = Bun.spawnSync([unzip, "-l", path]).stdout.toString();
      expect(listing).toContain("mot.webp");
      expect(listing).toContain("hai.webp");
    }

    await file.delete();
  });
});
