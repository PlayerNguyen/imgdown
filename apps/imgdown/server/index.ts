import { join } from "node:path";
import type { AssetDTO, BootData, Settings } from "@imgdown/shared";
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
} from "@imgdown/db";
import {
  ImageValidationError,
  LIMITS,
  MAX_TOTAL_BYTES,
  formatError,
  getCapabilities,
  inspectImage,
  writeThumbnail,
} from "@imgdown/media";
import { processBatch } from "./processor";
import { assertFormatAvailable, normalizeSettings, ValidationError } from "@imgdown/media";
import { renderDocument, renderNotFound } from "./ssr";
import { cleanupExpired, deleteBatchFiles } from "@imgdown/db";

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST ?? "0.0.0.0";
const MAX_FILE_BYTES = LIMITS.maxFileMB * 1024 * 1024;
const ASSET_VERSION = Date.now().toString(36);

const capabilities = await getCapabilities();
await ensureClientBuild();
markStaleBatchesFailed();
void cleanupExpired(LIMITS.retentionDays)
  .then(({ batches, assets }) => {
    if (batches || assets) console.log(`[cleanup] đã dọn ${batches} lô, ${assets} ảnh hết hạn`);
    return undefined;
  })
  .catch((error) => console.warn("[cleanup] lỗi dọn dữ liệu:", error));

setInterval(
  () => {
    void cleanupExpired(LIMITS.retentionDays).catch((error) =>
      console.warn("[cleanup] lỗi dọn dữ liệu:", error),
    );
  },
  6 * 60 * 60 * 1000,
);

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

function baseBoot() {
  return {
    stats: getStats(),
    settings: effectiveSettings(),
    capabilities,
    limits: { ...LIMITS },
  };
}

function renderHome(): Response {
  const boot: BootData = { page: "home", ...baseBoot(), batches: listBatches(4) };
  return html(renderDocument(boot, ASSET_VERSION));
}

function renderHistory(): Response {
  const boot: BootData = { page: "history", ...baseBoot(), batches: listBatches(100) };
  return html(renderDocument(boot, ASSET_VERSION));
}

function renderBatchPage(id: string): Response {
  const batch = getBatch(id);
  if (!batch) return html(renderNotFound("Không tìm thấy lô ảnh này."), 404);
  const boot: BootData = { page: "batch", ...baseBoot(), batches: [], batch };
  return html(renderDocument(boot, ASSET_VERSION));
}

function cleanFileName(name: string): string {
  return (
    (name || "anh")
      .replaceAll(/[\\/]/gu, "-")
      .replaceAll(/[\u0000-\u001F]/gu, "")
      .trim()
      .slice(0, 180) || "anh"
  );
}

async function handleUpload(request: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return badRequest("Không đọc được dữ liệu tải lên.");
  }

  const files = [...form.getAll("file"), ...form.getAll("files")].filter(
    (entry): entry is File => entry instanceof File,
  );
  if (files.length === 0) return badRequest("Chưa chọn ảnh nào.");
  if (files.length > 10) return badRequest("Mỗi lần chỉ tải lên tối đa 10 ảnh.");

  const assets: AssetDTO[] = [];
  const errors: { name: string; error: string }[] = [];

  for (const file of files) {
    const displayName = cleanFileName(file.name);
    try {
      if (file.size > MAX_FILE_BYTES) {
        throw new ValidationError(`Ảnh vượt giới hạn ${LIMITS.maxFileMB} MB.`);
      }
      if (file.size === 0) throw new ValidationError("Tệp rỗng.");

      const bytes = new Uint8Array(await file.arrayBuffer());
      const meta = await inspectImage(bytes);
      const id = crypto.randomUUID();
      const storedPath = join(UPLOAD_DIR, id);
      const thumbPath = join(THUMB_DIR, `${id}.webp`);

      await Bun.write(storedPath, bytes);
      const hasThumb = await writeThumbnail(bytes, thumbPath)
        .then(() => true)
        .catch((error) => {
          console.warn(`[upload] thumbnail thất bại cho ${displayName}:`, error);
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
        error:
          error instanceof ValidationError || error instanceof ImageValidationError
            ? error.message
            : formatError(error),
      });
    }
  }

  if (assets.length === 0 && errors.length > 0) {
    return json({ error: errors[0]!.error, errors }, 400);
  }
  return json({ assets, errors });
}

async function createBatchFromRequest(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as
    | { assetIds?: unknown; settings?: unknown }
    | null;
  if (!body || !Array.isArray(body.assetIds)) return badRequest("Dữ liệu lô ảnh không hợp lệ.");

  const assetIds = [...new Set(body.assetIds.filter((id): id is string => typeof id === "string"))];
  if (assetIds.length === 0) return badRequest("Cần ít nhất một ảnh.");
  if (assetIds.length > LIMITS.maxFiles) {
    return badRequest(`Mỗi lô tối đa ${LIMITS.maxFiles} ảnh.`);
  }

  const settings = normalizeSettings(body.settings);
  try {
    assertFormatAvailable(settings, capabilities);
  } catch (error) {
    if (error instanceof ValidationError) return badRequest(error.message);
    throw error;
  }

  const found = new Map(getAssets(assetIds).map((asset) => [asset.id, asset]));
  if (found.size !== assetIds.length) {
    return badRequest("Một số ảnh không còn trên máy chủ. Hãy tải lại ảnh đó.");
  }

  const totalInput = assetIds.reduce((sum, id) => sum + (found.get(id)?.size ?? 0), 0);
  if (totalInput > MAX_TOTAL_BYTES) {
    return badRequest(
      `Tổng dung lượng ảnh vượt giới hạn ${LIMITS.maxTotalMB} MB mỗi lô. Hãy bớt ảnh rồi thử lại.`,
    );
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
  void processBatch(batchId);
  return json({ batch }, 201);
}

function serveFile(path: string | null, type: string): Response {
  if (!path) return json({ error: "Không tìm thấy." }, 404);
  const file = Bun.file(path);
  if (!file.size) return json({ error: "Không tìm thấy." }, 404);
  return new Response(file, {
    headers: { "content-type": type, "cache-control": "public, max-age=31536000, immutable" },
  });
}

const pad = (value: number) => String(value).padStart(2, "0");

function downloadName(createdAt: number): string {
  const date = new Date(createdAt);
  return `imgnen-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(
    date.getHours(),
  )}${pad(date.getMinutes())}.zip`;
}

async function handleApi(request: Request, url: URL): Promise<Response> {
  const path = url.pathname;

  if (path === "/api/assets" && request.method === "POST") return handleUpload(request);

  if (path === "/api/settings" && request.method === "POST") {
    const body = (await request.json().catch(() => null)) as { settings?: unknown } | null;
    if (!body) return badRequest("Dữ liệu cài đặt không hợp lệ.");
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

  if (path === "/api/batches" && request.method === "POST") return createBatchFromRequest(request);

  const batchMatch = path.match(/^\/api\/batches\/([a-zA-Z0-9-]+)$/);
  if (batchMatch) {
    const id = batchMatch[1]!;
    if (request.method === "GET") {
      const batch = getBatch(id);
      if (!batch) return json({ error: "Không tìm thấy lô ảnh." }, 404);
      return json({ batch });
    }
    if (request.method === "DELETE") {
      const row = getBatchRow(id);
      if (!row) return json({ error: "Không tìm thấy lô ảnh." }, 404);
      if (row.status === "queued" || row.status === "processing") {
        return json({ error: "Lô ảnh đang xử lý, vui lòng đợi xong rồi xoá." }, 409);
      }
      await deleteBatchFiles(id);
      return json({ ok: true });
    }
  }

  const downloadMatch = path.match(/^\/api\/batches\/([a-zA-Z0-9-]+)\/download$/);
  if (downloadMatch && request.method === "GET") {
    const row = getBatchRow(downloadMatch[1]!);
    if (!row?.zip_path) return json({ error: "Tệp ZIP chưa sẵn sàng." }, 404);
    const file = Bun.file(row.zip_path);
    if (!(await file.exists())) return json({ error: "Tệp ZIP đã bị xoá." }, 404);
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
    return serveFile(getAsset(assetThumb[1]!)?.thumb_path ?? null, "image/webp");
  }

  const itemThumb = path.match(/^\/api\/thumb\/item\/([a-zA-Z0-9-]+)$/);
  if (itemThumb && request.method === "GET") {
    return serveFile(getItemThumbPath(itemThumb[1]!), "image/webp");
  }

  return json({ error: "Không tìm thấy API này." }, 404);
}

const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <defs><linearGradient id="g" x1="3" y1="2" x2="29" y2="30" gradientUnits="userSpaceOnUse">
    <stop stop-color="#6366f1"/><stop offset="1" stop-color="#06b6d4"/>
  </linearGradient></defs>
  <rect x="2.5" y="2.5" width="27" height="27" rx="8.5" fill="url(#g)"/>
  <path d="M10 21.5 16 10l6 11.5M12.6 17.4h6.8" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>`;

const server = Bun.serve({
  port: PORT,
  hostname: HOST,
  maxRequestBodySize: (LIMITS.maxFileMB + 10) * 1024 * 1024,
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path.startsWith("/api/")) return await handleApi(request, url);

      if (path === "/static/app.js" || path === "/static/styles.css") {
        const name = path.slice("/static/".length);
        const type = name.endsWith(".css") ? "text/css; charset=utf-8" : "text/javascript; charset=utf-8";
        const file = Bun.file(join("public", name));
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

      if (path === "/") return renderHome();
      if (path === "/history") return renderHistory();
      if (path.startsWith("/history/")) {
        const id = decodeURIComponent(path.slice("/history/".length));
        if (!id || id.includes("/")) return html(renderNotFound(), 404);
        return renderBatchPage(id);
      }
      if (path === "/health") return json({ ok: true, uptime: process.uptime() });

      return html(renderNotFound(), 404);
    } catch (error) {
      console.error(`[server] ${request.method} ${path}:`, error);
      if (path.startsWith("/api/")) return json({ error: "Máy chủ gặp lỗi. Vui lòng thử lại." }, 500);
      return html(renderNotFound("Máy chủ gặp lỗi khi hiển thị trang."), 500);
    }
  },
  error(error) {
    console.error("[server] lỗi không xử lý:", error);
    return json({ error: "Máy chủ gặp lỗi." }, 500);
  },
});

console.log(`\n  ImgDown đang chạy tại http://localhost:${server.port}`);
console.log(`  Bun ${Bun.version} · AVIF ${capabilities.avif ? "✓" : "✗"} · HEIC ${capabilities.heic ? "✓" : "✗"}`);
