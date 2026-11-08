"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Renders every page of a PDF (bytes or a URL) with pdf.js; `overlay(pageNumber)` is drawn on top of each page in percent coordinates (position:absolute; left/top/width/height in %). */
export default function PdfPages({ src, overlay, onPage }: { src: ArrayBuffer | string; overlay?: (page: number) => ReactNode; onPage?: (page: number, e: React.MouseEvent<HTMLDivElement>) => void }) {
  const [pages, setPages] = useState<number[]>([]), [err, setErr] = useState(""), box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const data = typeof src === "string" ? new Uint8Array(await (await fetch(src)).arrayBuffer()) : new Uint8Array(src.slice(0));
        const doc = await pdfjs.getDocument({ data }).promise;
        if (dead) return;
        setPages(Array.from({ length: doc.numPages }, (_, i) => i + 1));
        const w = Math.min(box.current?.clientWidth || 800, 900) * (window.devicePixelRatio || 1);
        for (let n = 1; n <= doc.numPages && !dead; n++) {
          const pg = await doc.getPage(n), vp0 = pg.getViewport({ scale: 1 }), vp = pg.getViewport({ scale: w / vp0.width });
          const cv = await waitFor(() => box.current?.querySelector<HTMLCanvasElement>(`canvas[data-p="${n}"]`));
          if (!cv || dead) return;
          cv.width = vp.width; cv.height = vp.height;
          await pg.render({ canvasContext: cv.getContext("2d")!, viewport: vp, canvas: cv }).promise;
        }
      } catch (e) { console.error("pdf.js:", e); if (!dead) setErr("This PDF couldn't be displayed: " + ((e as Error)?.message ?? e)); }
    })();
    return () => { dead = true; };
  }, [src]);
  if (err) return <p role="alert" style={{ color: "#b00020" }}>{err}</p>;
  return (
    <div ref={box} style={{ display: "grid", gap: 14, maxWidth: 900 }}>
      {!pages.length && <p className="sub">Loading the document…</p>}
      {pages.map((n) => (
        <div key={n} data-page={n} onClick={onPage ? (e) => onPage(n, e) : undefined} style={{ position: "relative", boxShadow: "0 1px 6px #0003", background: "#fff", lineHeight: 0, cursor: onPage ? "crosshair" : undefined }}>
          <canvas data-p={n} style={{ width: "100%", height: "auto" }} />
          {overlay?.(n)}
        </div>
      ))}
    </div>
  );
}

// Loaded as plain static files (public/pdfjs, copied from pdfjs-dist/legacy/build): bundling pdf.js through webpack breaks it.
export async function loadPdfjs() {
  const url = "/pdfjs/pdf.min.mjs", pdfjs = await import(/* webpackIgnore: true */ url);
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
  return pdfjs;
}

/** Reads each page's text positions and form fields, ready for lib/pdf-detect. */
export async function readPages(bytes: ArrayBuffer): Promise<import("@/lib/pdf-detect").PageData[]> {
  const doc = await (await loadPdfjs()).getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise, pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const pg = await doc.getPage(n), [x0, y0, x1, y1] = pg.view, [text, ann] = await Promise.all([pg.getTextContent(), pg.getAnnotations()]);
    pages.push({ w: x1 - x0, h: y1 - y0,
      items: text.items.filter((i: any) => "str" in i && i.str.trim()).map((i: any) => ({ str: i.str as string, x: i.transform[4] - x0, y: i.transform[5] - y0, w: i.width as number, h: (i.height as number) || Math.abs(i.transform[3]) })),
      annots: ann.filter((a: any) => a.subtype === "Widget" && a.rect && !a.readOnly).map((a: any) => ({ kind: a.fieldType === "Sig" ? "signature" : a.fieldType === "Ch" ? "dropdown" : a.fieldType === "Btn" ? (a.pushButton ? null : "checkbox") : "text", name: String(a.fieldName ?? ""), options: (a.options ?? []).map((o: any) => String(o.displayValue ?? o.exportValue ?? o)), rect: [a.rect[0] - x0, a.rect[1] - y0, a.rect[2] - x0, a.rect[3] - y0] })).filter((a: any) => a.kind) });
  }
  return pages;
}

const waitFor = async <T,>(f: () => T | null | undefined) => { for (let i = 0; i < 40; i++) { const v = f(); if (v) return v; await new Promise((r) => setTimeout(r, 25)); } return null; };
