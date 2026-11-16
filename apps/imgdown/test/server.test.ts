import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "bun:test";

const dataDir = await mkdtemp(join(tmpdir(), "imgdown-data-"));
const publicDir = await mkdtemp(join(tmpdir(), "imgdown-public-"));
await Bun.write(join(publicDir, "app.js"), "// test bundle\n");
await Bun.write(join(publicDir, "styles.css"), "/* test */\n");

process.env.DATA_DIR = dataDir;
process.env.NODE_ENV = "production";

const { startServer } = await import("../server/app");

test("startServer serves health, SSR and static assets", async () => {
  const running = await startServer({ host: "127.0.0.1", port: 0, publicDir, buildClient: false });
  try {
    const health = await fetch(`${running.url}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ ok: true });

    const home = await fetch(running.url);
    expect(home.status).toBe(200);
    const html = await home.text();
    expect(html).toContain("<title>ImgDown");
    expect(html).toContain("/static/app.js");

    const asset = await fetch(`${running.url}/static/app.js`);
    expect(asset.status).toBe(200);
    expect(await asset.text()).toBe("// test bundle\n");
  } finally {
    running.stop();
  }
});

test("startServer rejects missing prebuilt assets", async () => {
  const emptyDir = await mkdtemp(join(tmpdir(), "imgdown-empty-public-"));
  try {
    await expect(
      startServer({ host: "127.0.0.1", port: 0, publicDir: emptyDir, buildClient: false }),
    ).rejects.toThrow("Client bundle not found");
  } finally {
    await rm(emptyDir, { recursive: true, force: true });
  }
});

afterAll(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(publicDir, { recursive: true, force: true });
});
