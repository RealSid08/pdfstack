import { PDFDocument, degrees } from "pdf-lib";
import { PAGE_SIZES, type Item, type PageSize } from "./types";
import { extOf } from "./detect";

const MAX_EDGE = 4000; // px, keeps canvas memory sane on phones
const MARGIN = 24; // pt

export class ConvertError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

async function decodeImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  const ext = extOf(file.name);
  if (ext === "svg" || file.type === "image/svg+xml") {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = "async";
      await new Promise<void>((ok, bad) => {
        img.onload = () => ok();
        img.onerror = () => bad(new Error("bad svg"));
        img.src = url;
      });
      if (!img.naturalWidth) throw new Error("empty svg");
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  try {
    return await createImageBitmap(file);
  } catch {
    throw new ConvertError("DECODE_FAILED", "This image couldn't be read. Try exporting it as JPG or PNG.");
  }
}

function sizeOf(img: ImageBitmap | HTMLImageElement): [number, number] {
  return "naturalWidth" in img ? [img.naturalWidth, img.naturalHeight] : [img.width, img.height];
}

/** Rasterise an image to JPEG/PNG bytes, applying rotation and an edge cap. */
export async function rasterise(file: File, rotation: number): Promise<{ bytes: Uint8Array; w: number; h: number; png: boolean }> {
  const img = await decodeImage(file);
  const [iw, ih] = sizeOf(img);
  const scale = Math.min(1, MAX_EDGE / Math.max(iw, ih));
  const sw = Math.max(1, Math.round(iw * scale));
  const sh = Math.max(1, Math.round(ih * scale));
  const rotated = rotation === 90 || rotation === 270;
  const canvas = document.createElement("canvas");
  canvas.width = rotated ? sh : sw;
  canvas.height = rotated ? sw : sh;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ConvertError("NO_CANVAS", "Your browser couldn't process this image.");
  const ext = extOf(file.name);
  const png = ext === "png" || ext === "gif" || ext === "svg" || ext === "bmp" || file.type === "image/png";
  if (!png) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(img, -sw / 2, -sh / 2, sw, sh);
  if ("close" in img) img.close();
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, png ? "image/png" : "image/jpeg", 0.9));
  if (!blob) throw new ConvertError("ENCODE_FAILED", "Your browser couldn't process this image.");
  return { bytes: new Uint8Array(await blob.arrayBuffer()), w: canvas.width, h: canvas.height, png };
}

export async function imageToPdf(file: File, rotation: number, pageSize: PageSize): Promise<Uint8Array> {
  const { bytes, w, h, png } = await rasterise(file, rotation);
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

export async function serverConvert(file: File, pageSize: PageSize, signal?: AbortSignal): Promise<Uint8Array> {
  const fd = new FormData();
  fd.append("file", file, file.name);
  fd.append("options", JSON.stringify({ pageSize: pageSize === "fit" ? "A4" : pageSize }));
  let res: Response;
  try {
    res = await fetch("/api/convert", { method: "POST", body: fd, signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ConvertError("NETWORK", "Couldn't reach the converter. Check your connection and try again.");
  }
  if (!res.ok) {
    let code = "INTERNAL";
    let message = res.status === 502 || res.status === 503 || res.status === 504 ? "The converter is unavailable right now. Try again in a moment." : `Conversion failed (${res.status}).`;
    try {
      const body = (await res.json()) as { error?: { code?: string; message?: string } };
      code = body.error?.code ?? code;
      message = body.error?.message ?? message;
    } catch {
      /* non-JSON error */
    }
    throw new ConvertError(code, message);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length < 5 || String.fromCharCode(...bytes.subarray(0, 4)) !== "%PDF")
    throw new ConvertError("BAD_OUTPUT", "The converter returned something that isn't a PDF.");
  return bytes;
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
    if (!it.pdf) continue;
    const src = await PDFDocument.load(it.pdf, { ignoreEncryption: true });
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const p of pages) out.addPage(p);
  }
  return out.save();
}
