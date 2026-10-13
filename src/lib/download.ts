export function safeFilename(name: string): string {
  // Strip control characters and invalid filename punctuation while keeping unicode letters/numbers
  const base = name
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    // Replace ASCII control codes (0-31) safely without regex control chars
    .split("")
    .filter((ch) => ch.charCodeAt(0) >= 32)
    .join("")
    .replace(/\s+/g, " ")
    .slice(0, 120) || "combined";
  return base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
}

export function canShareFiles(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;
  if (typeof navigator.canShare !== "function") return false;
  try {
    // Probe support for sharing File objects
    const testFile = new File(["test"], "test.pdf", { type: "application/pdf" });
    return navigator.canShare({ files: [testFile] });
  } catch {
    return false;
  }
}

export async function shareFile(file: File): Promise<boolean> {
  if (!canShareFiles()) return false;
  try {
    await navigator.share({
      files: [file],
      title: file.name,
      text: "PDF created with Stack",
    });
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
  // target="_blank" is helpful for iOS Safari when download attribute is ignored on blob URLs
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Retain long enough for mobile browser download managers to finish spooling
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}
