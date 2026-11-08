"use client";
import { useEffect, useRef, useState } from "react";
import Flash from "@/components/flash";
import { sendUpload } from "@/lib/upload-client";
import { fileTooLarge } from "@/lib/upload-limit";
import SignPad from "@/components/sign-pad";
import { Agreement, Changes } from "@/components/agreement";
import type { Change, Version } from "@/lib/waiver-diff";

type Step = "waiver" | "handbook" | "id" | "resign";
const ORDER: [Step, string][] = [["waiver", "1. Sign the waiver"], ["handbook", "2. Read the handbook"], ["id", "3. Upload your ID"]];

type Update = { last: string; changes: Change[]; notes: { revision: string; summary: string; at: string }[] } | null;
export default function Steps({ step: first, name, version, kinds, update }: { step: Step; name: string; version: Version; kinds: Record<string, string>; update: Update }) {
  const [step, setStep] = useState<Step | "done">(first), [busy, setBusy] = useState(false), [err, setErr] = useState(""), [read, setRead] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const next = (r: Response) => r.json().then((j: { step: Step | "done" }) => { setErr(""); if (j.step === "done") location.href = "/members/onboarding"; else setStep(j.step); });
  const post = async (body: object) => { setBusy(true); setErr(""); const r = await fetch("/api/onboarding", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); setBusy(false); r.ok ? await next(r) : setErr(await r.text()); };
  // The handbook is the site's own page, so we can watch how far they scrolled. We poll instead of relying on the iframe's load event (it can fire before React hydrates and never reach us),
  // and listen for scrolls on the page or on any inner scroll area. The button unlocks within ~80px of the bottom.
  useEffect(() => {
    if (step !== "handbook") return;
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
  }, [step]);
  const sendId = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setErr("");
    const big = fileTooLarge((e.currentTarget.elements.namedItem("file") as HTMLInputElement).files?.[0] ?? { size: 0 });
    if (big) return setErr(big);
    setBusy(true);
    const r = await sendUpload("/api/onboarding/id", new FormData(e.currentTarget));
    setBusy(false); r?.ok ? await next(r) : setErr(r ? (await r.text()).slice(0, 300) || `Upload failed (${r.status}). Try a smaller photo.` : "Couldn't reach the server. Check your connection and try again.");
  };
  return (
    <div style={{ display: "grid", gap: 16 }}>
      {step !== "resign" && <p>Before you can use the members area, please finish these three steps.</p>}
      {step !== "resign" && <nav aria-label="Steps" className="bar">{ORDER.map(([s, l]) => <span key={s} className={"tag" + (s === step ? " pri" : "")} aria-current={s === step ? "step" : undefined}>{l}</span>)}</nav>}
      <Flash msg={err} />
      {(step === "waiver" || step === "resign") && <>
        {step === "resign" && update && <section aria-label="What changed" style={{ display: "grid", gap: 10 }}>
          <div className="card" style={{ borderLeft: "4px solid #d6a21f" }}>
            <strong>In plain language: what's different since you last signed (revision {update.last})</strong>
            {update.notes.map((n) => <p key={n.revision} style={{ whiteSpace: "pre-wrap", margin: "8px 0 0" }}><small className="sub">Revision {n.revision} · {new Date(n.at).toLocaleDateString()}</small><br />{n.summary}</p>)}
          </div>
          <h2 style={{ marginBottom: 0 }}>Section by section</h2>
          <Changes changes={update.changes} />
        </section>}
        <h2>{version.title} <small className="sub">revision {version.revision}</small></h2>
        <p className="sub">Please read the whole agreement, then sign at the bottom.</p>
        <article style={{ height: "calc(100vh - 440px)", minHeight: 240, resize: "both", overflow: "auto", maxWidth: "100%", minWidth: 280, border: "1px solid #ddd", borderRadius: 8, padding: 16, background: "#fff", color: "#111" }} tabIndex={0}><Agreement sections={version.sections} closing={version.closing} /></article>
        <p className="sub">When you sign, a PDF is emailed to you and to contact@kzoomakers.org, and kept encrypted. You can read every version you've signed on your Account page.</p>
        <SignPad name={name} busy={busy} initials drawRequired label="Sign the agreement" onSign={(signature, drawn, initials) => post({ step: "waiver", signature, initials, drawn })} />
      </>}
      {step === "handbook" && <>
        <h2>Membership handbook</h2>
        <p className="sub">Scroll to the end of the handbook below. The box unlocks once you have.</p>
        <iframe ref={frame} src="/handbook" title="Membership handbook" style={{ width: "100%", height: "calc(100vh - 440px)", minHeight: 240, resize: "both", overflow: "auto", maxWidth: "100%", minWidth: 280, border: "1px solid #ddd", borderRadius: 8, background: "#fff" }} />
        <button className="pri" disabled={!read || busy} onClick={() => post({ step: "handbook", read: true })}>I have read the membership handbook and agree to follow it</button>
      </>}
      {step === "id" && <>
        <h2>Photo ID</h2>
        <p>Upload a photo or scan of a government-issued or school photo ID: a non-expired driver's license or state ID, passport, military ID or college ID.</p>
        <p className="sub">🔒 Your ID is encrypted before it is stored and is encrypted in transit at all times, so it stays protected at rest and over the wire. Only authorized staff can open it, and every view is logged.</p>
        <form className="card" onSubmit={sendId} style={{ display: "grid", gap: 10 }}>
          <label>Type of ID<select name="kind" required defaultValue="">{<option value="" disabled>Choose…</option>}{Object.entries(kinds).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label>Expiration date (leave blank only for a college ID with none)<input type="date" name="expires" min={new Date().toISOString().slice(0, 10)} /></label>
          <label>Photo or scan<input type="file" name="file" accept="image/*,.heic,.heif" required /></label>
          <button className="pri" disabled={busy}>{busy ? "Uploading…" : "Upload and finish"}</button>
        </form>
      </>}
    </div>
  );
}
