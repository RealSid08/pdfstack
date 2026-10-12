# Stack: any file to PDF

A mobile and desktop converter at **https://stack.realsid08.me** (also available at https://pdf.realsid08.me). Add files, reorder them, and download one combined PDF. No account needed.

Everything is hosted on Cloudflare. The browser prepares images and existing PDFs, while a stateless Worker converts documents with Cloudflare Browser Rendering. The final PDF is merged on the user's device. Document contents are not saved in a database or bucket.

## Development

Use the runtime in `.nvmrc` and pnpm version in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm dev:worker
```

In a second terminal, run `pnpm dev` for frontend development. Its `/api` requests proxy to the Worker on port 8787. Remote Browser Rendering requires existing Wrangler authentication and uses account quota.

```sh
pnpm lint
pnpm deploy
node worker/verify-live.mjs
```

See [API contract](docs/API.md) for endpoints and [deployment runbook](docs/DEPLOY.md) for supported formats, conversion fidelity, Cloudflare resources, verification evidence, limits and operations.

## Product behavior

- Multi-file upload, drag or keyboard reordering, thumbnails, removal, rotation for images/PDFs, and a custom output name.
- A4, Letter, and image-fit sizing. Original PDF page dimensions are preserved.
- Images and PDFs are prepared locally, including HEIC and TIFF decoding loaded on demand.
- Documents are queued sequentially with bounded retry for a busy conversion service. Downloads wait until the queue finishes; failed files are explicitly counted as skipped.
- Anonymous product events contain event names, numeric counts and timings, and fixed categories. They do not contain filenames or document contents. Cloudflare observability is configured in the deployment runbook.

Not every arbitrary binary format has a printable representation. The capabilities endpoint and conversion errors define current support; legacy and preview-based formats have documented fidelity limits.

## Open source

Stack is released under the [MIT license](LICENSE). The GitHub repository is
[pdfstack](https://github.com/RealSid08/pdfstack); the product name is Stack.

Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup, checks and pull requests,
[SECURITY.md](SECURITY.md) for private vulnerability reporting, and our
[Code of Conduct](CODE_OF_CONDUCT.md) before participating.

Deployment uses your own Cloudflare account. Set `CLOUDFLARE_ACCOUNT_ID`, replace
the custom domains in `wrangler.jsonc` with domains you own, and authenticate
Wrangler. Browser Rendering uses account quota even during local development.
See [deployment instructions](docs/DEPLOY.md) for details and limits.

Third-party packages retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
