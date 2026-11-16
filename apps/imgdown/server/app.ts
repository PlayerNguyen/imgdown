import { join } from "node:path";
import {
  stripControlChars,
  type AssetDTO,
  type BootData,
  type Capabilities,
  type Locale,
  type Settings,
} from "@imgdown/shared";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, translate } from "../src/lib/messages";
import { ensureClientBuild } from "../scripts/build";
import {
  THUMB_DIR,
  UPLOAD_DIR,
  createBatch,
  getAsset,
  getAssets,
  getBatch,
  getBatchRow,
  getItemThumbPath,
  getSettings,
  getStats,
  insertAsset,
  listBatches,
  markStaleBatchesFailed,
  saveSettings,
  cleanupExpired,
  deleteBatchFiles,
} from "@imgdown/db";
import {
  LIMITS,
  MAX_TOTAL_BYTES,
  getCapabilities,
  normalizeSettings,
  inspectImage,
  writeThumbnail,
} from "@imgdown/media";
import { imageErrorMessage } from "./i18n";
import { processBatch } from "./processor";
import { renderDocument, renderNotFound } from "./ssr";

const MAX_FILE_BYTES = LIMITS.maxFileMB * 1024 * 1024;
const ASSET_VERSION = Date.now().toString(36);

export type StartServerOptions = {
  /** TCP port to bind. Pass 0 to let the OS choose an ephemeral port. */
  port?: number;
  /** Interface to bind. Defaults to `HOST` or `0.0.0.0`. */
  host?: string;
  /** Directory containing the built `app.js` and `styles.css` assets. */
  publicDir?: string;
  /** Build the client bundle when missing. Packaged apps should pass `false`. */
  buildClient?: boolean;
};

export type RunningServer = {
  /** The underlying Bun HTTP server. */
  server: ReturnType<typeof Bun.serve>;
  /** Local URL the web UI can load. */
  url: string;
  /** Encoder capabilities detected for this host. */
  capabilities: Capabilities;
  /** Stops accepting requests and clears the cleanup timer. */
  stop: () => void;
};

class UploadError extends Error {}
const FALLBACK_LOCALE: Locale = isLocale(process.env.DEFAULT_LOCALE)
  ? process.env.DEFAULT_LOCALE
  : DEFAULT_LOCALE;

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function requestLocale(request: Request): Locale {
  const value = readCookie(request.headers.get("cookie"), LOCALE_COOKIE);
  return isLocale(value) ? value : FALLBACK_LOCALE;
}

let capabilities: Capabilities = { avif: false, heic: false };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

function badRequest(message: string): Response {
  return json({ error: message }, 400);
}

function effectiveSettings(): Settings {
  const settings = getSettings();
  if (
    (settings.format === "avif" && !capabilities.avif) ||
    (settings.format === "heic" && !capabilities.heic)
  ) {
    return { ...settings, format: "auto" };
  }
  return settings;
}

function baseBoot(locale: Locale) {
  return {
    locale,
    stats: getStats(),
    settings: effectiveSettings(),
    capabilities,
    limits: { ...LIMITS },
  };
}

function renderHome(locale: Locale): Response {
  const boot: BootData = { page: "home", ...baseBoot(locale), batches: listBatches(4) };
  return html(renderDocument(boot, ASSET_VERSION));
}

function renderHistory(locale: Locale): Response {
  const boot: BootData = { page: "history", ...baseBoot(locale), batches: listBatches(100) };
  return html(renderDocument(boot, ASSET_VERSION));
}

function renderBatchPage(id: string, locale: Locale): Response {
  const batch = getBatch(id);
  if (!batch) return html(renderNotFound(locale, translate(locale, "page.notFoundBatch")), 404);
  const boot: BootData = { page: "batch", ...baseBoot(locale), batches: [], batch };
  return html(renderDocument(boot, ASSET_VERSION));
}

function cleanFileName(name: string): string {
  return (
    stripControlChars(name || "image")
      .replaceAll(/[\\/]/gu, "-")
      .trim()
      .slice(0, 180) || "image"
  );
}

async function handleUpload(request: Request, locale: Locale): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return badRequest(translate(locale, "api.uploadUnreadable"));
  }

  const files = [...form.getAll("file"), ...form.getAll("files")].filter(
    (entry): entry is File => entry instanceof File,
  );
  if (files.length === 0) return badRequest(translate(locale, "api.noFiles"));
  if (files.length > 10) return badRequest(translate(locale, "api.tooManyFiles"));

  const assets: AssetDTO[] = [];
  const errors: { name: string; error: string }[] = [];

  for (const file of files) {
    const displayName = cleanFileName(file.name);
    try {
      if (file.size > MAX_FILE_BYTES) {
        throw new UploadError(translate(locale, "api.fileTooLarge", { max: LIMITS.maxFileMB }));
      }
      if (file.size === 0) throw new UploadError(translate(locale, "api.emptyFile"));

      const bytes = new Uint8Array(await file.arrayBuffer());
      const meta = await inspectImage(bytes);
      const id = crypto.randomUUID();
      const storedPath = join(UPLOAD_DIR, id);
      const thumbPath = join(THUMB_DIR, `${id}.webp`);

      await Bun.write(storedPath, bytes);
      const hasThumb = await writeThumbnail(bytes, thumbPath)
        .then(() => true)
        .catch((error) => {
          console.warn(`[upload] thumbnail failed for ${displayName}:`, error);
          return false;
        });

      const now = Date.now();
      insertAsset({
        id,
        name: displayName,
        format: meta.format,
        mime: file.type || null,
        size: file.size,
        width: meta.width,
        height: meta.height,
        storedPath,
        thumbPath: hasThumb ? thumbPath : null,
      });

      assets.push({
        id,
        name: displayName,
        size: file.size,
        width: meta.width,
        height: meta.height,
        format: meta.format,
        thumbUrl: hasThumb ? `/api/thumb/asset/${id}?v=${now}` : "",
      });
    } catch (error) {
      errors.push({
        name: displayName,
        error: error instanceof UploadError ? error.message : imageErrorMessage(error, locale),
      });
    }
  }

  if (assets.length === 0 && errors.length > 0) {
    return json({ error: errors[0]!.error, errors }, 400);
  }
  return json({ assets, errors });
}

async function createBatchFromRequest(request: Request, locale: Locale): Promise<Response> {
  const body = (await request.json().catch(() => null)) as
    | { assetIds?: unknown; settings?: unknown }
    | null;
  if (!body || !Array.isArray(body.assetIds)) {
    return badRequest(translate(locale, "api.invalidBatch"));
  }

  const assetIds = [...new Set(body.assetIds.filter((id): id is string => typeof id === "string"))];
  if (assetIds.length === 0) return badRequest(translate(locale, "api.needImage"));
  if (assetIds.length > LIMITS.maxFiles) {
    return badRequest(translate(locale, "api.tooManyImages", { max: LIMITS.maxFiles }));
  }

  const settings = normalizeSettings(body.settings);
  if (settings.format === "avif" && !capabilities.avif) {
    return badRequest(translate(locale, "api.avifUnavailable"));
  }
  if (settings.format === "heic" && !capabilities.heic) {
    return badRequest(translate(locale, "api.heicUnavailable"));
  }

  const found = new Map(getAssets(assetIds).map((asset) => [asset.id, asset]));
  if (found.size !== assetIds.length) {
    return badRequest(translate(locale, "api.missingAssets"));
  }

  const totalInput = assetIds.reduce((sum, id) => sum + (found.get(id)?.size ?? 0), 0);
  if (totalInput > MAX_TOTAL_BYTES) {
    return badRequest(translate(locale, "api.totalTooLarge", { max: LIMITS.maxTotalMB }));
  }

  const batchId = crypto.randomUUID();
  const items = assetIds.map((assetId) => {
    const asset = found.get(assetId)!;
    return {
      id: crypto.randomUUID(),
      assetId,
      name: asset.name,
      inputBytes: asset.size,
      inputWidth: asset.width,
      inputHeight: asset.height,
    };
  });

  createBatch({ id: batchId, settings, items });
  const batch = getBatch(batchId)!;
  void processBatch(batchId, locale);
  return json({ batch }, 201);
}

function serveFile(path: string | null, type: string, locale: Locale): Response {
  const missing = json({ error: translate(locale, "api.notFound") }, 404);
  if (!path) return missing;
  const file = Bun.file(path);
  if (!file.size) return missing;
  return new Response(file, {
    headers: { "content-type": type, "cache-control": "public, max-age=31536000, immutable" },
  });
}

const pad = (value: number) => String(value).padStart(2, "0");

function downloadName(createdAt: number): string {
  const date = new Date(createdAt);
  return `imgdown-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(
    date.getHours(),
  )}${pad(date.getMinutes())}.zip`;
}

async function handleApi(request: Request, url: URL, locale: Locale): Promise<Response> {
  const path = url.pathname;

  if (path === "/api/assets" && request.method === "POST") return handleUpload(request, locale);

  if (path === "/api/settings" && request.method === "POST") {
    const body = (await request.json().catch(() => null)) as { settings?: unknown } | null;
    if (!body) return badRequest(translate(locale, "api.invalidSettings"));
    const settings = normalizeSettings(body.settings);
    if (
      (settings.format === "avif" && !capabilities.avif) ||
      (settings.format === "heic" && !capabilities.heic)
    ) {
      settings.format = "auto";
    }
    saveSettings(settings);
    return json({ settings });
  }

  if (path === "/api/batches" && request.method === "GET") {
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 30));
    return json({ batches: listBatches(limit) });
  }

  if (path === "/api/batches" && request.method === "POST") {
    return createBatchFromRequest(request, locale);
  }

  const batchMatch = path.match(/^\/api\/batches\/([a-zA-Z0-9-]+)$/);
  if (batchMatch) {
    const id = batchMatch[1]!;
    if (request.method === "GET") {
      const batch = getBatch(id);
      if (!batch) return json({ error: translate(locale, "api.batchNotFound") }, 404);
      return json({ batch });
    }
    if (request.method === "DELETE") {
      const row = getBatchRow(id);
      if (!row) return json({ error: translate(locale, "api.batchNotFound") }, 404);
      if (row.status === "queued" || row.status === "processing") {
        return json({ error: translate(locale, "api.batchProcessing") }, 409);
      }
      await deleteBatchFiles(id);
      return json({ ok: true });
    }
  }

  const downloadMatch = path.match(/^\/api\/batches\/([a-zA-Z0-9-]+)\/download$/);
  if (downloadMatch && request.method === "GET") {
    const row = getBatchRow(downloadMatch[1]!);
    if (!row?.zip_path) return json({ error: translate(locale, "api.zipNotReady") }, 404);
    const file = Bun.file(row.zip_path);
    if (!(await file.exists())) return json({ error: translate(locale, "api.zipDeleted") }, 404);
    return new Response(file, {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${downloadName(row.created_at)}"`,
        "content-length": String(file.size),
        "cache-control": "no-store",
      },
    });
  }

  const assetThumb = path.match(/^\/api\/thumb\/asset\/([a-zA-Z0-9-]+)$/);
  if (assetThumb && request.method === "GET") {
    return serveFile(getAsset(assetThumb[1]!)?.thumb_path ?? null, "image/webp", locale);
  }

  const itemThumb = path.match(/^\/api\/thumb\/item\/([a-zA-Z0-9-]+)$/);
  if (itemThumb && request.method === "GET") {
    return serveFile(getItemThumbPath(itemThumb[1]!), "image/webp", locale);
  }

  return json({ error: translate(locale, "api.unknown") }, 404);
}

const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <defs><linearGradient id="g" x1="3" y1="2" x2="29" y2="30" gradientUnits="userSpaceOnUse">
    <stop stop-color="#6366f1"/><stop offset="1" stop-color="#06b6d4"/>
  </linearGradient></defs>
  <rect x="2.5" y="2.5" width="27" height="27" rx="8.5" fill="url(#g)"/>
  <path d="M10 21.5 16 10l6 11.5M12.6 17.4h6.8" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>`;

/**
 * Starts the ImgDown HTTP server.
 * @param options - Optional host, port and public asset directory overrides.
 * @returns The running server, its local URL, encoder capabilities and a stop function.
 */
export async function startServer(options: StartServerOptions = {}): Promise<RunningServer> {
  const port = options.port ?? (Number(process.env.PORT) || 3000);
  const host = options.host ?? process.env.HOST ?? "0.0.0.0";
  const publicDir = options.publicDir ?? process.env.PUBLIC_DIR ?? "public";

  capabilities = await getCapabilities();
  if (options.buildClient === false) {
    const bundle = Bun.file(join(publicDir, "app.js"));
    if (!(await bundle.exists())) {
      throw new Error(
        `Client bundle not found at ${join(publicDir, "app.js")}. Run "bun run build" before starting ImgDown.`,
      );
    }
  } else {
    await ensureClientBuild(publicDir);
  }
  markStaleBatchesFailed(translate(FALLBACK_LOCALE, "batch.stale"));

  void cleanupExpired(LIMITS.retentionDays)
    .then(({ batches, assets }) => {
      if (batches || assets) {
        process.stdout.write(
          `[cleanup] removed ${batches} expired batches and ${assets} unused images\n`,
        );
      }
      return undefined;
    })
    .catch((error) => console.warn("[cleanup] cleanup failed:", error));

  const cleanupTimer = setInterval(
    () => {
      void cleanupExpired(LIMITS.retentionDays).catch((error) =>
        console.warn("[cleanup] cleanup failed:", error),
      );
    },
    6 * 60 * 60 * 1000,
  );

  const server = Bun.serve({
    port,
    hostname: host,
    maxRequestBodySize: (LIMITS.maxFileMB + 10) * 1024 * 1024,
    async fetch(request) {
      const url = new URL(request.url);
      const path = url.pathname;
      const locale = requestLocale(request);

      try {
        if (path.startsWith("/api/")) return await handleApi(request, url, locale);

        if (path === "/static/app.js" || path === "/static/styles.css") {
          const name = path.slice("/static/".length);
          const type = name.endsWith(".css")
            ? "text/css; charset=utf-8"
            : "text/javascript; charset=utf-8";
          const file = Bun.file(join(publicDir, name));
          if (!(await file.exists())) return new Response("Not found", { status: 404 });
          return new Response(file, { headers: { "content-type": type, "cache-control": "no-cache" } });
        }

        if (path === "/favicon.svg") {
          return new Response(FAVICON, {
            headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" },
          });
        }

        if (request.method !== "GET" && request.method !== "HEAD") {
          return new Response("Method not allowed", { status: 405 });
        }

        if (path === "/") return renderHome(locale);
        if (path === "/history") return renderHistory(locale);
        if (path.startsWith("/history/")) {
          const id = decodeURIComponent(path.slice("/history/".length));
          if (!id || id.includes("/")) return html(renderNotFound(locale), 404);
          return renderBatchPage(id, locale);
        }
        if (path === "/health") return json({ ok: true, uptime: process.uptime() });

        return html(renderNotFound(locale), 404);
      } catch (error) {
        console.error(`[server] ${request.method} ${path}:`, error);
        if (path.startsWith("/api/")) {
          return json({ error: translate(locale, "api.serverError") }, 500);
        }
        return html(renderNotFound(locale, translate(locale, "page.serverError")), 500);
      }
    },
    error(error) {
      console.error("[server] unhandled error:", error);
      return json({ error: translate(FALLBACK_LOCALE, "api.serverErrorShort") }, 500);
    },
  });

  const displayHost = host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;

  return {
    server,
    url: `http://${displayHost}:${server.port}`,
    capabilities,
    stop: () => {
      clearInterval(cleanupTimer);
      void server.stop(true);
    },
  };
}
