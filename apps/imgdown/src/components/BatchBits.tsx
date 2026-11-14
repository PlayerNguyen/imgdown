import type { BatchDTO, BatchItemDTO, Locale } from "@imgdown/shared";
import { formatBytes, formatDimensions, formatName, savedPercent, translate } from "@imgdown/shared";
import { useI18n } from "../lib/i18n";

/**
 * Localized label for a batch status.
 * @param status - Batch status.
 * @param locale - Target locale.
 * @returns The translated status label.
 */
export function batchStatusLabel(status: string, locale: Locale): string {
  switch (status) {
    case "queued":
      return translate(locale, "status.queued");
    case "processing":
      return translate(locale, "status.processing");
    case "partial":
      return translate(locale, "status.partial");
    case "error":
      return translate(locale, "status.error");
    case "pending":
      return translate(locale, "status.pending");
    default:
      return translate(locale, "status.done");
  }
}

/**
 * Tailwind classes for a batch status badge.
 * @param status - Batch status.
 * @returns The rendered React element.
 */
export function batchStatusClass(status: string): string {
  if (status === "done") return "border-emerald-200 bg-emerald-50 text-emerald-600";
  if (status === "partial") return "border-amber-200 bg-amber-50 text-amber-600";
  if (status === "error") return "border-red-200 bg-red-50 text-red-600";
  return "border-indigo-200 bg-indigo-50 text-indigo-600";
}

/**
 * Renders a compact status badge for a batch.
 * @param root0 - Component props.
 * @param root0.batch - Batch summary.
 * @returns The rendered React element.
 */
export function BatchStatusBadge({ batch }: { batch: BatchDTO }) {
  const { locale } = useI18n();
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${batchStatusClass(
        batch.status,
      )}`}
    >
      {batch.status === "queued" || batch.status === "processing" ? (
        <span className="size-1.5 animate-pulse rounded-full bg-current" />
      ) : null}
      {batchStatusLabel(batch.status, locale)}
    </span>
  );
}

/**
 * Renders a single processed item row summary.
 * @param root0 - Component props.
 * @param root0.item - Processed item.
 * @returns The rendered React element.
 */
export function ItemMeta({ item }: { item: BatchItemDTO }) {
  const { locale, t } = useI18n();
  const percent = savedPercent(item.inputBytes, item.outputBytes);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] tabular-nums text-slate-400">
      <span>{formatBytes(item.inputBytes, locale)}</span>
      {item.status === "done" ? (
        <>
          <span>→</span>
          <span className="font-medium text-slate-600">{formatBytes(item.outputBytes, locale)}</span>
          <span>{formatDimensions(item.outputWidth, item.outputHeight)}</span>
          <span className="format-tag">{formatName(locale, item.outputFormat ?? "")}</span>
          {percent !== null ? (
            <span className={percent > 0 ? "save-pill" : "rounded-full bg-slate-100 px-2 py-0.5 font-semibold"}>
              {percent > 0 ? `−${percent}%` : t("status.optimized")}
            </span>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
