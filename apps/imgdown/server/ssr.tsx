import { renderToString } from "react-dom/server";
import { App } from "../src/App";
import type { BootData } from "@imgdown/shared";

const TITLES: Record<BootData["page"], string> = {
  home: "ImgDown — Nén ảnh hàng loạt thành ZIP",
  history: "Lịch sử nén — ImgDown",
  batch: "Chi tiết lô ảnh — ImgDown",
};

const DESCRIPTIONS: Record<BootData["page"], string> = {
  home: "Kéo thả ảnh dung lượng cao, nén hàng loạt bằng Bun.Image và tải về một tệp ZIP nhẹ hơn. Tùy chọn WebP, JPEG, PNG và giữ EXIF.",
  history: "Xem lại các lô ảnh đã nén, tải lại tệp ZIP và quản lý lưu trữ cục bộ.",
  batch: "Chi tiết từng ảnh trong lô: dung lượng trước và sau, kích thước, định dạng đầu ra.",
};

function safeJson(data: unknown): string {
  return JSON.stringify(data)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

/** Renders the full document with React SSR and serialized boot data. */
export function renderDocument(boot: BootData, version: string): string {
  const html = renderToString(<App boot={boot} />);
  const title = TITLES[boot.page];
  const description = DESCRIPTIONS[boot.page];

  return `<!doctype html>
<html lang="vi">
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

/** Renders the standalone 404 page. */
export function renderNotFound(message = "Không tìm thấy trang này."): string {
  return `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Không tìm thấy — ImgDown</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/static/styles.css" />
  </head>
  <body>
    <main class="mx-auto flex min-h-screen max-w-3xl flex-col items-start justify-center gap-4 px-6">
      <span class="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-bold tracking-widest text-indigo-600 uppercase dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-300">404</span>
      <h1 class="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">${message}</h1>
      <p class="text-slate-500 dark:text-slate-400">Trang bạn tìm có thể đã bị xoá hoặc đường dẫn không đúng.</p>
      <a class="btn btn-primary mt-2" href="/">Về trang nén ảnh</a>
    </main>
  </body>
</html>`;
}
