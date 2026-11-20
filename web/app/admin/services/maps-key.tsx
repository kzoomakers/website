"use client";
import { useState } from "react";
import Notice from "@/components/notice";
import { confirmDialog } from "@/components/dialog";
import { Banner, Card, Field, Steps, useSnack } from "./card";

const LINK = { target: "_blank", rel: "noopener noreferrer" } as const;
const VALID = /^AIza[0-9A-Za-z_-]{35}$/;

// Google Maps API key for maps on the public site. Removing it turns maps off.
export default function MapsKey({ initial }: { initial: string }) {
  const [saved, setSaved] = useState(initial), [key, setKey] = useState(initial), [busy, setBusy] = useState(false), [msg, setMsg] = useState(""), [snack, say] = useSnack();
  const bad = key.trim() && !VALID.test(key.trim()) ? "Google Maps keys start with “AIza” and are 39 characters long." : "";
  const send = async (k: string, done: string) => {
    setBusy(true); setMsg("");
    const r = await fetch("/api/webmaster/maps-key", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: k }) }).catch(() => null);
    setBusy(false);
    if (r?.ok) { setSaved(k); setKey(k); say(done); } else setMsg(r ? await r.text() : "Couldn't reach the server. Try again.");
  };
  return (
    <Card title="Google Maps">
      {saved ? <Banner kind="ok" title="Maps are on">The address map on the public site is using your key.</Banner> : <Banner kind="off" title="Maps are off">Add a key to show a map of the space on the public site.</Banner>}
      <Steps open={!saved}>
        <li>Open <a href="https://console.cloud.google.com/google/maps-apis/credentials" {...LINK}>Google Cloud → Credentials</a> and choose <b>Create credentials → API key</b>.</li>
        <li>Under <b>Application restrictions</b> choose <b>Websites</b> and add this site’s address, so nobody else can use the key.</li>
        <li>Under <b>API restrictions</b> pick the Maps APIs the site uses, then paste the key below.</li>
      </Steps>
      <Notice kind="error">{msg}</Notice>
      <Field label="API key" value={key} set={setKey} ph="AIza…" mono error={bad} help="This kind of key is visible in visitors’ browsers, which is why the restrictions above matter." />
      <div className="set-actions">
        <button className="pri" disabled={busy || !key.trim() || !!bad || key.trim() === saved} onClick={() => send(key.trim(), "Maps key saved")}>{busy ? "Saving…" : "Save"}</button>
        {saved && <button className="danger-text" disabled={busy} onClick={async () => { if (await confirmDialog("Turn maps off? The map on the public site will stop showing.", { ok: "Turn off" })) send("", "Maps turned off"); }}>Turn off maps</button>}
      </div>
      {snack}
    </Card>
  );
}
