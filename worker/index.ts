// Stub – Codex owns this file. See docs/API.md for the contract.
export interface Env {
  ASSETS: Fetcher;
}

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") return json({ ok: true, version: "stub" });
    if (url.pathname === "/api/capabilities")
      return json({ serverExtensions: [], maxFileBytes: 25 * 1024 * 1024, pageSizes: ["A4", "Letter"] });
    if (url.pathname === "/api/convert")
      return json({ error: { code: "UNSUPPORTED_TYPE", message: "Server conversion is not available yet." } }, 400);
    if (url.pathname.startsWith("/api/")) return json({ error: { code: "NOT_FOUND", message: "Not found" } }, 404);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
