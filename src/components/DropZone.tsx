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
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-card/60 px-4 py-4 text-sm font-medium text-muted transition hover:border-accent hover:text-accent active:scale-[.99]"
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
        className="group pop flex min-h-[38vh] w-full flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-line bg-card/70 px-6 py-12 text-center shadow-card transition hover:border-accent hover:bg-card active:scale-[.995] sm:min-h-[42vh]"
      >
        <span className="grid size-16 place-items-center rounded-2xl bg-accent-soft text-accent transition group-hover:scale-105">
          <Upload className="size-7" strokeWidth={2} />
        </span>
        <span className="space-y-1.5">
          <span className="block text-xl font-semibold tracking-tight sm:text-2xl">
            <span className="sm:hidden">Tap to add files</span>
            <span className="hidden sm:inline">Drop files here or click to browse</span>
          </span>
          <span className="block text-sm text-muted">Images, documents, spreadsheets, presentations and more. Mix file types in one PDF.</span>
        </span>
        {hint}
      </button>
    </>
  );
}
