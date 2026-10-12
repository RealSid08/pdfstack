import type { Capabilities, Route } from "./types";

export const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif", "svg"]);
export const PDF_EXTS = new Set(["pdf"]);

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i + 1).toLowerCase();
}

export function routeFor(file: File, caps: Capabilities | null): Route {
  const ext = extOf(file.name);
  if (ext === "pdf" || file.type === "application/pdf") return "pdf";
  if (IMAGE_EXTS.has(ext) || (file.type.startsWith("image/") && !/hei[cf]/.test(file.type))) return "image";
  if (caps?.serverExtensions.includes(ext)) return "server";
  return caps ? "unsupported" : "server";
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function kindLabel(ext: string, route: Route): string {
  if (route === "pdf") return "PDF";
  if (route === "image") return ext === "jpeg" ? "JPG" : ext.toUpperCase() || "Image";
  return ext.toUpperCase() || "File";
}

export function stripExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i <= 0 ? name : name.slice(0, i);
}
