# API contract (frontend ↔ Worker)

The same-origin frontend merges per-file PDFs in the chosen order. PDF and image conversion runs in the browser. Documents use the stateless Cloudflare Worker and Browser Rendering. Uploads and generated PDFs are not persisted.

## Conversion routing and fidelity

- Browser: PDF, PNG/JPEG, WebP, GIF, BMP, AVIF, SVG, ICO, HEIC/HEIF, TIFF. Decoder support and image-frame behavior are frontend responsibilities.
- Worker: the extensions listed below. This is a best-effort document converter, not an Office layout engine. The full fidelity matrix and limits are in `DEPLOY.md`.
- Magic bytes override extensions for ZIP Office/OpenDocument/EPUB/iWork packages, OLE Office/MSG, RTF, PDF, MOBI and common Chromium raster images. Unknown ZIPs with usable previews are accepted.
- Valid UTF-8 or BOM-marked UTF-16 text of **any extension** is printable. Unknown text uses wrapped monospace and the original filename as a heading. The filename is never included in telemetry.
- Unsupported binary data returns a safe error identifying its extension and suggesting PDF/image/text export. Encrypted documents and damaged recognized containers can fail conversion.

## `GET /api/health`

`200 { "ok": true, "version": "<Cloudflare deployment UUID>" }`

## `GET /api/capabilities`

```json
{
  "serverExtensions": ["docx","doc","pptx","ppt","odt","rtf","pages","xlsx","xls","xlsb","ods","numbers","csv","tsv","odp","key","epub","mobi","eml","msg","mhtml","mht","html","htm","md","markdown","txt","json","log","js","jsx","ts","tsx","css","scss","py","rb","go","rs","java","c","h","cpp","hpp","cs","php","sh","bash","zsh","sql","yaml","yml","xml","toml","ini","conf"],
  "textFallback": true,
  "maxFileBytes": 26214400,
  "pageSizes": ["A4","Letter"]
}
```

`serverExtensions` describes known document handling; it is not an upload allowlist. Frontend should send all non-image, non-PDF files to conversion. `textFallback` signals that unknown extensions may still work as text.

## `POST /api/convert`

`multipart/form-data`:

- `file` (required): file with original filename.
- `options` (optional JSON string): `{ "pageSize": "A4" | "Letter", "landscape": boolean }`.

Success: `200`, `Content-Type: application/pdf`, PDF bytes; `Cache-Control: no-store` and attachment disposition.

A4 is the document default. Wide sheets auto-select landscape unless explicitly overridden. PPTX uses the source slide dimensions and zero margins; embedded PDF previews preserve their page sizes. Options do not rescale these source-native pages.

Failure shape is unchanged: `{ "error": { "code": "<CODE>", "message": "<safe human readable message>" } }`.

- `400 UNSUPPORTED_TYPE`: unrecognized binary data or archive without a supported document.
- `413 TOO_LARGE`: file over 25 MiB or multipart body over the bounded allowance.
- `422 CONVERSION_FAILED`: damaged, encrypted, empty, overly complex, or timed-out conversion; iWork without a usable preview/readable legacy XML.
- `429 RATE_LIMITED`: conversion/IP or account browser limit; `Retry-After: 60`.
- `500 INTERNAL`: browser service unavailable or unexpected dispatch failure.

No auth, cookies, CORS or upload storage. Worker runs first for `/api/*`; assets use SPA fallback. The async deadline is 30 seconds, plus Cloudflare's synchronous CPU/memory limits. Page JavaScript stays disabled, user HTML is sanitized, CSP blocks active content, and browser network requests are aborted.

## `POST /api/events`

Internal anonymous product-usage ingestion. No telemetry UI or third-party collector. JSON body at most **2,048 bytes**, including unknown fields. `Content-Type: application/json` and an exact same-origin `Origin` are required. No CORS. Read deadline: 3 seconds. Separate native limiter: 120 attempts/IP/minute; IP is used only as the ephemeral limiter key, never emitted in application logs/spans.

Required `event`, one of:

`page_view files_added file_ready file_failed file_removed files_cleared files_reordered page_size_changed pdf_downloaded pdf_shared pdf_build_failed`

Optional fields:

- `count`: integer 0..10,000.
- `bytes`: integer 0..1,073,741,824.
- `pages`: integer 0..100,000.
- `durationMs`: finite number 0..86,400,000.
- `route`: `image`, `pdf`, `server`.
- `outcome`: `success`, `error`.
- `viewport`: `mobile`, `desktop`.

Unknown fields are dropped before logging. Invalid known fields reject the event. No filenames, extensions, file content, IPs, session IDs, user IDs, arbitrary URLs or arbitrary error messages are emitted by application telemetry.

Responses have empty bodies: `204` accepted, `400` invalid JSON/schema, `403` origin rejected, `413` too large, `415` wrong content type, `429` separate event limiter (`Retry-After: 60`). These telemetry-specific responses do not change conversion's error JSON contract. Telemetry is best effort and never gates frontend conversion or download.
