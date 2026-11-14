"use client";
import { useEffect } from "react";

// Legacy jQuery behaviour (dropdowns, slick, counters, hours). Injected AFTER hydration so slick's
// DOM changes don't cause React hydration mismatches. async=false keeps execution in order.
// Slick and Filterizr (about 70 KB) are loaded only on pages that have something for them; script.js calls both unconditionally, so they are stubbed when skipped.
const SLICK = ".hero-slider, .testimonial-slider, .clients-logo-slider, .company-gallery", FILTR = ".filtr-container";
const sources = () => [
  "plugins/jquery/jquery.min.js", "plugins/bootstrap/bootstrap.min.js", "plugins/parallax/jquery.parallax-1.1.3.js",
  "plugins/lightbox2/js/lightbox.min.js", ...(document.querySelector(SLICK) ? ["plugins/slick/slick.min.js"] : []), ...(document.querySelector(FILTR) ? ["plugins/filterizr/jquery.filterizr.min.js"] : []),
  "plugins/smooth-scroll/smooth-scroll.min.js", "dynamic/js/hours.js", "nav-extras.js", "stub-plugins.js", "js/script.js",
];
const abs = (s: string) => (/^(https?:)?\/\//.test(s) ? s : "/" + s.replace(/^\//, ""));

// bare = standalone page: no site scripts, only the page's own.
export default function LegacyScripts({ extra = [], inline = [], bare = false }: { extra?: string[]; inline?: string[]; bare?: boolean }) {
  useEffect(() => {
    const added: HTMLElement[] = [];
    // Page scripts were written to run before DOMContentLoaded; by the time we inject them it has
    // already fired, so run those listeners right away.
    const orig = document.addEventListener;
    document.addEventListener = function (this: Document, type: string, fn: any, o?: any) {
      if (type === "DOMContentLoaded") return void setTimeout(() => fn.call(document, new Event(type)), 0);
      return orig.call(this, type, fn, o);
    } as typeof document.addEventListener;

    const runInline = () => {
      document.getElementById("preloader")?.remove(); // script.js waits for window "load", which already fired
      inline.forEach((code) => {
        const el = document.createElement("script");
        if (/^\s*import[\s{]/.test(code)) el.type = "module";
        el.text = code;
        document.body.appendChild(el);
        added.push(el);
      });
    };
    const srcs = [...(bare ? [] : sources()), ...extra];
    const els = srcs.map((s) => {
      const el = document.createElement("script");
      el.src = abs(s); el.async = false;
      document.body.appendChild(el);
      return el;
    });
    added.push(...els);
    // Inline scripts run only once every external script has executed.
    if (els.length) els[els.length - 1].onload = runInline; else runInline();
    return () => { document.addEventListener = orig; added.forEach((e) => e.remove()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extra.join(), inline.join(), bare]);
  return null;
}
