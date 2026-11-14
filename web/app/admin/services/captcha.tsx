"use client";
import { useState } from "react";
import Notice from "@/components/notice";

// Google reCAPTCHA v2 ("I'm not a robot") for the public forms. Blank site key turns it off.
export default function Captcha({ initial }: { initial: { site: string; hasSecret: boolean } }) {
  const [site, setSite] = useState(initial.site), [secret, setSecret] = useState(""), [has, setHas] = useState(initial.hasSecret), [busy, setBusy] = useState(false), [msg, setMsg] = useState(""), [ok, setOk] = useState(false);
  const save = async () => {
    setBusy(true); setMsg(""); setOk(false);
    const r = await fetch("/api/webmaster/captcha", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ site, secret }) }).catch(() => null);
    setBusy(false);
    if (r?.ok) { setHas((await r.json()).hasSecret); setSecret(""); setOk(true); } else setMsg(r ? await r.text() : "Couldn't reach the server. Try again.");
  };
  return (
    <div style={{ maxWidth: 560, marginTop: 32 }}>
      <h2>Spam protection (reCAPTCHA)</h2>
      <p className="sub">Adds Google's “I'm not a robot” box to the contact, board, donation, newsletter and tour forms. Create a <strong>reCAPTCHA v2 → “I'm not a robot” checkbox</strong> key at google.com/recaptcha/admin and add this website's domain. Blank site key turns it off.</p>
      <Notice kind="error">{msg}</Notice>
      <label>Site key<input value={site} autoComplete="off" placeholder="6L…" onChange={(e) => { setSite(e.target.value); setOk(false); }} /></label>
      <label>Secret key<input type="password" value={secret} autoComplete="new-password" placeholder={has ? "Saved — leave blank to keep" : "6L…"} onChange={(e) => { setSecret(e.target.value); setOk(false); }} /></label>
      <button className="pri" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
      {ok && <p className="ok" role="status">✓ Saved</p>}
    </div>
  );
}
