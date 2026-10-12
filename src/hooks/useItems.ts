import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { Capabilities, Item, PageSize } from "../lib/types";
import { routeFor, extOf } from "../lib/detect";
import { ConvertError, countPages, imageToPdf, pdfToPdf, serverConvert } from "../lib/convert";
import { imageThumb, pdfThumb } from "../lib/thumbs";
import { decodeImage, release, type Decoded } from "../lib/image";

type Action =
  | { type: "add"; items: Item[] }
  | { type: "remove"; id: string }
  | { type: "clear" }
  | { type: "move"; from: number; to: number }
  | { type: "patch"; id: string; patch: Partial<Item> }
  | { type: "requeue"; ids?: string[]; routes?: Item["route"][] };

function reducer(state: Item[], a: Action): Item[] {
  switch (a.type) {
    case "add":
      return [...state, ...a.items];
    case "remove":
      return state.filter((i) => i.id !== a.id);
    case "clear":
      return [];
    case "move": {
      if (a.from === a.to || a.from < 0 || a.to < 0 || a.from >= state.length || a.to >= state.length) return state;
      const next = state.slice();
      const [moved] = next.splice(a.from, 1);
      next.splice(a.to, 0, moved);
      return next;
    }
    case "patch":
      return state.map((i) => (i.id === a.id ? { ...i, ...a.patch } : i));
    case "requeue":
      return state.map((i) =>
        (a.ids ? a.ids.includes(i.id) : true) && (a.routes ? a.routes.includes(i.route) : true) && i.route !== "unsupported"
          ? { ...i, status: "queued", error: undefined }
          : i,
      );
  }
}

const CONCURRENCY = 2;

export function useItems(caps: Capabilities | null) {
  const [items, dispatch] = useReducer(reducer, []);
  const [pageSize, setPageSizeState] = useState<PageSize>("A4");
  const inflight = useRef(new Set<string>());
  const latest = useRef({ items, pageSize });
  latest.current = { items, pageSize };

  const addFiles = useCallback(
    (files: Iterable<File>) => {
      const list = Array.from(files).filter((f) => f.size > 0 || f.type);
      if (!list.length) return;
      const now = Date.now();
      const next: Item[] = list.map((file, n) => {
        const route = routeFor(file, caps);
        const tooBig = route === "server" && caps && file.size > caps.maxFileBytes;
        return {
          id: `${now}-${n}-${Math.random().toString(36).slice(2, 8)}`,
          file,
          name: file.name,
          ext: extOf(file.name),
          route,
          rotation: 0,
          status: route === "unsupported" || tooBig ? "error" : "queued",
          error:
            route === "unsupported"
              ? "This file type isn't supported yet."
              : tooBig
                ? `Too large to convert (limit ${Math.round(caps.maxFileBytes / 1024 / 1024)} MB).`
                : undefined,
        };
      });
      dispatch({ type: "add", items: next });
    },
    [caps],
  );

  // Conversion scheduler: pick queued items, up to CONCURRENCY at a time.
  useEffect(() => {
    const queued = items.filter((i) => i.status === "queued" && !inflight.current.has(i.id));
    const slots = CONCURRENCY - inflight.current.size;
    for (const item of queued.slice(0, Math.max(0, slots))) {
      inflight.current.add(item.id);
      dispatch({ type: "patch", id: item.id, patch: { status: "converting", error: undefined } });
      const ps = latest.current.pageSize;
      (async () => {
        const patch: Partial<Item> = {};
        try {
          if (item.route === "image") {
            let decoded: Decoded | undefined;
            try {
              decoded = await decodeImage(item.file);
            } catch {
              throw new ConvertError("DECODE_FAILED", "This image couldn't be read. Try exporting it as JPG or PNG.");
            }
            try {
              if (!item.thumb) patch.thumb = imageThumb(decoded);
              patch.pdf = await imageToPdf(item.file, item.rotation, ps, decoded);
            } finally {
              release(decoded);
            }
            patch.pages = 1;
          } else if (item.route === "pdf") {
            const r = await pdfToPdf(item.file, item.rotation);
            patch.pdf = r.bytes;
            patch.pages = r.pages;
            patch.thumb = item.thumb ?? (await pdfThumb(r.bytes));
          } else {
            patch.pdf = await serverConvert(item.file, ps);
            patch.pages = await countPages(patch.pdf);
            patch.thumb = await pdfThumb(patch.pdf);
          }
          patch.status = "ready";
        } catch (e) {
          patch.status = "error";
          patch.error = e instanceof ConvertError ? e.message : "Something went wrong converting this file.";
        } finally {
          inflight.current.delete(item.id);
          // Only apply if the item still exists and wasn't re-queued meanwhile.
          const cur = latest.current.items.find((i) => i.id === item.id);
          if (cur && cur.status === "converting") dispatch({ type: "patch", id: item.id, patch });
          else if (cur) dispatch({ type: "patch", id: item.id, patch: { thumb: cur.thumb ?? patch.thumb } });
        }
      })();
    }
  }, [items]);

  const remove = useCallback((id: string) => dispatch({ type: "remove", id }), []);
  const clear = useCallback(() => dispatch({ type: "clear" }), []);
  const move = useCallback((from: number, to: number) => dispatch({ type: "move", from, to }), []);
  const retry = useCallback((id: string) => dispatch({ type: "requeue", ids: [id] }), []);
  const rotate = useCallback((id: string) => {
    const cur = latest.current.items.find((i) => i.id === id);
    if (!cur) return;
    const rotation = (((cur.rotation + 90) % 360) as Item["rotation"]);
    dispatch({ type: "patch", id, patch: { rotation, status: "queued", error: undefined } });
  }, []);
  const setPageSize = useCallback((ps: PageSize) => {
    setPageSizeState(ps);
    latest.current.pageSize = ps;
    dispatch({ type: "requeue", routes: ["image", "server"] });
  }, []);

  return { items, pageSize, setPageSize, addFiles, remove, clear, move, retry, rotate };
}
