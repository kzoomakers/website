import { useEffect, useState, type RefObject } from "react";

// True once the handbook inside the iframe has been scrolled to within ~80px of the bottom. The page may scroll as a whole or inside an inner area (it has its own scroller),
// so each tick finds whatever really scrolls (taller than its box by more than 80px) and watches the biggest one. A page that doesn't scroll yet (still loading) counts as not read.
// We poll instead of relying on the iframe's load event (it can fire before React hydrates). After 2 minutes it unlocks anyway, in case the page can't be read.
export function useRead(frame: RefObject<HTMLIFrameElement | null>, active: boolean) {
  const [read, setRead] = useState(false);
  useEffect(() => {
    if (!active) return;
    let doc: Document | null = null;
    const tick = () => {
      try {
        const w = frame.current?.contentWindow, d = w?.document;
        if (!w || !d || d.readyState === "loading" || d.location.href === "about:blank") return;
        if (d !== doc) { doc = d; d.addEventListener("scroll", tick, true); }
        const scrolls = [d.documentElement, d.body, ...Array.from(d.querySelectorAll("*"))].filter((e) => e && e.scrollHeight > e.clientHeight + 80 && (e === d.documentElement || e === d.body || /auto|scroll/.test(w.getComputedStyle(e).overflowY)));
        const main = scrolls.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
        if (main && main.scrollHeight - main.scrollTop - main.clientHeight < 80) setRead(true);
      } catch { /* a page we can't read: the fallback below still unlocks */ }
    };
    const poll = setInterval(tick, 500), fallback = setTimeout(() => setRead(true), 120000);
    return () => { clearInterval(poll); clearTimeout(fallback); };
  }, [active, frame]);
  return read;
}
