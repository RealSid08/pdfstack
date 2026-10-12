import { PDFDocument, degrees } from "pdf-lib";
import { PAGE_SIZES, type Item, type PageSize } from "./types";
import { extOf } from "./detect";
import { decodeImage, drawToCanvas, release, type Decoded } from "./image";

const MAX_EDGE = 4000; // px, keeps canvas memory sane on phones
const MARGIN = 24; // pt

export class ConvertError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/** Rasterise an image to JPEG/PNG bytes, applying rotation and an edge cap. */
export async function rasterise(file: File, rotation: number, decoded?: Decoded): Promise<{ bytes: Uint8Array; w: number; h: number; png: boolean }> {
  let img: Decoded;
  try {
    img = decoded ?? (await decodeImage(file));
  } catch {
    throw new ConvertError("DECODE_FAILED", "This image couldn't be read. Try exporting it as JPG or PNG.");
  }
  const ext = extOf(file.name);
  const png = ext === "png" || ext === "gif" || ext === "svg" || ext === "bmp" || ext === "tif" || ext === "tiff" || file.type === "image/png";
  let canvas: HTMLCanvasElement;
  try {
    canvas = drawToCanvas(img, rotation, MAX_EDGE, png ? undefined : "#ffffff");
  } catch {
    throw new ConvertError("NO_CANVAS", "Your browser couldn't process this image.");
  } finally {
    if (!decoded) release(img);
  }
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, png ? "image/png" : "image/jpeg", 0.9));
  if (!blob) throw new ConvertError("ENCODE_FAILED", "Your browser couldn't process this image.");
  return { bytes: new Uint8Array(await blob.arrayBuffer()), w: canvas.width, h: canvas.height, png };
}

export async function imageToPdf(file: File, rotation: number, pageSize: PageSize, decoded?: Decoded): Promise<Uint8Array> {
  const { bytes, w, h, png } = await rasterise(file, rotation, decoded);
  const doc = await PDFDocument.create();
  const image = png ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  let pw: number, ph: number, x: number, y: number, dw: number, dh: number;
  if (pageSize === "fit") {
    const long = 842;
    const s = long / Math.max(w, h);
    pw = w * s;
    ph = h * s;
    x = 0;
    y = 0;
    dw = pw;
    dh = ph;
  } else {
    const [a, b] = PAGE_SIZES[pageSize];
    const landscape = w > h;
    pw = landscape ? b : a;
    ph = landscape ? a : b;
    const s = Math.min((pw - MARGIN * 2) / w, (ph - MARGIN * 2) / h);
    dw = w * s;
    dh = h * s;
    x = (pw - dw) / 2;
    y = (ph - dh) / 2;
  }
  const page = doc.addPage([pw, ph]);
  page.drawImage(image, { x, y, width: dw, height: dh });
  return doc.save();
}

export async function pdfToPdf(file: File, rotation: number): Promise<{ bytes: Uint8Array; pages: number }> {
  const src = new Uint8Array(await file.arrayBuffer());
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(src, { ignoreEncryption: false });
  } catch (e) {
    const msg = String(e);
    if (/encrypt/i.test(msg)) throw new ConvertError("ENCRYPTED", "This PDF is password protected. Remove the password first.");
    throw new ConvertError("BAD_PDF", "This PDF couldn't be read. It may be damaged.");
  }
  if (rotation) {
    for (const p of doc.getPages()) p.setRotation(degrees((p.getRotation().angle + rotation) % 360));
    return { bytes: await doc.save(), pages: doc.getPageCount() };
  }
  return { bytes: src, pages: doc.getPageCount() };
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((ok, bad) => {
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      bad(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      ok();
    }, ms);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });

export async function serverConvert(file: File, pageSize: PageSize, signal?: AbortSignal, onRetry?: (seconds: number) => void): Promise<Uint8Array> {
  const fd = new FormData();
  fd.append("file", file, file.name);
  fd.append("options", JSON.stringify({ pageSize: pageSize === "fit" ? "A4" : pageSize }));
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch("/api/convert", { method: "POST", body: fd, signal });
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      throw new ConvertError("NETWORK", "Couldn't reach the converter. Check your connection and try again.");
    }
    if (res.ok) {
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length < 5 || String.fromCharCode(...bytes.subarray(0, 4)) !== "%PDF")
        throw new ConvertError("BAD_OUTPUT", "The converter returned something that isn't a PDF.");
      return bytes;
    }
    // Busy server: wait and retry a few times before giving up.
    if ((res.status === 429 || res.status === 503) && attempt < 4) {
      const ra = Number(res.headers.get("retry-after"));
      const wait = Math.min(60, Number.isFinite(ra) && ra > 0 ? ra : 2 * (attempt + 1)) * 1000;
      onRetry?.(Math.round(wait / 1000));
      await sleep(wait, signal);
      continue;
    }
    let code = "INTERNAL";
    let message = res.status === 502 || res.status === 503 || res.status === 504 ? "The converter is unavailable right now. Try again in a moment." : res.status === 429 ? "The converter is busy. Try again in a moment." : `Conversion failed (${res.status}).`;
    try {
      const body = (await res.json()) as { error?: { code?: string; message?: string } };
      code = body.error?.code ?? code;
      if (res.status !== 429) message = body.error?.message ?? message;
    } catch {
      /* non-JSON error */
    }
    throw new ConvertError(code, message);
  }
}

export async function countPages(bytes: Uint8Array): Promise<number> {
  try {
    return (await PDFDocument.load(bytes, { ignoreEncryption: true })).getPageCount();
  } catch {
    return 0;
  }
}

export async function mergeAll(items: Item[], title: string): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  out.setTitle(title);
  out.setProducer("pdf.realsid08.me");
  out.setCreator("pdf.realsid08.me");
  for (const it of items) {
    if (it.status !== "ready" || !it.pdf) continue;
    const src = await PDFDocument.load(it.pdf, { ignoreEncryption: true });
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const p of pages) out.addPage(p);
  }
  return out.save();
}
