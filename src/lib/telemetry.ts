// Anonymous, bounded product events. Never include file names or document content.
type Event = "page_view" | "files_added" | "file_ready" | "file_failed" | "file_removed" | "files_cleared" | "files_reordered" | "page_size_changed" | "pdf_downloaded" | "pdf_shared" | "pdf_build_failed";
type Details = { count?: number; bytes?: number; pages?: number; durationMs?: number; route?: "image" | "pdf" | "server"; outcome?: "success" | "error"; viewport?: "mobile" | "desktop" };
export function track(event: Event, details: Details = {}) {
  const body = JSON.stringify({ event, ...details });
  void fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
}
let viewed = false;
export function trackPageView() {
  if (viewed) return;
  viewed = true;
  track("page_view", { viewport: window.matchMedia("(max-width: 639px)").matches ? "mobile" : "desktop" });
}
