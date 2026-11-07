"use client";
import { useEffect } from "react";

// Legacy jQuery behaviour (dropdowns, slick, counters, hours). Injected AFTER hydration so slick's
// DOM changes don't cause React hydration mismatches. async=false keeps execution in order.
const SRC = [
  "plugins/jquery/jquery.min.js", "plugins/bootstrap/bootstrap.min.js", "plugins/parallax/jquery.parallax-1.1.3.js",
  "plugins/lightbox2/js/lightbox.min.js", "plugins/slick/slick.min.js", "plugins/filterizr/jquery.filterizr.min.js",
  "plugins/smooth-scroll/smooth-scroll.min.js", "dynamic/js/hours.js", "nav-extras.js", "js/script.js",
];
export default function LegacyScripts({ extra = [] }: { extra?: string[] }) {
  useEffect(() => {
    const els = [...SRC, ...extra].map((s) => {
      const el = document.createElement("script");
      el.src = /^(https?:)?\/\//.test(s) ? s : "/" + s.replace(/^\//, ""); el.async = false;
      document.body.appendChild(el);
      return el;
    });
    // script.js hides the preloader on window "load", which already fired before we injected it.
    els[els.length - 1].onload = () => document.getElementById("preloader")?.remove();
    return () => els.forEach((e) => e.remove());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extra.join()]);
  return null;
}
