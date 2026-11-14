import { useEffect, useState } from "react";
import type { BatchDTO, BootData } from "@imgdown/shared";
import { Shell } from "../components/Shell";
import { BatchStatusBadge, batchStatusLabel } from "../components/BatchBits";
import { AlertIcon, CheckIcon, DownloadIcon, ImageIcon, SpinnerIcon, TrashIcon, ZipIcon } from "../components/Icons";
import {
  FORMAT_NAMES,
  formatBytes,
  formatDate,
  formatDimensions,
  savedPercent,
  settingsSummary,
} from "@imgdown/shared";
import { api, errorMessage } from "../lib/client-api";

const ACTIVE = new Set(["queued", "processing"]);

/**
 * Shows batch settings, savings and per-image results.
 * @param root0 - Component props.
 * @param root0.boot - Page boot data.
 * @returns The rendered React element.
 */
export function BatchDetailPage({ boot }: { boot: BootData }) {
  const [batch, setBatch] = useState<BatchDTO>(boot.batch!);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = ACTIVE.has(batch.status);

  useEffect(() => {
    if (!ACTIVE.has(batch.status)) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const data = await api<{ batch: BatchDTO }>(`/api/batches/${batch.id}`);
        if (cancelled) return;
        setBatch(data.batch);
        if (ACTIVE.has(data.batch.status)) timer = setTimeout(tick, 800);
      } catch {
        if (!cancelled) timer = setTimeout(tick, 1800);
      }
    };
    timer = setTimeout(tick, 400);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // Status changes (processing → done/error) restart the effect and stop polling.
  }, [batch.id, batch.status]);

  const remove = async () => {
    if (!globalThis.confirm("Xoá lô ảnh này cùng tệp ZIP? Thao tác không thể hoàn tác.")) return;
    setDeleting(true);
    setError(null);
    try {
      await api(`/api/batches/${batch.id}`, { method: "DELETE" });
      globalThis.location.href = "/history";
    } catch (caught) {
      setError(errorMessage(caught));
      setDeleting(false);
    }
  };

  const percent = savedPercent(batch.totalInput, batch.totalOutput);
  const doneItems = batch.items.filter((item) => item.status === "done");
  const failedItems = batch.items.filter((item) => item.status === "error");
  const totalSaved = doneItems.reduce(
    (sum, item) => sum + Math.max(0, item.inputBytes - (item.outputBytes ?? 0)),
    0,
  );

  return (
    <Shell active="batch" limits={boot.limits}>
      <a className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-indigo-600" href="/history">
        <span aria-hidden>←</span> Quay lại lịch sử
      </a>

      <section className="flex flex-col items-start justify-between gap-5 pb-6 lg:flex-row">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <BatchStatusBadge batch={batch} />
            <h1 className="text-[2rem] font-extrabold tracking-tight">Lô {batch.fileCount} ảnh</h1>
          </div>
          <p className="mt-1 text-xs text-slate-400">{formatDate(batch.createdAt)}</p>
          <p className="mt-1 text-[12.5px] text-slate-500">
            {settingsSummary(batch.settings)} <span className="font-mono text-[10px] text-slate-300">· {batch.id}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {batch.zipUrl ? (
            <a className="btn-primary" href={batch.zipUrl} download>
              <DownloadIcon size={17} /> Tải ZIP ({formatBytes(batch.zipBytes)})
            </a>
          ) : (
            <span className="btn-primary cursor-not-allowed opacity-60">
              {active ? <SpinnerIcon size={16} /> : <AlertIcon size={16} />}
              {active ? "Đang tạo ZIP…" : "Không có ZIP"}
            </span>
          )}
          <button type="button" className="btn-danger" disabled={deleting || active} onClick={remove}>
            {deleting ? <SpinnerIcon size={16} /> : <TrashIcon size={16} />} Xoá lô
          </button>
        </div>
      </section>

      {error ? (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-[13px] text-red-700" role="alert">
          <AlertIcon size={17} className="shrink-0" /> {error}
        </div>
      ) : null}
      {batch.error ? (
        <output className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[13px] text-amber-700">
          <AlertIcon size={17} className="shrink-0" /> {batch.error}
        </output>
      ) : null}

      <section className="mb-5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {[
          ["Dung lượng gốc", formatBytes(batch.totalInput), `${batch.fileCount} ảnh tải lên`],
          ["Dung lượng ZIP", batch.totalOutput !== null ? formatBytes(batch.totalOutput) : "…", batch.zipBytes !== null ? `Tệp ZIP ${formatBytes(batch.zipBytes)}` : "Chưa tạo xong"],
          ["Tiết kiệm", percent !== null ? `${percent}%` : "—", `${formatBytes(totalSaved)} giảm bớt`],
          ["Kết quả", `${doneItems.length}/${batch.items.length}`, failedItems.length > 0 ? `${failedItems.length} ảnh lỗi` : "Tất cả thành công"],
        ].map(([label, value, hint], index) => (
          <div
            key={label}
            className={`rounded-xl border bg-white px-4 py-3.5 ${index === 2 ? "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white" : "border-slate-200"}`}
          >
            <div className="text-[10.5px] text-slate-400">{label}</div>
            <div className={`text-[22px] font-bold tracking-tight tabular-nums ${index === 2 ? "text-emerald-600" : ""}`}>{value}</div>
            <div className="text-[10.5px] text-slate-400">{hint}</div>
          </div>
        ))}
      </section>

      <section className="card overflow-hidden">
        <div className="px-5 py-4">
          <h2 className="text-[15px] font-semibold tracking-tight">Chi tiết ảnh</h2>
          <p className="text-[11.5px] text-slate-400">Dung lượng, kích thước và định dạng đầu ra của từng ảnh</p>
        </div>
        <div className="detail-row table-head">
          <span>Ảnh</span>
          <span>Kích thước</span>
          <span>Dung lượng</span>
          <span>Định dạng</span>
          <span>Trạng thái</span>
        </div>
        {batch.items.map((item) => {
          const preview = item.thumbUrl ?? (item.assetId ? `/api/thumb/asset/${item.assetId}` : null);
          const itemPercent = savedPercent(item.inputBytes, item.outputBytes);
          return (
            <div key={item.id} className={`detail-row ${item.status === "error" ? "bg-red-50/40" : ""}`}>
              <div className="detail-file flex min-w-0 items-center gap-2.5">
                <div className="thumb size-11 rounded-lg">
                  {preview ? <img src={preview} alt="" loading="lazy" /> : <ImageIcon size={18} />}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold" title={item.name}>{item.name}</div>
                  {item.outputName && item.outputName !== item.name ? (
                    <div className="truncate text-[10.5px] text-slate-400">→ {item.outputName}</div>
                  ) : null}
                </div>
              </div>
              <div className="detail-cell">
                <span className="cell-label">Kích thước</span>
                <span>{formatDimensions(item.inputWidth, item.inputHeight)}</span>
                {item.outputWidth ? <span className="text-[10.5px] text-slate-400">→ {formatDimensions(item.outputWidth, item.outputHeight)}</span> : null}
              </div>
              <div className="detail-cell">
                <span className="cell-label">Dung lượng</span>
                <span>{formatBytes(item.inputBytes)}</span>
                {item.outputBytes !== null ? <span className="text-[10.5px] text-slate-400">→ {formatBytes(item.outputBytes)}</span> : null}
                {itemPercent !== null && itemPercent > 0 ? <span className="save-pill">−{itemPercent}%</span> : null}
              </div>
              <div className="detail-cell">
                <span className="cell-label">Định dạng</span>
                {item.outputFormat ? (
                  <span className="format-tag">{FORMAT_NAMES[item.outputFormat] ?? item.outputFormat}</span>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
                {item.quality !== null ? <span className="text-[10.5px] text-slate-400">chất lượng {item.quality}</span> : null}
                {item.durationMs !== null ? <span className="text-[10.5px] text-slate-400">{item.durationMs} ms</span> : null}
              </div>
              <div className="detail-cell">
                <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${item.status === "done" ? "text-emerald-600" : item.status === "error" ? "text-red-500" : "text-indigo-600"}`}>
                  {item.status === "done" ? <CheckIcon size={14} /> : item.status === "error" ? <AlertIcon size={14} /> : <SpinnerIcon size={13} />}
                  {batchStatusLabel(item.status)}
                </span>
                {item.error ? <span className="text-[10.5px] text-red-500">{item.error}</span> : null}
              </div>
            </div>
          );
        })}
      </section>

      <section className="mt-5 flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-slate-400">
        <ZipIcon size={19} className="mt-0.5 shrink-0 text-amber-500" />
        <p className="text-[11.5px] leading-relaxed">
          Tệp ZIP chứa {doneItems.length} ảnh đã nén, giữ tên gốc (kèm hậu tố nếu có). Ảnh gốc vẫn lưu trên máy chủ
          đến khi hết hạn {boot.limits.retentionDays} ngày hoặc bạn xoá lô.
        </p>
      </section>
    </Shell>
  );
}
