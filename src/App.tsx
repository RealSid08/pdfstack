import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { Header } from "./components/Header";
import { DropZone } from "./components/DropZone";
import { FileList } from "./components/FileList";
import { OutputBar } from "./components/OutputBar";
import { useItems } from "./hooks/useItems";
import { loadCapabilities } from "./lib/capabilities";
import { mergeAll } from "./lib/convert";
import { canShareFiles, downloadBlob, safeFilename, shareFile } from "./lib/download";
import { stripExt } from "./lib/detect";
import type { Capabilities } from "./lib/types";

export default function App() {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  useEffect(() => {
    loadCapabilities().then(setCaps);
  }, []);

  const { items, pageSize, setPageSize, addFiles, remove, clear, move, retry, rotate } = useItems(caps);
  const [filename, setFilename] = useState("");
  const [touchedName, setTouchedName] = useState(false);
  const [building, setBuilding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);

  // Default output name follows the first file until the user edits it.
  useEffect(() => {
    if (touchedName) return;
    setFilename(items.length ? (items.length === 1 ? stripExt(items[0].name) : `${stripExt(items[0].name)} + ${items.length - 1} more`) : "");
  }, [items, touchedName]);

  const stats = useMemo(() => {
    const ready = items.filter((i) => i.status === "ready");
    return {
      ready: ready.length,
      pages: ready.reduce((n, i) => n + (i.pages ?? 0), 0),
      pending: items.filter((i) => i.status === "queued" || i.status === "converting").length,
      errors: items.filter((i) => i.status === "error").length,
    };
  }, [items]);

  const build = useCallback(async (): Promise<File | null> => {
    const name = safeFilename(filename);
    setBuilding(true);
    try {
      const bytes = await mergeAll(items, stripExt(name));
      return new File([bytes as BlobPart], name, { type: "application/pdf" });
    } catch {
      setToast("Couldn't build the PDF. Try removing the file that failed.");
      return null;
    } finally {
      setBuilding(false);
    }
  }, [items, filename]);

  const onDownload = async () => {
    const f = await build();
    if (f) downloadBlob(f, f.name);
  };
  const onShare = async () => {
    const f = await build();
    if (f && !(await shareFile(f))) downloadBlob(f, f.name);
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Whole-page drop target.
  useEffect(() => {
    const enter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      dragDepth.current++;
      setDragOver(true);
    };
    const leave = () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragOver(false);
    };
    const over = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!e.dataTransfer?.files.length) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragOver(false);
      addFiles(e.dataTransfer.files);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [addFiles]);

  // Paste images from the clipboard.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length) addFiles(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  const empty = items.length === 0;

  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-6 sm:px-6">
        {empty ? (
          <section className="pt-4 sm:pt-8">
            <DropZone onFiles={addFiles} />
            <ul className="mx-auto mt-6 grid max-w-xl grid-cols-1 gap-x-6 gap-y-2 text-sm text-muted sm:grid-cols-3 sm:text-center">
              <li><strong className="font-medium text-ink">Drop or paste</strong> any number of files.</li>
              <li><strong className="font-medium text-ink">Drag to order</strong> them the way you want.</li>
              <li><strong className="font-medium text-ink">Download</strong> one PDF. That's it.</li>
            </ul>
            <p className="mt-8 text-center text-xs text-muted">
              Photos and PDFs never leave your device. Documents like Word and Excel are converted on our server and deleted immediately.
            </p>
          </section>
        ) : (
          <section className="pt-2 sm:pt-4">
            <div className="mb-3 flex items-center justify-between">
              <h1 className="text-base font-semibold tracking-tight">
                {items.length} {items.length === 1 ? "file" : "files"}
                <span className="ml-2 hidden text-sm font-normal text-muted sm:inline">Drag the handle to reorder</span>
              </h1>
              <button type="button" onClick={clear} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted hover:bg-card hover:text-danger">
                <Trash2 className="size-3.5" /> Clear all
              </button>
            </div>
            <FileList items={items} onMove={move} onRemove={remove} onRotate={rotate} onRetry={retry} />
            <div className="mt-3">
              <DropZone onFiles={addFiles} compact />
            </div>
            <OutputBar
              fileCount={items.length}
              readyCount={stats.ready}
              pageCount={stats.pages}
              pending={stats.pending}
              errors={stats.errors}
              filename={filename}
              onFilename={(v) => {
                setTouchedName(true);
                setFilename(v);
              }}
              pageSize={pageSize}
              onPageSize={setPageSize}
              building={building}
              onDownload={onDownload}
              onShare={onShare}
              canShare={canShareFiles()}
            />
          </section>
        )}
      </main>
      <footer className="mx-auto w-full max-w-3xl px-4 pb-6 text-center text-xs text-muted sm:px-6">
        Free, no account, no tracking. Built on Cloudflare.
      </footer>

      {dragOver && (
        <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-accent/10 p-4 backdrop-blur-[2px]">
          <div className="rounded-3xl border-2 border-dashed border-accent bg-card px-10 py-8 text-center shadow-lift">
            <p className="text-xl font-semibold">Drop to add</p>
            <p className="mt-1 text-sm text-muted">Files go to the end of the list</p>
          </div>
        </div>
      )}
      {toast && (
        <div role="status" className="pop fixed inset-x-4 bottom-24 z-50 mx-auto max-w-md rounded-xl bg-ink px-4 py-3 text-center text-sm text-paper shadow-lift sm:bottom-6">
          {toast}
        </div>
      )}
    </div>
  );
}
