import type { Locale } from "@imgdown/shared";
import { LOCALES, LOCALE_LABELS } from "../lib/messages";
import { LanguageIcon } from "./Icons";
import { useI18n } from "../lib/i18n";

/**
 * Compact selector that persists the visitor's locale in a cookie.
 * @returns The rendered language picker.
 */
export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();

  return (
    <label className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-2.5 py-1.5 text-slate-500 transition hover:border-slate-300">
      <LanguageIcon size={15} aria-hidden />
      <span className="sr-only">{t("shell.languageAria")}</span>
      <select
        value={locale}
        aria-label={t("shell.languageAria")}
        onChange={(event) => setLocale(event.target.value as Locale)}
        className="cursor-pointer appearance-none bg-transparent text-[12px] font-semibold text-slate-600 outline-none"
      >
        {LOCALES.map((code) => (
          <option key={code} value={code}>
            {LOCALE_LABELS[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
