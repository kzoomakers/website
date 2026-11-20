"use client";
import { useState } from "react";
import Notice from "@/components/notice";
import { confirmDialog } from "@/components/dialog";
import { Banner, Card, Field, Secret, Steps, useSnack } from "./card";

const LINK = { target: "_blank", rel: "noopener noreferrer" } as const;
const KEY = /^6L[0-9A-Za-z_-]{38}$/;

// Google reCAPTCHA v2 ("I'm not a robot") for the public forms. Removing the keys turns it off.
export default function Captcha({ initial }: { initial: { site: string; hasSecret: boolean } }) {
  const [savedSite, setSavedSite] = useState(initial.site), [site, setSite] = useState(initial.site), [secret, setSecret] = useState(""), [has, setHas] = useState(initial.hasSecret);
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(""), [snack, say] = useSnack();
  const on = !!savedSite && has;
  const siteBad = site.trim() && !KEY.test(site.trim()) ? "reCAPTCHA keys start with “6L” and are 40 characters long." : "";
  const secretBad = secret.trim() && !KEY.test(secret.trim()) ? "The secret key also starts with “6L” and is 40 characters long." : "";
  const dirty = site.trim() !== savedSite || !!secret.trim(), ready = !!site.trim() && (has || !!secret.trim()) && !siteBad && !secretBad;
  const send = async (s: string, k: string, done: string) => {
    setBusy(true); setMsg("");
    const r = await fetch("/api/webmaster/captcha", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ site: s, secret: k }) }).catch(() => null);
    setBusy(false);
    if (r?.ok) { setHas((await r.json()).hasSecret); setSavedSite(s); setSite(s); setSecret(""); say(done); } else setMsg(r ? await r.text() : "Couldn't reach the server. Try again.");
  };
  return (
    <Card title="Spam protection">
      {on ? <Banner kind="ok" title="Spam protection is on">Visitors see Google’s “I’m not a robot” box on the contact, board, donation, newsletter and tour forms.</Banner> : <Banner kind="off" title="Spam protection is off">Forms accept anyone. Turn it on to stop automated sign-ups and messages.</Banner>}
      <Steps open={!on}>
        <li>Open <a href="https://www.google.com/recaptcha/admin/create" {...LINK}>reCAPTCHA admin</a> and create a key of type <b>reCAPTCHA v2 → “I’m not a robot” checkbox</b>.</li>
        <li>Add this website’s domain when asked.</li>
        <li>Copy the <b>site key</b> and the <b>secret key</b> into the boxes below.</li>
      </Steps>
      <Notice kind="error">{msg}</Notice>
      <Field label="Site key" value={site} set={setSite} ph="6L…" mono error={siteBad} help="The public key. It is placed in the form’s page." />
      <Secret label="Secret key" saved={has} value={secret} set={setSecret} ph="6L…" />
      {secretBad && <p className="err">{secretBad}</p>}
      <div className="set-actions">
        <button className="pri" disabled={busy || !dirty || !ready} onClick={() => send(site.trim(), secret.trim(), "Spam protection saved")}>{busy ? "Saving…" : "Save"}</button>
        {on && <button className="danger-text" disabled={busy} onClick={async () => { if (await confirmDialog("Turn spam protection off? Forms will accept anyone.", { ok: "Turn off" })) send("", "", "Spam protection turned off"); }}>Turn off</button>}
      </div>
      {snack}
    </Card>
  );
}
