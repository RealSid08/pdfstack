# pdf.realsid08.me

Single-page web app: drop any files, reorder them, download one PDF. No accounts, nothing stored.
Everything runs on Cloudflare (Worker + static assets + Browser Rendering). See `docs/API.md` for the contract.

## Ownership
- `src/`, `index.html`, `public/`, styling, UX copy: **Claude (frontend/product)**.
- `worker/`, `wrangler.jsonc`, Cloudflare account/dashboard/DNS, deploy scripts, `docs/DEPLOY.md`: **Codex (backend/infra)**.
- `package.json`: both may add dependencies with `pnpm add`; do not remove the other side's entries.
- Keep commits scoped to your own files so both agents can commit in the same checkout.

## Commands
- `pnpm dev` – Vite dev server for the UI (proxies `/api` to `wrangler dev` on :8787).
- `pnpm dev:worker` – Worker locally.
- `pnpm build` – typecheck + Vite build into `dist/`.
- `pnpm deploy` – build and `wrangler deploy` to pdf.realsid08.me.

Node 26 (`.nvmrc`), pnpm 12.
