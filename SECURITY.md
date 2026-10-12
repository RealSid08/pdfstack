# Security policy

## Supported versions

Security fixes target the latest `main` commit and the hosted Stack deployment.
Older commits and forks do not receive backported fixes.

## Report a vulnerability privately

Use [GitHub private vulnerability reporting](https://github.com/RealSid08/pdfstack/security/advisories/new).
Do not open a public issue for an exploitable vulnerability or attach private
user documents. Include affected commit, reproduction with synthetic input,
expected and observed behavior, and impact. Coordinate disclosure with the
maintainer before publishing details. Response times are best effort.

## Scope and privacy

Relevant areas include document parsers, archive expansion, sanitization,
Browser Rendering isolation, resource limits, and deployment workflows.
Images and existing PDFs are normally prepared on-device. Documents sent to the
Worker are processed in request memory and browser sessions. No document database
or bucket is used. Cloudflare processes requests and retains operational logs
and traces; approved anonymous events contain fixed categories and numeric data.
See `docs/API.md` and `docs/DEPLOY.md` for the exact boundaries and retention.

Use local tests or your own deployment for security testing. Avoid exhausting
the public service's browser quota. Never submit credentials, real private
documents, or raw Cloudflare request envelopes in reports or commits.

## Known dependency advisories

The production dependency graph audit on 2026-10-12 reported two high-severity
`extract-zip` symlink traversal advisories, one high-severity `basic-ftp` listing
parser denial of service, and one moderate `sprintf-js` precision denial of
service. These enter via Puppeteer's desktop browser downloader and Mammoth's
Node CLI. None of these packages appears in the Wrangler dry-run Worker bundle;
Cloudflare Browser Rendering and Mammoth's browser export are used at runtime.
This does not make the installed development dependency graph vulnerability-free.
Do not use these dependencies' desktop download/extraction or CLI paths with
untrusted input. Dependabot alerts remain enabled; review upstream updates before
changing versions. `extract-zip` and `sprintf-js` have no patched releases in the
registry at this audit. Reassess exposure whenever bundling or imports change.

References: [extract-zip traversal](https://github.com/advisories/GHSA-jmr9-qjv8-65gv),
[extract-zip writes](https://github.com/advisories/GHSA-7pqw-9j4j-h8q3),
[basic-ftp parser](https://github.com/advisories/GHSA-c475-qrg2-pj4r),
and [sprintf-js precision](https://github.com/advisories/GHSA-hp3w-g68c-fv3c).
