import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import {
  LOCALE_COOKIE,
  translate,
  type Locale,
  type MessageKey,
  type MessageVars,
  type Page,
} from "@imgdown/shared";

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, vars?: MessageVars) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

/**
 * Provides the active locale and a translation helper to the React tree.
 * @param root0 - Component props.
 * @param root0.initialLocale - Locale resolved on the server.
 * @param root0.page - Current page, used to refresh metadata on change.
 * @param root0.children - Child content.
 * @returns The rendered provider.
 */
export function I18nProvider({
  initialLocale,
  page,
  children,
}: {
  initialLocale: Locale;
  page: Page;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const value = useMemo<I18nContextValue>(() => {
    const setLocale = (next: Locale) => {
      setLocaleState(next);
      if (typeof document === "undefined") return;
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      document.documentElement.lang = next;
      document.title = translate(next, `meta.${page}.title`);
      document
        .querySelector('meta[name="description"]')
        ?.setAttribute("content", translate(next, `meta.${page}.description`));
    };

    return {
      locale,
      setLocale,
      t: (key: MessageKey, vars?: MessageVars) => translate(locale, key, vars),
    };
  }, [locale, page]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Reads the active locale and translation helper from context.
 * @returns The i18n context value.
 */
export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}
