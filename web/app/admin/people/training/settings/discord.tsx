"use client";
import { useState } from "react";
import { alertDialog } from "@/components/dialog";
import { training } from "../rpc";

type Init = { cfg: { enabled: boolean; hasWebhook: boolean; webhook: string; name: string; avatar: string; embed: boolean; color: string; templates: string[] }; sends: { id: number; at: string; tool: string; status: string; error: string }[] };

export default function Discord({ init }: { init: Init }) {
  const c = init.cfg, [on, setOn] = useState(c.enabled), [hook, setHook] = useState(""), [name, setName] = useState(c.name), [avatar, setAvatar] = useState(c.avatar), [embed, setEmbed] = useState(c.embed), [color, setColor] = useState(c.color), [tpl, setTpl] = useState(c.templates.join("\n"));
  const save = (extra: object = {}) => training("discordSave", { cfg: { enabled: on, webhook: hook, name, avatar, embed, color, templates: tpl.split("\n"), ...extra } }).then(() => { alertDialog("Saved."); setHook(""); }, (x) => alertDialog(x.message));
  return (
    <>
      <h2>Discord announcements</h2>
      <p className="sub">Posts "newly authorized" to a channel through a webhook (Discord channel settings, Integrations, Webhooks). Only members who opt in on their Training page are named. The address is a secret: it is stored encrypted and never shown again.</p>
      <div className="card" style={{ padding: 16 }}>
        <label><input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} /> Announcements are on</label>
        <label>Webhook {c.hasWebhook && <span className="tag">saved: {c.webhook}</span>} <input style={{ width: "100%" }} placeholder={c.hasWebhook ? "Paste a new address to replace it" : "https://discord.com/api/webhooks/…"} value={hook} onChange={(e) => setHook(e.target.value)} autoComplete="off" /></label>
        <label>Name shown on posts <input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Picture address (https, optional) <input value={avatar} onChange={(e) => setAvatar(e.target.value)} /></label>
        <label><input type="checkbox" checked={embed} onChange={(e) => setEmbed(e.target.checked)} /> Use a card (embed) <input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></label>
        <label>Congratulation lines, one per line, picked at random. Use {"{{name}}"} and {"{{tool}}"}. <textarea rows={4} style={{ width: "100%" }} value={tpl} onChange={(e) => setTpl(e.target.value)} /></label>
        <div className="bar">
          <button className="pri" onClick={() => save()}>Save</button>
          <button onClick={() => training("discordTest").then(() => alertDialog("Test post sent."), (x) => alertDialog(x.message))}>Send a test post</button>
          {c.hasWebhook && <button onClick={() => save({ clearWebhook: true })}>Remove webhook</button>}
        </div>
      </div>
      {init.sends.length > 0 && <><h3>Last posts</h3><ul>{init.sends.map((s) => <li key={s.id}>{new Date(s.at).toLocaleString("en-US", { timeZone: "America/Detroit" })}: {s.tool}, {s.status}{s.error ? ` (${s.error})` : ""}</li>)}</ul></>}
    </>
  );
}
