"use client";
import { useDirtyGuard } from "@/components/dirty-guard";
import { useState } from "react";
import Revisions from "../revisions";
import { DAYS, type Hours } from "@/lib/hours";

const fields = (h: Hours) => ({ openDays: h.schedule.openDays, openTime: h.schedule.openTime, closeTime: h.schedule.closeTime, closedMessage: h.schedule.closedMessage, closedMessageToday: h.schedule.closedMessageToday, address: h.contact.address });

export default function HoursEditor({ initial }: { initial: Hours }) {
  const [f, setF] = useState(fields(initial));
  const [msg, setMsg] = useState("");
  const [saved, setSaved] = useState(0);
  useDirtyGuard(f, saved);
  const set = (p: Partial<typeof f>) => { setMsg(""); setF({ ...f, ...p }); };
  const save = async () => {
    const r = await fetch("/api/webmaster/hours", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(f) });
    setMsg(r.ok ? "Saved." : await r.text());
    setSaved(saved + 1);
  };
  return (
    <>
      <h1>Hours &amp; address</h1>
      <p className="sub">Shown in the footer, on the contact page and on the home page. Use times like <b>10:00 AM</b>; <b>12:00 AM</b> means midnight.</p>
      {msg && <p className="sub" role="status">{msg}</p>}
      <div className="card" style={{ padding: 12 }}>
        <fieldset style={{ border: 0, padding: 0 }}>
          <legend>Open on</legend>
          {DAYS.map((d) => (
            <label key={d} style={{ marginRight: 12 }}>
              <input type="checkbox" checked={f.openDays.includes(d)} onChange={(e) => set({ openDays: e.target.checked ? [...f.openDays, d] : f.openDays.filter((x) => x !== d) })} /> {d}
            </label>
          ))}
        </fieldset>
        <p>
          <input aria-label="Opens" value={f.openTime} onChange={(e) => set({ openTime: e.target.value })} /> to{" "}
          <input aria-label="Closes" value={f.closeTime} onChange={(e) => set({ closeTime: e.target.value })} />
        </p>
        <p><input style={{ width: "100%" }} aria-label="Message for closed days" placeholder="Message for closed days" value={f.closedMessage} onChange={(e) => set({ closedMessage: e.target.value })} /></p>
        <p><input style={{ width: "100%" }} aria-label="Message when closed today" placeholder="Message when closed today" value={f.closedMessageToday} onChange={(e) => set({ closedMessageToday: e.target.value })} /></p>
        <p><label>Address (used on the contact page, map link, home page and anywhere pages use <code>{"{address}"}</code>)<input style={{ width: "100%" }} aria-label="Address" value={f.address} onChange={(e) => set({ address: e.target.value })} /></label></p>
        <div className="bar"><button className="pri" onClick={save}>Save</button></div>
      </div>
      <Revisions<Hours> api="/api/webmaster/hours" reload={saved}
        lines={(d) => [`Open: ${d.schedule.openDays.join(", ")}`, `Time: ${d.schedule.openTime} - ${d.schedule.closeTime}`, `Closed message: ${d.schedule.closedMessage}`, `Closed today message: ${d.schedule.closedMessageToday}`, `Address: ${d.contact.address}`]}
        onRevert={async (r) => { setF(fields(await r.json())); setMsg("Reverted."); }} />
    </>
  );
}
