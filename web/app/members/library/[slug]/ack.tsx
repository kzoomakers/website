"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Ack({ slug, version }: { slug: string; version: number }) {
  const [err, setErr] = useState(""), r = useRouter();
  return (
    <p>
      <button onClick={async () => { const x = await fetch("/api/library/ack", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug }) }); if (x.ok) r.refresh(); else setErr(await x.text()); }}>I've read version {version}</button>
      {err && <span role="alert"> {err}</span>}
    </p>
  );
}
