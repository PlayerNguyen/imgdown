import type { BootData } from "@imgdown/shared";
import { HomePage } from "./pages/HomePage";
import { HistoryPage } from "./pages/HistoryPage";
import { BatchDetailPage } from "./pages/BatchDetailPage";

/**
 * Selects the SSR page component matching the boot payload.
 * @param root0 - Component props.
 * @param root0.boot - Page boot data.
 * @returns The rendered React element.
 */
export function App({ boot }: { boot: BootData }) {
  if (boot.page === "history") return <HistoryPage boot={boot} />;
  if (boot.page === "batch" && boot.batch) return <BatchDetailPage boot={boot} />;
  return <HomePage boot={boot} />;
}
