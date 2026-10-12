import { drawToCanvas, type Decoded } from "./image";
const THUMB = 160;

type PdfJs = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfJs> | undefined;
function pdfjs(): Promise<PdfJs> {
  pdfjsPromise ??= Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]).then(([lib, worker]) => {
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    return lib;
  });
  return pdfjsPromise;
}

export function imageThumb(img: Decoded): string | undefined {
  try {
    return drawToCanvas(img, 0, THUMB).toDataURL("image/jpeg", 0.8);
  } catch {
    return undefined;
  }
}

export async function pdfThumb(bytes: Uint8Array): Promise<string | undefined> {
  let task: import("pdfjs-dist").PDFDocumentLoadingTask | undefined;
  try {
    const lib = await pdfjs();
    task = lib.getDocument({ data: bytes.slice() });
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const vp0 = page.getViewport({ scale: 1 });
    const scale = THUMB / Math.max(vp0.width, vp0.height);
    const vp = page.getViewport({ scale });
    const c = document.createElement("canvas");
    c.width = Math.ceil(vp.width);
    c.height = Math.ceil(vp.height);
    const ctx = c.getContext("2d");
    if (!ctx) return undefined;
    await page.render({ canvas: c, canvasContext: ctx, viewport: vp }).promise;
    return c.toDataURL("image/jpeg", 0.8);
  } catch {
    return undefined;
  } finally {
    await task?.destroy().catch(() => {});
  }
}
