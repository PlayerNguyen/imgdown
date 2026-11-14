import { readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { AssetDTO } from "@imgdown/shared";
import {
  THUMB_DIR,
  ZIP_DIR,
  allBatchRows,
  allThumbPaths,
  assetIsReferenced,
  batchFileInfo,
  deleteAssetRow,
  deleteBatchRow,
  getAsset,
  unreferencedAssets,
} from "./db";

async function removeFile(path: string | null | undefined): Promise<void> {
  if (!path) return;
  try {
    await unlink(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`[storage] không xoá được ${path}:`, error);
    }
  }
}

/** Removes a batch, its ZIP, thumbs and now-unreferenced uploads. */
export async function deleteBatchFiles(batchId: string): Promise<void> {
  const info = batchFileInfo(batchId);
  const zipPath = deleteBatchRow(batchId);

  await removeFile(zipPath);
  for (const thumbPath of info.thumbPaths) await removeFile(thumbPath);

  for (const assetId of new Set(info.assetIds)) {
    if (assetIsReferenced(assetId)) continue;
    const asset = getAsset(assetId);
    if (!asset) continue;
    await removeFile(asset.stored_path);
    await removeFile(asset.thumb_path);
    deleteAssetRow(assetId);
  }
}

/** Deletes expired batches, abandoned uploads and orphan files. */
export async function cleanupExpired(
  retentionDays: number,
): Promise<{ batches: number; assets: number }> {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const oldBatches = allBatchRows().filter((batch) => batch.created_at < cutoff);
  for (const batch of oldBatches) await deleteBatchFiles(batch.id);

  const abandoned = unreferencedAssets(Date.now() - 24 * 60 * 60 * 1000);
  for (const asset of abandoned) {
    await removeFile(asset.stored_path);
    await removeFile(asset.thumb_path);
    deleteAssetRow(asset.id);
  }

  await removeOrphanFiles();
  return { batches: oldBatches.length, assets: abandoned.length };
}

async function removeOrphanFiles(): Promise<void> {
  const knownThumbs = new Set(allThumbPaths());
  for (const name of await readdir(THUMB_DIR).catch(() => [] as string[])) {
    const path = join(THUMB_DIR, name);
    if (!knownThumbs.has(path)) await removeFile(path);
  }

  const knownZips = new Set(allBatchRows().map((batch) => batch.zip_path).filter(Boolean) as string[]);
  for (const name of await readdir(ZIP_DIR).catch(() => [] as string[])) {
    const path = join(ZIP_DIR, name);
    if (!knownZips.has(path)) await removeFile(path);
  }
}

/** Maps an uploaded asset row to the client-facing DTO. */
export function assetToDTO(asset: {
  id: string;
  name: string;
  size: number;
  width: number;
  height: number;
  format: string;
  thumb_path: string | null;
  created_at: number;
}): AssetDTO {
  return {
    id: asset.id,
    name: asset.name,
    size: asset.size,
    width: asset.width,
    height: asset.height,
    format: asset.format,
    thumbUrl: asset.thumb_path ? `/api/thumb/asset/${asset.id}?v=${asset.created_at}` : "",
  };
}
