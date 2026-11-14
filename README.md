# ImgDown

Ứng dụng web kéo–thả ảnh, nén hàng loạt và trả về **một tệp ZIP**. Frontend React được render **SSR toàn bộ** bằng `react-dom/server`, backend chạy bằng **Bun**, xử lý ảnh bằng **`Bun.Image`** và lưu lịch sử/cài đặt trong **SQLite**.

## Tính năng

- Kéo–thả, chọn từ máy hoặc dán ảnh (`Ctrl/⌘ + V`), upload song song có tiến trình.
- Định dạng đầu ra: Tự động (WebP), WebP, JPEG, PNG, AVIF, HEIC hoặc giữ định dạng gốc.
- Chất lượng, kích thước tối đa, dung lượng mục tiêu mỗi ảnh, PNG palette, JPEG progressive, hậu tố tên tệp.
- **Giữ EXIF máy ảnh & ống kính (bật mặc định)**; tuỳ chọn giữ GPS riêng (mặc định tắt). Hỗ trợ JPEG/WebP/PNG.
- ZIP một tệp, giữ tên gốc, tự chống trùng tên; tiến trình và thống kê tiết kiệm.
- Lịch sử lô, chi tiết từng ảnh, tải lại ZIP, xoá lô; dọn ảnh/ZIP quá hạn (mặc định 7 ngày).
- Giới hạn mỗi lô: **100 ảnh · 60 MB/ảnh · tổng 1 GB** (đổi qua biến môi trường).

## Cấu trúc monorepo

```
apps/
  imgdown/              # Bun server + React SSR + Tailwind UI
    server/             # Bun.serve, SSR, batch processor
    src/                # React pages/components, client entry, styles.css
    public/             # bundle + CSS được build (gitignored)
    scripts/build.ts
packages/
  shared/               # kiểu dữ liệu + format helpers dùng chung
  media/                # Bun.Image pipeline, EXIF, ZIP, settings
  db/                   # SQLite schema/queries + cleanup
```

## Chạy

Yêu cầu **Bun ≥ 1.4** (có `Bun.Image`).

```bash
bun install
bun run dev          # build + server watch, http://localhost:3000
bun run start        # production: build minified + chạy server
```

## Kiểm tra chất lượng

```bash
bun check            # type check bằng Bun (thay cho tsc)
bun run lint         # oxlint (errors fail, warnings reported)
bun test             # unit test bằng bun:test
bun run dup          # jscpd, threshold < 1.5%
bun run build        # client bundle + Tailwind CSS
```

## JSDoc

Toàn bộ JSDoc dùng tiếng Anh. Oxlint 1.93 hỗ trợ sẵn `require-param`, `require-param-description`, `require-returns`, `require-returns-description`, `check-tag-names`, `empty-tags`. Ba rule còn lại (`require-jsdoc`, `require-description`, `check-param-names`) được nạp qua `jsPlugins` của Oxlint bằng `eslint-plugin-jsdoc` (alias `jsdoc-js`) — vẫn chạy trong `bun run lint`, không cần ESLint CLI.

## Biến môi trường

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `PORT` | `3000` | Cổng HTTP |
| `HOST` | `0.0.0.0` | Địa chỉ bind |
| `DATA_DIR` | `./data` | SQLite, ảnh upload, thumbnail, ZIP |
| `MAX_FILES` | `100` | Số ảnh tối đa mỗi lô |
| `MAX_FILE_MB` | `60` | Dung lượng tối đa mỗi ảnh |
| `MAX_TOTAL_MB` | `1024` | Tổng dung lượng tối đa mỗi lô (1 GB) |
| `MAX_PIXELS_MP` | `50` | Giới hạn megapixel |
| `IMAGE_CONCURRENCY` | `1` | Số ảnh nén song song |
| `RETENTION_DAYS` | `7` | Thời gian giữ ảnh/ZIP |

`DATA_DIR` tương đối theo thư mục `apps/imgdown` khi chạy qua script root.

## Ghi chú kỹ thuật

- AVIF/HEIC cần codec hệ điều hành; trên Linux thường bị tắt, WebP/JPEG/PNG luôn dùng được.
- EXIF được nhúng lại cho JPEG (APP1), WebP (VP8X + EXIF chunk), PNG (eXIf). Orientation luôn đặt về 1 vì pixel đã được xoay; GPS bị xoá nếu tắt tuỳ chọn.
- ZIP dùng phương thức STORE (ảnh đã nén sẵn), UTF-8 names, CRC32.
- Ảnh được kiểm tra bằng `Bun.Image` (không tin phần mở rộng/MIME), chặn path traversal trong tên ZIP.
- SSR dùng dữ liệu boot từ SQLite; không có `Date.now()`/`Math.random()` trong render.

## API

| Method | Đường dẫn | Mô tả |
| --- | --- | --- |
| `POST` | `/api/assets` | Upload ảnh (`file`/`files`) |
| `POST` | `/api/batches` | Tạo lô `{ assetIds, settings }` |
| `GET` | `/api/batches?limit=` | Danh sách lô |
| `GET` | `/api/batches/:id` | Trạng thái + items |
| `DELETE` | `/api/batches/:id` | Xoá lô, ZIP, ảnh không còn dùng |
| `GET` | `/api/batches/:id/download` | Tải ZIP |
| `POST` | `/api/settings` | Lưu cài đặt mặc định |
| `GET` | `/api/thumb/asset/:id` | Thumbnail ảnh gốc |
| `GET` | `/api/thumb/item/:id` | Thumbnail ảnh nén |
| `GET` | `/health` | Health check |

## zrok

```bash
bun run build
bun run start &
zrok2 share public --headless 3000
```
