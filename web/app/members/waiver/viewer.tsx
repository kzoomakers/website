"use client";
import { useState } from "react";
import dynamic from "next/dynamic";

// Browser only: server-side rendering would pull in the library's native Node engine, which the build can't bundle.
const PDFViewer = dynamic(() => import("@embedpdf/viewer-react").then((m) => m.PDFViewer), { ssr: false });

// The viewer is heavy, so it only loads once someone asks to see a PDF.
export default function Viewer({ src, open = false }: { src: string; open?: boolean }) {
  const [on, setOn] = useState(open);
  return on ? <PDFViewer src={src} style={{ height: "min(75vh, 640px)", borderRadius: 10, overflow: "hidden" }} /> : <button type="button" className="wv-btn" onClick={() => setOn(true)}>📄 View signed PDF</button>;
}
