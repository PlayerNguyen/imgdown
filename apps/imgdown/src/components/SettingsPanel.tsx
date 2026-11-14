import type { CSSProperties } from "react";
import type { Capabilities, OutputFormat, Settings } from "@imgdown/shared";
import { formatHint, formatName } from "@imgdown/shared";
import { CheckIcon, SlidersIcon } from "./Icons";
import { useI18n } from "../lib/i18n";

const FORMATS: OutputFormat[] = ["auto", "webp", "jpeg", "png", "original", "avif", "heic"];
const QUALITY_PRESETS = [90, 80, 65, 50];

function num(value: string): number {
  const parsed = Math.trunc(Number(value.replaceAll(/\D/gu, "")));
  return Number.isFinite(parsed) ? Math.min(12000, Math.max(0, parsed)) : 0;
}

/**
 * Output settings card with format, quality, resize, EXIF and filename controls.
 * @param root0 - Component props.
 * @param root0.settings - Compression settings.
 * @param root0.onChange - Settings change callback.
 * @param root0.capabilities - Encoder capabilities for this host.
 * @param root0.disabled - Whether controls are disabled.
 * @returns The rendered React element.
 */
export function SettingsPanel({
  settings,
  onChange,
  capabilities,
  disabled,
}: {
  settings: Settings;
  onChange: (settings: Settings) => void;
  capabilities: Capabilities;
  disabled: boolean;
}) {
  const { locale, t } = useI18n();
  const update = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });
  const png = settings.format === "png";
  const qualityDisabled = disabled || (png && !settings.pngPalette);
  const unavailable = (format: OutputFormat) =>
    (format === "avif" && !capabilities.avif) || (format === "heic" && !capabilities.heic);
  const colors = Math.max(8, Math.min(256, Math.round(16 + (settings.quality / 100) * 240)));

  return (
    <aside className="card p-4" aria-label={t("settings.title")}>
      <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3.5">
        <span className="grid size-9 place-items-center rounded-xl border border-slate-200 bg-slate-50 text-indigo-600">
          <SlidersIcon size={18} />
        </span>
        <div>
          <h2 className="text-sm font-semibold tracking-tight">{t("settings.title")}</h2>
          <p className="text-[11px] text-slate-400">{t("settings.subtitle")}</p>
        </div>
      </div>

      <fieldset className="min-w-0 pt-4 disabled:opacity-60" disabled={disabled}>
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="field-label">{t("settings.format")}</span>
            <span className="field-value">{formatName(locale, settings.format)}</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5" aria-label={t("settings.formatAria")}>
            {FORMATS.map((format) => {
              const blocked = unavailable(format);
              return (
                <button
                  key={format}
                  type="button"
                  aria-pressed={settings.format === format}
                  disabled={blocked}
                  title={blocked ? t("settings.unsupportedTitle") : formatHint(locale, format)}
                  onClick={() => update({ format })}
                  className={`format-btn ${settings.format === format ? "format-btn-active" : ""}`}
                >
                  <span className="format-name">{formatName(locale, format)}</span>
                  <span className="format-hint">
                    {blocked ? t("settings.unsupported") : formatHint(locale, format)}
                  </span>
                </button>
              );
            })}
          </div>
          {capabilities.note ? (
            <p className="mt-2 text-[10.5px] leading-relaxed text-slate-400">
              {t("settings.capabilityNote")}
            </p>
          ) : null}
        </div>

        <div className="mt-4 border-t border-slate-100 pt-4">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <label htmlFor="quality" className="field-label">
              {png ? t("settings.palette") : t("settings.quality")}
            </label>
            <output htmlFor="quality" className="text-xs font-bold tabular-nums text-indigo-600">
              {png ? t("settings.colors", { count: colors }) : `${settings.quality}%`}
            </output>
          </div>
          <input
            id="quality"
            type="range"
            min={1}
            max={100}
            value={settings.quality}
            disabled={qualityDisabled}
            onChange={(event) => update({ quality: Number(event.target.value) })}
            className="range"
            style={{ "--range-progress": `${settings.quality}%` } as CSSProperties}
          />
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {QUALITY_PRESETS.map((value) => (
              <button
                key={value}
                type="button"
                disabled={qualityDisabled}
                onClick={() => update({ quality: value })}
                className={`chip ${settings.quality === value ? "chip-active" : ""}`}
              >
                {value}
              </button>
            ))}
            <span className="ml-auto text-[10px] text-slate-400">
              {qualityDisabled ? t("settings.paletteEnable") : t("settings.qualityHint")}
            </span>
          </div>
        </div>

        <details className="mt-4 border-t border-slate-100 pt-3.5" open={settings.maxWidth > 0 || settings.maxHeight > 0}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
            <span className="field-label">{t("settings.maxSize")}</span>
            <span className="field-value flex items-center gap-1.5">
              {settings.maxWidth || settings.maxHeight
                ? `${settings.maxWidth || "∞"} × ${settings.maxHeight || "∞"} px`
                : t("settings.keepOriginal")}
              <span className="text-[10px]">▾</span>
            </span>
          </summary>
          <div className="pt-3">
            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
              <label className="flex flex-col gap-1 text-[10.5px] text-slate-400">
                {t("settings.width")}
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={12000}
                  step={10}
                  className="input"
                  value={settings.maxWidth || ""}
                  placeholder="0"
                  onChange={(event) => update({ maxWidth: num(event.target.value) })}
                />
              </label>
              <span className="pb-2 text-xs text-slate-400">×</span>
              <label className="flex flex-col gap-1 text-[10.5px] text-slate-400">
                {t("settings.height")}
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={12000}
                  step={10}
                  className="input"
                  value={settings.maxHeight || ""}
                  placeholder="0"
                  onChange={(event) => update({ maxHeight: num(event.target.value) })}
                />
              </label>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button type="button" className="chip" onClick={() => update({ maxWidth: 0, maxHeight: 0 })}>
                {t("common.original")}
              </button>
              {[2560, 1920, 1280, 800].map((edge) => (
                <button
                  key={edge}
                  type="button"
                  className={`chip ${settings.maxWidth === edge && settings.maxHeight === edge ? "chip-active" : ""}`}
                  onClick={() => update({ maxWidth: edge, maxHeight: edge })}
                >
                  {edge}px
                </button>
              ))}
            </div>
            <p className="mt-2 text-[10.5px] leading-relaxed text-slate-400">
              {t("settings.maxSizeHint")}
            </p>
          </div>
        </details>

        <details className="mt-4 border-t border-slate-100 pt-3.5" open={settings.targetKB !== null}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
            <span className="field-label">{t("settings.target")}</span>
            <span className="field-value flex items-center gap-1.5">
              {settings.targetKB ? `${settings.targetKB} KB` : t("common.unlimited")}
              <span className="text-[10px]">▾</span>
            </span>
          </summary>
          <div className="pt-3">
            <div className="relative">
              <input
                id="target"
                type="number"
                inputMode="numeric"
                min={5}
                max={50000}
                className="input pr-16"
                placeholder={t("common.unlimited")}
                aria-label={t("settings.targetAria")}
                value={settings.targetKB ?? ""}
                onChange={(event) =>
                  update({ targetKB: event.target.value === "" ? null : Math.max(5, num(event.target.value)) })
                }
              />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[10.5px] text-slate-400">
                {t("settings.perImage")}
              </span>
            </div>
            <p className="mt-2 text-[10.5px] leading-relaxed text-slate-400">
              {t("settings.targetHint")}
            </p>
          </div>
        </details>

        <div className="mt-4 border-t border-slate-100 pt-4">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="field-label">{t("settings.metadata")}</span>
            <span className="field-value">
              {settings.keepMetadata
                ? settings.keepLocation
                  ? t("summary.exifLocation")
                  : t("summary.exif")
                : t("settings.metadataRemoved")}
            </span>
          </div>
          <label className="check-row">
            <span>
              {t("settings.keepExif")}
              <small>{t("settings.keepExifHint")}</small>
            </span>
            <input
              type="checkbox"
              checked={settings.keepMetadata}
              onChange={(event) =>
                update({
                  keepMetadata: event.target.checked,
                  keepLocation: event.target.checked ? settings.keepLocation : false,
                })
              }
            />
          </label>
          <label className={`check-row mt-3 ${settings.keepMetadata ? "" : "check-disabled"}`}>
            <span>
              {t("settings.keepGps")}
              <small>{t("settings.keepGpsHint")}</small>
            </span>
            <input
              type="checkbox"
              checked={settings.keepLocation}
              disabled={!settings.keepMetadata}
              onChange={(event) => update({ keepLocation: event.target.checked })}
            />
          </label>
          <p className="mt-2 text-[10.5px] leading-relaxed text-slate-400">
            {t("settings.metadataHint")}
          </p>
        </div>

        <details className="mt-4 border-t border-slate-100 pt-3.5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-600">{t("settings.advanced")}</span>
            <span className="text-[10px] text-slate-400">＋</span>
          </summary>
          <div className="flex flex-col gap-3 pt-3">
            <label className="check-row">
              <span>
                {t("settings.pngPalette")}
                <small>{t("settings.pngPaletteHint")}</small>
              </span>
              <input
                type="checkbox"
                checked={settings.pngPalette}
                onChange={(event) => update({ pngPalette: event.target.checked })}
              />
            </label>
            <label className="check-row">
              <span>
                {t("settings.progressive")}
                <small>{t("settings.progressiveHint")}</small>
              </span>
              <input
                type="checkbox"
                checked={settings.progressive}
                onChange={(event) => update({ progressive: event.target.checked })}
              />
            </label>
            <label className="flex flex-col gap-1 text-[11.5px] text-slate-600">
              {t("settings.suffix")}
              <input
                type="text"
                className="input"
                value={settings.suffix}
                placeholder="-min"
                maxLength={24}
                onChange={(event) => update({ suffix: event.target.value })}
              />
            </label>
          </div>
        </details>
      </fieldset>

      <p className="mt-4 flex items-center gap-1 border-t border-slate-100 pt-3 text-[10.5px] text-slate-400">
        <CheckIcon size={13} className="text-emerald-500" /> {t("settings.autosave")}
      </p>
    </aside>
  );
}
