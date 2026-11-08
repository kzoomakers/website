"use client";
import { Puck, type Data } from "@puckeditor/core";
import { alertDialog } from "@/components/dialog";
import "@puckeditor/core/puck.css";
import { config } from "@/lib/puck-config";

export default function Editor({ slug, data, menu }: { slug: string; data: Data; menu: unknown[] }) {
  return (
    <Puck
      config={config}
      data={data}
      metadata={{ menu }}
      onPublish={async (d) => {
        const r = await fetch("/api/pages", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug, data: d }) });
        if (!r.ok) alertDialog("Publish failed: " + (await r.text()));
      }}
    />
  );
}
