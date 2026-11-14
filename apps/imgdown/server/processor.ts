import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { stripControlChars, type Settings } from "@imgdown/shared";
import {
  THUMB_DIR,
  ZIP_DIR,
  getAsset,
  getBatchItems,
  getBatchRow,
  updateBatch,
  updateItem,
} from "@imgdown/db";
import { ZipWriter, compressImage, formatError, getCapabilities, writeThumbnail } from "@imgdown/media";

const CONCURRENCY = Math.min(4, Math.max(1, Number(process.env.IMAGE_CONCURRENCY) || 1));

function baseName(name: string): string {
  const cleaned = stripControlChars(name).replaceAll(/[\\/]/gu, "-").trim();
  const withoutExt = cleaned.replace(/\.[a-z0-9]{1,8}$/i, "");
  return (withoutExt || "image").slice(0, 120) || "image";
}

function uniqueName(used: Set<string>, name: string, suffix: string, ext: string): string {
  const base = `${baseName(name)}${suffix}`;
  let candidate = `${base}.${ext}`;
  let index = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${base}-${index}.${ext}`;
    index++;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

/**
 * Processes a queued batch, writes the ZIP and updates progress in SQLite.
 * @param batchId - Batch identifier.
 */
export async function processBatch(batchId: string): Promise<void> {
  const batch = getBatchRow(batchId);
  if (!batch) return;

  const zipPath = join(ZIP_DIR, `${batchId}.zip`);
  const settings = JSON.parse(batch.settings) as Settings;
  let zip: ZipWriter | null = null;

  try {
    const capabilities = await getCapabilities();
    zip = new ZipWriter(zipPath);
    const writer = zip;

    updateBatch(batchId, { status: "processing" });

    const items = getBatchItems(batchId);
    const usedNames = new Set<string>();
    let cursor = 0;
    let done = 0;
    let failed = 0;
    let totalOutput = 0;
    let firstError: string | null = null;

    const worker = async () => {
      while (cursor < items.length) {
        const item = items[cursor++]!;
        if (item.status !== "pending") continue;

        const startedAt = Date.now();
        updateItem(item.id, { status: "processing" });

        try {
          if (!item.assetId) throw new Error("The uploaded original image could not be found.");
          const asset = getAsset(item.assetId);
          if (!asset) throw new Error("The original image has been removed from the server.");

          const data = new Uint8Array(await Bun.file(asset.stored_path).arrayBuffer());
          const result = await compressImage(
            data,
            { width: asset.width, height: asset.height, format: asset.format },
            settings,
            capabilities,
          );

          const outputName = uniqueName(usedNames, item.name, settings.suffix, result.ext);
          await writer.add(outputName, result.bytes);

          const thumbPath = join(THUMB_DIR, `${item.id}.webp`);
          const hasThumb = await writeThumbnail(result.bytes, thumbPath)
            .then(() => true)
            .catch((error) => {
              console.warn(`[processor] thumbnail failed for ${item.name}:`, error);
              return false;
            });

          updateItem(item.id, {
            status: "done",
            outputName,
            outputBytes: result.bytes.length,
            outputWidth: result.width,
            outputHeight: result.height,
            outputFormat: result.format,
            quality: result.quality,
            durationMs: Date.now() - startedAt,
            error: null,
            thumbPath: hasThumb ? thumbPath : null,
          });
          totalOutput += result.bytes.length;
          done++;
        } catch (error) {
          const message = formatError(error);
          firstError ??= message;
          failed++;
          updateItem(item.id, {
            status: "error",
            error: message,
            durationMs: Date.now() - startedAt,
          });
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
    await writer.close();

    if (done === 0) {
      await unlink(zipPath).catch(() => {});
      updateBatch(batchId, {
        status: "error",
        error: firstError ? `No images could be compressed: ${firstError}` : "No images could be compressed.",
        finishedAt: Date.now(),
        totalOutput: 0,
      });
      return;
    }

    const zipBytes = (await Bun.file(zipPath).stat()).size;
    updateBatch(batchId, {
      status: failed > 0 ? "partial" : "done",
      totalOutput,
      zipPath,
      zipBytes,
      error: failed > 0 ? `${failed} images could not be compressed.` : null,
      finishedAt: Date.now(),
    });
  } catch (error) {
    console.error(`[processor] batch ${batchId} failed:`, error);
    try {
      await zip?.close();
    } catch {
      // ignore
    }
    await unlink(zipPath).catch(() => {});
    updateBatch(batchId, {
      status: "error",
      error: "The server failed to create the ZIP file. Please try again.",
      finishedAt: Date.now(),
    });
  }
}
