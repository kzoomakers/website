"use client";
import { useState } from "react";
import { PDFViewer } from "@embedpdf/viewer-react";

// The viewer is heavy, so it only loads once someone asks to see a PDF.
export default function Viewer({ src, open = false }: { src: string; open?: boolean }) {
  const [on, setOn] = useState(open);
  return on ? <PDFViewer src={src} style={{ height: "75vh", borderRadius: 10, overflow: "hidden" }} /> : <button type="button" className="wv-btn" onClick={() => setOn(true)}>📄 View signed PDF</button>;
}
