import { Layers } from "lucide-react";

export function Header() {
  return (
    <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 pt-5 pb-2 sm:px-6 sm:pt-8">
      <a href="/" className="flex items-center gap-2.5" aria-label="Stack home">
        <span className="grid size-9 place-items-center rounded-xl bg-accent text-white shadow-card">
          <Layers className="size-5" strokeWidth={2.25} />
        </span>
        <span className="text-lg font-semibold tracking-tight">Stack</span>
      </a>
      <span className="text-xs text-muted">Any file to PDF</span>
    </header>
  );
}
