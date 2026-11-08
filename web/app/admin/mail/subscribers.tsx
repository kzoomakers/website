"use client";
import { confirmDialog, promptDialog } from "@/components/dialog";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { rpc, when, type State } from "./api";

const TABS = [["all", "All"], ["subscribed", "Subscribed"], ["unconfirmed", "Unconfirmed"], ["unsubscribed", "Unsubscribed"], ["bounced", "Bounced"], ["complained", "Spam complaints"], ["inactive", "Inactive"], ["trash", "Trash"]] as const;
type Sub = { id: number; email: string; name: string; status: string; lists: number[]; created_at: string; tags: string[]; consent_at: string | null; consent_ip: string; consent_source: string; confirmed_at: string | null; unsub_reason: string };
const consent = (r: Sub) => r.consent_at ? `Consent recorded ${when(r.consent_at)} via ${r.consent_source || "unknown"}${r.consent_ip ? " (IP " + r.consent_ip + ")" : ""}${r.confirmed_at ? ", confirmed " + when(r.confirmed_at) : ""}.` : "No consent record.";
const blank = { email: "", name: "", status: "subscribed", lists: [] as number[], tags: "" };

export default function Subscribers({ s, reload }: { s: State; reload: () => void }) {
  const q = useSearchParams();
  const [status, setStatus] = useState(q.get("status") || "all");
  const [list, setList] = useState(Number(q.get("list")) || 0);
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ rows: Sub[]; counts: Record<string, number>; total: number; pages: number } | null>(null);
  const [sel, setSel] = useState<number[]>([]);
  const [edit, setEdit] = useState<(typeof blank & { id?: number; note?: string }) | null>(null);
  const [imp, setImp] = useState(false);
  const [act, setAct] = useState<{ email: string; rows: any[] } | null>(null);
  const [text, setText] = useState("");
  const [impStatus, setImpStatus] = useState("subscribed");
  const [impLists, setImpLists] = useState<number[]>([]);
  const [bulk, setBulk] = useState("");
  const [msg, setMsg] = useState("");
  const load = useCallback(() => rpc("subscribers", { status, list: list || undefined, search, page, tag: tag || undefined }).then((d) => { setData(d); setSel([]); }).catch((e) => setMsg(e.message)), [status, list, search, page, tag]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);
  const after = () => { load(); reload(); };
  const doBulk = async () => {
    if (!bulk || !sel.length) return;
    const [action, l] = bulk.split(":");
    if (action === "erase") { if (!(await confirmDialog(`Permanently erase ${sel.length} ${sel.length === 1 ? 'person' : 'people'} and everything we hold about them? This can't be undone.`, { ok: `Erase ${sel.length}`, danger: true }))) return; try { for (const id of sel) await rpc("erasePerson", { id }); setBulk(""); after(); } catch (e: any) { setMsg(e.message); } return; }
    if (action === "addTag" || action === "removeTag") { const tg = await promptDialog("Tag name?"); if (!tg) return; try { await rpc("bulkSubscribers", { ids: sel, action, tag: tg }); setBulk(""); after(); } catch (e: any) { setMsg(e.message); } return; }
    if (action === "delete" && !(await confirmDialog(`Permanently delete ${sel.length} ${sel.length === 1 ? 'person' : 'people'}?`, { ok: `Delete ${sel.length}`, danger: true }))) return;
    try { await rpc("bulkSubscribers", { ids: sel, action, list: Number(l) || undefined }); setBulk(""); after(); } catch (e: any) { setMsg(e.message); }
  };
  const names = (ids: number[]) => ids.map((i) => s.lists.find((l) => l.id === i)?.name).filter(Boolean).join(", ");
  const all = !!data?.rows.length && sel.length === data.rows.length;
  return (
    <>
      <h1>Subscribers <button className="pri" onClick={() => setEdit({ ...blank })}>New subscriber</button> <button onClick={() => setImp(!imp)}>Import</button>
        <button onClick={async () => { const { csv } = await rpc("exportSubscribers", { status, list: list || undefined, search }); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "subscribers.csv"; a.click(); }}>Export</button></h1>
      {msg && <p className="err" role="alert">{msg}</p>}
      {imp && (
        <div className="card" style={{ padding: 14, marginBottom: 14 }}>
          <b>Import subscribers</b>
          <p className="sub">One per line: <code>email</code> or <code>Name, email</code>. A CSV export from MailPoet works — the email is found on each line. Only import people who agreed to hear from you.</p>
          <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); }} />
          <textarea style={{ width: "100%", marginTop: 8 }} rows={5} value={text} onChange={(e) => setText(e.target.value)} />
          <p>Status: <select value={impStatus} onChange={(e) => setImpStatus(e.target.value)}><option value="subscribed">Subscribed</option><option value="unconfirmed">Unconfirmed</option><option value="unsubscribed">Unsubscribed</option></select></p>
          <p>Add to: {s.lists.map((l) => <label className="in" key={l.id}><input type="checkbox" checked={impLists.includes(l.id)} onChange={(e) => setImpLists(e.target.checked ? [...impLists, l.id] : impLists.filter((x) => x !== l.id))} />{l.name}</label>)}</p>
          <button className="pri" disabled={!text.trim()} onClick={async () => { try { const r = await rpc("addSubscribers", { text, lists: impLists, status: impStatus }); setMsg(`Imported ${r.added} people.`); setText(""); setImp(false); after(); } catch (e: any) { setMsg(e.message); } }}>Import</button>
        </div>)}
      {edit && (
        <div className="modal-bg" onClick={() => setEdit(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{edit.id ? "Edit subscriber" : "New subscriber"}</h2>
            <label className="field"><span>Email</span><input type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></label>
            <label className="field"><span>Name</span><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
            <label className="field"><span>Tags (comma-separated)</span><input value={edit.tags} onChange={(e) => setEdit({ ...edit, tags: e.target.value })} /></label>
            <label className="field"><span>Status</span><select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option value="subscribed">Subscribed</option><option value="unconfirmed">Unconfirmed</option><option value="unsubscribed">Unsubscribed</option></select></label>
            {edit.id && edit.note && <p className="sub">{edit.note}</p>}
            <div className="field"><span>Lists</span>{s.lists.map((l) => <label className="in" key={l.id}><input type="checkbox" checked={edit.lists.includes(l.id)} onChange={(e) => setEdit({ ...edit, lists: e.target.checked ? [...edit.lists, l.id] : edit.lists.filter((x) => x !== l.id) })} />{l.name}</label>)}</div>
            <div className="bar"><button className="pri" onClick={async () => { try { await rpc("saveSubscriber", { subscriber: edit }); setEdit(null); setMsg(""); after(); } catch (e: any) { setMsg(e.message); setEdit(null); } }}>Save</button><button onClick={() => setEdit(null)}>Cancel</button></div>
          </div>
        </div>)}
      {act && (
        <div className="modal-bg" onClick={() => setAct(null)}>
          <div className="modal" style={{ maxWidth: 680, maxHeight: "90vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <h2>Activity: {act.email}</h2>
            <table className="mp-table">
              <thead><tr><th>Email</th><th>Opened</th><th>Clicked</th></tr></thead>
              <tbody>
                {act.rows.map((r) => (
                  <tr key={r.campaign_id}>
                    <td><b>{r.subject}</b><br /><small>{r.status === "sent" ? "sent " + when(r.sent_at) : r.status}</small></td>
                    <td>{r.opened_at ? <>✓ <small>{when(r.opened_at)}{r.opens > 1 ? ` · ${r.opens} times` : ""}</small></> : <span className="mut">–</span>}</td>
                    <td>{r.clicks ? <small>{r.urls?.join(", ")}</small> : <span className="mut">–</span>}</td>
                  </tr>))}
              </tbody>
            </table>
            {!act.rows.length && <p className="sub">No emails have been sent to this person yet.</p>}
            <p className="sub">Opens are approximate: some mail apps pre-load images (counting an open nobody made) and others block them.</p>
            <div className="bar"><button onClick={() => setAct(null)}>Close</button></div>
          </div>
        </div>)}
      <div className="mp-tabs">{TABS.map(([k, label]) => <button key={k} aria-current={status === k ? "true" : undefined} onClick={() => { setStatus(k); setPage(0); }}>{label} <small>({data?.counts[k] ?? 0})</small></button>)}</div>
      <div className="bar">
        <select aria-label="Bulk action" value={bulk} onChange={(e) => setBulk(e.target.value)}>
          <option value="">Bulk action…</option>
          {status === "trash" ? <><option value="restore">Restore</option><option value="delete">Delete permanently</option><option value="erase">Erase all data (GDPR)</option></> : <>
            {s.lists.map((l) => <option key={"a" + l.id} value={"addToList:" + l.id}>Add to “{l.name}”</option>)}
            {s.lists.map((l) => <option key={"r" + l.id} value={"removeFromList:" + l.id}>Remove from “{l.name}”</option>)}
            <option value="addTag">Add tag…</option><option value="removeTag">Remove tag…</option><option value="unsubscribe">Unsubscribe</option><option value="trash">Move to trash</option></>}
        </select>
        <button disabled={!bulk || !sel.length} onClick={doBulk}>Apply{sel.length ? ` (${sel.length})` : ""}</button>
        <select aria-label="Filter by tag" value={tag} onChange={(e) => { setTag(e.target.value); setPage(0); }}><option value="">All tags</option>{s.tags.map((t) => <option key={t} value={t}>{t}</option>)}</select>
        <select aria-label="Filter by list" value={list} onChange={(e) => { setList(+e.target.value); setPage(0); }}><option value={0}>All lists</option>{s.lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
        <input type="search" placeholder="Search subscribers" aria-label="Search subscribers" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} style={{ width: 220 }} />
      </div>
      <table className="mp-table">
        <thead><tr><th style={{ width: 30 }}><input type="checkbox" aria-label="Select all" checked={all} onChange={(e) => setSel(e.target.checked ? data!.rows.map((r) => r.id) : [])} /></th><th>Email</th><th>Status</th><th>Lists</th><th>Subscribed on</th></tr></thead>
        <tbody>
          {data?.rows.map((r) => (
            <tr key={r.id}>
              <td><input type="checkbox" aria-label={"Select " + r.email} checked={sel.includes(r.id)} onChange={(e) => setSel(e.target.checked ? [...sel, r.id] : sel.filter((x) => x !== r.id))} /></td>
              <td><b>{r.email}</b>{r.name && <><br /><small>{r.name}</small></>}{r.tags.map((t) => <span key={t} className="pill draft" style={{ marginLeft: 4 }}>{t}</span>)}
                <div className="mp-act"><button onClick={async () => setAct({ email: r.email, rows: await rpc("activity", { id: r.id }) })}>Activity</button>{status !== "trash" && <button onClick={() => setEdit({ id: r.id, email: r.email, name: r.name, status: r.status === "bounced" || r.status === "complained" ? "unsubscribed" : r.status, lists: r.lists, tags: r.tags.join(", "), note: consent(r) })}>Edit</button>}
                  <button onClick={async () => { const d = await rpc("exportPerson", { id: r.id }); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: "application/json" })); a.download = r.email + ".json"; a.click(); }}>Download data</button></div></td>
              <td><span className={"pill" + (r.status === "subscribed" ? " sent" : " draft")}>{r.status}</span></td>
              <td><small>{names(r.lists)}</small>{r.unsub_reason && <><br /><small className="mut">Left: {r.unsub_reason}</small></>}</td><td><small>{when(r.created_at)}</small></td>
            </tr>))}
        </tbody>
      </table>
      {data && !data.rows.length && <p className="sub">No subscribers match.</p>}
      {data && data.pages > 1 && <div className="bar" style={{ marginTop: 12 }}><button disabled={page === 0} onClick={() => setPage(page - 1)}>← Previous</button><span>Page {page + 1} of {data.pages}</span><button disabled={page + 1 >= data.pages} onClick={() => setPage(page + 1)}>Next →</button></div>}
    </>
  );
}
