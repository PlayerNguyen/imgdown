import type { ReactNode } from "react";
import type { Limits, Page } from "@imgdown/shared";
import { HistoryIcon, LogoMark, ZapIcon } from "./Icons";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useI18n } from "../lib/i18n";

/**
 * Shared header, page container and footer for every SSR page.
 * @param root0 - Component props.
 * @param root0.active - Currently active page.
 * @param root0.limits - Configured runtime limits.
 * @param root0.children - Child content.
 * @returns The rendered React element.
 */
export function Shell({
  active,
  limits,
  children,
}: {
  active: Page;
  limits: Limits;
  children: ReactNode;
}) {
  const { t } = useI18n();

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-[#edf1f8]/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1180px] items-center gap-4 px-5">
          <a className="mr-auto flex items-center gap-2.5" href="/" aria-label={t("shell.homeAria")}>
            <LogoMark size={34} />
            <span className="flex flex-col leading-tight">
              <span className="text-lg font-semibold tracking-tight">
                img<strong className="bg-gradient-to-r from-indigo-600 to-sky-500 bg-clip-text font-extrabold text-transparent">down</strong>
              </span>
              <span className="hidden text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400 sm:block">
                {t("shell.tagline")}
              </span>
            </span>
          </a>

          <nav className="flex items-center gap-1 rounded-full border border-slate-200 bg-white/80 p-1" aria-label={t("shell.navAria")}>
            <a
              href="/"
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
                active === "home"
                  ? "bg-indigo-50 text-indigo-600"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <ZapIcon size={16} />
              {t("shell.navCompress")}
            </a>
            <a
              href="/history"
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
                active === "history" || active === "batch"
                  ? "bg-indigo-50 text-indigo-600"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <HistoryIcon size={16} />
              {t("shell.navHistory")}
            </a>
          </nav>

          <LanguageSwitcher />

          <div className="hidden items-center gap-2 text-[11px] font-medium text-slate-400 xl:flex">
            <span className="size-1.5 rounded-full bg-emerald-500 ring-4 ring-emerald-500/15" />
            Bun.Image · SQLite
          </div>
        </div>
      </header>

      <main className="mx-auto min-h-[calc(100vh-13rem)] w-full max-w-[1180px] px-5 py-7">{children}</main>

      <footer className="border-t border-slate-200 bg-white/50">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-3 px-5 py-5 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <p>
            {t("shell.footer", { days: limits.retentionDays })}
          </p>
          <p className="flex flex-wrap gap-1.5">
            {["WebP", "JPEG", "PNG", "AVIF", "HEIC"].map((format) => (
              <span
                key={format}
                className="rounded border border-slate-200 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-slate-400"
              >
                {format}
              </span>
            ))}
          </p>
        </div>
      </footer>
    </>
  );
}
