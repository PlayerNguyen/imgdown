import { useEffect, useState } from "react";
import type { BatchDTO, BootData } from "@imgdown/shared";
import { Shell } from "../components/Shell";
import { BatchStatusBadge } from "../components/BatchBits";
import { AlertIcon, DownloadIcon, HistoryIcon, SpinnerIcon, TrashIcon, ZipIcon } from "../components/Icons";
import { formatBytes, formatDate, formatNumber, savedPercent, settingsSummary } from "@imgdown/shared";
import { api, errorMessage } from "../lib/client-api";
import { useI18n } from "../lib/i18n";

const ACTIVE = new Set(["queued", "processing"]);

/**
 * History page listing batches with download/delete actions and live polling.
 * @param root0 - Component props.
 * @param root0.boot - Page boot data.
 * @returns The rendered React element.
 */
export function HistoryPage({ boot }: { boot: BootData }) {
  const { locale, t } = useI18n();
  const [batches, setBatches] = useState<BatchDTO[]>(boot.batches);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasActive = batches.some((batch) => ACTIVE.has(batch.status));

  useEffect(() => {
    if (!hasActive) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const data = await api<{ batches: BatchDTO[] }>("/api/batches?limit=100", undefined, locale);
        if (cancelled) return;
        setBatches(data.batches);
        if (data.batches.some((batch) => ACTIVE.has(batch.status))) timer = setTimeout(tick, 1200);
      } catch {
        if (!cancelled) timer = setTimeout(tick, 2200);
      }
    };
    timer = setTimeout(tick, 700);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [hasActive, locale]);

  const remove = async (batch: BatchDTO) => {
    if (!window.confirm(t("history.confirm", { count: batch.fileCount }))) return;
    setBusyId(batch.id);
    setError(null);
    try {
      await api(`/api/batches/${batch.id}`, { method: "DELETE" }, locale);
      setBatches((prev) => prev.filter((item) => item.id !== batch.id));
    } catch (caught) {
      setError(errorMessage(caught, locale));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Shell active="history" limits={boot.limits}>
      <section className="flex flex-col justify-between gap-5 pb-6 pt-2 sm:flex-row sm:items-end">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-indigo-600">
            <HistoryIcon size={14} /> {t("history.badge")}
          </span>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">{t("history.title")}</h1>
          <p className="mt-1 text-[13px] text-slate-400">{t("history.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            [t("history.statImages"), formatNumber(boot.stats.files, locale)],
            [t("history.statSaved"), formatBytes(boot.stats.savedBytes, locale)],
            [t("history.statRetention"), t("history.days", { count: boot.limits.retentionDays })],
          ].map(([label, value]) => (
            <div key={label} className="min-w-[108px] rounded-xl border border-slate-200 bg-white px-3 py-2">
              <div className="text-[10px] text-slate-400">{label}</div>
              <div className="text-[15px] font-bold tracking-tight tabular-nums">{value}</div>
            </div>
          ))}
        </div>
      </section>

      {error ? (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700" role="alert">
          <AlertIcon size={16} /> {error}
        </div>
      ) : null}

      {batches.length === 0 ? (
        <section className="card flex flex-col items-center gap-2 px-6 py-16 text-center">
          <span className="mb-2 grid size-16 place-items-center rounded-2xl border border-indigo-200 bg-indigo-50 text-indigo-600">
            <ZipIcon size={30} />
          </span>
          <h2 className="text-xl font-bold tracking-tight">{t("history.emptyTitle")}</h2>
          <p className="max-w-sm text-[13px] text-slate-400">{t("history.emptyBody")}</p>
          <a className="btn-primary mt-3" href="/">
            {t("history.emptyCta")}
          </a>
        </section>
      ) : (
        <div className="card overflow-hidden">
          {batches.map((batch) => {
            const percent = savedPercent(batch.totalInput, batch.totalOutput);
            const isActive = ACTIVE.has(batch.status);
            return (
              <article
                key={batch.id}
                className="grid gap-4 border-b border-slate-100 px-5 py-4 transition last:border-0 hover:bg-slate-50/60 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center lg:gap-6"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <BatchStatusBadge batch={batch} />
                    <a className="text-[14px] font-semibold hover:text-indigo-600" href={`/history/${batch.id}`}>
                      {t("home.imageCount", { count: batch.fileCount })}
                    </a>
                    <span className="text-[10.5px] text-slate-400">{formatDate(batch.createdAt, locale)}</span>
                  </div>
                  <p className="mt-1 text-[11.5px] text-slate-400">
                    {settingsSummary(batch.settings, locale)}
                    {batch.error ? <span className="font-medium text-amber-600"> · {batch.error}</span> : null}
                  </p>
                  <p className="mt-0.5 font-mono text-[9.5px] text-slate-300">{batch.id}</p>
                </div>

                <div className="flex items-center gap-2.5 tabular-nums">
                  <div>
                    <div className="text-[9.5px] text-slate-400">{t("history.before")}</div>
                    <strong className="text-[12.5px]">{formatBytes(batch.totalInput, locale)}</strong>
                  </div>
                  <span className="text-[11px] text-slate-300">→</span>
                  <div>
                    <div className="text-[9.5px] text-slate-400">{t("history.after")}</div>
                    <strong className="text-[12.5px]">
                      {batch.totalOutput !== null ? formatBytes(batch.totalOutput, locale) : "…"}
                    </strong>
                  </div>
                  {percent !== null ? <span className="save-pill">−{percent}%</span> : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <a className="btn-ghost px-3 py-1.5 text-[12px]" href={`/history/${batch.id}`}>
                    {t("common.details")}
                  </a>
                  {batch.zipUrl ? (
                    <a className="btn-primary px-3 py-1.5 text-[12px]" href={batch.zipUrl} download>
                      <DownloadIcon size={14} /> ZIP
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-[12px] font-semibold text-slate-400">
                      {isActive ? <SpinnerIcon size={13} /> : <AlertIcon size={13} />}
                      {isActive ? t("history.compressing") : t("history.noZip")}
                    </span>
                  )}
                  <button
                    type="button"
                    className="grid size-8 place-items-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                    aria-label={t("history.deleteAria", { id: batch.id })}
                    disabled={busyId === batch.id || isActive}
                    title={isActive ? t("history.deleteWaiting") : t("history.deleteTitle")}
                    onClick={() => remove(batch)}
                  >
                    {busyId === batch.id ? <SpinnerIcon size={15} /> : <TrashIcon size={16} />}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <p className="mt-6 text-center text-[11.5px] text-slate-400">
        {t("history.footer", { days: boot.limits.retentionDays })}
      </p>
    </Shell>
  );
}
