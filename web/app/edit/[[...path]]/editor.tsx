"use client";
import { Puck, type Data } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import { config } from "@/lib/puck-config";

export default function Editor({ slug, data }: { slug: string; data: Data }) {
  return (
    <Puck
      config={config}
      data={data}
      onPublish={async (d) => {
        const r = await fetch("/api/pages", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug, data: d }) });
        if (!r.ok) alert("Publish failed: " + (await r.text()));
      }}
    />
  );
}
