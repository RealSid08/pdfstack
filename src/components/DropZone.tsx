import { useId, useRef, type ReactNode } from "react";
import { Upload, Plus } from "lucide-react";

interface Props {
  onFiles: (files: FileList | File[]) => void;
  compact?: boolean;
  hint?: ReactNode;
}

export function DropZone({ onFiles, compact, hint }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const open = () => inputRef.current?.click();

  const input = (
    <input
      ref={inputRef}
      id={id}
      type="file"
      multiple
      className="sr-only"
      onChange={(e) => {
        if (e.target.files?.length) onFiles(e.target.files);
        e.target.value = "";
      }}
    />
  );

  if (compact) {
    return (
      <>
        {input}
        <button
          type="button"
          onClick={open}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line bg-card/60 px-4 py-4 text-sm font-medium text-muted transition hover:border-accent hover:bg-card hover:text-accent active:scale-[.99]"
        >
          <Plus className="size-4" /> Add more files
        </button>
      </>
    );
  }

  return (
    <>
      {input}
      <button
        type="button"
        onClick={open}
        className="group pop flex min-h-[30vh] w-full flex-col items-center justify-center gap-3.5 rounded-3xl border-2 border-dashed border-line bg-card/70 px-6 py-9 text-center shadow-card transition hover:border-accent hover:bg-card active:scale-[.995] sm:min-h-[34vh]"
      >
        <span className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent shadow-xs transition group-hover:scale-105">
          <Upload className="size-6" strokeWidth={2.2} />
        </span>
        <div className="space-y-1">
          <span className="block text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            <span className="sm:hidden">Tap to choose files</span>
            <span className="hidden sm:inline">Drop files here or click to browse</span>
          </span>
          <span className="block text-xs text-muted sm:text-sm">
            PDFs, images, Word docs, spreadsheets, or paste from clipboard
          </span>
        </div>
        {hint}
      </button>
    </>
  );
}
