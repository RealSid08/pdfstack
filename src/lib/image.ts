import { extOf } from "./detect";

export const HEIC_EXTS = new Set(["heic", "heif", "hif"]);
export const TIFF_EXTS = new Set(["tif", "tiff"]);

export class DecodeError extends Error {}

export type Decoded = ImageBitmap | HTMLImageElement;

export function sizeOf(img: Decoded): [number, number] {
  return "naturalWidth" in img ? [img.naturalWidth, img.naturalHeight] : [img.width, img.height];
}

export function release(img: Decoded) {
  if ("close" in img) img.close();
}

async function viaImageElement(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((ok, bad) => {
      img.onload = () => ok();
      img.onerror = () => bad(new DecodeError("bad image"));
      img.src = url;
    });
    if (!img.naturalWidth) throw new DecodeError("empty image");
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function viaHeic(file: File): Promise<ImageBitmap> {
  const { heicTo } = await import("heic-to");
  return heicTo({ blob: file, type: "bitmap" });
}

async function viaTiff(file: File): Promise<ImageBitmap> {
  const UTIF = (await import("utif2")).default;
  const buf = await file.arrayBuffer();
  const ifds = UTIF.decode(buf);
  if (!ifds.length) throw new DecodeError("empty tiff");
  // Pick the largest page (TIFFs often carry thumbnails first).
  let best = ifds[0];
  for (const ifd of ifds) {
    UTIF.decodeImage(buf, ifd);
    if ((ifd.width ?? 0) * (ifd.height ?? 0) > (best.width ?? 0) * (best.height ?? 0)) best = ifd;
  }
  const rgba = UTIF.toRGBA8(best);
  const pixels = new Uint8ClampedArray(rgba.length);
  pixels.set(rgba);
  const data = new ImageData(pixels, best.width, best.height);
  return createImageBitmap(data);
}

/** Decode any supported raster/vector image into something drawable on a canvas. */
export async function decodeImage(file: File): Promise<Decoded> {
  const ext = extOf(file.name);
  try {
    if (ext === "svg" || file.type === "image/svg+xml") return await viaImageElement(file);
    if (HEIC_EXTS.has(ext) || /hei[cf]/.test(file.type)) return await viaHeic(file);
    if (TIFF_EXTS.has(ext) || file.type === "image/tiff") return await viaTiff(file);
    try {
      return await createImageBitmap(file);
    } catch {
      return await viaImageElement(file);
    }
  } catch (e) {
    if (e instanceof DecodeError) throw e;
    throw new DecodeError(String(e));
  }
}

/** Draw a decoded image to a canvas with optional rotation and edge cap. */
export function drawToCanvas(img: Decoded, rotation: number, maxEdge: number, background?: string): HTMLCanvasElement {
  const [iw, ih] = sizeOf(img);
  const scale = Math.min(1, maxEdge / Math.max(iw, ih));
  const sw = Math.max(1, Math.round(iw * scale));
  const sh = Math.max(1, Math.round(ih * scale));
  const rotated = rotation === 90 || rotation === 270;
  const canvas = document.createElement("canvas");
  canvas.width = rotated ? sh : sw;
  canvas.height = rotated ? sw : sh;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new DecodeError("no canvas");
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(img, -sw / 2, -sh / 2, sw, sh);
  return canvas;
}
