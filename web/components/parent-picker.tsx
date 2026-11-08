"use client";
import { useEffect, useState } from "react";

/** Dropdown of every place in the sitemap tree (pages and menu groups). Blank = automatic. */
export default function ParentPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [opts, setOpts] = useState<{ v: string; label: string }[]>([]);
  useEffect(() => {
    fetch("/api/pages?tree").then((r) => r.json()).then((t) => {
      const out: { v: string; label: string }[] = [];
      const walk = (ns: any[], d: number) => ns.forEach((n) => { out.push({ v: n.slug ?? n.label, label: "\u2003".repeat(d) + n.label }); walk(n.children, d + 1); });
      walk(t, 0);
      setOpts(out);
    }).catch(() => {});
  }, []);
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", padding: 8 }}>
      <option value="">Automatic</option>
      {opts.map((o: { v: string; label: string }) => <option key={o.v} value={o.v}>{o.label}</option>)}
    </select>
  );
}
