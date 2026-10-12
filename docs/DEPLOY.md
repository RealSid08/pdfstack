# Deployment and operation

## Commands

Use the repo's Node 26 (`.nvmrc`) and pnpm 12. Install with `pnpm install --frozen-lockfile`, then:

- `pnpm build`: checks frontend and Worker TypeScript and builds static assets into `dist/`.
- `pnpm dev:worker`: Wrangler on `http://localhost:8787`. Run `pnpm build` once to supply static assets; the Vite dev server proxies `/api` to this port. `BROWSER` has `remote: true`, so local PDF rendering uses the real account, requires Wrangler login, and consumes browser quota. Do not use `wrangler dev --local`, which disables remote bindings.
- `pnpm deploy`: builds and deploys the Worker, assets and custom domain noninteractively using existing Wrangler OAuth authentication. Login separately with `pnpm exec wrangler login` on a new machine; browser write permission is required.
- `node worker/verify-live.mjs`: generates DOCX, two-sheet XLSX, MD, TXT, CSV, JSON and hostile HTML samples and sends real curl requests to production. Requires `pdftotext` (Poppler) for content verification; also parses PDFs with pdf-lib. Samples and outputs are retained in a printed temporary directory. Tests space browser launches by 21 seconds for Workers Free. Optional first argument selects another origin.

If pnpm reports ignored dependency builds on a fresh install, approve only `esbuild` and `workerd` with `pnpm approve-builds esbuild workerd --yes`; retain the resulting pnpm configuration when maintaining the project. These are Wrangler's build/runtime binaries.

## Cloudflare resources

Account: `a948d7fb82122c0f6f00bec3a43585b1`.

- Worker `pdf-realsid`, configured in `wrangler.jsonc`.
- Custom domain `pdf.realsid08.me` in the existing `realsid08.me` zone. Cloudflare manages its DNS and HTTPS certificate. `workers.dev` and preview URLs are disabled.
- Static asset bundle `dist/`, binding `ASSETS`, SPA fallback. `/api/*` runs through the Worker first.
- Browser Rendering / Browser Run binding `BROWSER`, used remotely in local development as well as production.
- Native rate limiting binding `CONVERT_LIMITER`, account namespace `2026101201`, 30 conversion attempts per IP per 60 seconds. Keys are prefixed `pdf:`. This is Cloudflare's approximate, per-location limiter, not a global billing ceiling; people sharing an IP share this limit. Browser service limits can independently return `RATE_LIMITED`.
- Version metadata binding `VERSION`: `/api/health` reports the Cloudflare deployment UUID.
- Workers observability enabled. Application logs contain failure categories and stage/name only; they never log uploads, generated PDFs, filenames, IP addresses, or parser error messages.

No R2, KV, D1, Durable Objects, queues, cookies or document storage are created. Uploads and PDFs are held in request memory and browser sessions only. No Mac service is needed for production.

## Conversion behavior and boundaries

Capabilities are defined once in `worker/conversion.ts` and returned by `/api/capabilities`. Current supported extensions:

`docx xlsx csv html htm md markdown txt json log js jsx ts tsx css scss py rb go rs java c h cpp hpp cs php sh bash zsh sql yaml yml xml toml ini conf`

DOCX uses Mammoth semantic HTML conversion, not pixel-identical Word layout. XLSX/CSV preserve displayed cell values in tables, one section per sheet, with page breaks between sheets. Charts, spreadsheet styling and Office pagination are not reproduced. A4 portrait is the default; optional Letter and landscape are honored. Margins are 15 mm, with print backgrounds and a readable base stylesheet. JSON must be valid and is pretty-printed; code and logs are escaped plain text, without execution. Text must be UTF-8 or BOM-marked UTF-16.

PPTX, ODT, RTF, HEIC and HEIF return `400 UNSUPPORTED_TYPE`: no verified faithful parser/decoder is installed. Browser-side PDF and common image conversion belong to the frontend, so those extensions are deliberately absent from server capabilities.

Files may be at most 26,214,400 bytes (25 MiB). The multipart body is bounded while streaming, with an additional 64 KiB allowance for form metadata; file size is checked separately after parsing. Office archive metadata is limited to 40 MiB expanded and 5,000 entries before parsing. Spreadsheets are limited to fewer than 10,001 rows, 200 columns and 100,000 rectangular cells in total. Generated HTML is limited to 12 MiB. Larger or overly complex documents are rejected rather than silently truncated. These safeguards cannot guarantee that every file under 25 MiB fits the Workers Free CPU or memory limits.

The asynchronous conversion deadline is 30 seconds from Worker dispatch, including any remaining upload reading, parsing and rendering. Client upload transit or Cloudflare buffering before dispatch can take longer. Synchronous parser CPU is additionally bounded by Cloudflare's runtime limit. Deadline failures return `422 CONVERSION_FAILED`; late browser launches still close in `finally`. Page and browser cleanup runs for success and failure. Browser idle expiry is 60 seconds as an additional backstop.

Untrusted HTML/Markdown/Office HTML is sanitized: scripts, frames, styles, external image URLs, handlers and active attributes are removed. Only embedded raster data images are allowed. Printing also disables JavaScript, applies a restrictive CSP, and intercepts and aborts every page network request before `setContent`; it never navigates to upload-supplied URLs. External CSS/fonts/images are intentionally absent from PDFs. The API does not enable CORS.

## Costs and limits

This account was on Workers Free at initial deployment. The deploy API rejected configurable CPU limits on that plan, so no `limits.cpu_ms` setting is included. Workers Free provides a small CPU allowance and Browser Run allows 10 browser minutes/day, three concurrent browsers, and one new browser every 20 seconds for the entire account. Multiple rapid server conversions will therefore receive HTTP 429 even below the app's per-IP limit. Every conversion closes its browser to avoid idle charges. The current architecture intentionally creates a fresh browser per file rather than retaining user documents across requests.

For a generally usable multi-file converter, the account owner should upgrade Workers to Paid in [Workers plans](https://dash.cloudflare.com/a948d7fb82122c0f6f00bec3a43585b1/workers/plans), then redeploy. This is a billing decision and was not performed automatically. Paid Browser Run includes 10 browser hours/month, then $0.09/hour, and 10 included concurrent browsers averaged monthly, then $2 per additional averaged browser; the paid technical defaults allow up to 200 concurrent sessions and three new browsers/second. Workers subscription/request/CPU charges are separate. After upgrading, configure an appropriate Worker CPU limit for Office parsing and verify larger realistic documents.

Check current [Browser Run pricing](https://developers.cloudflare.com/browser-run/pricing/), [Browser Run limits](https://developers.cloudflare.com/browser-run/limits/), and [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) before changing capacity. Monitor account browser duration and daily peaks in Cloudflare's Browser Run dashboard. Per-IP throttling does not prevent distributed abuse from consuming the daily free quota or paid usage.

## Rollback

Inspect versions with `pnpm exec wrangler deployments list` and `pnpm exec wrangler versions list`. Roll back to a known healthy version with:

```sh
pnpm exec wrangler rollback <version-id> --yes --message "Restore known healthy converter"
```

This app has no persistent data migrations. Verify `/api/health`, `/api/capabilities`, and a TXT conversion after rollback. Keep the local config/source consistent with the desired version before the next `pnpm deploy`, which will deploy the current checkout again. Redeploying an earlier Git commit with `pnpm deploy` is also possible, but preserve other agents' uncommitted frontend work before changing the checkout.

## Initial acceptance evidence

Verified on 2026-10-12 against the public HTTPS custom domain. `pnpm build`, Worker TypeScript, backend oxlint and `git diff --check` passed. SPA fallback returned HTTP 200 on a non-API route.

| Sample | PDF bytes | Pages | Verified behavior |
| --- | ---: | ---: | --- |
| DOCX | 9,590 | 1 | Expected document text |
| XLSX | 24,624 | 2 | Two sheets, page break, A4 landscape |
| Markdown | 19,978 | 1 | Heading and table text |
| TXT | 8,524 | 1 | Letter 612 × 792 pt; literal script text |
| CSV | 19,235 | 1 | Quoted comma and table values |
| JSON | 9,414 | 1 | Parsed and pretty-printed content |
| HTML | 16,873 | 1 | Expected content; script did not execute |

All returned `application/pdf`, began with `%PDF`, opened with pdf-lib and yielded expected text through Poppler `pdftotext`. A4 output dimensions were approximately 595.92 × 842.88 pt. Unsupported EXE returned 400 `UNSUPPORTED_TYPE`, a 25 MiB + 1 byte file returned 413 `TOO_LARGE`, and corrupt DOCX returned 422 `CONVERSION_FAILED`. A chunked multipart body exceeding the file limit plus metadata allowance also returned the documented 413 JSON response. A launch immediately after a local browser session returned 429 `RATE_LIMITED`, verifying that account browser throttling is surfaced safely rather than as a parser error. This proves the sample workload only; large or highly complex documents on Workers Free remain subject to runtime limits.
