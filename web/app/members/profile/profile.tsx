"use client";
import { useEffect, useRef, useState } from "react";
import "./rocker.css";
import "./toggle.css";
import type { MySkill } from "@/lib/crm";
import { INDUSTRIES, type Fields } from "@/lib/fields";

const LEVELS = [["learning", "Learning"], ["competent", "Knows it"], ["teach", "Can teach"]] as const;

// My Profile: edit your directory listing: opt in, a short bio, and the skills you want to advertise.
const interests = (v?: string) => (v ?? "").split(",").map((x) => x.trim()).filter(Boolean);

export default function Profile({ init, suggestions, values }: { values: Fields; init: { optin: boolean; show_phone: boolean; show_email: boolean; bio: string; photo: string; skills: MySkill[]; fields: Fields }; suggestions: string[] }) {
  const [optin, setOptin] = useState(init.optin), [bio, setBio] = useState(init.bio), [showPhone, setShowPhone] = useState(init.show_phone), [showEmail, setShowEmail] = useState(init.show_email), [skills, setSkills] = useState(init.skills), [msg, setMsg] = useState(""), [busy, setBusy] = useState(false), [photo, setPhoto] = useState(init.photo), [pm, setPm] = useState(""), [draft, setDraft] = useState(""), [otherInd, setOtherInd] = useState(!!init.fields.industry?.[0] && !INDUSTRIES.includes(init.fields.industry[0])), [fields, setFields] = useState<Record<string, string>>(Object.fromEntries(Object.entries(init.fields).map(([k, v]) => [k, v.join(", ")])));
  // The photo saves as soon as it is chosen (separately from the rest of the form); choosing another replaces it.
  const upload = async (f?: File) => {
    if (!f) return;
    setPm("Uploading…");
    const fd = new FormData(); fd.set("file", f);
    const r = await fetch("/api/members/photo", { method: "POST", body: fd }).catch(() => null);
    if (r?.ok) { setPhoto((await r.json()).url); setPm(""); } else setPm(r ? await r.text() : "Network error. Try again.");
  };
  const drop = async () => { const r = await fetch("/api/members/photo", { method: "DELETE" }).catch(() => null); if (r?.ok) { setPhoto(""); setPm(""); } };
  const addInterest = () => {
    const t = draft.trim().replace(/\s+/g, " "), have = interests(fields.interests);
    setDraft("");
    if (t && !have.some((x) => x.toLowerCase() === t.toLowerCase()) && have.length < 20) setFields({ ...fields, interests: [...have, t].join(",") });
  };
  const set = (i: number, p: Partial<MySkill>) => setSkills(skills.map((s, j) => (j === i ? { ...s, ...p } : s)));
  // Autosave: shortly after any change, send the whole profile. Skills still being typed (under 2 letters, or the box is focused) wait, so half-typed
  // words never reach the shared skill list; leaving the box (tick) saves them. Saves never overlap: a change during a save triggers one more after it.
  const [tick, setTick] = useState(0), first = useRef(true), saving = useRef(false), again = useRef(false);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const save = async () => {
      if (document.activeElement?.closest("[data-skill]")) return;
      if (saving.current) { again.current = true; return; }
      saving.current = true; setBusy(true); setMsg("Saving…");
      const body = { op: "saveSkills", optin, show_phone: showPhone, show_email: showEmail, bio, skills: skills.filter((s) => s.name.trim().length >= 2),
        fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, k === "interests" ? interests(v) : [v]])) };
      const r = await fetch("/api/members", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
      saving.current = false; setBusy(false); setMsg(r?.ok ? "All changes saved." : r ? await r.text() : "Couldn't save (network). Will retry on your next change.");
      if (again.current) { again.current = false; setTick((t) => t + 1); }
    };
    const t = setTimeout(save, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optin, showPhone, showEmail, bio, skills, fields, tick]);
  return (
    <form style={{ display: "grid", gap: 14, maxWidth: 620 }} onSubmit={(e) => e.preventDefault()} onBlur={() => setTick((t) => t + 1)}>
      {["occupation", "company", "city", "neighborhood", "industry", "interests"].map((k) => <datalist key={k} id={"v-" + k}>{(values[k] ?? []).map((v) => <option key={v} value={v} />)}</datalist>)}
      <datalist id="skill-names">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
      <label style={{ display: "flex", gap: 14, alignItems: "center", padding: 14, border: `2px solid ${optin ? "#d30e00" : "#999"}`, borderRadius: 12, background: "url(/brushed-metal.svg) center/cover", color: "#f2f2f2", boxShadow: "0 1px 0 #fff4 inset, 0 3px 8px #0006" }}><span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flex: "none" }}><b aria-hidden style={{ letterSpacing: 1, color: optin ? "#ff5a4d" : "#e6e6e6", fontSize: 14, textShadow: optin ? "0 0 6px #ff0d0d" : "none" }}>{optin ? "ON" : "OFF"}</b><span className="rk"><input type="checkbox" checked={optin} onChange={(e) => setOptin(e.target.checked)} aria-label="List me in the member directory" />
        <span className="rk-frame"><span className="rk-sw">
          <span className="rk-top rk-c"><span>|</span><span className="rk-lt" /><span className="rk-top-back" /></span>
          <span className="rk-bottom rk-c"><span>O</span><span className="rk-lb" /><span className="rk-bottom-back" /></span>
        </span></span></span></span>
        <span><strong>List me in the member directory.</strong> Other signed-in members who are listed too can see my photo, first name, last initial, bio and skills, and message me. They never see my email, phone or address unless I switch one on below.</span></label>
      {([["phone", "List my phone number in member directory", showPhone, setShowPhone], ["email", "List my email in member directory", showEmail, setShowEmail]] as const).map(([k, t, on, set]) => (
        <div key={k} className="tgl-row">
          <span className="tgl-col"><b aria-hidden className="tgl-state" style={{ color: on ? "#2e9e4f" : "#777" }}>{on ? "ON" : "OFF"}</b>
            <span className="tgl-sw"><span className="round"><input type="checkbox" id={"tgl-" + k} checked={on} onChange={(e) => set(e.target.checked)} /><div className="back"><label className="but" htmlFor={"tgl-" + k}><span className="on">I</span><span className="off">0</span></label></div></span></span></span>
          <label htmlFor={"tgl-" + k}>{t}</label>
        </div>))}
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        {photo ? <img src={photo} alt="Your photo" width={80} height={80} style={{ borderRadius: "50%", objectFit: "cover", flex: "none" }} />
          : <span aria-hidden style={{ width: 80, height: 80, borderRadius: "50%", background: "#ddd", display: "grid", placeItems: "center", fontSize: 28, color: "#777", flex: "none" }}>📷</span>}
        <div style={{ display: "grid", gap: 6 }}>
          <label className="btn btn-sm" style={{ cursor: "pointer", width: "fit-content" }}>{photo ? "Change photo" : "Upload a photo of yourself"}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} /></label>
          {photo && <button type="button" className="btn btn-sm" style={{ width: "fit-content" }} onClick={drop}>Remove photo</button>}
          {pm && <small role="status">{pm}</small>}
        </div>
      </div>
      <label>Short bio (optional)<textarea rows={3} maxLength={500} value={bio} onChange={(e) => setBio(e.target.value)} style={{ width: "100%" }} placeholder="What do you like to make?" /></label>
      <h2>About me</h2>
      <label>Occupation<input list="v-occupation" maxLength={60} value={fields.occupation ?? ""} onChange={(e) => setFields({ ...fields, occupation: e.target.value })} placeholder="e.g. Nurse, machinist, retired teacher" style={{ width: "100%" }} /></label>
      <label>Company<input list="v-company" maxLength={60} value={fields.company ?? ""} onChange={(e) => setFields({ ...fields, company: e.target.value })} style={{ width: "100%" }} /></label>
      <label>Industry<select value={otherInd ? "Other" : fields.industry ?? ""} onChange={(e) => { const v = e.target.value; setOtherInd(v === "Other"); setFields({ ...fields, industry: v === "Other" ? "" : v }); }} style={{ width: "100%" }}>
        <option value="">Not listed</option>{INDUSTRIES.map((i) => <option key={i}>{i}</option>)}<option>Other</option></select></label>
      {otherInd && <input list="v-industry" maxLength={60} aria-label="Other industry" placeholder="Your industry" value={fields.industry ?? ""} onChange={(e) => setFields({ ...fields, industry: e.target.value })} />}
      <label>City<input list="v-city" maxLength={60} value={fields.city ?? ""} onChange={(e) => setFields({ ...fields, city: e.target.value })} placeholder="e.g. Kalamazoo" style={{ width: "100%" }} /></label>
      <label>Neighborhood<input list="v-neighborhood" maxLength={60} value={fields.neighborhood ?? ""} onChange={(e) => setFields({ ...fields, neighborhood: e.target.value })} placeholder="e.g. Vine, Edison, Milwood" style={{ width: "100%" }} /></label>
      <div>Interests
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4, padding: 6, border: "1px solid var(--line, #ccc)", borderRadius: 8 }}>
          {interests(fields.interests).map((t) => (
            <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 4px 2px 10px", borderRadius: 999, border: "1px solid var(--line, #ccc)", fontSize: 14 }}>{t}
              <button type="button" aria-label={`Remove ${t}`} onClick={() => setFields({ ...fields, interests: interests(fields.interests).filter((x) => x !== t).join(",") })} style={{ border: 0, background: "none", color: "inherit", cursor: "pointer", padding: "0 6px", fontSize: 16, lineHeight: 1 }}>×</button></span>
          ))}
          <input list="v-interests" aria-label="Add an interest" maxLength={60} placeholder={interests(fields.interests).length ? "Add another…" : "Type an interest and press Enter (e.g. woodworking)"} value={draft} disabled={interests(fields.interests).length >= 20}
            onChange={(e) => setDraft(e.target.value.includes(",") ? "" : e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addInterest(); } else if (e.key === "Backspace" && !draft) setFields({ ...fields, interests: interests(fields.interests).slice(0, -1).join(",") }); }}
            onBlur={addInterest} style={{ flex: "1 1 160px", border: 0, background: "transparent", minWidth: 120 }} />
        </div>
      </div>
      <h2>Skills</h2>
      {skills.map((s, i) => (
        <div key={i} data-skill style={{ display: "grid", gap: 6, gridTemplateColumns: "2fr 1.3fr auto", alignItems: "center" }}>
          <input list="skill-names" required minLength={2} maxLength={40} aria-label="Skill" placeholder="Skill (e.g. MIG welding)" value={s.name} onChange={(e) => set(i, { name: e.target.value })} />
          <select aria-label="Level" value={s.level} onChange={(e) => set(i, { level: e.target.value as MySkill["level"] })}>{LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <button type="button" className="btn btn-sm" aria-label={`Remove ${s.name || "skill"}`} onClick={() => setSkills(skills.filter((_, j) => j !== i))}>✕</button>
          <input style={{ gridColumn: "1 / -1" }} maxLength={140} aria-label="Note" placeholder="Note (optional), e.g. aluminum, small parts" value={s.note} onChange={(e) => set(i, { note: e.target.value })} />
        </div>
      ))}
      {skills.length < 20 && <div><button type="button" className="btn btn-sm" onClick={() => setSkills([...skills, { name: "", level: "competent", note: "" }])}>+ Add a skill</button></div>}
      {msg && <p role="status" style={{ margin: 0, color: "var(--mut, #888)", fontSize: 13 }}>{msg}</p>}
    </form>
  );
}
