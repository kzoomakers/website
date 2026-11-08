"use client";
import { useState } from "react";

// Cancelling needs a click (not just opening the link) so email scanners that prefetch links can't cancel tours.
export default function Cancel({ token }: { token: string }) {
  const [state, setState] = useState<{ ok?: string; err?: string }>({}), [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    const r = await fetch("/api/tours/cancel", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) }).catch(() => null);
    setBusy(false);
    setState(r?.ok ? { ok: (await r.json()).when } : { err: r ? await r.text() : "Couldn't reach the server." });
  };
  if (state.ok) return <p role="status">Your tour on {state.ok} is cancelled. You can <a href="/tours">book another time</a> whenever you like.</p>;
  return (
    <>
      <p>Cancel your tour so someone else can take the spot?</p>
      {state.err && <p role="alert" style={{ color: "#b3261e" }}>{state.err}</p>}
      <button className="btn btn-main" disabled={busy || !token} onClick={go}>{busy ? "Cancelling…" : "Yes, cancel my tour"}</button> <a href="/tours" className="btn">Keep it</a>
    </>
  );
}
