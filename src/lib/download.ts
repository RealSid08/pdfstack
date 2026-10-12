export function safeFilename(name: string): string {
  const base = name.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/\s+/g, " ").slice(0, 120) || "combined";
  return base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
}

export function canShareFiles(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.canShare === "function" && typeof navigator.share === "function";
}

export async function shareFile(file: File): Promise<boolean> {
  if (!canShareFiles() || !navigator.canShare({ files: [file] })) return false;
  try {
    await navigator.share({ files: [file], title: file.name });
    return true;
  } catch (e) {
    if ((e as Error).name === "AbortError") return true;
    return false;
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
