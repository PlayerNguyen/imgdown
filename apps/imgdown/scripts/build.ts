import { mkdir } from "node:fs/promises";

const production = process.env.NODE_ENV === "production";

/** Builds the browser client bundle into public/app.js. */
export async function buildClient(): Promise<void> {
  await mkdir("public", { recursive: true });
  const result = await Bun.build({
    entrypoints: ["./src/client.tsx"],
    outdir: "./public",
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
    throw new Error("Không build được client bundle.");
  }
}

/** Builds the client bundle only when it is missing (or in development). */
export async function ensureClientBuild(): Promise<number> {
  const bundle = Bun.file("./public/app.js");
  if (production && (await bundle.exists())) {
    return (await bundle.stat()).mtimeMs;
  }
  await buildClient();
  return (await bundle.stat()).mtimeMs;
}

if (import.meta.main) {
  const started = performance.now();
  await buildClient();
  console.log(`✓ client bundle → public/app.js (${Math.round(performance.now() - started)}ms)`);
}
