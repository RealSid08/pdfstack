# Browser acceptance, 2026-10-12

Verified the deployed HTTPS app at `https://pdf.realsid08.me` using the thread's collaborative browser.

- Mobile viewport: 390 × 844. Clear “Any file to PDF” introduction, no horizontal overflow.
- Mixed upload: PNG, three-page PDF, HEIC and TIFF. All four prepared successfully, six total pages.
- Keyboard drag reordering moved the original PDF before the PNG. The downloaded artifact was 4,859,686 bytes; Poppler reported six pages and extracted the three original PDF page markers first, matching the requested order.
- Desktop viewport: 1440 × 900, with dark appearance. Theme variables and computed foreground/background colors verified after transitions settled.
- Product telemetry: page view, files added and file-ready browser requests returned 204 from production `/api/events`. Download and reordering events are also emitted. Wrangler tail also captured this browser's `page_view`, `files_added`, four `file_ready` events, `files_reordered`, `pdf_downloaded` and `files_cleared`, confirming ingestion rather than only endpoint acceptance.

Local controlled browser checks used mocked conversion responses to exercise rare queue paths:

- Two server documents were processed serially, with the first 429 retried after its one-second Retry-After. Three calls yielded two ready documents.
- Clearing an in-flight request aborted its signal. A subsequently added document processed successfully, proving cleared work does not strand the queue.
- Event payloads contained only event names, aggregate numbers and fixed categories.

TypeScript and the frontend build passed. Oxlint completed with three existing advisory warnings (control-character filename sanitation, render-time latest-state ref, and derived filename effect). Lazy HEIC decoding remains a large chunk and is loaded only for those inputs.

This verifies the sample interactions, not every browser/device or every possible document. Server-format evidence and fidelity limits belong in `docs/DEPLOY.md`.
