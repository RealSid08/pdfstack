# API contract (frontend ↔ Worker)

The frontend is a static SPA served by the same Cloudflare Worker. The Worker only converts
files that the browser cannot convert itself. Nothing is stored server-side; the Worker is stateless.

## What is converted where

| Input                                   | Where     | How                                        |
|-----------------------------------------|-----------|--------------------------------------------|
| PDF                                     | Browser   | pdf-lib merge (pages copied as-is)         |
| PNG, JPEG, WebP, GIF, BMP, SVG, AVIF    | Browser   | decode → canvas → embedded in a page       |
| HEIC/HEIF (if browser cannot decode)    | Worker    | best effort; `UNSUPPORTED_TYPE` if impossible |
| DOCX, XLSX, PPTX, ODT, RTF, HTML, MD, TXT, CSV, JSON, code files | Worker | convert to HTML → Browser Rendering → PDF |

The browser merges all per-file PDFs in the user's chosen order and downloads the result.
The Worker never sees the final merged document.

## Endpoints

### `GET /api/health`
`200 { "ok": true, "version": "<git sha or build id>" }`

### `GET /api/capabilities`
Lets the UI label unsupported files before uploading.
```json
{
  "serverExtensions": ["docx","xlsx","pptx","odt","rtf","html","htm","md","txt","csv","json","heic","heif", "..."],
  "maxFileBytes": 26214400,
  "pageSizes": ["A4","Letter"]
}
```

### `POST /api/convert`
`multipart/form-data` with fields:
- `file` (required): the file, with its original filename.
- `options` (optional, JSON string): `{ "pageSize": "A4" | "Letter", "landscape": boolean }`

Success: `200`, `Content-Type: application/pdf`, body is the PDF bytes.
Optional header `X-Page-Count: <n>`.

Failure: JSON body `{ "error": { "code": "<CODE>", "message": "<human readable>" } }`
- `400 UNSUPPORTED_TYPE` – extension/MIME not convertible server-side.
- `413 TOO_LARGE` – over `maxFileBytes`.
- `422 CONVERSION_FAILED` – conversion ran but produced no usable PDF (corrupt file, etc.).
- `429 RATE_LIMITED` – per-IP limit hit; include `Retry-After` seconds.
- `500 INTERNAL` – anything else.

Messages must be safe to show verbatim in the UI.

## Non-functional
- No auth, no cookies, no storage. Per-IP rate limiting is encouraged (Cloudflare rate limiting rules or in-Worker).
- Hard cap on request size (default 25 MB) and conversion time (~30 s) so a bad file cannot hang the UI.
- CORS is unnecessary (same origin). Reject cross-origin POSTs if convenient.
- `/api/*` must be served by the Worker (`run_worker_first`), everything else by static assets with SPA fallback.
