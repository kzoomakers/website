"use client";
import { useEffect, useMemo } from "react";

/** Offers data the PII modal returned as a JSON file download (nothing is kept on the page once it's closed). */
export default function JsonDownload({ data, name, label }: { data: unknown; name: string; label: string }) {
  const href = useMemo(() => URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })), [data]);
  useEffect(() => () => URL.revokeObjectURL(href), [href]);
  return <a href={href} download={name}>{label}</a>;
}
