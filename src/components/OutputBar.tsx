import { useState } from "react";
import { Download, Loader2, Share2, SlidersHorizontal, Info } from "lucide-react";
import type { PageSize } from "../lib/types";

interface Props {
  fileCount: number;
  readyCount: number;
  pageCount: number;
  pending: number;
  errors: number;
  filename: string;
  onFilename: (v: string) => void;
  pageSize: PageSize;
  onPageSize: (v: PageSize) => void;
  building: boolean;
  onDownload: () => void;
  onShare?: () => void;
  canShare: boolean;
}

const SIZES: { value: PageSize; label: string; hint: string }[] = [
  { value: "A4", label: "A4", hint: "Standard international A4 pages" },
  { value: "Letter", label: "Letter", hint: "Standard US Letter pages" },
  { value: "fit", label: "Fit image", hint: "Fit images to original dimensions without margins" },
];

export function OutputBar(p: Props) {
  const [open, setOpen] = useState(false);
  const disabled = p.readyCount === 0 || p.pending > 0 || p.building;
  const summary =
    p.pending > 0
      ? `Preparing ${p.pending} of ${p.fileCount}...`
      : `${p.readyCount} ${p.readyCount === 1 ? "file" : "files"} · ${p.pageCount} ${p.pageCount === 1 ? "page" : "pages"}${p.errors ? ` · ${p.errors} skipped` : ""}`;

  return (
    <div className="sticky bottom-0 z-20 -mx-4 mt-6 border-t border-line bg-paper/90 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur sm:static sm:mx-0 sm:mt-8 sm:rounded-2xl sm:border sm:bg-card sm:p-4 sm:shadow-card">
      <div className={`${open ? "flex" : "hidden"} flex-col gap-3 pb-3 sm:flex sm:flex-row sm:items-end sm:gap-4 sm:pb-0`}>
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-muted">
          Output file name
          <span className="flex items-center rounded-xl border border-line bg-card px-3 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20 sm:bg-paper">
            <input
              value={p.filename}
              onChange={(e) => p.onFilename(e.target.value)}
              placeholder="combined"
              className="min-w-0 flex-1 bg-transparent py-2 text-sm text-ink outline-none"
              aria-label="Output PDF file name"
              spellCheck={false}
              autoCapitalize="off"
            />
            <span className="text-sm font-medium text-muted">.pdf</span>
          </span>
        </label>
        <div className="flex flex-col gap-1 text-xs font-medium text-muted">
          Page size layout
          <div role="radiogroup" aria-label="Page size layout" className="flex rounded-xl border border-line bg-card p-0.5 sm:bg-paper">
            {SIZES.map((s) => (
              <button
                key={s.value}
                type="button"
                role="radio"
                aria-checked={p.pageSize === s.value}
                title={s.hint}
                onClick={() => p.onPageSize(s.value)}
                className={`flex-1 rounded-[10px] px-3 py-1.5 text-sm font-medium transition sm:flex-none ${
                  p.pageSize === s.value ? "bg-ink text-paper shadow-card" : "text-muted hover:text-ink"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile hint if share is supported */}
      {p.canShare && (
        <div className="mb-2 flex items-center gap-1.5 text-[11px] text-muted sm:hidden">
          <Info className="size-3 text-accent" />
          <span>Tap Share to save to Files or open directly in apps on mobile</span>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 sm:mt-3">
        <p className="min-w-0 text-xs font-medium text-muted tabular-nums" aria-live="polite">
          {summary}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label="Output options"
            title="Options (file name & layout)"
            className={`grid size-11 place-items-center rounded-xl border border-line bg-card transition sm:hidden ${open ? "border-accent text-accent" : "text-ink"}`}
          >
            <SlidersHorizontal className="size-5" />
          </button>
          {p.canShare && p.onShare && (
            <button
              type="button"
              disabled={disabled}
              onClick={p.onShare}
              aria-label="Share or save to Files"
              title="Share or save to Files (iOS / Android)"
              className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-line bg-card px-3 text-xs font-medium text-ink transition hover:border-accent hover:text-accent active:scale-95 disabled:opacity-40"
            >
              <Share2 className="size-4" />
              <span className="sm:inline">Share</span>
            </button>
          )}
          <button
            type="button"
            disabled={disabled}
            onClick={p.onDownload}
            className="inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl bg-accent px-4 text-sm font-semibold text-white shadow-card transition hover:bg-accent-strong active:scale-[.98] disabled:opacity-40 disabled:hover:bg-accent sm:px-5"
          >
            {p.building ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            {p.building ? "Building PDF..." : "Download PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}
