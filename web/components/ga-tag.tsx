"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { PRIVATE } from "@/lib/ga-private";

export const CONSENT_KEY = "cookie-consent";

/** Remembers where this visitor first arrived from (referring site or utm_source) for 90 days, so a later booking or signup can be credited to it. See lib/ga-attr.ts. */
function firstTouch() {
  if (/(^|;\s*)ft=/.test(document.cookie)) return;
  let s = new URL(location.href).searchParams.get("utm_source") ?? "";
  try { const h = new URL(document.referrer).hostname.replace(/^www\./, ""); if (!s && document.referrer && h !== location.hostname.replace(/^www\./, "")) s = h; } catch { /* no usable referrer */ }
  s = s.toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 60) || "direct";
  document.cookie = `ft=${s}; max-age=${90 * 86400}; path=/; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
}

// Loads Google Analytics on public pages when it is switched on in Admin > Setup > Google Analytics AND the visitor accepted cookies (see cookie-consent.tsx).
export default function GaTag() {
  const path = usePathname();
  useEffect(() => {
    const w = window as any, off = PRIVATE.test(path);
    if (w.gaId) w["ga-disable-" + w.gaId] = off; // moving to a private page without a reload stops sending
    if (off || w.gaStarted) return;
    const start = async () => {
      if (w.gaStarted) return;
      let ok = false;
      try { ok = w.cookieFree || localStorage.getItem(CONSENT_KEY) === "1"; } catch { /* no storage: no consent */ }
      if (!ok) return;
      w.gaStarted = true;
      try {
        const { id } = await (await fetch("/api/ga/tag")).json() as { id: string };
        if (!id || w.gtag) return;
        firstTouch();
        w.gaId = id; w.dataLayer = w.dataLayer || [];
        w.gtag = function () { w.dataLayer.push(arguments); };
        w.gtag("js", new Date()); w.gtag("config", id);
        const s = document.createElement("script");
        s.async = true; s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
        document.head.appendChild(s);
      } catch { w.gaStarted = false; }
    };
    void start();
    window.addEventListener("cookie-consent", start);
    return () => window.removeEventListener("cookie-consent", start);
  }, [path]);
  return null;
}
