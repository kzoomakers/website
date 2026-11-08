"use client";
import { useEffect } from "react";

// Marks the notices that were new when this page loaded as read, once the page is really open (a prefetch or server render does not count).
export default function MarkRead({ ids }: { ids: number[] }) {
  useEffect(() => {
    if (ids.length) fetch("/api/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids }) }).catch(() => {});
  }, [ids.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
