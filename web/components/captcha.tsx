"use client";
import { useEffect, useRef } from "react";

// Google "I'm not a robot" box. Put it inside a <form>: Google adds a `g-recaptcha-response` field there, so read it with FormData(form).get("g-recaptcha-response") and send it as `captcha`.
// Shows nothing while no site key is saved (Admin > Setup). A token works once, so call resetCaptcha(form) after a failed submit.
declare global { interface Window { grecaptcha?: any; __rcReady?: () => void } }
let site: Promise<string> | null = null, script: Promise<void> | null = null;
const siteKey = () => (site ??= fetch("/api/captcha").then((r) => r.json()).then((j) => String(j.site || "")).catch(() => ""));
const load = () => (script ??= new Promise<void>((ok) => {
  window.__rcReady = ok;
  const s = document.createElement("script");
  s.src = "https://www.google.com/recaptcha/api.js?onload=__rcReady&render=explicit"; s.async = true;
  document.head.appendChild(s);
}));
const ids = new WeakMap<Element, number>();

export function resetCaptcha(form: Element | null) {
  const el = form?.querySelector(".rc-box"), id = el && ids.get(el);
  if (id != null) window.grecaptcha?.reset(id);
}

export default function Captcha({ compact = false }: { compact?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let dead = false;
    siteKey().then(async (k) => {
      if (!k || dead || !box.current) return;
      await load();
      if (dead || !box.current || ids.has(box.current)) return;
      ids.set(box.current, window.grecaptcha.render(box.current, { sitekey: k, size: compact ? "compact" : "normal" }));
    });
    return () => { dead = true; };
  }, [compact]);
  return <div ref={box} className="rc-box" style={{ margin: "0 0 14px", minHeight: 0 }} />;
}
