export type PageSize = "A4" | "Letter" | "fit";

export type Route = "image" | "pdf" | "server" | "unsupported";

export type Status = "queued" | "converting" | "ready" | "error";

export interface Item {
  id: string;
  file: File;
  name: string;
  ext: string;
  route: Route;
  status: Status;
  rotation: 0 | 90 | 180 | 270;
  thumb?: string;
  pages?: number;
  pdf?: Uint8Array;
  error?: string;
  note?: string;
}

export interface Capabilities {
  serverExtensions: string[];
  maxFileBytes: number;
  pageSizes: string[];
}

export const PAGE_SIZES: Record<Exclude<PageSize, "fit">, [number, number]> = {
  A4: [595.28, 841.89],
  Letter: [612, 792],
};
