import {
  FileText,
  Image as ImageIcon,
  FileType2,
  GripVertical,
  RotateCw,
  Download,
  Check,
} from "lucide-react";

export function WorkflowSteps() {
  return (
    <div className="mt-8 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
      {/* Step 1: Add */}
      <div className="group relative flex flex-col rounded-2xl border border-line bg-card p-4 shadow-card transition hover:border-accent/40">
        <div className="relative mb-3 flex h-28 w-full flex-col items-center justify-center overflow-hidden rounded-xl bg-paper/80 p-2.5">
          <div className="relative flex w-full max-w-[190px] flex-col gap-1.5">
            <div className="flex items-center gap-2 rounded-lg border border-line bg-card px-2.5 py-1.5 shadow-xs transition-transform group-hover:-translate-y-0.5">
              <span className="grid size-5 place-items-center rounded bg-accent/10 text-accent">
                <FileText className="size-3" />
              </span>
              <span className="truncate text-xs font-medium text-ink">Contract.pdf</span>
              <span className="ml-auto text-[10px] text-muted">2.4 MB</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-line bg-card px-2.5 py-1.5 shadow-xs transition-transform group-hover:translate-x-0.5">
              <span className="grid size-5 place-items-center rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <FileType2 className="size-3" />
              </span>
              <span className="truncate text-xs font-medium text-ink">Notes.docx</span>
              <span className="ml-auto text-[10px] text-muted">140 KB</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-line bg-card px-2.5 py-1.5 shadow-xs transition-transform group-hover:translate-y-0.5">
              <span className="grid size-5 place-items-center rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <ImageIcon className="size-3" />
              </span>
              <span className="truncate text-xs font-medium text-ink">Photo.jpg</span>
              <span className="ml-auto text-[10px] text-muted">3.1 MB</span>
            </div>
          </div>
        </div>

        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5">
            <span className="grid size-4.5 place-items-center rounded-full bg-accent text-[10px] font-bold text-white">
              1
            </span>
            <h2 className="text-sm font-semibold text-ink">Add files</h2>
          </div>
          <p className="text-xs leading-relaxed text-muted">
            Drop files or paste images straight from your clipboard.
          </p>
        </div>
      </div>

      {/* Step 2: Arrange */}
      <div className="group relative flex flex-col rounded-2xl border border-line bg-card p-4 shadow-card transition hover:border-accent/40">
        <div className="relative mb-3 flex h-28 w-full flex-col items-center justify-center overflow-hidden rounded-xl bg-paper/80 p-2.5">
          <div className="flex w-full max-w-[190px] flex-col gap-1.5">
            <div className="flex items-center gap-2 rounded-lg border border-line bg-card px-2.5 py-1.5 shadow-xs">
              <GripVertical className="size-3 text-muted/50" />
              <span className="grid size-4 place-items-center rounded bg-ink/80 text-[9px] font-bold text-paper">
                1
              </span>
              <span className="truncate text-xs font-medium text-ink">Notes.docx</span>
              <span className="ml-auto text-[10px] text-muted">p. 1</span>
            </div>

            <div className="flex items-center gap-2 rounded-lg border-2 border-accent/60 bg-accent-soft/30 px-2.5 py-1.5 shadow-sm ring-1 ring-accent/30 transition-transform group-hover:scale-[1.02]">
              <GripVertical className="size-3 text-accent" />
              <span className="grid size-4 place-items-center rounded bg-accent text-[9px] font-bold text-white">
                2
              </span>
              <span className="truncate text-xs font-medium text-ink">Contract.pdf</span>
              <span className="ml-auto text-[10px] font-medium text-accent">p. 1-3</span>
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-line bg-card px-2.5 py-1.5 shadow-xs">
              <GripVertical className="size-3 text-muted/50" />
              <span className="grid size-4 place-items-center rounded bg-ink/80 text-[9px] font-bold text-paper">
                3
              </span>
              <span className="truncate text-xs font-medium text-ink">Photo.jpg</span>
              <RotateCw className="ml-auto size-3 text-muted" />
            </div>
          </div>
        </div>

        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5">
            <span className="grid size-4.5 place-items-center rounded-full bg-accent text-[10px] font-bold text-white">
              2
            </span>
            <h2 className="text-sm font-semibold text-ink">Arrange order</h2>
          </div>
          <p className="text-xs leading-relaxed text-muted">
            Drag cards to reorder, or rotate sideways images.
          </p>
        </div>
      </div>

      {/* Step 3: Download */}
      <div className="group relative flex flex-col rounded-2xl border border-line bg-card p-4 shadow-card transition hover:border-accent/40">
        <div className="relative mb-3 flex h-28 w-full flex-col items-center justify-center overflow-hidden rounded-xl bg-paper/80 p-2.5">
          <div className="relative flex items-center justify-center">
            <div className="absolute -top-1.5 h-18 w-26 -rotate-6 rounded-lg border border-line/60 bg-card/60 shadow-xs" />
            <div className="absolute -top-0.5 h-18 w-26 rotate-3 rounded-lg border border-line/80 bg-card/80 shadow-xs" />
            <div className="relative flex h-20 w-28 flex-col justify-between rounded-xl border border-line bg-card p-2 shadow-md">
              <div className="flex items-center justify-between">
                <span className="rounded bg-accent px-1.5 py-0.5 text-[9px] font-bold text-white">
                  PDF
                </span>
                <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-ok">
                  <Check className="size-2.5" /> 5 pages
                </span>
              </div>
              <p className="truncate text-[10px] font-semibold text-ink">combined.pdf</p>
              <div className="flex items-center justify-center gap-1 rounded bg-accent py-0.5 text-[8px] font-semibold text-white shadow-xs">
                <Download className="size-2" /> Download
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5">
            <span className="grid size-4.5 place-items-center rounded-full bg-accent text-[10px] font-bold text-white">
              3
            </span>
            <h2 className="text-sm font-semibold text-ink">Download one PDF</h2>
          </div>
          <p className="text-xs leading-relaxed text-muted">
            Choose page layout and export your combined document.
          </p>
        </div>
      </div>
    </div>
  );
}
