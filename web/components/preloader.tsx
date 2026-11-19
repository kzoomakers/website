"use client";
import { useEffect, useState } from "react";

// Full-screen cover until the page has loaded, then fades out and unmounts (React owns it, so nothing else may remove it).
export default function Preloader() {
  const [state, setState] = useState<"on" | "fading" | "gone">("on");
  useEffect(() => {
    const done = () => { setState("fading"); setTimeout(() => setState("gone"), 600); };
    if (document.readyState === "complete") { done(); return; }
    window.addEventListener("load", done, { once: true });
    return () => window.removeEventListener("load", done);
  }, []);
  if (state === "gone") return null;
  return <div id="preloader" style={state === "fading" ? { opacity: 0, transition: "opacity .6s", pointerEvents: "none" } : undefined}><div className="preloader"><span /><span /><span /><span /><span /><span /></div></div>;
}
