import type { CSSProperties } from "react";
import type { Capabilities, OutputFormat, Settings } from "@imgdown/shared";
import { FORMAT_HINTS, FORMAT_NAMES } from "@imgdown/shared";
import { CheckIcon, SlidersIcon } from "./Icons";

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
  const update = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });
  const png = settings.format === "png";
  const qualityDisabled = disabled || (png && !settings.pngPalette);
  const unavailable = (format: OutputFormat) =>
    (format === "avif" && !capabilities.avif) || (format === "heic" && !capabilities.heic);

  return (
    <aside className="card p-4" aria-label="Cài đặt đầu ra">
      <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3.5">
        <span className="grid size-9 place-items-center rounded-xl border border-slate-200 bg-slate-50 text-indigo-600">
          <SlidersIcon size={18} />
        </span>
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Cài đặt đầu ra</h2>
          <p className="text-[11px] text-slate-400">Áp dụng cho cả lô ảnh</p>
        </div>
      </div>

      <fieldset className="min-w-0 pt-4 disabled:opacity-60" disabled={disabled}>
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="field-label">Định dạng</span>
            <span className="field-value">{FORMAT_NAMES[settings.format]}</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5" aria-label="Định dạng đầu ra">
            {FORMATS.map((format) => {
              const blocked = unavailable(format);
              return (
                <button
                  key={format}
                  type="button"
                  aria-pressed={settings.format === format}
                  disabled={blocked}
                  title={blocked ? "Không được hỗ trợ trên máy chủ này" : FORMAT_HINTS[format]}
                  onClick={() => update({ format })}
                  className={`format-btn ${settings.format === format ? "format-btn-active" : ""}`}
                >
                  <span className="format-name">{FORMAT_NAMES[format]}</span>
                  <span className="format-hint">{blocked ? "Không hỗ trợ" : FORMAT_HINTS[format]}</span>
                </button>
              );
            })}
          </div>
          {capabilities.note ? <p className="mt-2 text-[10.5px] leading-relaxed text-slate-400">{capabilities.note}</p> : null}
        </div>

        <div className="mt-4 border-t border-slate-100 pt-4">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <label htmlFor="quality" className="field-label">
              {png ? "Số màu (palette)" : "Chất lượng"}
            </label>
            <output htmlFor="quality" className="text-xs font-bold tabular-nums text-indigo-600">
              {png
                ? `${Math.max(8, Math.min(256, Math.round(16 + (settings.quality / 100) * 240)))} màu`
                : `${settings.quality}%`}
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
              {qualityDisabled ? "Bật palette để chỉnh" : "Cao hơn = nét hơn"}
            </span>
          </div>
        </div>

        <details className="mt-4 border-t border-slate-100 pt-3.5" open={settings.maxWidth > 0 || settings.maxHeight > 0}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
            <span className="field-label">Kích thước tối đa</span>
            <span className="field-value flex items-center gap-1.5">
              {settings.maxWidth || settings.maxHeight
                ? `${settings.maxWidth || "∞"} × ${settings.maxHeight || "∞"} px`
                : "Giữ nguyên"}
              <span className="text-[10px]">▾</span>
            </span>
          </summary>
          <div className="pt-3">
            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
              <label className="flex flex-col gap-1 text-[10.5px] text-slate-400">
                Rộng
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
                Cao
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
                Gốc
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
              Ảnh nhỏ hơn sẽ không bị phóng to. Đặt 0 để bỏ giới hạn.
            </p>
          </div>
        </details>

        <details className="mt-4 border-t border-slate-100 pt-3.5" open={settings.targetKB !== null}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
            <span className="field-label">Dung lượng mục tiêu</span>
            <span className="field-value flex items-center gap-1.5">
              {settings.targetKB ? `${settings.targetKB} KB` : "Không giới hạn"}
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
                placeholder="Không giới hạn"
                aria-label="Dung lượng mục tiêu mỗi ảnh (KB)"
                value={settings.targetKB ?? ""}
                onChange={(event) =>
                  update({ targetKB: event.target.value === "" ? null : Math.max(5, num(event.target.value)) })
                }
              />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[10.5px] text-slate-400">
                KB / ảnh
              </span>
            </div>
            <p className="mt-2 text-[10.5px] leading-relaxed text-slate-400">
              Tự tìm chất lượng thấp nhất đạt mục tiêu, không vượt mức chất lượng đã chọn.
            </p>
          </div>
        </details>

        <div className="mt-4 border-t border-slate-100 pt-4">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="field-label">Siêu dữ liệu</span>
            <span className="field-value">
              {settings.keepMetadata ? (settings.keepLocation ? "EXIF + GPS" : "EXIF") : "Đã xoá"}
            </span>
          </div>
          <label className="check-row">
            <span>
              Giữ EXIF máy ảnh &amp; ống kính
              <small>Khẩu độ, tiêu cự, ISO, ngày chụp… chỉ thêm vài KB.</small>
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
              Giữ vị trí GPS
              <small>Tắt để không chia sẻ nơi chụp. Chỉ dùng khi bật EXIF.</small>
            </span>
            <input
              type="checkbox"
              checked={settings.keepLocation}
              disabled={!settings.keepMetadata}
              onChange={(event) => update({ keepLocation: event.target.checked })}
            />
          </label>
          <p className="mt-2 text-[10.5px] leading-relaxed text-slate-400">
            Hỗ trợ JPEG, WebP, PNG. AVIF/HEIC chưa nhúng lại được EXIF.
          </p>
        </div>

        <details className="mt-4 border-t border-slate-100 pt-3.5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-600">Nâng cao</span>
            <span className="text-[10px] text-slate-400">＋</span>
          </summary>
          <div className="flex flex-col gap-3 pt-3">
            <label className="check-row">
              <span>
                PNG palette
                <small>Giảm mạnh dung lượng ảnh đồ hoạ, icon, ảnh chụp màn hình.</small>
              </span>
              <input
                type="checkbox"
                checked={settings.pngPalette}
                onChange={(event) => update({ pngPalette: event.target.checked })}
              />
            </label>
            <label className="check-row">
              <span>
                JPEG progressive
                <small>Hiển thị dần khi tải, thường nhẹ hơn một chút.</small>
              </span>
              <input
                type="checkbox"
                checked={settings.progressive}
                onChange={(event) => update({ progressive: event.target.checked })}
              />
            </label>
            <label className="flex flex-col gap-1 text-[11.5px] text-slate-600">
              Hậu tố tên tệp
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
        <CheckIcon size={13} className="text-emerald-500" /> Cài đặt được lưu tự động vào SQLite
      </p>
    </aside>
  );
}
