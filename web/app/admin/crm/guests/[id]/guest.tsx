"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Notice from "@/components/notice";
import { confirmDialog } from "@/components/dialog";
import PiiButton from "@/components/pii-retrieve";
import IdPhoto from "../../people/[id]/id-photo";
import "../../people/[id]/person.css";

type G = { id: number; first_name: string; last_name: string; email: string; host_id: number; host_name: string; minor: boolean | null; ready: boolean; next: string | null; done: Record<string, boolean>; id_expired: boolean; has_photo: boolean; ever_signed: boolean; needs_resign: boolean; signed_doc: number | null; retain_until: string | null; deletable: boolean; delete_requested_at: string | null; last_visit: string | null; created_at: string };
const STEPS: [string, string][] = [["details", "Details"], ["emergency", "Emergency contact"], ["agreement", "Agreement"], ["photo", "Photo ID"]];
const when = (s: string) => new Date(s).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
const day = (s: string) => new Date(s).toLocaleDateString([], { dateStyle: "medium" });

export default function Guest({ guest: g, visits, canEdit }: { guest: G; visits: string[]; canEdit: boolean }) {
  const router = useRouter(), [msg, setMsg] = useState(""), name = `${g.first_name} ${g.last_name}`.trim() || "(not started)";
  const del = async () => {
    const warn = g.deletable ? `Delete ${name} and everything we hold about them?` : `WARNING: ${name} is still inside the record-keeping period (until ${day(g.retain_until!)}). Deleting now is before the retention period ends. Delete everything anyway?`;
    if (!(await confirmDialog(warn, { ok: "Delete", danger: true }))) return;
    const r = await fetch("/api/webmaster/guests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "delete", id: g.id, override: true }) }).catch(() => null);
    if (r?.ok) router.push("/admin/crm/guests"); else setMsg(r ? await r.text() : "Couldn't reach the server.");
  };
  return (
    <>
      <Link className="pp-back" href="/admin/crm/guests">← All guests</Link>
      <header className="pp-hero"><div className="pp-hero-in">
        <div className="pp-av" aria-hidden>{(name[0] ?? "?").toUpperCase()}</div>
        <div className="pp-id">
          <h1>{name}</h1>
          <p>{g.email} · brought by <Link href={`/admin/crm/people/${g.host_id}`}>{g.host_name}</Link></p>
          <div className="pp-chips">
            {g.ready ? <span className="chip ok">Ready</span> : <span className="chip warn">Incomplete</span>}
            {g.minor && <span className="chip">minor</span>}
            {g.needs_resign ? <span className="chip warn">must re-sign</span> : g.ever_signed ? <span className="chip ok">agreement signed</span> : <span className="chip">never signed</span>}
            {g.id_expired && <span className="chip bad">ID expired</span>}
            {g.delete_requested_at && <span className="chip bad">asked to be deleted</span>}
          </div>
        </div>
      </div></header>
      <Notice kind="error">{msg}</Notice>
      <div className="pp-cols">
        <div>
          <h2>Progress</h2>
          <div className="pp-sec">{STEPS.map(([k, l]) => <p key={k} style={{ margin: "4px 0" }}>{g.done[k] ? "✅" : "⬜"} {l}{k === "photo" && g.id_expired ? " (expired)" : ""}</p>)}</div>

          <h2>Phone &amp; address</h2>
          <div className="pp-sec"><PiiButton kind="personal" subject={{ type: "guest", id: g.id }} label="Retrieve info">{(d) => <>
            <p style={{ margin: "2px 0" }}><a href={`tel:${d.phone}`}>{d.phone}</a></p>
            <p style={{ margin: "2px 0" }}>{d.address}, {d.zip} {d.state}</p>
            {d.guardian_name && <p style={{ margin: "2px 0" }}>Guardian: {d.guardian_name}</p>}
          </>}</PiiButton></div>

          <h2>Emergency contacts</h2>
          <div className="pp-sec"><PiiButton kind="emergency" subject={{ type: "guest", id: g.id }} label="Retrieve emergency contacts">{(d) => <>
            {d.contacts.map((k: any) => <div className="pp-ec" key={k.id}>
              <strong>{k.first_name} {k.last_name}</strong> <span className="chip">{k.relationship}</span><br />
              <a href={`tel:${k.phone}`}>{k.phone}</a>{k.business_phone && <> · work <a href={`tel:${k.business_phone}`}>{k.business_phone}</a></>}
              {k.address && <div className="sub" style={{ margin: 0 }}>{k.address}</div>}
            </div>)}
            {!d.contacts.length && <p className="sub">None on file.</p>}
          </>}</PiiButton></div>

          <h2>Signed guest agreement</h2>
          <div className="pp-sec">{g.signed_doc
            ? <PiiButton kind="signed_doc" subject={{ type: "guest", id: g.id, doc: g.signed_doc }} label="Retrieve signed agreement">{(d) => <a href={d.pdf} download={`${String(d.title).replace(/[^\w.-]+/g, "_").slice(0, 60)}.pdf`}>⬇ {d.title} (PDF)</a>}</PiiButton>
            : <p className="sub" style={{ margin: 0 }}>Not signed yet.</p>}</div>

          <h2>Check-ins ({visits.length})</h2>
          <div className="pp-sec">{visits.length ? <ul style={{ margin: 0, paddingLeft: 18 }}>{visits.map((v) => <li key={v}>{when(v)}</li>)}</ul> : <p className="sub" style={{ margin: 0 }}>Never checked in.</p>}</div>
        </div>
        <aside className="pp-side">
          <section className="pp-sec"><h2>Gov ID</h2>{g.has_photo ? <IdPhoto id={g.id} type="guest" /> : <p className="sub" style={{ margin: 0 }}>No ID on file.</p>}</section>
          <section className="pp-sec"><h2>Records</h2>
            <p className="sub" style={{ margin: 0 }}>Added {day(g.created_at)}{g.last_visit ? ` · last visit ${day(g.last_visit)}` : ""}.<br />{g.retain_until ? `Kept until ${day(g.retain_until)}.` : "Nothing signed, so nothing to keep."}</p>
            {canEdit && <p style={{ margin: "10px 0 0" }}><button type="button" className="danger" onClick={del}>Delete guest</button></p>}
          </section>
        </aside>
      </div>
    </>
  );
}
