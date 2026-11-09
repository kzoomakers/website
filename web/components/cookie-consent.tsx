"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { CONSENT_KEY } from "./ga-tag";
import PrivacyText from "./privacy-text";

// Blocking cookie notice: the page behind it can't be clicked or scrolled until the visitor accepts. The choice is kept in localStorage on this browser.
// Not shown on staff pages, or on the privacy page (people must be able to read it before deciding).
const SKIP = /^\/(admin|privacy)(\/|$)/;

export default function CookieConsent() {
  const path = usePathname(), [show, setShow] = useState(false), [pos, setPos] = useState({ x: 0, y: 0 }), drag = useRef<{ x: number; y: number } | null>(null), accept = useRef<HTMLButtonElement>(null);
  const [accepted, setAccepted] = useState(false), [open, setOpen] = useState(false), [text, setText] = useState<string | null>(null), [bad, setBad] = useState(false);
  useEffect(() => {
    let ok = false;
    try { ok = localStorage.getItem(CONSENT_KEY) === "1"; } catch { /* storage blocked: ask every time */ }
    setAccepted(ok);
    if (ok || SKIP.test(path)) return setShow(false);
    // Not answered yet: ask, unless an admin turned the notice off in Admin > Setup > Analytics & cookies (then trackers start without asking).
    let live = true;
    fetch("/api/ga/tag").then((r) => r.json()).then(({ banner }: { banner: boolean }) => {
      if (!live) return;
      if (banner === false) { (window as any).cookieFree = true; window.dispatchEvent(new Event("cookie-consent")); } else setShow(true);
    }).catch(() => live && setShow(true));
    return () => { live = false; };
  }, [path]);
  useEffect(() => {
    if (!show) return;
    const el = document.documentElement, was = el.style.overflow;
    el.style.overflow = "hidden"; // no scrolling behind the dialog
    accept.current?.focus();
    return () => { el.style.overflow = was; };
  }, [show]);

  // Taking consent back: forget the choice and reload, so trackers that already started are gone and the question is asked again.
  const withdraw = () => { try { localStorage.removeItem(CONSENT_KEY); } catch { /* nothing stored */ } location.reload(); };
  const ok = () => {
    try { localStorage.setItem(CONSENT_KEY, "1"); } catch { /* still lets them in for this visit */ }
    window.dispatchEvent(new Event("cookie-consent"));
    setAccepted(true);
    setShow(false);
  };
  const trap = (e: React.KeyboardEvent<HTMLDivElement>) => { // Tab stays inside the dialog
    if (e.key !== "Tab") return;
    const f = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("button,[tabindex=\"0\"]")), i = f.indexOf(document.activeElement as HTMLElement);
    e.preventDefault();
    f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
  };
  const expand = (v: boolean) => { // the statement is fetched the first time it is opened
    setOpen(v);
    if (v && text === null) fetch("/api/privacy").then((r) => r.ok ? r.json() : Promise.reject()).then((j) => setText(j.text)).catch(() => setBad(true));
  };
  const move = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const x = Math.min(innerWidth / 2 - 40, Math.max(-innerWidth / 2 + 40, e.clientX - drag.current.x)), y = Math.min(innerHeight / 2 - 22, Math.max(-innerHeight / 2 + 22, e.clientY - drag.current.y));
    setPos({ x, y });
  };

  if (!show) return accepted && !/^\/admin(\/|$)/.test(path) ? <><style>{".cc-settings{all:unset;position:fixed;left:8px;bottom:6px;z-index:2147482000;font:11px Helvetica,Arial,sans-serif;color:#555;background:rgba(255,255,255,.85);padding:2px 6px;border-radius:3px;text-decoration:underline;cursor:pointer}.cc-settings:focus-visible{outline:2px solid #067dff}"}</style><button type="button" className="cc-settings" onClick={withdraw}>Cookie settings</button></> : null;

  return (
    <div className="cc-shade">
      <style>{CSS}</style>
      <div className="cc-dialog" role="dialog" aria-modal="true" aria-labelledby="cc-msg" onKeyDown={trap} style={{ transform: `translate(${pos.x}px, ${pos.y}px)`, width: open ? 640 : undefined }}>
        <div className="cc-title" onPointerDown={(e) => { drag.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} />
        <div className="cc-body">
          <div className="cc-row">
          <img className="cc-icon" src="/images/dialogbox.webp" alt="" width={60} height={60} />
          <div className="cc-warning" id="cc-msg">This site contains cookies for storing login session ids, and analytics cookies to improve site performance. To see full details see our <button type="button" className="cc-link" aria-expanded={open} aria-controls="cc-privacy" onClick={() => expand(true)}>Privacy Policy</button><button type="button" className="cc-caret" aria-expanded={open} aria-controls="cc-privacy" aria-label={open ? "Hide privacy policy" : "Show privacy policy"} onClick={() => expand(!open)}><span style={{ display: "inline-block", transform: open ? "rotate(-90deg)" : "none", transition: "transform .15s" }}>&gt;</span></button>.</div>
          </div>
          {open && <div className="cc-privacy" id="cc-privacy" tabIndex={0}>{bad ? <p>The privacy policy could not be loaded. Try again later.</p> : text === null ? <p>Loading…</p> : <PrivacyText text={text} />}</div>}
          <div className="cc-actions">
            <a className="cc-btn" href="https://example.com">Leave</a>
            <button className="cc-btn cc-confirm" type="button" ref={accept} onClick={ok}>Accept Cookie Usage</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.cc-shade{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;overscroll-behavior:contain}
.cc-dialog{font-family:Helvetica,Arial,sans-serif;width:422px;max-width:calc(100vw - 24px);background:#e7e7e7;border-radius:5px;box-shadow:0 15px 25px rgba(50,50,50,.7);color:#000}
.cc-title{height:22px;background:linear-gradient(to bottom,#e6e6e6,#c4c4c4);border-radius:5px 5px 0 0;border-bottom:1px solid #9e9e9e;cursor:grab;touch-action:none}
.cc-title:active{cursor:grabbing}
.cc-body{padding:18px 20px 16px;overflow:hidden}
.cc-row{display:flex;align-items:flex-start;gap:16px}
.cc-icon{flex:none;width:60px;height:60px;object-fit:contain}
.cc-warning{flex:1;min-width:0;font-size:13px;font-weight:700;line-height:1.45}
.cc-link,.cc-caret{all:unset;cursor:pointer;color:#0645ad}
.cc-link{text-decoration:underline}
.cc-caret{margin-left:4px;padding:0 4px;font-weight:700}
.cc-link:focus-visible,.cc-caret:focus-visible{outline:2px solid #067dff}
.cc-dialog .cc-privacy{margin:16px 0 0;max-height:min(50vh,320px);overflow:auto;background:#fff;border:1px solid #a5a5a5;border-radius:3px;padding:10px 16px;font:400 13px/1.5 Helvetica,Arial,sans-serif;color:#222}
.cc-dialog .cc-privacy h2{font:700 14px/1.3 Helvetica,Arial,sans-serif;margin:12px 0 4px;padding:0;color:#000}
.cc-dialog .cc-privacy p,.cc-dialog .cc-privacy li{font:inherit;margin:0 0 6px;padding:0;color:inherit}
.cc-dialog .cc-privacy ul{margin:0 0 6px;padding:0 0 0 20px;list-style:disc}
.cc-dialog .cc-privacy li{list-style:disc}
.cc-actions{display:flex;justify-content:flex-end;gap:10px;padding:16px 0 0}
.cc-btn{box-sizing:border-box;min-width:80px;padding:4px 12px;font:13px Helvetica,Arial,sans-serif;color:#000;text-align:center;text-decoration:none;background:#fff;border:1px solid #a5a5a5;border-radius:3px;cursor:pointer}
.cc-confirm{color:#fff;background:linear-gradient(to bottom,#6cb3fa,#067dff);border-width:0}
.cc-confirm:active{background:#067dff}
.cc-btn:focus-visible{outline:2px solid #067dff;outline-offset:2px}
/* Phones: a sheet pinned to the bottom (no dragging), big tap targets, 16px text so iOS doesn't zoom, room for the home bar. */
@media (max-width:600px){
.cc-shade{align-items:flex-end}
.cc-dialog{width:100%!important;max-width:100%;transform:none!important;border-radius:14px 14px 0 0;max-height:92dvh;display:flex;flex-direction:column}
.cc-title{height:18px;border-radius:14px 14px 0 0;cursor:default;position:relative}
.cc-title::after{content:"";position:absolute;left:50%;top:6px;width:40px;height:5px;margin-left:-20px;border-radius:3px;background:#9e9e9e}
.cc-body{overflow:auto;padding:14px 16px calc(16px + env(safe-area-inset-bottom))}
.cc-row{gap:12px}.cc-icon{width:44px;height:44px}
.cc-warning{font-size:15px;line-height:1.45}
.cc-link{padding:6px 0}.cc-caret{padding:6px 10px;font-size:16px}
.cc-dialog .cc-privacy{max-height:40dvh;font-size:14px}
.cc-actions{flex-direction:column-reverse;gap:10px;padding:16px 0 0}
.cc-btn{min-height:46px;font-size:16px;display:flex;align-items:center;justify-content:center}
}
`;
