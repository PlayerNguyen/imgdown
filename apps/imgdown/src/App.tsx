import type { BootData } from "@imgdown/shared";
import { HomePage } from "./pages/HomePage";
import { HistoryPage } from "./pages/HistoryPage";
import { BatchDetailPage } from "./pages/BatchDetailPage";
import { I18nProvider } from "./lib/i18n";

/**
 * Selects the SSR page component matching the boot payload.
 * @param root0 - Component props.
 * @param root0.boot - Page boot data.
 * @returns The rendered React element.
 */
export function App({ boot }: { boot: BootData }) {
  return (
    <I18nProvider initialLocale={boot.locale} page={boot.page}>
      {boot.page === "history" ? (
        <HistoryPage boot={boot} />
      ) : boot.page === "batch" && boot.batch ? (
        <BatchDetailPage boot={boot} />
      ) : (
        <HomePage boot={boot} />
      )}
    </I18nProvider>
  );
}
