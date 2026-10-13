import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, RotateCw, X, AlertCircle, Check, Loader2, ChevronUp, ChevronDown, RefreshCw, FileText, Image as ImageIcon, File as FileIcon, Table2, FileType2 } from "lucide-react";
import type { Item } from "../lib/types";
import { formatBytes, kindLabel } from "../lib/detect";

interface Props {
  item: Item;
  index: number;
  count: number;
  onRemove: (id: string) => void;
  onRotate: (id: string) => void;
  onRetry: (id: string) => void;
  onMove: (from: number, to: number) => void;
}

function KindIcon({ item }: { item: Item }) {
  const cls = "size-6";
  if (item.route === "image") return <ImageIcon className={`${cls} text-amber-500`} />;
  if (item.route === "pdf") return <FileText className={`${cls} text-accent`} />;
  if (["xlsx", "xls", "csv", "ods"].includes(item.ext)) return <Table2 className={`${cls} text-emerald-500`} />;
  if (["docx", "doc", "odt", "rtf", "md", "txt"].includes(item.ext)) return <FileType2 className={`${cls} text-blue-500`} />;
  return <FileIcon className={`${cls} text-muted`} />;
}

export function FileCard({ item, index, count, onRemove, onRotate, onRetry, onMove }: Props) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Translate.toString(transform), transition };
  const busy = item.status === "converting" || item.status === "queued";
  const canRotate = item.route === "image" || item.route === "pdf";
  const rotatedDeg = ((item.rotation % 360) + 360) % 360;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`pop relative flex items-center gap-2.5 rounded-2xl border border-line bg-card p-2.5 shadow-card sm:gap-4 sm:p-3 ${
        isDragging ? "z-10 shadow-lift ring-2 ring-accent/40" : ""
      } ${item.status === "error" ? "border-danger/40" : ""}`}
    >
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        type="button"
        aria-label={`Drag to reorder ${item.name}`}
        className="drag-handle -ml-1 grid h-12 w-8 shrink-0 touch-none cursor-grab place-items-center rounded-lg text-muted/70 hover:bg-paper hover:text-ink active:cursor-grabbing"
      >
        <GripVertical className="size-5" />
      </button>

      <div className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-paper sm:size-16">
        {item.thumb ? (
          <img
            src={item.thumb}
            alt=""
            className="size-full object-cover transition-transform"
            style={{ transform: item.route === "image" ? `rotate(${item.rotation}deg)` : undefined }}
            draggable={false}
          />
        ) : busy ? (
          <div className="shimmer size-full" />
        ) : (
          <div className="grid size-full place-items-center text-muted">
            <KindIcon item={item} />
          </div>
        )}
        <span className="absolute left-1 top-1 rounded-md bg-ink/80 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-paper">
          {index + 1}
        </span>
        {rotatedDeg > 0 && (
          <span className="absolute bottom-1 right-1 rounded bg-ink/80 px-1 py-0.5 text-[9px] font-semibold text-paper">
            {rotatedDeg}°
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink" title={item.name}>
          {item.name}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
          <span>{kindLabel(item.ext, item.route)}</span>
          <span aria-hidden>·</span>
          <span>{formatBytes(item.file.size)}</span>
          {item.status === "ready" && item.pages != null && (
            <>
              <span aria-hidden>·</span>
              <span>
                {item.pages} {item.pages === 1 ? "page" : "pages"}
              </span>
            </>
          )}
        </p>
        <p className="mt-1 flex items-center gap-1 text-xs">
          {item.status === "ready" && (
            <span className="inline-flex items-center gap-1 text-ok">
              <Check className="size-3.5" /> Ready
            </span>
          )}
          {busy && (
            <span className="inline-flex items-center gap-1 text-muted">
              <Loader2 className="size-3.5 animate-spin text-accent" />{" "}
              {item.note ?? (item.route === "server" ? "Converting..." : "Preparing...")}
            </span>
          )}
          {item.status === "error" && (
            <span className="inline-flex items-start gap-1 text-danger">
              <AlertCircle className="mt-px size-3.5 shrink-0" />
              <span>
                {item.error}{" "}
                {item.route !== "unsupported" && (
                  <button type="button" onClick={() => onRetry(item.id)} className="inline-flex items-center gap-0.5 font-medium underline underline-offset-2 hover:opacity-80">
                    <RefreshCw className="size-3" /> Retry
                  </button>
                )}
              </span>
            </span>
          )}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <div className="flex flex-col">
          <IconButton label="Move up" disabled={index === 0} onClick={() => onMove(index, index - 1)}>
            <ChevronUp className="size-4" />
          </IconButton>
          <IconButton label="Move down" disabled={index === count - 1} onClick={() => onMove(index, index + 1)}>
            <ChevronDown className="size-4" />
          </IconButton>
        </div>
        {canRotate && (
          <IconButton label="Rotate 90° clockwise" onClick={() => onRotate(item.id)} disabled={busy}>
            <RotateCw className="size-4" />
          </IconButton>
        )}
        <IconButton label={`Remove ${item.name}`} onClick={() => onRemove(item.id)} danger>
          <X className="size-4" />
        </IconButton>
      </div>
    </li>
  );
}

function IconButton({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`grid size-9 place-items-center rounded-lg text-muted transition hover:bg-paper active:scale-95 disabled:opacity-30 disabled:hover:bg-transparent ${
        danger ? "hover:text-danger active:text-danger" : "hover:text-ink active:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
