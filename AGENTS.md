# AGENTS.md

## Project

ImgDown is a Bun + React SSR image compressor, organised as a monorepo:

```
apps/imgdown/     Bun server, React SSR client, Tailwind UI, build scripts
packages/shared/  Domain types + formatting helpers (server & browser)
packages/media/   Bun.Image pipeline, EXIF, ZIP writer, settings validation
packages/db/      bun:sqlite schema/queries + storage cleanup
```

Read `README.md` for features and environment variables.

## Required checks

Run all of these before considering a task complete:

```bash
bun check          # Bun's TypeScript 7 checker (do not use tsc)
bun run lint       # oxlint (errors fail, warnings reported)
bun test           # bun:test unit tests
bun run dup        # jscpd duplication threshold < 1.5%
bun run build      # Bun client bundle + Tailwind CSS
```

Do not use `tsc --noEmit`.

## Hard rules

- **Every exported function must have an English JSDoc block with a description, `@param` and `@returns`.** This includes React components and public class methods.
  ```ts
  /**
   * Loads one batch and its items.
   * @param id - Batch identifier.
   * @returns The batch DTO, or `null` when it does not exist.
   */
  export function getBatch(id: string): BatchDTO | null { ... }
  ```
  Oxlint 1.93 implements most JSDoc rules natively; the remaining `require-jsdoc`, `require-description` and `check-param-names` rules run through `jsPlugins` using `eslint-plugin-jsdoc` aliased as `jsdoc-js` in `.oxlintrc.json`.
- No `any`. Prefer `unknown` and narrowing.
- Keep strict TypeScript; do not weaken `tsconfig.json`.
- Use Bun APIs (`Bun.serve`, `Bun.file`, `Bun.Image`, `bun:sqlite`, `bun:test`).
- Tailwind CSS v4 only. Custom component classes live in `apps/imgdown/src/styles.css` via `@apply`; do not add a second stylesheet.
- SSR must be deterministic: no `Date.now()`, `Math.random()` or client-only branching during render. Use `packages/shared/src/format.ts` for locale/time formatting.
- Validate all client input server-side. Never trust filenames, MIME types or extensions; `Bun.Image` sniffs bytes.
- SQLite access stays in `packages/db`. Use prepared statements and transactions for multi-row writes.
- Batch limits: `MAX_FILES` (100), `MAX_FILE_MB` (60), `MAX_TOTAL_MB` (1024). Enforce both client and server.
- ZIP names must be sanitized; prevent traversal and duplicate entries.
- Preserve EXIF only for JPEG/WebP/PNG, reset Orientation to 1, strip GPS unless `keepLocation` is enabled.
- Do not log image bytes or personal filenames.

## UI conventions

- Vietnamese labels, friendly tone, accessible focus states, `aria-label` on icon-only buttons.
- Reuse `Shell`, `SettingsPanel`, `BatchStatusBadge`, `ItemMeta` and shared formatters; do not duplicate status label maps.
- Keep drag/drop, paste, keyboard and mobile flows working.
- Use Tailwind utilities for layout, custom classes only for repeated component styling.

## Tests

- `bun:test` only, under `packages/media/test/`.
- Cover ZIP structure, settings validation, EXIF extraction/patch/embed, and the image pipeline.
- Test fixtures live in `packages/media/test/fixtures/` and stay small (currently a 10 KB JPEG).
- When changing limits, update `packages/media/src/image.ts`, the client copy in `HomePage`, README and tests together.

## zrok

```bash
bun run build
bun run start &
zrok2 share public --headless 3000
```
