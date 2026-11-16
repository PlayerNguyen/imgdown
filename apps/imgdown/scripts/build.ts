import { mkdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * Builds the browser client bundle.
 * @param outdir - Directory that receives the generated `app.js`.
 * @returns A promise that resolves when the bundle has been written.
 */
export async function buildClient(outdir = "public"): Promise<void> {
  const production = process.env.NODE_ENV === "production";
  await mkdir(outdir, { recursive: true });
  const result = await Bun.build({
    entrypoints: ["./src/client.tsx"],
    outdir,
    naming: "app.js",
    target: "browser",
    minify: production,
    sourcemap: production ? "none" : "linked",
    define: {
      "process.env.NODE_ENV": JSON.stringify(production ? "production" : "development"),
    },
  });

  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error("Could not build the client bundle.");
  }
}

/**
 * Builds the client bundle only when it is missing (or in development).
 * @param publicDir - Directory that receives and serves the client assets.
 * @returns Bundle modification timestamp in milliseconds.
 */
export async function ensureClientBuild(publicDir = "public"): Promise<number> {
  const bundle = Bun.file(join(publicDir, "app.js"));
  if (process.env.NODE_ENV === "production" && (await bundle.exists())) {
    return (await bundle.stat()).mtimeMs;
  }
  await buildClient(publicDir);
  return (await bundle.stat()).mtimeMs;
}

if (import.meta.main) {
  const started = performance.now();
  await buildClient();
  process.stdout.write(`✓ client bundle → public/app.js (${Math.round(performance.now() - started)}ms)\n`);
}
