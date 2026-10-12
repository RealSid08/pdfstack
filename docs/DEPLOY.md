# Deployment and operation

## Commands

Use the repo's Node 26 (`.nvmrc`) and pnpm 12. Install with `pnpm install --frozen-lockfile`, then:

- `pnpm build`: checks frontend and Worker TypeScript and builds static assets into `dist/`.
- `pnpm dev:worker`: Wrangler on `http://localhost:8787`. Run `pnpm build` once to supply static assets; the Vite dev server proxies `/api` to this port. `BROWSER` has `remote: true`, so local PDF rendering uses the real account, requires Wrangler login, and consumes browser quota. Do not use `wrangler dev --local`, which disables remote bindings.
- `pnpm deploy`: builds and deploys the Worker, assets and custom domain noninteractively using existing Wrangler OAuth authentication. Login separately with `pnpm exec wrangler login` on a new machine; browser write permission is required.
- `node worker/verify-local.mjs`: generates fixtures and checks all 56 parser extensions plus alias parity. Requires Node 26, `uv`, macOS `textutil`; uv obtains python-docx, python-pptx, odfpy and Pillow for fixture generation.
- `node worker/verify-live.mjs`: live distinct-format, magic-byte, fallback and error acceptance against production. Requires `/opt/homebrew/bin/pdftotext` and `pdfimages` (Poppler). Uses pdf-lib to verify page counts and dimensions. Spaced 21 seconds for Workers Free. Code/markup aliases are covered locally; set `VERIFY_ALL_ALIASES=1` for every suffix live. `VERIFY_ONLY=sample.xls,sample.xlsx` selects focused reruns. Optional first argument selects another origin. Fixtures, PDFs and JSON results remain in the printed temp directory; nothing runs after completion.
- `node worker/verify-events.mjs`: 14 public telemetry validation cases. Verify actual ingestion separately with Wrangler tail, then stop the tail session.

If pnpm reports ignored dependency builds on a fresh install, approve only `esbuild` and `workerd` with `pnpm approve-builds esbuild workerd --yes`; retain the resulting pnpm configuration when maintaining the project. These are Wrangler's build/runtime binaries.

## Cloudflare resources

Set `CLOUDFLARE_ACCOUNT_ID` to your own account ID. The public Wrangler config deliberately omits an account ID.

- Worker `pdf-realsid`, configured in `wrangler.jsonc`.
- Custom domains `stack.realsid08.me` and `pdf.realsid08.me` in the existing `realsid08.me` zone. Cloudflare manages its DNS and HTTPS certificate. `workers.dev` and preview URLs are disabled.
- Static asset bundle `dist/`, binding `ASSETS`, SPA fallback. `/api/*` runs through the Worker first.
- Browser Rendering / Browser Run binding `BROWSER`, used remotely in local development as well as production.
- Native rate limiting binding `CONVERT_LIMITER`, account namespace `2026101201`, 30 conversion attempts per IP per 60 seconds. Keys are prefixed `pdf:`. This is Cloudflare's approximate, per-location limiter, not a global billing ceiling; people sharing an IP share this limit. Browser service limits can independently return `RATE_LIMITED`.
- Version metadata binding `VERSION`: `/api/health` reports the Cloudflare deployment UUID.
- Workers observability enabled. Application logs contain failure categories and stage/name only; they never log uploads, generated PDFs, filenames, IP addresses, or parser error messages.

No R2, KV, D1, Durable Objects, queues, cookies or document storage are created. Native product logs and traces are retained by Cloudflare as described below. Uploads and PDFs are held in request memory and browser sessions only. No Mac service is needed for production.

## Conversion behavior and fidelity

Capabilities are defined once in `worker/conversion.ts`. All 56 listed extensions have parser fixtures. Alias formats share a parser; `textFallback: true` enables valid text with any suffix.

| Formats | Rendering and limitations |
| --- | --- |
| PPTX | Slide order and source dimensions, positioned text boxes and raster pictures, basic font size/bold/italic/alignment and RGB fills. Basic decks retain layout. Group transforms, masters/themes, SmartArt, charts, equations, transitions and complex shapes are not fully reproduced. No claim of pixel-identical PowerPoint rendering. |
| DOCX | Mammoth semantic HTML: paragraphs, basic formatting, tables, inline raster images. Word pagination, floating shapes and exact typography are not preserved. |
| DOC | Word binary piece-table text extraction; paragraphs, no original layout/images. |
| PPT | Best-effort latest slide-list text with page sections; avoids historical edits/master text where that list exists. Alternate text-box records are a fallback. Embedded JPEG/PNG recovery is an appendix, not accurate per-slide image placement. |
| ODT | Paragraphs, headings, tables and embedded raster images; style/layout fidelity limited. |
| RTF | Text, paragraph breaks, bold/italic, Unicode and Windows-1252 escapes. Embedded objects/pictures and complex formatting are omitted. |
| XLSX, XLS, XLSB, ODS, CSV, TSV | Displayed cell values, repeated first-row headers, sections/page breaks per sheet. Six or more columns auto-select landscape. Charts, formulas recalculation, merged-cell fidelity, styling and print areas are not reproduced. |
| ODP | Slide sections, text and embedded raster images; reflowed, not positioned deck fidelity. |
| Pages, Keynote (`key`), Numbers | Embedded PDF preview pages preferred, otherwise highest-resolution preview raster. Legacy XML text fallback. A thumbnail may cover only the first page; preview-based conversion cannot reconstruct missing pages. Modern IWA-only packages without previews are rejected with export guidance, not claimed as fully decoded. |
| EPUB | OPF spine chapter order, chapter page breaks, XHTML text and relative embedded raster images. Publisher CSS, fonts and external assets omitted. |
| MOBI | Best-effort text/HTML for unencrypted PalmDOC/uncompressed records. HUFF/CDIC, DRM and advanced Kindle formats unsupported; embedded MOBI images are not recovered. |
| EML | Decoded headers, HTML or text body, inline CID raster images. Attachments are not recursively converted. |
| MSG | Plain-text MAPI body and subject/sender. HTML-only/compressed-RTF-only messages require EML/PDF export. |
| MHTML, MHT | MIME HTML body and CID/Content-Location raster images; remote assets, CSS and scripts omitted. |
| HTML/HTM, Markdown/MD | Sanitized semantic markup. No user CSS, scripts, external images, frames or network access. |
| JSON, XML | Pretty-printed JSON when valid; XML line-separated markup. Invalid JSON remains printable text. |
| TXT, code/config aliases, unknown text | UTF-8 or BOM-marked UTF-16, wrapped monospace with filename heading. |
| Magic-byte PDF / PNG/JPEG/GIF/WebP/BMP/AVIF | PDF pages copied with pdf-lib; common raster embedded by Chromium. These normally stay client-side. HEIC/TIFF/SVG/ICO decoding stays frontend-owned. |

Full server list:

`docx doc pptx ppt odt rtf pages xlsx xls xlsb ods numbers csv tsv odp key epub mobi eml msg mhtml mht html htm md markdown txt json log js jsx ts tsx css scss py rb go rs java c h cpp hpp cs php sh bash zsh sql yaml yml xml toml ini conf`

WPD/WPS were optional and are not implemented as binary parsers; readable text still converts. Audio, video, executables and arbitrary unknown binary formats cannot meaningfully be printed by this pipeline. The UI accepts any file for an attempt; no universal fidelity guarantee is technically supportable.

### Renderer evaluation

Reviewed [docx-preview's rendering API and limitations](https://github.com/VolodymyrBaydalka/docxjs): it provides browser layout with trusted JavaScript and would need a separate isolated layout-and-sanitize path plus a bundled browser dependency. It was not benchmarked or adopted in this round. Mammoth retains the verified JavaScript-disabled pipeline; DOCX fidelity is explicitly semantic. The small PPTX OOXML renderer handles the requested basic positioned deck features without enabling page scripts. Richer Office renderer evaluation remains future work, not a claimed verified improvement.

### Resource and security boundaries

Files may be at most 26,214,400 bytes (25 MiB). Multipart body is bounded while streaming, with 64 KiB extra for metadata. ZIPs are limited to 40 MiB expanded and 5,000 entries before decompression. Spreadsheets reject 10,001+ rows, 201+ columns and over 100,000 rectangular cells. PPTX is capped at 300 slides and sane dimensions. Generated HTML is capped at 12 MiB. MOBI output is capped at 12 MiB with bounded record buffers. Large or complex documents can still exceed Workers Free CPU or 128 MiB memory limits below the upload cap.

Conversion has a 30-second async deadline from dispatch. Cloudflare independently limits synchronous CPU. Browser/page cleanup runs in `finally`, including late launches after timeout. Every successful or failed request releases its own browser; idle expiry is a backstop. No shared browser document state is retained.

Sanitization strips scripts, frames, external images, handlers and active attributes. Only tightly constrained generated position/font/color styles are accepted for PPTX/RTF. XML parsers reject DTDs/entities. Printing disables JavaScript, applies restrictive CSP and aborts all page requests. Source-native PDF passthrough rebuilds copied pages; it is not an antivirus service. The Worker never fetches upload-supplied URLs.

## Product telemetry and traces

Native `cloudflare:workers` tracing instruments `conversion.parse`, `conversion.layout`, `conversion.render`, `conversion.result` and `product.event`. Parser spans are manually ended so raw parser exceptions/document fragments are not automatically attached. Conversion result logs include only status/outcome/duration. Product logs use structured `{kind:"product_event",event,...approvedFields}`. See `API.md` for the strict event contract.

`observability.logs` and `observability.traces` persist to Cloudflare at 100% head sampling. Automatic invocation logs are disabled; URL query strings are redacted. No third-party exporter, cookies, user/session identifiers or application-level IP logging. Cloudflare's platform still maintains its standard request/trace infrastructure; these are operational traces, not anonymous unique-user analytics. Browser usage events can be blocked, dropped, retried or spoofed, so counts are approximate and do not identify people.

Dashboard: Workers & Pages → `pdf-realsid` → Observability → Logs. In Query Builder, filter `kind = product_event`, group by `event`, count rows, and select a time range/histogram interval. Add `route`, `outcome` or `viewport` filters for segmentation. Filter `event = pdf_downloaded` and sum `pages` or `bytes` for output volume; inspect `durationMs` for processing time. For conversion health, filter `kind = conversion`, group by `outcome`/`status`. The Traces view exposes the named custom spans. Live inspection:

```sh
pnpm exec wrangler tail pdf-realsid --format json --search product_event
```

Do not publish raw tail envelopes: Cloudflare runtime request metadata can include request headers/IP even though the application's sanitized log message does not. Inspect/export the `logs[].message` payloads only.

As documented on 2026-10-12, [Workers Free logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/) retain **3 days** (200,000 log events/day), and [traces](https://developers.cloudflare.com/workers/observability/traces/) retain **7 days**. Cloudflare documents observability pricing changes from December 1, 2026; recheck pricing before that date. This setup is useful for recent usage, not permanent historical analytics.

Analytics Engine was evaluated because it is [available on Free](https://developers.cloudflare.com/analytics/analytics-engine/pricing/). Adding its binding was rejected with Cloudflare code **10089**, requiring account activation. The activation dashboard was blocked at security verification. Its binding was removed, so deployment remains on the existing plan. Nothing was billed/upgraded. Optional future step for longer usage trends: enable Analytics Engine in the account dashboard, then implement/verify the dataset; currently no dataset or Analytics Engine data points are emitted.

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

## Initial acceptance evidence (historical, before text fallback)

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

## Expanded-format acceptance (2026-10-12)

Production deployment: `12b6cd59-4712-4b06-af3b-3ecabc6d7ec4`. It includes the shared frontend through `aec36dd` and native telemetry. Final measured Worker upload: **3,987.48 KiB uncompressed / 889.50 KiB gzip**, startup **70 ms**. No Worker bundle/CPU limit was hit by these small fixtures. The existing frontend chunk-size warning remains; build and TypeScript pass. No billing upgrade was performed.

- Local: 65 fixtures covering all **56 advertised extensions**, 35 text/markup alias checks. Generated DOCX/PPTX use python-docx/python-pptx; ODT/ODP use odfpy; DOC/RTF use macOS textutil; spreadsheet binaries use SheetJS. EPUB/MOBI/MSG and preview-bearing iWork packages are structured fixtures. The iWork fixtures verify preview extraction, not full Apple application export interoperability. The synthetic PPT record fixture is supplemented by Apache POI's real binary PowerPoint file.
- First live run: **14 successful conversions** (DOCX, PPTX, ODT, ODP, DOC, RTF, Pages, Keynote, Numbers, EPUB, MOBI, EML, MHTML, MHT). Four spreadsheet assertions initially failed because Poppler interleaved wrapped header text with adjacent columns; these were test-expectation failures, not missing cells. The run was stopped before redundant code-suffix browser launches.
- Focused live rerun: **27 passed, zero failed**: 20 conversions including the four spreadsheet formats, MSG/PPT, CSV/TSV, HTML/MD, TXT/JSON/JS/XML, unknown UTF-8, UTF-16, renamed DOCX, magic PDF/raster and raster iWork preview; plus seven invalid-input/error cases. Expected content, `%PDF`, MIME, positive page counts, spreadsheet landscape/two-sheet breaks, two-slide PPTX dimensions, EPUB order, inactive hostile HTML and embedded image presence were checked. The PPTX PDF was also rasterized and visually inspected.
- Supplemental live checks: real Apache PPT **2 pages / 11,137 bytes**, MHTML Content-Location **1 page / 9,948 bytes**, plus expanded ZIP rejection all passed.
- Worker service mocks: `500 INTERNAL`, browser `429 RATE_LIMITED`, `422` timeout and late-browser cleanup passed without disrupting production. These are local fault-injection results, not claims of inducing a real production outage.
- Telemetry: **14 live endpoint cases** passed. A bounded burst produced `429` with `Retry-After: 60`; conversion's separate limiter remained usable. Wrangler tail captured sanitized `pdf_downloaded` and frontend events, with an injected `filename` field absent. Parent-owned browser acceptance additionally observed `page_view`, `files_added`, `file_ready`, `files_reordered`, `pdf_downloaded`, and `files_cleared`; see `UI_ACCEPTANCE.md`. Native trace settings deployed successfully, but dashboard span visualization was not inspected because the dashboard security check blocked access.

Evidence logs: `/tmp/pdf-round2-live.log`, `/tmp/pdf-round2-distinct.log`, `/tmp/pdf-round2-extra.log`. PDFs and machine-readable results remain under the temp directories printed in those logs. Application code stores none of these verification documents in production.

Commands for supplemental/fault coverage:

```sh
node worker/verify-worker.mjs
node worker/verify-supplemental.mjs
VERIFY_RATE_LIMIT=1 node worker/verify-events.mjs
```

The supplemental test fetches Apache POI's pinned `REL_3_14_FINAL/test-data/slideshow/basic_test_ppt_file.ppt` fixture locally, verifies two pages without duplicated historical/master text, checks MHTML Content-Location images, and asserts the expanded-archive cap. It never uses an external conversion service.

## GitHub CI/CD

Repository: `RealSid08/pdf-realsid` (private). `.github/workflows/ci.yml` runs locked dependency installation, lint, document parser fixtures, Worker failure/cleanup tests, TypeScript and the frontend build on pull requests and pushes to `main`.

Successful `main` checks deploy the checked asset artifact and Worker to `pdf.realsid08.me`. Pull requests do not receive production credentials and do not deploy. GitHub's `production` environment records deployments. Main runs are serialized; pull-request runs superseded by new commits are cancelled.

GitHub secret: `CLOUDFLARE_API_TOKEN`. Repository variable: `CLOUDFLARE_ACCOUNT_ID`. The token `pdf-realsid-ci` is scoped to the existing account and the `realsid08.me` zone, with Workers Scripts Edit, Account Settings Read, Zone Read and Workers Routes Edit. No credentials are committed. For rotation, create a token with the same permissions and pipe its value into `gh secret set CLOUDFLARE_API_TOKEN --repo RealSid08/pdf-realsid`; never put the value in shell arguments or logs.

The Node runtime follows `.nvmrc`; pnpm follows `packageManager`. Workflow actions are pinned to commit SHAs. Fixture generation uses uv 0.12.23 and pinned Python fixture dependencies; the test-only legacy DOC fixture was generated with macOS textutil and contains synthetic acceptance text. CI runs on Linux without an Office application.

Post-deploy verification checks public health, capabilities, the HTML/JavaScript assets and the telemetry endpoint. Full live format tests remain a deliberate manual acceptance tool because they consume Browser Run quota. GitHub run details must show the deployment step executed, not only a green check job.

## GitHub deployment and fork safety

The canonical repository is `RealSid08/pdfstack`. GitHub Actions builds and checks
pull requests without production credentials. Only a push to the canonical
repository's `main` branch or a manual run on that branch can deploy. Forks run
checks only. Actions are pinned to commit hashes; Dependabot proposes updates.

For your own deployment, configure the `production` environment to allow only
`main`, set its `CLOUDFLARE_API_TOKEN` secret (scoped to your account's Workers,
Browser Rendering and the necessary zone routes), and set the repository variable
`CLOUDFLARE_ACCOUNT_ID`. Replace both custom domains with your own domains, and
update the workflow's canonical repository guard and verification origins.
Do not commit tokens, Wrangler credentials or `.dev.vars`.

The `main` branch requires a PR, the `Check` job, resolved review conversations,
and linear history. An additional ruleset restricts updates to repository admins
through PRs only. Currently `RealSid08` is the sole admin. No ruleset permits direct
pushes, force pushes or branch deletion, including for admins. Own PRs need no
second-person approval; contributor PRs are reviewed and merged by the maintainer.
