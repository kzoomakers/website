"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { confirmDialog } from "@/components/dialog";
import { ImagePick } from "../media-picker";
import RichEditor from "../rich-editor";
import Revisions from "../../webmaster/revisions";
import type { Author, Cat, Post } from "@/lib/blog";

// <input type=datetime-local> wants local "YYYY-MM-DDTHH:mm"; the API wants an ISO instant.
const toLocal = (iso: string | null) => (iso ? new Date(Date.parse(iso) - new Date(iso).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
const BLANK = { slug: "", title: "", excerpt: "", body: "", image: "", tags: [] as string[], status: "draft" as Post["status"], publish_at: null as string | null, author_id: null as number | null, category_ids: [] as number[] };

export default function PostEditor({ initial, authors, categories, me, tones }: { initial: Post | null; authors: Author[]; categories: Cat[]; me: number; tones: { id: string; label: string }[] }) {
  const [p, setP] = useState<typeof BLANK & { id?: number }>(initial ?? { ...BLANK, author_id: me });
  const [tags, setTags] = useState((initial?.tags ?? []).join(", "));
  const [msg, setMsg] = useState("");
  const [saved, setSaved] = useState(0);
  const [enh, setEnh] = useState(false), [ev, setEv] = useState(0); // ev remounts the editor so it picks up AI text
  const router = useRouter();
  const set = (x: Partial<typeof p>) => setP({ ...p, ...x });
  const save = async (status = p.status) => {
    const body = { ...p, status, tags: tags.split(",").map((t) => t.trim()).filter(Boolean) };
    const r = await fetch("/api/webmaster/blog", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) return setMsg(await r.text());
    const saved_: Post = await r.json();
    setP(saved_); setMsg("Saved."); setSaved(saved + 1);
    if (!p.id) router.replace(`/admin/blog/${saved_.id}`);
  };
  const del = async () => {
    if (!(await confirmDialog(`Delete “${p.title}”?`, { ok: "Delete", danger: true }))) return;
    await fetch(`/api/webmaster/blog?id=${p.id}`, { method: "DELETE" });
    router.push("/admin/blog");
  };
  return (
    <>
      <style>{`.prose-body .ProseMirror{font:16px/1.6 Georgia,serif}.prose-body img{max-width:100%}.prose-body blockquote{border-left:3px solid #ccc;margin-left:0;padding-left:12px;color:#555}.prose-body pre{background:#f4f4f4;padding:8px;border-radius:6px}`}</style>
      <h1>{p.id ? "Edit post" : "New post"}</h1>
      <p className="sub"><a href="/admin/blog">← All posts</a></p>
      {msg && <p className="sub">{msg}</p>}
      <div className="card" style={{ padding: 12, display: "grid", gap: 8 }}>
        <input aria-label="Title" placeholder="Title" value={p.title} onChange={(e) => set({ title: e.target.value })} />
        <input aria-label="URL slug" placeholder="URL slug (blank = from title)" value={p.slug} onChange={(e) => set({ slug: e.target.value })} />
        <textarea rows={2} aria-label="Excerpt" placeholder="Excerpt (shown in the list, RSS and search results)" value={p.excerpt} onChange={(e) => set({ excerpt: e.target.value })} />
        {tones.length > 0 && <div><button type="button" disabled={!p.body.trim()} onClick={() => setEnh(true)}>✨ Enhance with AI</button></div>}
        <RichEditor key={`${p.id ?? "new"}-${ev}`} value={p.body} onChange={(body) => set({ body })} />
        <ImagePick value={p.image} onChange={(image) => set({ image })} />
        <label>Author{" "}<select value={p.author_id ?? ""} onChange={(e) => set({ author_id: e.target.value ? Number(e.target.value) : null })}>
          <option value="">(none)</option>{authors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        <fieldset style={{ border: 0, padding: 0 }}><legend>Categories</legend>
          {categories.map((c) => <label key={c.id} style={{ marginRight: 12 }}><input type="checkbox" checked={p.category_ids.includes(c.id)}
            onChange={(e) => set({ category_ids: e.target.checked ? [...p.category_ids, c.id] : p.category_ids.filter((x) => x !== c.id) })} /> {c.name}</label>)}
          {!categories.length && <span className="sub">None yet: add some under Categories.</span>}</fieldset>
        <input aria-label="Tags" placeholder="Tags, comma separated" value={tags} onChange={(e) => setTags(e.target.value)} />
        <label>Publish at (optional; future = scheduled){" "}
          <input type="datetime-local" value={toLocal(p.publish_at)} onChange={(e) => set({ publish_at: e.target.value ? new Date(e.target.value).toISOString() : null })} />
        </label>
      </div>
      {enh && <Enhance tones={tones} html={p.body} onClose={() => setEnh(false)} onApply={(body) => { set({ body }); setEv(ev + 1); setEnh(false); setMsg("AI rewrite applied. Read it over, then save."); }} />}
      <div className="bar" style={{ marginTop: 8 }}>
        <button onClick={() => save("draft")}>Save draft</button>
        <button className="pri" onClick={() => save("published")}>{p.status === "published" ? "Update" : "Publish"}</button>
        {p.status === "published" && p.slug && <a href={`/blog/${p.slug}`} target="_blank">view ↗</a>}
        {p.id && <button className="danger" onClick={del}>Delete</button>}
      </div>
      {p.id && <Revisions<Post> api={`/api/webmaster/blog/${p.id}`} reload={saved}
        lines={(d) => [`Title: ${d.title}`, `Slug: ${d.slug}`, `Status: ${d.status} ${d.publish_at ?? ""}`, `Tags: ${d.tags.join(", ")}`, `Image: ${d.image}`, `Excerpt: ${d.excerpt}`, `Author: ${d.author_id ?? ""}`, `Categories: ${d.category_ids?.join(",")}`, ...d.body.replace(/></g, ">\n<").split("\n")]}
        onRevert={async (r) => { const x: Post = await r.json(); setP(x); setTags(x.tags.join(", ")); setMsg("Reverted."); }} />}
    </>
  );
}

// Pick a personality, preview the AI's rewrite beside the original, then apply or go back. Nothing changes until Apply.
function Enhance({ tones, html, onClose, onApply }: { tones: { id: string; label: string }[]; html: string; onClose: () => void; onApply: (html: string) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(""), [out, setOut] = useState(""), [note, setNote] = useState(""), [err, setErr] = useState("");
  useEffect(() => { ref.current?.showModal(); }, []);
  const go = async (tone: string) => {
    setBusy(tone); setErr("");
    try {
      const r = await fetch("/api/webmaster/blog/enhance", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tone, html }) });
      if (!r.ok) throw new Error(await r.text());
      const j = await r.json();
      setOut(j.html); setNote(j.note);
    } catch (e: any) { setErr(e.message); }
    setBusy("");
  };
  const pane = { flex: "1 1 280px", maxHeight: "45vh", overflow: "auto", border: "1px solid #ddd", borderRadius: 8, padding: 10 } as const;
  return (
    <dialog ref={ref} aria-label="Enhance with AI" onCancel={(e) => { e.preventDefault(); if (!busy) onClose(); }} style={{ width: "min(900px, calc(100% - 32px))", border: 0, borderRadius: 14, padding: 20 }}>
      <h2 style={{ marginTop: 0 }}>{out ? "Preview" : "Click a personality for your post"}</h2>
      {err && <p role="alert" className="sub">{err}</p>}
      {note && <p role="status" className="sub"><strong>{note}</strong></p>}
      <div className="bar">{tones.map((t) => <button key={t.id} type="button" disabled={!!busy} onClick={() => go(t.id)}>{busy === t.id ? "Writing…" : t.label}</button>)}</div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
        <div className="prose-body" style={pane}><strong className="sub">Original</strong><div dangerouslySetInnerHTML={{ __html: html }} /></div>
        {(out || busy) && <div className="prose-body" style={pane}><strong className="sub">AI rewrite</strong>{busy ? <p>Writing…</p> : <div dangerouslySetInnerHTML={{ __html: out }} />}</div>}
      </div>
      <div className="bar" style={{ marginTop: 12, justifyContent: "flex-end" }}>
        <button type="button" disabled={!!busy} onClick={onClose}>Cancel</button>
        {out && !busy && <button type="button" className="pri" onClick={() => onApply(out)}>Use this version</button>}
      </div>
    </dialog>
  );
}
