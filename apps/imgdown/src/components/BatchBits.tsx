import type { BatchDTO, BatchItemDTO } from "@imgdown/shared";
import { FORMAT_NAMES, formatBytes, formatDimensions, savedPercent } from "@imgdown/shared";

/** Vietnamese label for a batch status. */
export function batchStatusLabel(status: string): string {
  switch (status) {
    case "queued":
      return "Đang chờ";
    case "processing":
      return "Đang nén";
    case "partial":
      return "Một phần";
    case "error":
      return "Lỗi";
    default:
      return "Hoàn tất";
  }
}

/** Tailwind classes for a batch status badge. */
export function batchStatusClass(status: string): string {
  if (status === "done") return "border-emerald-200 bg-emerald-50 text-emerald-600";
  if (status === "partial") return "border-amber-200 bg-amber-50 text-amber-600";
  if (status === "error") return "border-red-200 bg-red-50 text-red-600";
  return "border-indigo-200 bg-indigo-50 text-indigo-600";
}

/** Renders a compact status badge for a batch. */
export function BatchStatusBadge({ batch }: { batch: BatchDTO }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${batchStatusClass(
        batch.status,
      )}`}
    >
      {batch.status === "queued" || batch.status === "processing" ? (
        <span className="size-1.5 animate-pulse rounded-full bg-current" />
      ) : null}
      {batchStatusLabel(batch.status)}
    </span>
  );
}

/** Renders a single processed item row summary. */
export function ItemMeta({ item }: { item: BatchItemDTO }) {
  const percent = savedPercent(item.inputBytes, item.outputBytes);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] tabular-nums text-slate-400">
      <span>{formatBytes(item.inputBytes)}</span>
      {item.status === "done" ? (
        <>
          <span>→</span>
          <span className="font-medium text-slate-600">{formatBytes(item.outputBytes)}</span>
          <span>{formatDimensions(item.outputWidth, item.outputHeight)}</span>
          <span className="format-tag">{FORMAT_NAMES[item.outputFormat ?? ""] ?? item.outputFormat}</span>
          {percent !== null ? (
            <span className={percent > 0 ? "save-pill" : "rounded-full bg-slate-100 px-2 py-0.5 font-semibold"}>
              {percent > 0 ? `−${percent}%` : "đã tối ưu"}
            </span>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

