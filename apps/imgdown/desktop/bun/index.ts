import { join } from "node:path";
import { BrowserWindow, PATHS, Utils } from "electrobun/main";

// The desktop scripts prebuild the client, so the bundled main process never
// needs to run Bun.build against source files that are absent from the bundle.
process.env.NODE_ENV = "production";
process.env.DATA_DIR = join(Utils.paths.userData, "data");

const bundledPublicDir = join(PATHS.VIEWS_FOLDER, "public");
const publicDir = (await Bun.file(join(bundledPublicDir, "app.js")).exists())
  ? bundledPublicDir
  : join(process.cwd(), "public");
process.env.PUBLIC_DIR = publicDir;

const { startServer } = await import("../../server/app");
const running = await startServer({ host: "127.0.0.1", port: 0, buildClient: false });

const mainWindow = new BrowserWindow({
  title: "ImgDown",
  url: running.url,
  frame: { width: 1280, height: 900 },
});

mainWindow.on("close", () => {
  running.stop();
});

process.stdout.write(
  `[desktop] ImgDown ${running.url} · data ${process.env.DATA_DIR ?? ""} · ` +
    `AVIF ${running.capabilities.avif ? "✓" : "✗"} · HEIC ${running.capabilities.heic ? "✓" : "✗"}\n`,
);
