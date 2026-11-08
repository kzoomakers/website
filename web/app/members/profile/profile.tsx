"use client";
import { useEffect, useId, useRef, useState } from "react";
import "./rocker.css";
import "./toggle.css";
import "./profile.css";
import type { MySkill } from "@/lib/crm";
import { INDUSTRIES, OPEN_TO, SOCIALS, cleanTitle, type Fields, type FieldKey, FIELDS } from "@/lib/fields";

const LEVELS = [["learning", "Learning"], ["competent", "Knows it"], ["teach", "Can teach"]] as const;
type Init = { optin: boolean; show_phone: boolean; show_email: boolean; discord: string; show_discord: boolean; socials: Record<string, string>; show_socials: boolean; since: string; bio: string; photo: string; skills: MySkill[]; fields: Fields };

const Sec = ({ icon, title, desc, children }: { icon: string; title: string; desc: string; children: React.ReactNode }) => (
  <details className="mp-sec" open><summary><span className="mp-ico" aria-hidden>{icon}</span><span><h2>{title}</h2><p>{desc}</p></span></summary><div className="mp-body">{children}</div></details>
);
const Grp = ({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) => <fieldset className="mp-grp"><legend>{title}</legend>{desc && <p className="mp-d">{desc}</p>}{children}</fieldset>;
const Tgl = ({ id, on, set, label }: { id: string; on: boolean; set: (v: boolean) => void; label: string }) => (
  <div className="tgl-row">
    <span className="tgl-col"><b aria-hidden className="tgl-state" style={{ color: on ? "#2e9e4f" : "#777" }}>{on ? "ON" : "OFF"}</b>
      <span className="tgl-sw"><span className="round"><input type="checkbox" id={"tgl-" + id} checked={on} onChange={(e) => set(e.target.checked)} /><div className="back"><label className="but" htmlFor={"tgl-" + id}><span className="on">I</span><span className="off">0</span></label></div></span></span></span>
    <label htmlFor={"tgl-" + id}>{label}</label>
  </div>
);

// Tags you type or pick: always Title Case, letters/numbers/spaces/hyphens/periods only, and offers what other members already entered so spellings stay consistent.
function Chips({ label, help, value, set, sugg, max = 20, ph }: { label: string; help: string; value: string[]; set: (v: string[]) => void; sugg: string[]; max?: number; ph: string }) {
  const [d, setD] = useState(""), id = useId();
  const add = (raw: string) => {
    let t = cleanTitle(raw); setD("");
    if (!t) return;
    t = sugg.find((s) => s.toLowerCase() === t.toLowerCase()) ?? t;
    if (value.length < max && !value.some((x) => x.toLowerCase() === t.toLowerCase())) set([...value, t]);
  };
  const pop = sugg.filter((s) => !value.some((x) => x.toLowerCase() === s.toLowerCase())).slice(0, 8);
  return (
    <div className="mp-f" role="group" aria-labelledby={id}>
      <span className="mp-l" id={id}>{label}</span><span className="mp-h">{help}</span>
      <div className="mp-chips">
        {value.map((t) => <span key={t} className="mp-chip">{t}<button type="button" aria-label={`Remove ${t}`} onClick={() => set(value.filter((x) => x !== t))}>×</button></span>)}
        <input list={id + "-l"} aria-label={`Add to ${label}`} maxLength={60} placeholder={value.length ? "Add another…" : ph} value={d} disabled={value.length >= max}
          onChange={(e) => setD(e.target.value.replace(/[^\p{L}\p{N} .-]/gu, ""))}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(d); } else if (e.key === "Backspace" && !d) set(value.slice(0, -1)); }} onBlur={() => add(d)} />
        <datalist id={id + "-l"}>{sugg.map((s) => <option key={s} value={s} />)}</datalist>
      </div>
      {pop.length > 0 && <div className="mp-sug">Others picked: {pop.map((s) => <button type="button" key={s} onClick={() => add(s)}>+ {s}</button>)}</div>}
    </div>
  );
}

// My Profile: edit your directory listing. Everything saves itself a moment after you change it.
export default function Profile({ init, suggestions, values }: { values: Fields; init: Init; suggestions: string[] }) {
  const [optin, setOptin] = useState(init.optin), [bio, setBio] = useState(init.bio), [showPhone, setShowPhone] = useState(init.show_phone), [showEmail, setShowEmail] = useState(init.show_email);
  const [discord, setDiscord] = useState(init.discord), [showDiscord, setShowDiscord] = useState(init.show_discord), [socials, setSocials] = useState<Record<string, string>>(init.socials ?? {}), [showSocials, setShowSocials] = useState(init.show_socials);
  const [skills, setSkills] = useState(init.skills), [msg, setMsg] = useState(""), [photo, setPhoto] = useState(init.photo), [pm, setPm] = useState("");
  const [otherInd, setOtherInd] = useState(!!init.fields.industry?.[0] && !INDUSTRIES.includes(init.fields.industry[0])), [fields, setFields] = useState<Fields>(init.fields);
  const many = (k: FieldKey) => fields[k] ?? [], one = (k: FieldKey) => fields[k]?.[0] ?? "", sug = (k: string) => values[k] ?? [];
  const setMany = (k: FieldKey, v: string[]) => setFields({ ...fields, [k]: v }), setOne = (k: FieldKey, v: string) => setMany(k, v ? [v] : []);
  const text = (k: FieldKey, ph: string, list?: string) => <input list={list} maxLength={FIELDS[k].max} value={one(k)} onChange={(e) => setOne(k, e.target.value)} placeholder={ph} />;
  const upload = async (f?: File) => {
    if (!f) return;
    setPm("Uploading…");
    const fd = new FormData(); fd.set("file", f);
    const r = await fetch("/api/members/photo", { method: "POST", body: fd }).catch(() => null);
    if (r?.ok) { setPhoto((await r.json()).url); setPm(""); } else setPm(r ? await r.text() : "Network error. Try again.");
  };
  const drop = async () => { const r = await fetch("/api/members/photo", { method: "DELETE" }).catch(() => null); if (r?.ok) { setPhoto(""); setPm(""); } };
  const set = (i: number, p: Partial<MySkill>) => setSkills(skills.map((s, j) => (j === i ? { ...s, ...p } : s)));
  // Autosave: shortly after any change, send the whole profile. Skills still being typed (under 2 letters, or the box is focused) wait, so half-typed
  // words never reach the shared skill list; leaving the box (tick) saves them. Saves never overlap: a change during a save triggers one more after it.
  const [tick, setTick] = useState(0), first = useRef(true), saving = useRef(false), again = useRef(false);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const save = async () => {
      if (document.activeElement?.closest("[data-skill]")) return;
      if (saving.current) { again.current = true; return; }
      saving.current = true; setMsg("Saving…");
      const body = { op: "saveSkills", optin, show_phone: showPhone, show_email: showEmail, discord, show_discord: showDiscord, socials, show_socials: showSocials, bio, skills: skills.filter((s) => s.name.trim().length >= 2), fields };
      const r = await fetch("/api/members", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
      saving.current = false; setMsg(r?.ok ? "✓ All changes saved" : r ? await r.text() : "Couldn't save (network). Will retry on your next change.");
      if (again.current) { again.current = false; setTick((t) => t + 1); }
    };
    const t = setTimeout(save, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optin, showPhone, showEmail, discord, showDiscord, socials, showSocials, bio, skills, fields, tick]);
  const hasLink = !!discord.trim() || Object.values(socials).some((v) => v?.trim());
  const checks = [photo, bio.trim(), one("pronouns"), many("open_to").length, one("working_on"), one("looking_for"), many("machine").length, many("interests").length, skills.length, one("occupation"), one("city"), hasLink], pct = Math.round((checks.filter(Boolean).length / checks.length) * 100);
  const since = init.since ? new Date(init.since).toLocaleDateString([], { month: "long", year: "numeric" }) : "";
  return (
    <form className="mp" onSubmit={(e) => e.preventDefault()} onBlur={() => setTick((t) => t + 1)}>
      <div className="mp-meter" role="status"><div aria-hidden><i style={{ width: pct + "%" }} /></div><small>Profile {pct}% complete. {pct < 100 ? "A fuller profile makes it easier for members to say hi." : "Looking great! 🎉"}</small></div>
      {(["occupation", "company", "city", "neighborhood", "industry"] as const).map((k) => <datalist key={k} id={"v-" + k}>{sug(k).map((v) => <option key={v} value={v} />)}</datalist>)}
      <datalist id="v-pronouns">{["she/her", "he/him", "they/them", "she/they", "he/they", "ask me"].map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="skill-names">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>

      <Sec icon="📒" title="Your listing" desc="Whether other members can find you. Everything below only shows if you're listed.">
        <label style={{ display: "flex", gap: 14, alignItems: "center", padding: 14, border: `2px solid ${optin ? "#d30e00" : "#999"}`, borderRadius: 12, background: "url(/brushed-metal.svg) center/cover", color: "#f2f2f2", boxShadow: "0 1px 0 #fff4 inset, 0 3px 8px #0006" }}><span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flex: "none" }}><b aria-hidden style={{ letterSpacing: 1, color: optin ? "#ff5a4d" : "#e6e6e6", fontSize: 14, textShadow: optin ? "0 0 6px #ff0d0d" : "none" }}>{optin ? "ON" : "OFF"}</b><span className="rk"><input type="checkbox" checked={optin} onChange={(e) => setOptin(e.target.checked)} aria-label="List me in the member directory" />
          <span className="rk-frame"><span className="rk-sw">
            <span className="rk-top rk-c"><span>|</span><span className="rk-lt" /><span className="rk-top-back" /></span>
            <span className="rk-bottom rk-c"><span>O</span><span className="rk-lb" /><span className="rk-bottom-back" /></span>
          </span></span></span></span>
          <span><strong>List me in the member directory.</strong> Other signed-in members who are listed too can see my photo, first name, last initial, bio and skills, and message me. They never see my email, phone or address unless I switch one on below.</span></label>
        {since && <span className="mp-since">🗓️ Member since {since} <small style={{ opacity: .7 }}>(we already know this, so it's shown automatically)</small></span>}
      </Sec>

      <Sec icon="👋" title="Introduce yourself" desc="The first thing people see on your card.">
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          {photo ? <img src={photo} alt="Your photo" width={80} height={80} style={{ borderRadius: "50%", objectFit: "cover", flex: "none" }} />
            : <span aria-hidden style={{ width: 80, height: 80, borderRadius: "50%", background: "#ddd", display: "grid", placeItems: "center", fontSize: 28, color: "#777", flex: "none" }}>📷</span>}
          <div style={{ display: "grid", gap: 6 }}>
            <label className="btn btn-sm" style={{ cursor: "pointer", width: "fit-content" }}>{photo ? "Change photo" : "Upload a photo of yourself"}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} /></label>
            {photo && <button type="button" className="btn btn-sm" style={{ width: "fit-content" }} onClick={drop}>Remove photo</button>}
            <small className="mp-h">A friendly face helps people recognize you at the space.</small>
            {pm && <small role="status">{pm}</small>}
          </div>
        </div>
        <label className="mp-f"><span className="mp-l">Pronouns <small>(optional)</small></span><span className="mp-h">Shown next to your name so people know how to refer to you. Pick one or type your own.</span>{text("pronouns", "e.g. she/her, he/him, they/them", "v-pronouns")}</label>
        <label className="mp-f"><span className="mp-l">Short bio <small>(optional)</small></span><span className="mp-h">A sentence or two about you and what you like to make.</span><textarea rows={3} maxLength={500} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="What do you like to make?" /><span className="mp-count">{bio.length}/500</span></label>
      </Sec>

      <Sec icon="🤝" title="Let's connect" desc="Small details that give members a reason to start a conversation. This is the most useful section for meeting people.">
        <Grp title="What you're up for" desc="Tick anything you'd enjoy. It tells members what kind of connection is welcome.">
          <div className="mp-opts">{OPEN_TO.map((o) => <label key={o} className="mp-opt"><input type="checkbox" checked={many("open_to").includes(o)} onChange={(e) => setMany("open_to", e.target.checked ? [...many("open_to"), o] : many("open_to").filter((x) => x !== o))} />{o}</label>)}</div>
        </Grp>
        <Grp title="What's on your bench" desc="Two short lines that work as conversation starters on your card.">
          <label className="mp-f"><span className="mp-l">🔨 Currently working on</span><span className="mp-h">The project you're into right now, so people can ask about it or join in. <em>e.g. "A CNC-cut walnut bookshelf" or "Learning to solder a synth kit".</em></span>{text("working_on", "What are you building or learning?")}<span className="mp-count">{one("working_on").length}/120</span></label>
          <label className="mp-f"><span className="mp-l">🔎 Looking for</span><span className="mp-h">What you'd love help with or company for: a person, a skill, a tool, a partner. Members who can help will know to message you. <em>e.g. "Someone to teach me TIG welding" or "A buddy for Saturday build days".</em></span>{text("looking_for", "What would you like help with or company for?")}<span className="mp-count">{one("looking_for").length}/120</span></label>
        </Grp>
      </Sec>

      <Sec icon="🛠️" title="At the makerspace" desc="What you use, what you know and what you're into.">
        <Grp title="Favorite places and machines" desc="Helps members who love the same equipment find each other.">
          <Chips label="Favorite machine or area" help="Type one and press Enter, or tap a suggestion. Spelling is tidied for you." value={many("machine")} set={(v) => setMany("machine", v)} sugg={sug("machine")} ph="e.g. Laser Cutter, Wood Shop, 3D Printers" />
        </Grp>
        <Grp title="Skills" desc="What you can do, and how well. Others can search by skill and ask for help or lessons.">
          {skills.map((s, i) => (
            <div key={i} data-skill style={{ display: "grid", gap: 6, gridTemplateColumns: "2fr 1.3fr auto", alignItems: "center" }}>
              <input list="skill-names" required minLength={2} maxLength={40} aria-label="Skill" placeholder="Skill (e.g. MIG welding)" value={s.name} onChange={(e) => set(i, { name: e.target.value })} />
              <select aria-label="Level" value={s.level} onChange={(e) => set(i, { level: e.target.value as MySkill["level"] })}>{LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              <button type="button" className="btn btn-sm" aria-label={`Remove ${s.name || "skill"}`} onClick={() => setSkills(skills.filter((_, j) => j !== i))}>✕</button>
              <input style={{ gridColumn: "1 / -1" }} maxLength={140} aria-label="Note" placeholder="Note (optional), e.g. aluminum, small parts" value={s.note} onChange={(e) => set(i, { note: e.target.value })} />
            </div>
          ))}
          {skills.length < 20 && <div><button type="button" className="btn btn-sm" onClick={() => setSkills([...skills, { name: "", level: "competent", note: "" }])}>+ Add a skill</button></div>}
        </Grp>
        <Chips label="Interests" help="Hobbies and topics, in or out of the shop. Good for finding people to chat with." value={many("interests")} set={(v) => setMany("interests", v)} sugg={sug("interests")} ph="e.g. Woodworking, Robotics, Board Games" />
      </Sec>

      <Sec icon="🪪" title="About you" desc="Optional background. Members can search and filter by these.">
        <div className="mp-two">
          <label className="mp-f"><span className="mp-l">Occupation</span>{text("occupation", "e.g. Nurse, Machinist", "v-occupation")}</label>
          <label className="mp-f"><span className="mp-l">Company</span>{text("company", "Where you work", "v-company")}</label>
        </div>
        <label className="mp-f"><span className="mp-l">Industry</span><select value={otherInd ? "Other" : one("industry")} onChange={(e) => { const v = e.target.value; setOtherInd(v === "Other"); setOne("industry", v === "Other" ? "" : v); }}>
          <option value="">Not listed</option>{INDUSTRIES.map((i) => <option key={i}>{i}</option>)}<option>Other</option></select></label>
        {otherInd && <input list="v-industry" maxLength={60} aria-label="Other industry" placeholder="Your industry" value={one("industry")} onChange={(e) => setOne("industry", e.target.value)} />}
        <div className="mp-two">
          <label className="mp-f"><span className="mp-l">City</span>{text("city", "e.g. Kalamazoo", "v-city")}</label>
          <label className="mp-f"><span className="mp-l">Neighborhood</span>{text("neighborhood", "e.g. Vine, Edison, Milwood", "v-neighborhood")}</label>
        </div>
        <small className="mp-h">Letters, numbers, spaces, hyphens and periods only. Capitalization is tidied for you, and spellings match what other members used.</small>
      </Sec>

      <Sec icon="📬" title="Contact and links" desc="Each one is off until you choose to show it. Only other listed members can see them.">
        <Grp title="Contact details" desc="Taken from your account. Members can always message you through the site without seeing these.">
          <Tgl id="email" on={showEmail} set={setShowEmail} label="List my email in member directory" />
          <Tgl id="phone" on={showPhone} set={setShowPhone} label="List my phone number in member directory" />
        </Grp>
        <Grp title="Chat and social" desc="Add your handles so people can find you elsewhere. Leave blank any you don't use.">
          <label className="mp-f"><span className="mp-l">Discord username</span><span className="mp-h">Your username, not the old name#1234 style.</span><span className="mp-pre"><span>@</span><input maxLength={40} value={discord} onChange={(e) => setDiscord(e.target.value)} placeholder="makerjane" autoComplete="off" /></span></label>
          {discord.trim() && <Tgl id="discord" on={showDiscord} set={setShowDiscord} label="List my Discord username in member directory" />}
          <div className="mp-two">
            {(Object.keys(SOCIALS) as (keyof typeof SOCIALS)[]).map((k) => (
              <label key={k} className="mp-f"><span className="mp-l">{SOCIALS[k].label}</span>
                <span className="mp-pre">{SOCIALS[k].prefix && <span>{SOCIALS[k].prefix}</span>}<input maxLength={200} value={socials[k] ?? ""} onChange={(e) => setSocials({ ...socials, [k]: e.target.value })} placeholder={SOCIALS[k].ph} autoComplete="off" /></span></label>
            ))}
          </div>
          {Object.values(socials).some((v) => v?.trim()) && <Tgl id="socials" on={showSocials} set={setShowSocials} label="List my GitHub, Instagram, YouTube and website links in member directory" />}
        </Grp>
      </Sec>
      {msg && <p role="status" className="mp-status">{msg}</p>}
    </form>
  );
}
