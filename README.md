# ImgDown

A drag-and-drop web app that batch-compresses images and returns **a single ZIP file**. The React frontend is **fully server-rendered** with `react-dom/server`, the backend runs on **Bun**, images are processed with **`Bun.Image`**, and history/settings are stored in **SQLite**.

## Features

- Drag and drop, pick from your device or paste images (`Ctrl/⌘ + V`); parallel uploads with progress.
- Output formats: Auto (WebP), WebP, JPEG, PNG, AVIF, HEIC, or keep the original format.
- Quality, max dimensions, per-image target size, PNG palette, progressive JPEG and a filename suffix.
- **Preserve camera and lens EXIF (enabled by default)**; GPS retention is a separate opt-in (off by default). JPEG/WebP/PNG are supported.
- One ZIP per batch, original names preserved, automatic duplicate-name handling, progress and savings stats.
- Batch history, per-image details, re-download ZIPs, delete batches, and automatic cleanup of expired images/ZIPs (7 days by default).
- Per-batch limits: **100 images · 60 MB/image · 1 GB total** (configurable through environment variables).
- **English and Vietnamese UI** with an in-app language switcher; the choice is stored in a cookie and applied during SSR.

## Monorepo layout

```
apps/
  imgdown/              # Bun server + React SSR + Tailwind UI
    server/             # Bun.serve, SSR, batch processor
    desktop/            # Electrobun desktop shell (PoC)
    src/                # React pages/components, client entry, styles.css
    public/             # built bundle + CSS (gitignored)
    scripts/build.ts
packages/
  shared/               # shared types and text utilities
  media/                # Bun.Image pipeline, EXIF, ZIP, settings
  db/                   # SQLite schema/queries + cleanup
```

## Running

Requires **Bun ≥ 1.4** (with `Bun.Image`).

```bash
bun install
bun run dev          # build + server watch, http://localhost:3000
bun run start        # production: minified build + server
```

## Desktop PoC (Electrobun)

`apps/imgdown/desktop/` is an experimental [Electrobun 2.x](https://electrobun.dev) shell. It keeps the existing Bun server in-process: the desktop main process starts `startServer()` on loopback and loads the returned URL in a native window, so SSR, `Bun.Image`, SQLite and ZIP handling keep working without a rewrite.

Prerequisites: Electrobun downloads its pinned Hutch/Bun toolchain on first run. Linux needs the WebKitGTK 4.1 runtime packages; macOS requires 14+; Windows uses WebView2.

```bash
bun install
bun run desktop:dev    # build web assets + open the desktop window
bun run desktop:build  # app bundle in build/, installers in artifacts/
```

How it works:

- `desktop/bun/index.ts` sets `DATA_DIR` to Electrobun's per-user data directory, resolves the bundled `views/public` assets, calls `startServer({ host: "127.0.0.1", port: 0, buildClient: false })` and opens the local URL.
- `desktop:dev` prebuilds the client; the desktop main process never runs `Bun.build`, so bundled apps never try to read source files that are not packaged.
- `electrobun.config.ts` copies `public/app.js` and `public/styles.css` into `views/public`.
- `hutch.config.ts` pins the Electrobun toolchain and provides the install/dev/build tasks.

PoC limitations: there is no save dialog yet (ZIP download behavior depends on the system webview), no single-instance lock or local auth token, no signing/auto-update setup, and drag/drop may need native handling. File picking and paste remain the reliable input paths. AVIF/HEIC still depend on OS codecs. `.hutch/`, `build/` and `artifacts/` are generated and gitignored.

## Quality checks

```bash
bun check            # type check with Bun (instead of tsc)
bun run lint         # oxlint (errors fail, warnings reported)
bun test             # unit tests with bun:test
bun run dup          # jscpd, threshold < 1.5%
bun run build        # client bundle + Tailwind CSS
```

## JSDoc

All JSDoc is written in English. Oxlint 1.93 supports `require-param`, `require-param-description`, `require-returns`, `require-returns-description`, `check-tag-names` and `empty-tags` natively. The remaining three rules (`require-jsdoc`, `require-description`, `check-param-names`) are loaded through Oxlint's `jsPlugins` using `eslint-plugin-jsdoc` (aliased as `jsdoc-js`) — they still run inside `bun run lint`, with no ESLint CLI required.

## Internationalization

- Supported locales: `en` (default) and `vi`.
- Messages live in `apps/imgdown/src/lib/messages.ts`; formatting lives in `apps/imgdown/src/lib/format.ts`.
- Packages contain no user-facing copy: they expose types, structured errors and error codes only.
- The server reads the `imgdown_locale` cookie, falls back to `DEFAULT_LOCALE`, and passes the resolved locale to the client through the SSR boot payload.
- The language picker in the header updates the React tree immediately, persists the cookie and refreshes `lang`, `<title>` and the meta description without reloading the page.
- Number, byte and date formatting are locale-aware. English dates use UTC and Vietnamese dates use `Asia/Ho_Chi_Minh` so SSR output stays deterministic.

## Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `DATA_DIR` | `./data` | SQLite database, uploads, thumbnails, ZIP files |
| `PUBLIC_DIR` | `public` | Directory containing the built `app.js` and `styles.css` |
| `MAX_FILES` | `100` | Maximum images per batch |
| `MAX_FILE_MB` | `60` | Maximum size per image |
| `MAX_TOTAL_MB` | `1024` | Maximum total size per batch (1 GB) |
| `MAX_PIXELS_MP` | `50` | Megapixel limit |
| `IMAGE_CONCURRENCY` | `1` | Number of images compressed in parallel |
| `RETENTION_DAYS` | `7` | How long images/ZIP files are kept |
| `DEFAULT_LOCALE` | `en` | Fallback UI locale (`en` or `vi`) |

`DATA_DIR` is resolved relative to the `apps/imgdown` directory when started through the root script.

## Technical notes

- AVIF/HEIC require OS codecs; they are often disabled on Linux, while WebP/JPEG/PNG always work.
- EXIF is re-embedded for JPEG (APP1), WebP (VP8X + EXIF chunk) and PNG (eXIf). Orientation is always reset to 1 because pixels are already rotated; GPS is stripped unless the option is enabled.
- ZIP uses the STORE method (images are already compressed), UTF-8 names and CRC32.
- Uploads are validated with `Bun.Image` (extensions and MIME types are not trusted), and ZIP entry names are protected against path traversal.
- SSR uses boot data read from SQLite; no `Date.now()` or `Math.random()` runs during render.

## API

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/assets` | Upload images (`file`/`files`) |
| `POST` | `/api/batches` | Create a batch `{ assetIds, settings }` |
| `GET` | `/api/batches?limit=` | List batches |
| `GET` | `/api/batches/:id` | Batch status + items |
| `DELETE` | `/api/batches/:id` | Delete a batch, its ZIP and unused images |
| `GET` | `/api/batches/:id/download` | Download the ZIP |
| `POST` | `/api/settings` | Save default settings |
| `GET` | `/api/thumb/asset/:id` | Original-image thumbnail |
| `GET` | `/api/thumb/item/:id` | Compressed-image thumbnail |
| `GET` | `/health` | Health check |

## zrok

```bash
bun run build
bun run start &
zrok2 share public --headless 3000
```
