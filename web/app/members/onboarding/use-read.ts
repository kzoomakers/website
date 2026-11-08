import { useEffect, useState, type RefObject } from "react";

// True once the iframe's page has been scrolled to within ~80px of the bottom. We poll instead of relying on the iframe's load event (it can fire before
// React hydrates and never reach us), and listen for scrolls on the page or any inner scroll area. After 2 minutes it unlocks anyway, in case the page can't be read.
export function useRead(frame: RefObject<HTMLIFrameElement | null>, active: boolean) {
  const [read, setRead] = useState(false);
  useEffect(() => {
    if (!active) return;
    let doc: Document | null = null;
    const low = (e: Element) => e.scrollHeight - e.scrollTop - e.clientHeight < 80;
    const tick = (ev?: Event) => {
      try {
        const w = frame.current?.contentWindow, d = w?.document;
        if (!w || !d || d.readyState === "loading" || d.location.href === "about:blank") return;
        if (d !== doc) { doc = d; d.addEventListener("scroll", tick, true); }
        const t = ev?.target;
        if (low(d.documentElement) || (d.body && low(d.body)) || (t && "scrollHeight" in t && low(t as Element))) setRead(true);
      } catch { /* a page we can't read: the fallback below still unlocks */ }
    };
    const poll = setInterval(tick, 500), fallback = setTimeout(() => setRead(true), 120000);
    return () => { clearInterval(poll); clearTimeout(fallback); };
  }, [active, frame]);
  return read;
}
