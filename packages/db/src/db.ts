import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { BatchDTO, BatchItemDTO, BatchStatus, ItemStatus, Settings, Stats } from "@imgdown/shared";
import { DEFAULT_SETTINGS, normalizeSettings } from "@imgdown/media";

export const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), "data");
export const UPLOAD_DIR = join(DATA_DIR, "uploads");
export const THUMB_DIR = join(DATA_DIR, "thumbs");
export const ZIP_DIR = join(DATA_DIR, "zips");

for (const dir of [DATA_DIR, UPLOAD_DIR, THUMB_DIR, ZIP_DIR]) {
  mkdirSync(dir, { recursive: true });
}

export const db = new Database(join(DATA_DIR, "imgdown.sqlite"), { create: true });

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS assets (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    format      TEXT NOT NULL,
    mime        TEXT,
    size        INTEGER NOT NULL,
    width       INTEGER NOT NULL,
    height      INTEGER NOT NULL,
    stored_path TEXT NOT NULL,
    thumb_path  TEXT,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_assets_created ON assets(created_at);

  CREATE TABLE IF NOT EXISTS batches (
    id           TEXT PRIMARY KEY,
    status       TEXT NOT NULL,
    settings     TEXT NOT NULL,
    file_count   INTEGER NOT NULL DEFAULT 0,
    total_input  INTEGER NOT NULL DEFAULT 0,
    total_output INTEGER,
    zip_path     TEXT,
    zip_bytes    INTEGER,
    error        TEXT,
    created_at   INTEGER NOT NULL,
    finished_at  INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_batches_created ON batches(created_at DESC);

  CREATE TABLE IF NOT EXISTS batch_items (
    id            TEXT PRIMARY KEY,
    batch_id      TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    asset_id      TEXT REFERENCES assets(id) ON DELETE SET NULL,
    name          TEXT NOT NULL,
    output_name   TEXT,
    status        TEXT NOT NULL DEFAULT 'pending',
    input_bytes   INTEGER NOT NULL DEFAULT 0,
    output_bytes  INTEGER,
    input_width   INTEGER,
    input_height  INTEGER,
    output_width  INTEGER,
    output_height INTEGER,
    output_format TEXT,
    quality       INTEGER,
    duration_ms   INTEGER,
    error         TEXT,
    thumb_path    TEXT,
    created_at    INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_items_batch ON batch_items(batch_id);

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

type AssetRow = {
  id: string;
  name: string;
  format: string;
  mime: string | null;
  size: number;
  width: number;
  height: number;
  stored_path: string;
  thumb_path: string | null;
  created_at: number;
};

type BatchRow = {
  id: string;
  status: BatchStatus;
  settings: string;
  file_count: number;
  total_input: number;
  total_output: number | null;
  zip_path: string | null;
  zip_bytes: number | null;
  error: string | null;
  created_at: number;
  finished_at: number | null;
};

type ItemRow = {
  id: string;
  batch_id: string;
  asset_id: string | null;
  name: string;
  output_name: string | null;
  status: ItemStatus;
  input_bytes: number;
  output_bytes: number | null;
  input_width: number | null;
  input_height: number | null;
  output_width: number | null;
  output_height: number | null;
  output_format: string | null;
  quality: number | null;
  duration_ms: number | null;
  error: string | null;
  thumb_path: string | null;
  created_at: number;
};

/** Reads the persisted default settings, falling back to built-in defaults. */
export function getSettings(): Settings {
  try {
    const row = db.query<{ value: string }, []>("SELECT value FROM settings WHERE key = 'defaults'").get();
    if (!row) return { ...DEFAULT_SETTINGS };
    return normalizeSettings(JSON.parse(row.value));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Persists the default settings used by the next SSR render. */
export function saveSettings(settings: Settings): void {
  db.run(
    "INSERT INTO settings (key, value) VALUES ('defaults', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [JSON.stringify(settings)],
  );
}

/** Inserts an uploaded asset record. */
export function insertAsset(asset: {
  id: string;
  name: string;
  format: string;
  mime: string | null;
  size: number;
  width: number;
  height: number;
  storedPath: string;
  thumbPath: string | null;
}): void {
  db.run(
    `INSERT INTO assets (id, name, format, mime, size, width, height, stored_path, thumb_path, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      asset.id,
      asset.name,
      asset.format,
      asset.mime,
      asset.size,
      asset.width,
      asset.height,
      asset.storedPath,
      asset.thumbPath,
      Date.now(),
    ],
  );
}

/** Looks up one uploaded asset by id. */
export function getAsset(id: string): AssetRow | null {
  return db.query<AssetRow, [string]>("SELECT * FROM assets WHERE id = ?").get(id) ?? null;
}

/** Looks up multiple uploaded assets by id. */
export function getAssets(ids: string[]): AssetRow[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  return db.query<AssetRow, string[]>(`SELECT * FROM assets WHERE id IN (${placeholders})`).all(...ids);
}

/** Creates a batch and its pending items in one transaction. */
export function createBatch(batch: {
  id: string;
  settings: Settings;
  items: {
    id: string;
    assetId: string;
    name: string;
    inputBytes: number;
    inputWidth: number;
    inputHeight: number;
  }[];
}): void {
  const now = Date.now();
  db.transaction(() => {
    db.run(
      `INSERT INTO batches (id, status, settings, file_count, total_input, created_at)
       VALUES (?, 'queued', ?, ?, ?, ?)`,
      [
        batch.id,
        JSON.stringify(batch.settings),
        batch.items.length,
        batch.items.reduce((sum, item) => sum + item.inputBytes, 0),
        now,
      ],
    );
    for (const item of batch.items) {
      db.run(
        `INSERT INTO batch_items (id, batch_id, asset_id, name, status, input_bytes, input_width, input_height, created_at)
         VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
        [
          item.id,
          batch.id,
          item.assetId,
          item.name,
          item.inputBytes,
          item.inputWidth,
          item.inputHeight,
          now,
        ],
      );
    }
  })();
}

/** Looks up a batch row by id. */
export function getBatchRow(id: string): BatchRow | null {
  return db.query<BatchRow, [string]>("SELECT * FROM batches WHERE id = ?").get(id) ?? null;
}

function itemToDTO(row: ItemRow): BatchItemDTO {
  return {
    id: row.id,
    assetId: row.asset_id,
    name: row.name,
    outputName: row.output_name,
    status: row.status,
    inputBytes: row.input_bytes,
    outputBytes: row.output_bytes,
    inputWidth: row.input_width,
    inputHeight: row.input_height,
    outputWidth: row.output_width,
    outputHeight: row.output_height,
    outputFormat: row.output_format,
    quality: row.quality,
    durationMs: row.duration_ms,
    error: row.error,
    thumbUrl: row.thumb_path ? `/api/thumb/item/${row.id}?v=${row.created_at}` : null,
  };
}

/** Returns all items of a batch in insertion order. */
export function getBatchItems(batchId: string): BatchItemDTO[] {
  const rows = db
    .query<ItemRow, [string]>("SELECT * FROM batch_items WHERE batch_id = ? ORDER BY created_at, rowid")
    .all(batchId);
  return rows.map((row) => itemToDTO(row));
}

function batchToDTO(row: BatchRow, items: BatchItemDTO[]): BatchDTO {
  return {
    id: row.id,
    status: row.status,
    settings: normalizeSettings(JSON.parse(row.settings)),
    fileCount: row.file_count,
    totalInput: row.total_input,
    totalOutput: row.total_output,
    zipBytes: row.zip_bytes,
    zipUrl: row.zip_path ? `/api/batches/${row.id}/download` : null,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
    error: row.error,
    items,
  };
}

/** Loads a full batch DTO, optionally without its items. */
export function getBatch(id: string, includeItems = true): BatchDTO | null {
  const row = getBatchRow(id);
  if (!row) return null;
  return batchToDTO(row, includeItems ? getBatchItems(id) : []);
}

/** Returns the thumbnail path of a processed item. */
export function getItemThumbPath(id: string): string | null {
  const row = db
    .query<{ thumb_path: string | null }, [string]>("SELECT thumb_path FROM batch_items WHERE id = ?")
    .get(id);
  return row?.thumb_path ?? null;
}

/** Lists the newest batches, optionally including their items. */
export function listBatches(limit = 30, includeItems = false): BatchDTO[] {
  const rows = db
    .query<BatchRow, [number]>("SELECT * FROM batches ORDER BY created_at DESC LIMIT ?")
    .all(limit);
  if (!includeItems) return rows.map((row) => batchToDTO(row, []));

  const itemRows = db
    .query<ItemRow, []>("SELECT * FROM batch_items ORDER BY created_at, rowid")
    .all();
  const grouped = new Map<string, BatchItemDTO[]>();
  for (const item of itemRows) {
    const list = grouped.get(item.batch_id) ?? [];
    list.push(itemToDTO(item));
    grouped.set(item.batch_id, list);
  }
  return rows.map((row) => batchToDTO(row, grouped.get(row.id) ?? []));
}

function updateColumns(
  table: "batch_items" | "batches",
  id: string,
  patch: Record<string, string | number | null | undefined>,
  mapping: Record<string, string>,
): void {
  const columns: string[] = [];
  const values: (string | number | null)[] = [];
  for (const [key, column] of Object.entries(mapping)) {
    if (key in patch) {
      columns.push(`${column} = ?`);
      values.push(patch[key] ?? null);
    }
  }
  if (columns.length === 0) return;
  db.run(`UPDATE ${table} SET ${columns.join(", ")} WHERE id = ?`, [...values, id]);
}

/** Updates selected columns of a batch item. */
export function updateItem(
  id: string,
  patch: {
    status?: ItemStatus;
    outputName?: string | null;
    outputBytes?: number | null;
    inputWidth?: number | null;
    inputHeight?: number | null;
    outputWidth?: number | null;
    outputHeight?: number | null;
    outputFormat?: string | null;
    quality?: number | null;
    durationMs?: number | null;
    error?: string | null;
    thumbPath?: string | null;
  },
): void {
  updateColumns("batch_items", id, patch, {
    status: "status",
    outputName: "output_name",
    outputBytes: "output_bytes",
    inputWidth: "input_width",
    inputHeight: "input_height",
    outputWidth: "output_width",
    outputHeight: "output_height",
    outputFormat: "output_format",
    quality: "quality",
    durationMs: "duration_ms",
    error: "error",
    thumbPath: "thumb_path",
  });
}

/** Updates selected columns of a batch. */
export function updateBatch(
  id: string,
  patch: {
    status?: BatchStatus;
    totalOutput?: number | null;
    zipPath?: string | null;
    zipBytes?: number | null;
    error?: string | null;
    finishedAt?: number | null;
  },
): void {
  updateColumns("batches", id, patch, {
    status: "status",
    totalOutput: "total_output",
    zipPath: "zip_path",
    zipBytes: "zip_bytes",
    error: "error",
    finishedAt: "finished_at",
  });
}

/** Deletes a batch row and returns its ZIP path, if any. */
export function deleteBatchRow(id: string): string | null {
  const row = getBatchRow(id);
  db.run("DELETE FROM batches WHERE id = ?", [id]);
  return row?.zip_path ?? null;
}

/** Returns thumbnail paths and asset ids belonging to a batch. */
export function batchFileInfo(batchId: string): { thumbPaths: string[]; assetIds: string[] } {
  const rows = db
    .query<{ thumb_path: string | null; asset_id: string | null }, [string]>(
      "SELECT thumb_path, asset_id FROM batch_items WHERE batch_id = ?",
    )
    .all(batchId);
  return {
    thumbPaths: rows.map((row) => row.thumb_path).filter((path): path is string => Boolean(path)),
    assetIds: rows.map((row) => row.asset_id).filter((id): id is string => Boolean(id)),
  };
}

/** Checks whether an asset is still referenced by any batch. */
export function assetIsReferenced(assetId: string): boolean {
  const row = db
    .query<{ count: number }, [string]>("SELECT COUNT(*) AS count FROM batch_items WHERE asset_id = ?")
    .get(assetId);
  return (row?.count ?? 0) > 0;
}

/** Returns all thumbnail paths known to the database. */
export function allThumbPaths(): string[] {
  const assets = db
    .query<{ thumb_path: string | null }, []>("SELECT thumb_path FROM assets WHERE thumb_path IS NOT NULL")
    .all();
  const items = db
    .query<{ thumb_path: string | null }, []>(
      "SELECT thumb_path FROM batch_items WHERE thumb_path IS NOT NULL",
    )
    .all();
  return [...assets, ...items]
    .map((row) => row.thumb_path)
    .filter((path): path is string => Boolean(path));
}

/** Returns uploads that no batch references and that are older than the cutoff. */
export function unreferencedAssets(olderThanMs: number): AssetRow[] {
  return db
    .query<AssetRow, [number]>(
      `SELECT * FROM assets
       WHERE created_at < ?
         AND id NOT IN (SELECT asset_id FROM batch_items WHERE asset_id IS NOT NULL)`,
    )
    .all(olderThanMs);
}

/** Deletes an asset row. */
export function deleteAssetRow(id: string): void {
  db.run("DELETE FROM assets WHERE id = ?", [id]);
}

/** Aggregates lifetime file/savings statistics for the current database. */
export function getStats(): Stats {
  const row = db
    .query<{ files: number | null; saved: number | null; output: number | null }, []>(
      `SELECT COUNT(*) AS files,
              SUM(MAX(input_bytes - output_bytes, 0)) AS saved,
              SUM(output_bytes) AS output
       FROM batch_items WHERE status = 'done'`,
    )
    .get();
  const batches = db
    .query<{ count: number }, []>("SELECT COUNT(*) AS count FROM batches WHERE status IN ('done','partial')")
    .get();
  return {
    batches: batches?.count ?? 0,
    files: row?.files ?? 0,
    savedBytes: row?.saved ?? 0,
    outputBytes: row?.output ?? 0,
  };
}

/** Returns every asset row, used by cleanup routines. */
export function allAssetRows(): AssetRow[] {
  return db.query<AssetRow, []>("SELECT * FROM assets").all();
}

/** Returns every batch row, used by cleanup routines. */
export function allBatchRows(): BatchRow[] {
  return db.query<BatchRow, []>("SELECT * FROM batches").all();
}

/** Marks interrupted batches as failed after a server restart. */
export function markStaleBatchesFailed(): void {
  db.run(
    `UPDATE batches SET status = 'error', error = ?, finished_at = ?
     WHERE status IN ('queued', 'processing')`,
    ["Máy chủ đã khởi động lại khi lô ảnh đang xử lý. Vui lòng thử lại.", Date.now()],
  );
}
