"use client";
import { useEffect } from "react";

// Quietly reports clicks on links that leave kzoomakers.org (any a[href] on any page) so the admin can see how often they're used. Never blocks or delays the click.
export default function LinkTracker() {
  useEffect(() => {
    const on = (e: MouseEvent) => {
      if (e.type === "auxclick" && e.button !== 1) return;
      try {
        const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
        if (!a || !/^https?:$/.test(a.protocol) || a.hostname === location.hostname || /(^|\.)kzoomakers\.org$/i.test(a.hostname)) return;
        navigator.sendBeacon("/api/links/click", JSON.stringify({ url: a.href, screen: `${screen.width}x${screen.height}@${devicePixelRatio}`, page: location.pathname }));
      } catch { /* tracking must never break a link */ }
    };
    document.addEventListener("click", on, true);
    document.addEventListener("auxclick", on, true);
    return () => { document.removeEventListener("click", on, true); document.removeEventListener("auxclick", on, true); };
  }, []);
  return null;
}
