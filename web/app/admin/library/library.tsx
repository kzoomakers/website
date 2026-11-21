"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { alertDialog, confirmDialog, promptDialog } from "@/components/dialog";
import { fail, makeRpc } from "@/app/admin/rpc";
import { ordered, TIERS, TYPES, type Folder } from "./shared";

const rpc = makeRpc("/api/library/admin");

type Doc = { id: number; slug: string; title: string; description: string; type: string; tier: string; status: string; pinned: boolean; owner: string; review_on: string | null; folders: number[]; pages: number; has_text: boolean; tags: string[] };


type Share = { id: number; allow_download: boolean; expires_at: string; revoked_at: string | null; created_by: string; opens: number; last_open: string | null };
// Share links for one document: create (passcode is always required, shown once) and revoke.
function Shares({ d }: { d: Doc }) {
  const [list, setList] = useState<Share[] | null>(null);
  const load = () => rpc("shares", { id: d.id }).then(setList, () => setList([]));
  const add = async () => {
    const days = await promptDialog("Link lasts how many days? (1, 7 or 30)", "30"); if (!days) return;
    const dl = await confirmDialog("Let people with the link download the PDF? (View-only still lets the viewer fetch the file, so only share what you'd be fine with them keeping.)", { ok: "Allow download" });
    rpc("share", { id: d.id, days: Number(days), allowDownload: dl }).then(async (r) => { await alertDialog(`Link: ${location.origin}/d/${r.token}\nPasscode: ${r.passcode}\nExpires in ${r.days} days.\n\nThis is the only time the link and passcode are shown. Send the passcode separately.`); load(); }, fail);
  };
  return (
    <details onToggle={(e) => e.currentTarget.open && load()}><summary>Share links</summary>
      <button onClick={add}>New share link</button>
      {list?.map((x) => { const dead = x.revoked_at || new Date(x.expires_at) < new Date(); return (
        <div key={x.id}>{dead ? <s>link #{x.id}</s> : <>link #{x.id}</>} · {x.revoked_at ? "revoked" : dead ? "expired" : `expires ${new Date(x.expires_at).toLocaleDateString()}`} · {x.allow_download ? "download" : "view only"} · opened {x.opens}× · by {x.created_by}{" "}
          {!dead && <button onClick={async () => (await confirmDialog("Revoke this link? It stops working at once.")) && rpc("revokeShare", { id: x.id }).then(load, fail)}>Revoke</button>}</div>); })}
    </details>
  );
}

// Version history and "upload a new version".
function Versions({ d, reload }: { d: Doc; reload: () => void }) {
  const [list, setList] = useState<{ version: number; pages: number; change_note: string; requires_reread: boolean; uploaded_by: string; at: string }[] | null>(null);
  const pick = useRef<HTMLInputElement>(null);
  const send = async (file: File) => {
    const note = await promptDialog("What changed in this version?", ""); if (note === null) return;
    const reread = (d.type === "sop" || d.type === "safety") ? await confirmDialog("Ask everyone to acknowledge this version again?", { ok: "Yes, re-read" }) : false;
    const fd = new FormData(); fd.append("file", file); fd.append("doc", String(d.id)); fd.append("note", note); fd.append("reread", reread ? "1" : "0");
    const r = await fetch("/api/library/version", { method: "POST", body: fd });
    if (!r.ok) return fail(new Error(await r.text()));
    reload();
  };
  return (
    <details onToggle={(e) => e.currentTarget.open && rpc("versions", { id: d.id }).then(setList, fail)}><summary>Versions</summary>
      <input ref={pick} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) send(f); }} />
      <button onClick={() => pick.current?.click()}>Upload a new version</button>
      {list?.map((x) => <div key={x.version}>v{x.version} · {x.pages} p · {new Date(x.at).toLocaleDateString()} · {x.uploaded_by}{x.change_note && ` · ${x.change_note}`}{x.requires_reread && " · re-read"} <a href={`/api/library/file/${d.slug}?v=${x.version}`} target="_blank" rel="noreferrer">open</a></div>)}
    </details>
  );
}

// Who has read the current version (SOPs and safety guides).
function Reads({ d }: { d: Doc }) {
  const [r, setR] = useState<{ version: number; read: { name: string }[]; unread: string[] } | null>(null);
  return (
    <details onToggle={(e) => e.currentTarget.open && rpc("acks", { id: d.id }).then(setR, fail)}><summary>Who has read it</summary>
      {r && <><p>Version {r.version}: {r.read.length} read, {r.unread.length} not yet.</p>{r.unread.length > 0 && <p><b>Not read:</b> {r.unread.join(", ")}</p>}</>}
    </details>
  );
}

function Row({ d, canEdit, reload, folders, trash, picked, pick }: { d: Doc; canEdit: boolean; reload: () => void; folders: Folder[]; trash: boolean; picked: boolean; pick: () => void }) {
  const [f, setF] = useState({ title: d.title, description: d.description, type: d.type, tier: d.tier, status: d.status, tags: d.tags.join(", "), owner: d.owner, review_on: d.review_on ?? "" });
  const save = (extra: object = {}) => rpc("edit", { id: d.id, ...f, tags: f.tags.split(","), ...extra }).then(reload, fail);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="row" style={{ display: "block" }}>
      {canEdit && !trash && <input type="checkbox" aria-label={`Select ${d.title}`} checked={picked} onChange={pick} />} <b>{d.title}</b> <span className="tag">{d.status}</span> <span className="tag">{d.pages} p</span> {!d.has_text && <span className="tag" title="Scanned PDF: search can't see inside it">not searchable</span>}
      {" "}<a href={`/api/library/file/${d.slug}`} target="_blank" rel="noreferrer">Open PDF</a> · <a href={`/admin/library/qr/${d.slug}`} target="_blank" rel="noreferrer">QR</a>
      {d.review_on && d.review_on < new Date().toISOString().slice(0, 10) && <span className="tag pri">review overdue</span>}
      {canEdit && !trash && <Shares d={d} />}
      {canEdit && !trash && <Versions d={d} reload={reload} />}
      {!trash && (d.type === "sop" || d.type === "safety") && <Reads d={d} />}
      {canEdit && trash && <button onClick={() => rpc("restore", { id: d.id }).then(reload, fail)}>Restore</button>}
      {canEdit && !trash && (
        <div className="bar" style={{ flexWrap: "wrap" }}>
          <input aria-label="Title" value={f.title} onChange={set("title")} />
          <select aria-label="Type" value={f.type} onChange={set("type")}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
          <select aria-label="Who can see it" value={f.tier} onChange={set("tier")}>{TIERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <select aria-label="Status" value={f.status} onChange={set("status")}><option>draft</option><option>published</option><option>archived</option></select>
          <input aria-label="Owner (looks after this document)" placeholder="Owner" value={f.owner} onChange={set("owner")} />
          <label>Review by <input type="date" value={f.review_on} onChange={set("review_on")} /></label>
          <input aria-label="Tags, comma separated" placeholder="Tags, comma separated" value={f.tags} onChange={set("tags")} />
          <select aria-label="Folder" value={d.folders[0] ?? ""} onChange={(e) => rpc("place", { id: d.id, folders: e.target.value ? [e.target.value] : [] }).then(reload, fail)}>
            <option value="">No folder</option>{ordered(folders).map((x) => <option key={x.id} value={x.id}>{"\u00a0\u00a0".repeat(x.depth)}{x.title}</option>)}
          </select>
          <button onClick={async () => { const toPublic = f.tier === "public" && d.tier !== "public"; if (toPublic && !(await confirmDialog("Anyone on the internet will be able to read this document. Do you have the right to publish it? (Manufacturer manuals are often copyrighted.)"))) return; save(toPublic ? { confirmed: true } : {}); }}>Save</button>
          <button onClick={() => rpc("edit", { id: d.id, pinned: !d.pinned }).then(reload, fail)}>{d.pinned ? "Unpin" : "Pin"}</button>
          <button onClick={async () => (await confirmDialog(`Move "${d.title}" to the recycle bin?`)) && rpc("delete", { id: d.id }).then(reload, fail)}>Delete</button>
        </div>
      )}
    </div>
  );
}

export default function Library({ canEdit }: { canEdit: boolean }) {
  const [folders, setFolders] = useState<Folder[]>([]), [trash, setTrash] = useState(false), [overdue, setOverdue] = useState(false), [sel, setSel] = useState<number[]>([]), [bulk, setBulk] = useState({ tier: "", status: "", folder: "", addTags: "" }), [tags, setTags] = useState<{ id: number; name: string; n: number }[]>([]), [docs, setDocs] = useState<Doc[] | null>(null), [q, setQ] = useState(""), [needs, setNeeds] = useState(false), [on, setOn] = useState<boolean | null>(null), [busy, setBusy] = useState(false), [progress, setProgress] = useState(""), [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const reload = useCallback(() => Promise.all([rpc(trash ? "trash" : "list", { q, needsDetails: needs, overdue }).then(setDocs), rpc("folders").then(setFolders), rpc("tags").then(setTags)]).catch(fail), [q, needs, trash, overdue]);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { rpc("flags").then((f) => setOn(f.library), () => {}); }, []);

  // One request per file: the size limit applies to each PDF, not to the whole batch, and a bad file doesn't stop the rest.
  async function upload(files: FileList | File[]) {
    const bad: string[] = [];
    setBusy(true);
    for (const [i, f] of [...files].entries()) {
      setProgress(`Uploading ${i + 1} of ${files.length}…`);
      const fd = new FormData();
      fd.append("file", f);
      const r = await fetch("/api/library/upload", { method: "POST", body: fd }).catch(() => null);
      if (!r?.ok) bad.push(`${f.name}: ${r ? await r.text() : "couldn't reach the server."}`);
    }
    setBusy(false); setProgress("");
    if (bad.length) await alertDialog(bad.join("\n"));
    setNeeds(true); await reload();
  }

  return (
    <div onDragOver={(e) => { if (canEdit) { e.preventDefault(); setDrag(true); } }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); if (canEdit && e.dataTransfer.files.length) upload(e.dataTransfer.files); }} style={{ outline: drag ? "3px dashed #888" : undefined, minHeight: "60vh" }}>
      <h1>Library</h1>
      <p className="sub">Manuals, safety guides and SOPs. New uploads start as staff-only drafts: set who can see each one, then publish it.</p>
      {canEdit && on !== null && <label><input type="checkbox" checked={on} onChange={(e) => rpc("setFlags", { library: e.target.checked }).then(() => setOn(e.target.checked), fail)} /> Library is open to members</label>}
      {canEdit && (
        <p>
          <input ref={input} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => e.target.files && upload(e.target.files)} />
          <button disabled={busy} onClick={() => input.current?.click()}>{busy ? progress || "Uploading…" : "Upload PDFs"}</button> <span className="sub">or drop files anywhere on this page.</span>
        </p>
      )}
      <div className="bar">
        <input aria-label="Search the library" type="search" placeholder="Search titles, tags and text inside PDFs" value={q} onChange={(e) => setQ(e.target.value)} />
        <label><input type="checkbox" checked={trash} onChange={(e) => setTrash(e.target.checked)} /> Recycle bin (30 days)</label>
        <label><input type="checkbox" checked={overdue} onChange={(e) => setOverdue(e.target.checked)} /> Review overdue</label>
        <label><input type="checkbox" checked={needs} onChange={(e) => setNeeds(e.target.checked)} /> Drafts only</label>
        {canEdit && <a href="/admin/library/triage">Triage drafts</a>}
      </div>
      {canEdit && !trash && (
        <details><summary>Folders ({folders.length})</summary>
          {ordered(folders).map((f) => (
            <div key={f.id} style={{ paddingLeft: f.depth * 20 }}>
              {f.title}{" "}
              <button onClick={async () => { const t = await promptDialog("Rename folder", f.title); if (t) rpc("renameFolder", { id: f.id, title: t }).then(reload, fail); }}>Rename</button>
              {f.depth < 2 && <button onClick={async () => { const t = await promptDialog(`New folder inside "${f.title}"`); if (t) rpc("addFolder", { parent: f.id, title: t }).then(reload, fail); }}>Add inside</button>}
              <button onClick={async () => (await confirmDialog(`Delete "${f.title}" and any folders inside it? The documents stay in the library.`)) && rpc("deleteFolder", { id: f.id }).then(reload, fail)}>Delete</button>
            </div>
          ))}
          <button onClick={async () => { const t = await promptDialog("New top-level folder"); if (t) rpc("addFolder", { title: t }).then(reload, fail); }}>Add folder</button>
        </details>
      )}
      {canEdit && !trash && tags.length > 0 && (
        <details><summary>Tags ({tags.length})</summary>
          {tags.map((t) => <div key={t.id}>{t.name} ({t.n}) <button onClick={async () => { const n = await promptDialog(`Rename "${t.name}". Using another tag's name merges the two.`, t.name); if (n) rpc("renameTag", { id: t.id, name: n }).then(reload, fail); }}>Rename / merge</button></div>)}
        </details>
      )}
      {canEdit && sel.length > 0 && (
        <div className="bar" role="toolbar" aria-label="Bulk edit" style={{ position: "sticky", bottom: 0, flexWrap: "wrap" }}>
          <b>{sel.length} selected</b>
          <select aria-label="Set who can see them" value={bulk.tier} onChange={(e) => setBulk({ ...bulk, tier: e.target.value })}><option value="">Keep who can see</option>{TIERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <select aria-label="Set status" value={bulk.status} onChange={(e) => setBulk({ ...bulk, status: e.target.value })}><option value="">Keep status</option><option>draft</option><option>published</option><option>archived</option></select>
          <select aria-label="Add to folder" value={bulk.folder} onChange={(e) => setBulk({ ...bulk, folder: e.target.value })}><option value="">Keep folders</option>{ordered(folders).map((x) => <option key={x.id} value={x.id}>{"\u00a0\u00a0".repeat(x.depth)}{x.title}</option>)}</select>
          <input aria-label="Add tags, comma separated" placeholder="Add tags" value={bulk.addTags} onChange={(e) => setBulk({ ...bulk, addTags: e.target.value })} />
          <button onClick={async () => { if (bulk.tier === "public" && !(await confirmDialog("Anyone on the internet will be able to read these documents. Do you have the right to publish them?"))) return; rpc("bulk", { ids: sel, ...bulk, addTags: bulk.addTags.split(","), confirmed: bulk.tier === "public" }).then(() => { setSel([]); setBulk({ tier: "", status: "", folder: "", addTags: "" }); reload(); }, fail); }}>Apply</button>
          <button onClick={() => setSel([])}>Clear</button>
        </div>
      )}
      {docs === null ? <p>Loading…</p> : docs.length === 0 ? <p className="sub">Nothing here yet.</p> : docs.map((d) => <Row key={d.id + d.title + d.tier + d.status + d.folders.join()} d={d} canEdit={canEdit} reload={reload} folders={folders} trash={trash} picked={sel.includes(d.id)} pick={() => setSel(sel.includes(d.id) ? sel.filter((x) => x !== d.id) : [...sel, d.id])} />)}
    </div>
  );
}
