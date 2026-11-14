import { renderToString } from "react-dom/server";
import { App } from "../src/App";
import { translate, type BootData, type Locale } from "@imgdown/shared";

function safeJson(data: unknown): string {
  return JSON.stringify(data)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

/**
 * Renders the full document with React SSR and serialized boot data.
 * @param boot - Page boot data.
 * @param version - Asset version used for cache busting.
 * @returns The complete HTML document.
 */
export function renderDocument(boot: BootData, version: string): string {
  const html = renderToString(<App boot={boot} />);
  const title = translate(boot.locale, `meta.${boot.page}.title`);
  const description = translate(boot.locale, `meta.${boot.page}.description`);

  return `<!doctype html>
<html lang="${boot.locale}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <meta name="color-scheme" content="light" />
    <meta name="theme-color" content="#edf1f8" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/static/styles.css?v=${version}" />
    <script>window.__BOOT__ = ${safeJson(boot)};</script>
    <script type="module" src="/static/app.js?v=${version}"></script>
  </head>
  <body>
    <div id="root">${html}</div>
  </body>
</html>`;
}

/**
 * Renders the standalone 404 page.
 * @param locale - Locale used for the page copy.
 * @param message - Optional human-readable message.
 * @returns A standalone 404 HTML document.
 */
export function renderNotFound(locale: Locale, message?: string): string {
  return `<!doctype html>
<html lang="${locale}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${translate(locale, "page.notFoundTitle")}</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/static/styles.css" />
  </head>
  <body>
    <main class="mx-auto flex min-h-screen max-w-3xl flex-col items-start justify-center gap-4 px-6">
      <span class="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-bold tracking-widest text-indigo-600 uppercase dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-300">404</span>
      <h1 class="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">${message ?? translate(locale, "page.notFoundDefault")}</h1>
      <p class="text-slate-500 dark:text-slate-400">${translate(locale, "page.notFoundBody")}</p>
      <a class="btn btn-primary mt-2" href="/">${translate(locale, "page.notFoundCta")}</a>
    </main>
  </body>
</html>`;
}
