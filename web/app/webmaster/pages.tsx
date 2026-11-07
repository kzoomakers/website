"use client";
import { useEffect, useState } from "react";
import { promptDialog } from "@/components/dialog";
import { ago } from "./ago";
import { count, type MenuItem } from "@/lib/menu";

const api = "/api/pages";
const SLUG = /^[a-z0-9][a-z0-9_\-\/]*$/i;

export default function Pages() {
  const [slugs, setSlugs] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"all" | "deleted">("all");
  const [gone, setGone] = useState<{ id: number; slug: string; at: string; actor: string }[]>([]);
  const load = () => {
    fetch(api).then((r) => r.json()).then(setSlugs).catch(() => setErr("Could not load pages"));
    fetch(`${api}?deleted`).then((r) => r.json()).then(setGone).catch(() => {});
  };
  const restore = async (d: { id: number; slug: string }) => {
    const r = await fetch(api, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug: d.slug, revision: d.id, restore: true }) });
    r.ok ? load() : setErr(await r.text());
  };
  useEffect(() => { load(); }, []);
  const ask = async (what: string, d = "") => { const s = (await promptDialog(what, d))?.trim(); if (s && !SLUG.test(s)) { setErr(`Bad slug: ${s}`); return null; } return s || null; };

  const create = async () => { const s = await ask("New page slug (e.g. new-page)"); if (s) location.href = `/edit/${s}`; };
  const dup = async (from: string) => {
    const to = await ask(`Duplicate ${from} as`, `${from}-copy`); if (!to) return;
    const data = await (await fetch(`${api}?slug=${encodeURIComponent(from)}`)).json();
    const r = await fetch(api, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug: to, data }) });
    r.ok ? load() : setErr(await r.text());
  };
  // Delete goes through a modal; if the menu links to the page it also offers to remove those menu items.
  const [delAsk, setDelAsk] = useState<{ slug: string; menu: MenuItem[]; hits: number } | null>(null);
  const del = async (slug: string) => {
    const menu: MenuItem[] = await fetch("/api/webmaster/menu").then((r) => r.json()).catch(() => []);
    setDelAsk({ slug, menu, hits: count(menu, slug) });
  };
  const confirmDel = async (alsoMenu: boolean) => {
    if (!delAsk) return;
    const { slug } = delAsk;
    setDelAsk(null);
    const r = await fetch(`${api}?slug=${encodeURIComponent(slug)}${alsoMenu ? "&menu" : ""}`, { method: "DELETE" });
    r.ok ? load() : setErr(await r.text());
  };
  const shown = slugs.filter((s) => s.includes(q.toLowerCase()));
  return (
    <>
      <h1>Pages</h1>
      <p className="sub">{slugs.length} pages</p>
      {err && <p className="err">{err}</p>}
      <div className="seg" role="tablist">
        <button role="tab" aria-pressed={tab === "all"} onClick={() => setTab("all")}>All pages</button>
        <button role="tab" aria-pressed={tab === "deleted"} onClick={() => setTab("deleted")}>Deleted{gone.length ? ` (${gone.length})` : ""}</button>
      </div>
      {tab === "deleted" ? (
        <div className="card">
          {gone.map((d) => (
            <div className="row" key={d.slug}>
              <span className="grow">{d.slug} <span className="tag">deleted by {d.actor}</span></span>
              <span className="tag" title={new Date(d.at).toLocaleString()}>{ago(d.at)}</span>
              <a href={`/webmaster/history?slug=${encodeURIComponent(d.slug)}`}><button>History</button></a>
              <button className="pri" onClick={() => restore(d)}>Restore</button>
            </div>
          ))}
          {!gone.length && <p className="sub">Nothing deleted. Deleted pages show up here and can be restored.</p>}
        </div>
      ) : <>
      <div className="bar">
        <button className="pri" onClick={create}>+ New page</button>
        <input placeholder="Filter pages…" aria-label="Filter pages" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="card">
        {shown.map((s) => (
          <div className="row" key={s}>
            <a href={s === "index" ? "/" : `/${s}`}>{s}</a>
            <a href={`/edit/${s}`}><button>Edit</button></a>
            <a href={`/webmaster/history?slug=${encodeURIComponent(s)}`}><button>History</button></a>
            <button onClick={() => dup(s)}>Duplicate</button>
            <button className="danger" onClick={() => del(s)}>Delete</button>
          </div>
        ))}
        {!shown.length && <p className="sub">No pages match.</p>}
      </div></>}
      {delAsk && (
        <div className="modal-bg" onClick={() => setDelAsk(null)}>
          <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="dtitle" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === "Escape" && setDelAsk(null)}>
            <h2 id="dtitle">Delete “{delAsk.slug}”?</h2>
            <p>{delAsk.hits
              ? `This page is in the menu (${delAsk.hits} ${delAsk.hits > 1 ? "items" : "item"}). Are you sure you want to delete this page?`
              : "You can restore it later from the Deleted tab."}</p>
            <div className="bar" style={{ justifyContent: "flex-end", marginBottom: 0 }}>
              <button autoFocus onClick={() => setDelAsk(null)}>No</button>
              <button className="danger" onClick={() => confirmDel(false)}>Yes</button>
              {delAsk.hits > 0 && <button className="pri" onClick={() => confirmDel(true)}>Yes + the menu item too</button>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
