"use client";
import { useEffect, useState } from "react";

export type Alerts = { reviews: number; comments: number; forms: number; applicants: number; walkups: number };

// What is waiting for staff, for the tab badges and the left menu. One request is shared by whoever asks within 10 seconds, then refreshed every minute and when you move to another page.
let last: { at: number; p: Promise<Alerts | null> } | undefined;
const fetchAlerts = () => (last && Date.now() - last.at < 10_000 ? last.p : (last = { at: Date.now(), p: fetch("/api/webmaster/alerts", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null), () => null) }).p);

export function useAlerts(here: string) {
  const [a, setA] = useState<Alerts | null>(null);
  useEffect(() => {
    let live = true;
    const poll = () => fetchAlerts().then((d) => live && d && setA(d));
    poll();
    const t = setInterval(poll, 60_000);
    return () => { live = false; clearInterval(t); };
  }, [here]);
  return a;
}
