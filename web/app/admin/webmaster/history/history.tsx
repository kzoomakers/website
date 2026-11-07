"use client";
import { useEffect, useRef, useState } from "react";
import { confirmDialog } from "@/components/dialog";
import { ago } from "../ago";
import DiffView from "../diff-view";

type Rev = { id: number; at: string; actor: string; action: string; target: string };
const LABEL: Record<string, string> = { "page.save": "Saved", "page.revert": "Reverted", "page.restore": "Restored", "page.delete": "Deleted", "page.import": "Original" };
const api = "/api/pages";

export default function History({ slug }: { slug: string }) {
  const [revs, setRevs] = useState<Rev[]>([]);
  const [open, setOpen] = useState<{ id: number; vs: "prev" | "now" } | null>(null);
  const [pair, setPair] = useState<[unknown, unknown] | null>(null);
  const [msg, setMsg] = useState("");
  const cache = useRef(new Map<number | "now", unknown>());
  const load = () => fetch(`${api}?history=${encodeURIComponent(slug)}`).then((r) => r.json()).then(setRevs).catch(() => setMsg("Could not load history"));
  useEffect(() => { load(); }, [slug]);

  const data = async (k: number | "now" | null) => {
    if (k === null) return {};
    if (!cache.current.has(k)) {
      const r = await fetch(k === "now" ? `${api}?slug=${encodeURIComponent(slug)}` : `${api}?rev=${k}`);
      cache.current.set(k, r.ok ? await r.json() : {});
    }
    return cache.current.get(k);
  };
  useEffect(() => {
    if (!open) return;
    setPair(null);
    const i = revs.findIndex((r) => r.id === open.id);
    const base = open.vs === "prev" ? (revs[i + 1]?.id ?? null) : open.id;
    const target = open.vs === "prev" ? open.id : "now";
    Promise.all([data(base), data(target)]).then(setPair);
  }, [open, revs.length]);

  const revert = async (id: number) => {
    if (!(await confirmDialog(`Revert ${slug} to revision #${id}? The current version stays in history.`, { ok: "Revert" }))) return;
    const r = await fetch(api, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug, revision: id }) });
    cache.current.delete("now");
    setMsg(r.ok ? "Reverted" : await r.text());
    load();
  };
  const cur = revs.find((r) => r.action !== "page.delete")?.id;
  return (
    <>
      <h1>History · {slug}</h1>
      <p className="sub"><a href="/admin/webmaster">← Pages</a> · <a href={`/edit/${slug}`}>Open in editor</a> <span className="toast" role="status">{msg}</span></p>
      <div className="card">
        {revs.map((v, i) => (
          <div key={v.id}>
            <div className="row">
              <span className="grow"><b>{LABEL[v.action] ?? v.action}</b> <span className="tag">#{v.id} · {v.actor}{v.target && v.target !== "original" ? ` · ${v.target}` : ""}</span></span>
              <span className="tag" title={new Date(v.at).toLocaleString()}>{ago(v.at)}</span>
              <button aria-expanded={open?.id === v.id} onClick={() => setOpen(open?.id === v.id ? null : { id: v.id, vs: "prev" })}>{open?.id === v.id ? "Hide changes" : "Changes"}</button>
              {v.id === cur ? <span className="tag">current</span> : v.action !== "page.delete" && <button onClick={() => revert(v.id)}>Revert</button>}
            </div>
            {open?.id === v.id && (
              <div className="dpanel">
                <div className="seg" role="group" aria-label="Compare against">
                  {(["prev", "now"] as const).map((m) => <button key={m} aria-pressed={open.vs === m} onClick={() => setOpen({ id: v.id, vs: m })}>{m === "prev" ? "vs previous" : "vs current page"}</button>)}
                </div>
                {pair ? <DiffView before={pair[0]} after={pair[1]} /> : <p className="sub">Loading…</p>}
                {open.vs === "now" && <p className="sub">Showing what Revert would change: this revision → current page.</p>}
              </div>
            )}
          </div>
        ))}
        {!revs.length && <p className="sub">No history yet. Revisions are recorded from the next save.</p>}
      </div>
    </>
  );
}
