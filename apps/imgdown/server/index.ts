import { startServer } from "./app";

const running = await startServer();

process.stdout.write(`\n  ImgDown is running at ${running.url}\n`);
process.stdout.write(
  `  Bun ${Bun.version} · AVIF ${running.capabilities.avif ? "✓" : "✗"} · HEIC ${running.capabilities.heic ? "✓" : "✗"}\n`,
);
