"use client";
import { useState } from "react";

// Our guides are volunteers giving up family time, so a gentle nudge goes with every cancel.
const NUDGES = [
  "A quick reminder: our guides are volunteers. They may have stepped away from their kids or from making dinner for their family to meet you, so please only cancel when you really need to.",
  "Thank you for letting us know. Our tour guides give up their own evenings and weekends, often time they'd otherwise spend with family, so we ask that you don't cancel casually.",
  "Plans change, we get it. Just remember a volunteer set aside time for your tour, maybe pulling away from their family to do it, so please try not to flake out on us.",
  "Cancelled. Please keep in mind that our guides are neighbors donating their time, sometimes rearranging dinner or family time to show you around. We'd love for you to only cancel when you truly must.",
];

// Cancelling needs a click (not just opening the link) so email scanners that prefetch links can't cancel tours.
export default function Cancel({ token }: { token: string }) {
  const [state, setState] = useState<{ ok?: string; err?: string; nudge?: string }>({}), [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    const r = await fetch("/api/tours/cancel", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) }).catch(() => null);
    setBusy(false);
    setState(r?.ok ? { ok: (await r.json()).when, nudge: NUDGES[Math.floor(Math.random() * NUDGES.length)] } : { err: r ? await r.text() : "Couldn't reach the server." });
  };
  if (state.ok) return <div role="status"><p>Your tour on {state.ok} is cancelled. You can <a href="/tours">book another time</a> whenever you like.</p><p>{state.nudge}</p></div>;
  return (
    <>
      <p>Cancel your tour so someone else can take the spot?</p>
      {state.err && <p role="alert" style={{ color: "#b3261e" }}>{state.err}</p>}
      <button className="btn btn-main" disabled={busy || !token} onClick={go}>{busy ? "Cancelling…" : "Yes, cancel my tour"}</button> <a href="/tours" className="btn">Keep it</a>
    </>
  );
}
