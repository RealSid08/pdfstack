import type { Capabilities } from "./types";

const FALLBACK: Capabilities = {
  serverExtensions: ["docx", "xlsx", "csv", "md", "txt", "html", "htm", "json"],
  maxFileBytes: 25 * 1024 * 1024,
  pageSizes: ["A4", "Letter"],
};

export async function loadCapabilities(): Promise<Capabilities> {
  try {
    const res = await fetch("/api/capabilities", { headers: { accept: "application/json" } });
    if (!res.ok) return FALLBACK;
    const data = (await res.json()) as Partial<Capabilities>;
    return {
      serverExtensions: (data.serverExtensions ?? FALLBACK.serverExtensions).map((e) => e.toLowerCase()),
      maxFileBytes: data.maxFileBytes ?? FALLBACK.maxFileBytes,
      pageSizes: data.pageSizes ?? FALLBACK.pageSizes,
    };
  } catch {
    return FALLBACK;
  }
}
