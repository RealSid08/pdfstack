# Contributing to Stack

Bug reports, documentation and focused pull requests are welcome. Discuss large
changes in an issue first. The repository is pdfstack; the product is Stack.

## Setup and checks

Use Node 26 from `.nvmrc`, pnpm 12.10.1 from `package.json`, and `uv` for parser
fixtures. Clone the repository, then run:

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm build
```

Run `pnpm dev:worker` and `pnpm dev` in separate terminals. Remote Browser
Rendering requires your own Cloudflare authentication and uses account quota.
Replace custom domains and set `CLOUDFLARE_ACCOUNT_ID` before deploying your fork.
Never deploy to the project's domains from a development branch.

## Pull requests

Fork the repository and create a focused branch. Explain the problem, resulting
behavior, checks performed and relevant limitations. Add regression coverage when
behavior warrants it. UI changes should include screenshots and browser evidence;
conversion changes should include synthetic fixtures and fidelity expectations.
Preserve the API contract in `docs/API.md` or document intentional changes.
Do not include private documents, filenames, credentials or raw Cloudflare logs.

CI checks fork PRs without production secrets. All changes to main use PRs and
passing checks. `RealSid08` maintains the project and controls merges; squash
merges keep history linear. Automated dependency updates also need review.
Contributions are licensed under the project's MIT license. No CLA is required.

Report security issues privately using [SECURITY.md](SECURITY.md). Follow the
[Code of Conduct](CODE_OF_CONDUCT.md) in all project spaces.
