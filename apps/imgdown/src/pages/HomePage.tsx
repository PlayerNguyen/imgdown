import { useEffect, useRef, useState } from "react";
import type { AssetDTO, BatchDTO, BatchItemDTO, BootData, Settings } from "@imgdown/shared";
import { SettingsPanel } from "../components/SettingsPanel";
import { Shell } from "../components/Shell";
import {
  AlertIcon,
  CheckIcon,
  DownloadIcon,
  ImageIcon,
  RefreshIcon,
  SparkleIcon,
  SpinnerIcon,
  TrashIcon,
  UploadIcon,
  XIcon,
  ZipIcon,
} from "../components/Icons";
import { BatchStatusBadge, ItemMeta } from "../components/BatchBits";
import {
  formatBytes,
  formatDate,
  formatDimensions,
  formatNumber,
  savedPercent,
  settingsSummary,
} from "@imgdown/shared";
import { api, errorMessage } from "../lib/client-api";
import { useI18n } from "../lib/i18n";

type Draft = {
  key: string;
  file: File | null;
  name: string;
  size: number;
  previewUrl: string | null;
  status: "uploading" | "ready" | "error";
  progress: number;
  asset: AssetDTO | null;
  error: string | null;
};

const ACTIVE_STATUSES = new Set(["queued", "processing"]);
const MAX_PARALLEL_UPLOADS = 3;

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-100">
      <span
        className="block h-full rounded-full bg-gradient-to-r from-indigo-500 to-sky-500 transition-all"
        style={{ width: `${Math.max(3, value)}%` }}
      />
    </div>
  );
}

function DraftRow({ draft, onRemove }: { draft: Draft; onRemove: () => void }) {
  const { locale, t } = useI18n();
  return (
    <li className="flex items-center gap-3 border-b border-slate-100 px-4 py-2.5 last:border-0">
      <div className="relative grid size-13 shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-slate-400">
        {draft.previewUrl ? <img src={draft.previewUrl} alt="" className="size-full object-cover" /> : <ImageIcon size={19} />}
        {draft.status === "uploading" ? (
          <span className="absolute inset-0 grid place-items-center bg-white/70 text-indigo-600">
            <SpinnerIcon size={15} />
          </span>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-slate-800" title={draft.name}>
          {draft.name}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] tabular-nums text-slate-400">
          <span>{formatBytes(draft.size, locale)}</span>
          {draft.asset ? <span>{formatDimensions(draft.asset.width, draft.asset.height)}</span> : null}
          {draft.asset ? <span className="format-tag">{draft.asset.format.toUpperCase()}</span> : null}
          {draft.status === "uploading" ? (
            <span>{t("home.uploadProgress", { percent: Math.round(draft.progress * 100) })}</span>
          ) : null}
          {draft.status === "ready" ? <span className="font-medium text-emerald-600">{t("home.ready")}</span> : null}
        </div>
        {draft.error ? <p className="mt-0.5 text-[11px] text-red-500">{draft.error}</p> : null}
        {draft.status === "uploading" ? <ProgressBar value={draft.progress * 100} /> : null}
      </div>
      <button
        type="button"
        className="grid size-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        aria-label={t("home.removeAria", { name: draft.name })}
        onClick={onRemove}
      >
        <XIcon size={16} />
      </button>
    </li>
  );
}

function BatchItemRow({
  item,
  preview,
}: {
  item: BatchItemDTO;
  preview: string | null;
}) {
  return (
    <li className="flex items-center gap-3 border-b border-slate-100 px-4 py-2.5 last:border-0">
      <div className="relative grid size-13 shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-slate-400">
        {preview ? <img src={preview} alt="" className="size-full object-cover" /> : <ImageIcon size={19} />}
        {item.status === "processing" || item.status === "pending" ? (
          <span className="absolute inset-0 grid place-items-center bg-white/70 text-indigo-600">
            <SpinnerIcon size={15} />
          </span>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-slate-800" title={item.name}>
          {item.outputName ?? item.name}
        </p>
        <ItemMeta item={item} />
        {item.error ? <p className="mt-0.5 text-[11px] text-red-500">{item.error}</p> : null}
      </div>
      <span className="shrink-0">
        {item.status === "done" ? (
          <CheckIcon size={17} className="text-emerald-500" />
        ) : item.status === "error" ? (
          <AlertIcon size={17} className="text-red-500" />
        ) : (
          <SpinnerIcon size={15} className="text-indigo-500" />
        )}
      </span>
    </li>
  );
}

/**
 * Home page: drag/drop, batch progress and settings.
 * @param root0 - Component props.
 * @param root0.boot - Page boot data.
 * @returns The rendered React element.
 */
export function HomePage({ boot }: { boot: BootData }) {
  const { locale, t } = useI18n();
  const [settings, setSettings] = useState<Settings>(boot.settings);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [batch, setBatch] = useState<BatchDTO | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [recent, setRecent] = useState<BatchDTO[]>(boot.batches);
  const [stats, setStats] = useState(boot.stats);
  const [dragActive, setDragActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const draftsRef = useRef<Draft[]>([]);
  const uploadQueue = useRef<Draft[]>([]);
  const activeUploads = useRef(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completedBatches = useRef<Set<string>>(new Set());
  const addFilesRef = useRef<(files: File[]) => void>(() => {});
  const batchIdRef = useRef<string | null>(null);


  const commitDrafts = (next: Draft[]) => {
    draftsRef.current = next;
    setDrafts(next);
  };

  const showToast = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4200);
  };

  const patchDraft = (key: string, patch: Partial<Draft>) => {
    commitDrafts(draftsRef.current.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)));
  };

  const uploadOne = (draft: Draft) =>
    new Promise<void>((resolve) => {
      if (!draft.file) {
        resolve();
        return;
      }
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/assets");
      xhr.responseType = "json";
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) patchDraft(draft.key, { progress: event.loaded / event.total });
      });
      xhr.addEventListener("load", () => {
        const payload = xhr.response as { assets?: AssetDTO[]; error?: string } | null;
        if (xhr.status >= 200 && xhr.status < 300 && payload?.assets?.[0]) {
          const asset = payload.assets[0];
          patchDraft(draft.key, { status: "ready", progress: 1, asset, name: asset.name, error: null });
        } else {
          patchDraft(draft.key, {
            status: "error",
            progress: 1,
            error: payload?.error ?? t("home.uploadFailed"),
          });
        }
        resolve();
      });
      xhr.addEventListener("error", () => {
        patchDraft(draft.key, { status: "error", progress: 1, error: t("home.uploadOffline") });
        resolve();
      });
      const form = new FormData();
      form.append("file", draft.file, draft.name);
      xhr.send(form);
    });

  const pumpUploads = () => {
    while (activeUploads.current < MAX_PARALLEL_UPLOADS && uploadQueue.current.length > 0) {
      const next = uploadQueue.current.shift()!;
      activeUploads.current++;
      void uploadOne(next).finally(() => {
        activeUploads.current--;
        pumpUploads();
      });
    }
  };

  const addFiles = (files: File[]) => {
    if (batchIdRef.current) {
      showToast(t("home.batchActive"));
      return;
    }
    if (!files.length) return;

    const remaining = boot.limits.maxFiles - draftsRef.current.length;
    if (remaining <= 0) {
      showToast(t("home.maxFilesReached", { max: boot.limits.maxFiles }));
      return;
    }
    if (files.length > remaining) {
      showToast(t("home.onlyRemaining", { remaining, max: boot.limits.maxFiles }));
    }

    const maxBytes = boot.limits.maxFileMB * 1024 * 1024;
    const maxTotalBytes = boot.limits.maxTotalMB * 1024 * 1024;
    let totalBytes = draftsRef.current.reduce(
      (sum, draft) => sum + (draft.status === "error" ? 0 : draft.size),
      0,
    );
    let acceptedCount = 0;
    let overTotal = 0;
    const newDrafts: Draft[] = [];
    const toUpload: Draft[] = [];

    for (const file of files) {
      if (acceptedCount >= remaining) break;
      const key = crypto.randomUUID();
      const isImage =
        file.type.startsWith("image/") ||
        /\.(?:jpe?g|png|webp|gif|bmp|tiff?|heic|heif|avif)$/iu.test(file.name);
      const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;

      if (!isImage) {
        newDrafts.push({
          key,
          file: null,
          name: file.name,
          size: file.size,
          previewUrl: null,
          status: "error",
          progress: 1,
          asset: null,
          error: t("home.notImage"),
        });
        acceptedCount++;
        continue;
      }
      if (file.size > maxBytes) {
        newDrafts.push({
          key,
          file: null,
          name: file.name,
          size: file.size,
          previewUrl,
          status: "error",
          progress: 1,
          asset: null,
          error: t("home.tooLarge", { max: boot.limits.maxFileMB }),
        });
        acceptedCount++;
        continue;
      }
      if (file.size === 0) {
        newDrafts.push({
          key,
          file: null,
          name: file.name,
          size: 0,
          previewUrl,
          status: "error",
          progress: 1,
          asset: null,
          error: t("home.emptyFile"),
        });
        acceptedCount++;
        continue;
      }
      if (totalBytes + file.size > maxTotalBytes) {
        overTotal++;
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        continue;
      }

      totalBytes += file.size;
      acceptedCount++;
      const draft: Draft = {
        key,
        file,
        name: file.name,
        size: file.size,
        previewUrl,
        status: "uploading",
        progress: 0,
        asset: null,
        error: null,
      };
      newDrafts.push(draft);
      toUpload.push(draft);
    }

    if (overTotal > 0) {
      showToast(
        t("home.totalLimit", {
          size: formatBytes(maxTotalBytes, locale),
          count: overTotal,
        }),
      );
    }

    commitDrafts([...draftsRef.current, ...newDrafts]);
    if (toUpload.length) {
      uploadQueue.current.push(...toUpload);
      pumpUploads();
    }
  };


  useEffect(() => {
    addFilesRef.current = addFiles;
  });

  useEffect(() => {
    batchIdRef.current = batchId;
  }, [batchId]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.items ?? [])
        .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));
      if (files.length) {
        event.preventDefault();
        addFilesRef.current(files);
      }
    };
    const onDragOver = (event: DragEvent) => {
      if (event.dataTransfer?.types?.includes("Files")) {
        event.preventDefault();
        setDragActive(true);
      }
    };
    const onDragLeave = (event: DragEvent) => {
      if (!event.relatedTarget) setDragActive(false);
    };
    const onDrop = (event: DragEvent) => {
      event.preventDefault();
      setDragActive(false);
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length) addFilesRef.current(files);
    };
    document.addEventListener("paste", onPaste);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("paste", onPaste);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      for (const draft of draftsRef.current) {
        if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
      }
    };
  }, []);

  useEffect(() => {
    if (!batchId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const data = await api<{ batch: BatchDTO }>(`/api/batches/${batchId}`, undefined, locale);
        if (cancelled) return;
        setBatch(data.batch);

        if (!ACTIVE_STATUSES.has(data.batch.status)) {
          if (!completedBatches.current.has(batchId)) {
            completedBatches.current.add(batchId);
            if (data.batch.status !== "error") {
              setRecent((prev) => [data.batch, ...prev.filter((item) => item.id !== batchId)].slice(0, 4));
              const doneItems = data.batch.items.filter((item) => item.status === "done");
              setStats((prev) => ({
                batches: prev.batches + 1,
                files: prev.files + doneItems.length,
                savedBytes:
                  prev.savedBytes +
                  doneItems.reduce((sum, item) => sum + Math.max(0, item.inputBytes - (item.outputBytes ?? 0)), 0),
                outputBytes: prev.outputBytes + doneItems.reduce((sum, item) => sum + (item.outputBytes ?? 0), 0),
              }));
            }
          }
          return;
        }
        timer = setTimeout(tick, 650);
      } catch {
        if (!cancelled) timer = setTimeout(tick, 1600);
      }
    };

    timer = setTimeout(tick, 350);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [batchId, locale]);

  const updateSettings = (next: Settings) => {
    setSettings(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api("/api/settings", { method: "POST", body: JSON.stringify(next) }, locale).catch(() => {});
    }, 550);
  };

  const removeDraft = (key: string) => {
    const draft = draftsRef.current.find((item) => item.key === key);
    if (draft?.previewUrl) URL.revokeObjectURL(draft.previewUrl);
    commitDrafts(draftsRef.current.filter((item) => item.key !== key));
  };

  const clearDrafts = () => {
    for (const draft of draftsRef.current) {
      if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
    }
    commitDrafts([]);
  };

  const resetAll = () => {
    clearDrafts();
    setBatch(null);
    setBatchId(null);
    setError(null);
    setStarting(false);
    completedBatches.current = new Set();
  };

  const startBatch = async () => {
    const ready = draftsRef.current.filter((draft) => draft.asset);
    if (ready.length === 0 || starting) return;
    setStarting(true);
    setError(null);
    try {
      const data = await api<{ batch: BatchDTO }>("/api/batches", {
        method: "POST",
        body: JSON.stringify({ assetIds: ready.map((draft) => draft.asset!.id), settings }),
      }, locale);
      setBatch(data.batch);
      setBatchId(data.batch.id);
    } catch (caught) {
      setError(errorMessage(caught, locale));
    } finally {
      setStarting(false);
    }
  };

  const readyDrafts = drafts.filter((draft) => draft.asset);
  const uploading = drafts.some((draft) => draft.status === "uploading");
  const readyBytes = readyDrafts.reduce((sum, draft) => sum + draft.size, 0);
  const failedUploads = drafts.filter((draft) => draft.status === "error").length;
  const assetThumbs = new Map(
    drafts.filter((draft) => draft.asset).map((draft) => [draft.asset!.id, draft.previewUrl ?? draft.asset!.thumbUrl]),
  );

  const currentItems = batch?.items ?? [];
  const finishedItems = currentItems.filter((item) => item.status === "done" || item.status === "error");
  const overallProgress = currentItems.length ? Math.round((finishedItems.length / currentItems.length) * 100) : 0;
  const batchFinished = batch ? !ACTIVE_STATUSES.has(batch.status) : false;
  const doneCount = currentItems.filter((item) => item.status === "done").length;
  const batchPercent = batch ? savedPercent(batch.totalInput, batch.totalOutput) : null;
  const ctaLabel = starting
    ? t("home.creating")
    : uploading
      ? t("home.uploadingCta")
      : readyDrafts.length
        ? t("home.compressCta", { count: readyDrafts.length })
        : t("home.addToStart");

  return (
    <Shell active="home" limits={boot.limits}>
      <section className="grid items-center gap-10 pb-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)] lg:pt-5">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] font-semibold tracking-wide text-indigo-600 uppercase">
            <SparkleIcon size={14} />
            Bun.Image · ZIP · SQLite
          </span>
          <h1 className="mt-4 text-[clamp(2.35rem,5vw,3.6rem)] leading-[1.04] font-bold tracking-[-0.045em] text-slate-900">
            {t("home.heroLine1")}
            <br />
            {t("home.heroLine2")}{" "}
            <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-sky-500 bg-clip-text text-transparent">
              {t("home.heroHighlight")}
            </span>
            .
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-slate-500">
            {t("home.heroBody")}
          </p>
          <div className="mt-6 flex gap-6">
            {[
              [formatNumber(stats.files, locale), t("home.statImages")],
              [formatBytes(stats.savedBytes, locale), t("home.statSaved")],
              [formatNumber(stats.batches, locale), t("home.statBatches")],
            ].map(([value, label]) => (
              <div key={label} className="flex flex-col border-r border-slate-200 pr-6 last:border-0 last:pr-0">
                <span className="text-xl font-bold tracking-tight tabular-nums">{value}</span>
                <span className="text-[11px] text-slate-400">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative hidden rotate-[-1.2deg] rounded-2xl border border-slate-200 bg-gradient-to-br from-indigo-50/80 via-white to-sky-50/60 p-4 shadow-xl shadow-indigo-500/5 lg:block">
          <div className="flex items-center gap-2.5 border-b border-slate-200 pb-3">
            <span className="flex gap-1">
              <i className="size-1.5 rounded-full bg-red-400" />
              <i className="size-1.5 rounded-full bg-amber-400" />
              <i className="size-1.5 rounded-full bg-emerald-400" />
            </span>
            <span className="flex-1 font-mono text-[11px] text-slate-400">batch_2026.zip</span>
            <ZipIcon size={17} className="text-slate-400" />
          </div>
          <div className="pt-4">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
              <span>{t("home.imageCount", { count: 12 })}</span>
              <span className="save-pill">−87%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <span className="block h-full w-[87%] rounded-full bg-gradient-to-r from-indigo-500 to-sky-500" />
            </div>
            <div className="mt-4 flex items-center gap-3 rounded-xl border border-slate-200 bg-white/75 p-3">
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400">{t("home.mockBefore")}</span>
                <strong className="text-[15px] tracking-tight">24.8 MB</strong>
              </div>
              <span className="mx-auto text-xs text-slate-300">→</span>
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400">{t("home.mockAfter")}</span>
                <strong className="text-[15px] tracking-tight text-emerald-600">3.2 MB</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_372px]">
        <div className="flex min-w-0 flex-col gap-5">
          {!batch ? (
            <>
              <section className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
                <input
                  ref={inputRef}
                  type="file"
                  className="sr-only"
                  accept="image/*,.heic,.heif,.tif,.tiff"
                  multiple
                  onChange={(event) => {
                    if (event.target.files) addFiles(Array.from(event.target.files));
                    event.target.value = "";
                  }}
                />
                <button
                  type="button"
                  className="flex w-full cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/80 px-6 py-7 text-center transition hover:border-indigo-400 hover:bg-indigo-50/40 sm:flex-row sm:text-left"
                  aria-label={t("home.chooseAria")}
                  onClick={() => inputRef.current?.click()}
                >
                  <span className="grid size-14 shrink-0 place-items-center rounded-2xl border border-indigo-200 bg-indigo-50 text-indigo-600 shadow-lg shadow-indigo-500/10">
                    <UploadIcon size={25} />
                  </span>
                  <span className="block min-w-0 flex-1">
                    <span className="block text-lg font-semibold tracking-tight">{t("home.dropTitle")}</span>
                    <span className="mt-0.5 block text-[13px] text-slate-400">
                      {t("home.dropOr")}{" "}
                      <span className="font-semibold text-indigo-600">{t("home.chooseFromDevice")}</span> ·{" "}
                      {t("home.pasteWith")}{" "}
                      <kbd className="rounded border border-slate-300 px-1 text-[10px]">Ctrl</kbd> +{" "}
                      <kbd className="rounded border border-slate-300 px-1 text-[10px]">V</kbd>
                    </span>
                    <span className="mt-2 flex flex-wrap justify-center gap-1 sm:justify-start">
                      {["JPEG", "PNG", "WebP", "GIF", "BMP", "TIFF"].map((format) => (
                        <span
                          key={format}
                          className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-slate-400"
                        >
                          {format}
                        </span>
                      ))}
                    </span>
                    <span className="mt-2 block text-[11.5px] text-slate-400">
                      {t("home.limits", {
                        maxFiles: boot.limits.maxFiles,
                        maxFileMB: boot.limits.maxFileMB,
                        total: formatBytes(boot.limits.maxTotalMB * 1024 * 1024, locale),
                        maxPixels: boot.limits.maxPixelsMP,
                      })}
                    </span>
                  </span>
                </button>
              </section>

              {error ? (
                <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-[13px] text-red-600" role="alert">
                  <AlertIcon size={17} className="mt-0.5 shrink-0" />
                  <span className="flex-1">{error}</span>
                  <button type="button" onClick={() => setError(null)} aria-label={t("common.close")}>
                    <XIcon size={15} />
                  </button>
                </div>
              ) : null}

              {drafts.length > 0 ? (
                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-end justify-between gap-4 px-5 pt-4 pb-3">
                    <div>
                      <h2 className="text-[15px] font-semibold tracking-tight">{t("home.selectedTitle")}</h2>
                      <p className="mt-0.5 text-[11.5px] text-slate-400">
                        {t("home.selectedReady", { count: readyDrafts.length })}
                        {uploading ? ` · ${t("home.selectedUploading")}` : ""}
                        {failedUploads ? ` · ${t("home.selectedFailed", { count: failedUploads })}` : ""}
                      </p>
                    </div>
                    <button type="button" className="btn-ghost px-2.5 py-1.5 text-[12px]" onClick={clearDrafts}>
                      <TrashIcon size={14} /> {t("home.removeAll")}
                    </button>
                  </div>
                  <ul className="max-h-[510px] overflow-y-auto border-t border-slate-100">
                    {drafts.map((draft) => (
                      <DraftRow key={draft.key} draft={draft} onRemove={() => removeDraft(draft.key)} />
                    ))}
                  </ul>
                </section>
              ) : (
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                    <span className="grid size-9 place-items-center rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-600">
                      <SparkleIcon size={18} />
                    </span>
                    <div>
                      <h2 className="text-sm font-semibold tracking-tight">{t("home.stepsTitle")}</h2>
                      <p className="text-[11.5px] text-slate-400">{t("home.stepsSubtitle")}</p>
                    </div>
                  </div>
                  <ol className="mt-4 grid gap-4 sm:grid-cols-3">
                    {[
                      [
                        t("home.step1Title"),
                        t("home.step1Body", { max: boot.limits.maxFiles }),
                      ],
                      [t("home.step2Title"), t("home.step2Body")],
                      [
                        t("home.step3Title"),
                        t("home.step3Body", { days: boot.limits.retentionDays }),
                      ],
                    ].map(([title, description], index) => (
                      <li key={title} className="flex items-start gap-2.5">
                        <span className="grid size-6 shrink-0 place-items-center rounded-full border border-slate-200 bg-slate-50 text-[10px] font-bold text-indigo-600">
                          {index + 1}
                        </span>
                        <div>
                          <strong className="block text-xs font-semibold">{title}</strong>
                          <p className="mt-0.5 text-[11px] leading-snug text-slate-400">{description}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </>
          ) : (
            <>
              {batchFinished ? (
                <section
                  className={`grid gap-4 rounded-2xl border p-5 sm:grid-cols-[auto_minmax(0,1fr)] ${
                    batch.status === "error"
                      ? "border-red-200 bg-gradient-to-br from-red-50 to-white"
                      : batch.status === "partial"
                        ? "border-amber-200 bg-gradient-to-br from-amber-50 to-white"
                        : "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white"
                  }`}
                >
                  <span
                    className={`grid size-11 place-items-center rounded-full border bg-white ${
                      batch.status === "error"
                        ? "border-red-300 text-red-600"
                        : "border-emerald-300 text-emerald-600"
                    }`}
                  >
                    {batch.status === "error" ? <AlertIcon size={22} /> : <CheckIcon size={22} />}
                  </span>
                  <div>
                    <h2 className="text-[17px] font-semibold tracking-tight">
                      {batch.status === "error"
                        ? t("home.batchErrorTitle")
                        : batch.status === "partial"
                          ? t("home.batchPartialTitle")
                          : t("home.batchDoneTitle")}
                    </h2>
                    {batch.status === "error" ? (
                      <p className="mt-1 text-[13px] text-slate-500">
                        {batch.error ?? t("home.batchErrorHint")}
                      </p>
                    ) : (
                      <p className="mt-1 text-[13px] tabular-nums text-slate-500">
                        {t("home.batchResult", {
                          count: doneCount,
                          input: formatBytes(batch.totalInput, locale),
                          output: formatBytes(batch.totalOutput, locale),
                        })}
                        {batchPercent !== null ? (
                          <span className="font-medium text-emerald-600">
                            {" "}· {t("home.smaller", { percent: batchPercent })}
                          </span>
                        ) : null}
                        {batch.error ? ` · ${batch.error}` : ""}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {batch.zipUrl ? (
                        <a className="btn-primary px-3.5 py-2 text-[13px]" href={batch.zipUrl} download>
                          <DownloadIcon size={16} />
                          {t("home.downloadZip", { size: formatBytes(batch.zipBytes, locale) })}
                        </a>
                      ) : null}
                      <button type="button" className="btn-ghost px-3.5 py-2 text-[13px]" onClick={resetAll}>
                        <RefreshIcon size={15} />
                        {t("home.newBatch")}
                      </button>
                    </div>
                  </div>
                </section>
              ) : (
                <section className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-5" aria-live="polite">
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-full border border-indigo-200 bg-white text-indigo-600">
                      <SpinnerIcon size={20} />
                    </span>
                    <div>
                      <h2 className="text-[15px] font-semibold tracking-tight">
                        {t("home.compressingProgress", { done: doneCount, total: currentItems.length })}
                      </h2>
                      <p className="text-[11.5px] text-slate-400">
                        {settingsSummary(settings, locale)}
                      </p>
                    </div>
                    <strong className="ml-auto text-xl font-bold tabular-nums text-indigo-600">{overallProgress}%</strong>
                  </div>
                  <div className="mt-3.5 h-1.5 overflow-hidden rounded-full bg-indigo-100">
                    <span
                      className="block h-full rounded-full bg-gradient-to-r from-indigo-500 to-sky-500 transition-all duration-500"
                      style={{ width: `${Math.max(3, overallProgress)}%` }}
                    />
                  </div>
                  <p className="mt-2 text-[10.5px] text-slate-400">
                    {t("home.privacyNote")}
                  </p>
                </section>
              )}

              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-end justify-between gap-4 px-5 pt-4 pb-3">
                  <div>
                    <h2 className="text-[15px] font-semibold tracking-tight">{t("home.itemsTitle")}</h2>
                    <p className="mt-0.5 text-[11.5px] text-slate-400">
                      {t("home.itemsSummary", {
                        count: currentItems.length,
                        summary: settingsSummary(settings, locale),
                      })}
                    </p>
                  </div>
                  {batch.status === "partial" ? (
                    <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-600">
                      {batch.error}
                    </span>
                  ) : null}
                </div>
                <ul className="max-h-[510px] overflow-y-auto border-t border-slate-100">
                  {currentItems.map((item) => (
                    <BatchItemRow
                      key={item.id}
                      item={item}
                      preview={
                        item.thumbUrl ??
                        (item.assetId ? (assetThumbs.get(item.assetId) ?? null) : null)
                      }
                    />
                  ))}
                </ul>
              </section>
            </>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <SettingsPanel
            settings={settings}
            onChange={updateSettings}
            capabilities={boot.capabilities}
            disabled={starting || (batch ? ACTIVE_STATUSES.has(batch.status) : false)}
          />

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            {!batch ? (
              <>
                <div className="flex items-end justify-between gap-3">
                  <div className="flex flex-col">
                    <span className="text-[10.5px] text-slate-400">{t("home.selectedLabel")}</span>
                    <strong className="flex items-center gap-1.5 text-[15px] font-bold tracking-tight tabular-nums">
                      {t("home.imageCount", { count: readyDrafts.length })}
                      {uploading ? <SpinnerIcon size={13} /> : null}
                    </strong>
                  </div>
                  <div className="flex flex-col text-right">
                    <span className="text-[10.5px] text-slate-400">{t("home.totalLabel")}</span>
                    <strong className="text-[15px] font-bold tracking-tight tabular-nums">
                      {formatBytes(readyBytes, locale)}
                    </strong>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-primary mt-3 w-full py-3.5 text-[15px]"
                  disabled={readyDrafts.length === 0 || uploading || starting}
                  onClick={startBatch}
                >
                  {starting ? <SpinnerIcon size={18} /> : <ZipIcon size={19} />}
                  {ctaLabel}
                </button>
                <p className="mt-2.5 text-center text-[10.5px] leading-snug text-slate-400">
                  {t("home.originalCleanup", { days: boot.limits.retentionDays })}
                </p>
              </>
            ) : (
              <>
                <div className="flex items-end justify-between gap-3">
                  <div className="flex flex-col">
                    <span className="text-[10.5px] text-slate-400">{t("home.currentBatch")}</span>
                    <strong className="text-[15px] font-bold tracking-tight tabular-nums">
                      {t("home.imageCount", { count: currentItems.length })}
                    </strong>
                  </div>
                  <div className="flex flex-col text-right">
                    <span className="text-[10.5px] text-slate-400">
                      {batchFinished ? t("home.savedLabel") : t("home.progressLabel")}
                    </span>
                    <strong className="text-[15px] font-bold tracking-tight tabular-nums">
                      {batchFinished ? (batchPercent !== null ? `${batchPercent}%` : "—") : `${overallProgress}%`}
                    </strong>
                  </div>
                </div>
                {batchFinished && batch.zipUrl ? (
                  <a className="btn-primary mt-3 w-full py-3.5 text-[15px]" href={batch.zipUrl} download>
                    <DownloadIcon size={18} />
                    {t("home.downloadZip", { size: formatBytes(batch.zipBytes, locale) })}
                  </a>
                ) : (
                  <button type="button" className="btn-primary mt-3 w-full py-3.5 text-[15px]" disabled>
                    <SpinnerIcon size={18} />
                    {batchFinished ? t("home.noZip") : t("home.compressing")}
                  </button>
                )}
                <button type="button" className="btn-ghost mt-2 w-full" onClick={resetAll}>
                  <RefreshIcon size={16} />
                  {t("home.newBatch")}
                </button>
                <p className="mt-2.5 text-center text-[10.5px] leading-snug text-slate-400">
                  {batchFinished && batch.zipUrl ? t("home.zipContains") : t("home.leavePage")}
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {recent.length > 0 ? (
        <section className="mt-10">
          <div className="mb-3 flex items-end justify-between gap-4 px-0.5">
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight">{t("home.recentTitle")}</h2>
              <p className="mt-0.5 text-[11.5px] text-slate-400">{t("home.recentSubtitle")}</p>
            </div>
            <a className="text-[13px] font-semibold text-indigo-600 hover:underline" href="/history">
              {t("home.viewAll")}
            </a>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            {recent.slice(0, 4).map((item) => {
              const percent = savedPercent(item.totalInput, item.totalOutput);
              return (
                <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm transition hover:border-slate-300">
                  <div className="flex items-center justify-between gap-2">
                    <BatchStatusBadge batch={item} />
                    <span className="text-[10.5px] text-slate-400">{formatDate(item.createdAt, locale)}</span>
                  </div>
                  <h3 className="mt-2 text-sm font-semibold">{t("home.imageCount", { count: item.fileCount })}</h3>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[11.5px] tabular-nums text-slate-400">
                    {formatBytes(item.totalInput, locale)} <span>→</span>
                    {item.totalOutput !== null ? formatBytes(item.totalOutput, locale) : "…"}
                    {percent !== null ? <em className="font-bold not-italic text-emerald-600">−{percent}%</em> : null}
                  </p>
                  <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2">
                    <a className="text-[12.5px] font-semibold text-indigo-600 hover:underline" href={`/history/${item.id}`}>
                      {t("common.details")}
                    </a>
                    {item.zipUrl ? (
                      <a className="grid size-7 place-items-center rounded-md border border-slate-200 text-slate-400 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600" href={item.zipUrl} download aria-label={t("home.downloadAria")}>
                        <DownloadIcon size={15} />
                      </a>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {dragActive ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#f6f7fb]/60 p-6 backdrop-blur-sm" aria-hidden>
          <div className="flex w-full max-w-2xl flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-indigo-500 bg-white/90 px-8 py-14 text-indigo-600 shadow-2xl">
            <UploadIcon size={30} />
            <span className="text-lg font-semibold">{t("home.dropOverlay")}</span>
          </div>
        </div>
      ) : null}

      {toast ? (
        <output className="fixed bottom-5 left-1/2 z-50 flex max-w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-[12.5px] font-medium shadow-xl" aria-live="polite">
          <AlertIcon size={16} className="shrink-0 text-amber-500" />
          {toast}
        </output>
      ) : null}
    </Shell>
  );
}
