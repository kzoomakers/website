"use client";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { buildTree, countAll, type Item, type Node, type Sort } from "@/lib/comment-tree";
import "./comments.css";

const MAX = 2000, SLIM = 3, FLAT = 9; // depths where the thread switches to a slim rail, then stops indenting
const hue = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
const post = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

function Avatar({ name }: { name: string }) {
  return <span className="cm-av" aria-hidden style={{ background: `hsl(${hue(name)} 45% 42%)` }}>{name.trim()[0]?.toUpperCase() || "?"}</span>;
}

// Dates render as plain text on the server and become "5m ago" after mount, so there is no hydration mismatch.
function When({ iso }: { iso: string }) {
  const [t, setT] = useState(() => iso.slice(0, 10));
  useEffect(() => {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    setT(s < 45 ? "just now" : s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : s < 86400 * 30 ? `${Math.round(s / 86400)}d ago` : new Date(iso).toLocaleDateString("en-US", { dateStyle: "medium" }));
  }, [iso]);
  return <time dateTime={iso} title={new Date(iso).toLocaleString()}>{t}</time>;
}

type Ctx = { me: string | null; login: string; closed: boolean; postId: number; add: (i: Item) => void; like: (i: Item) => void; say: (m: string) => void;
  folded: Set<number>; fold: (id: number) => void; replying: number | null; setReplying: (id: number | null) => void; fresh: number | null };
const C = createContext<Ctx>(null!);

function Composer({ parent, onDone, focus }: { parent?: number; onDone?: () => void; focus?: boolean }) {
  const c = useContext(C), ta = useRef<HTMLTextAreaElement>(null), [body, setBody] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false), [hp, setHp] = useState("");
  useEffect(() => { if (focus) ta.current?.focus(); }, [focus]);
  useEffect(() => { const t = ta.current; if (t) { t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; } }, [body]);
  const go = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy || !body.trim()) return;
    setBusy(true); setErr("");
    const r = await post("/api/blog/comments", { postId: c.postId, parentId: parent ?? null, body, website: hp }).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setErr(r ? await r.text() : "Couldn't reach the server. Try again.");
    const item: Item = await r.json();
    setBody(""); c.add(item); onDone?.();
    c.say(item.pending ? "Comment submitted. It will appear once a moderator approves it." : "Comment posted.");
  };
  const left = MAX - body.length;
  return (
    <form onSubmit={go}>
      <div className="cm-box">
        <textarea ref={ta} rows={1} maxLength={MAX} required aria-label={parent ? "Write a reply" : "Add a comment"} placeholder={parent ? "Write a reply…" : "Join the conversation…"} value={body}
          onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) go(); if (e.key === "Escape" && parent) onDone?.(); }} />
        <input className="cm-hp" tabIndex={-1} autoComplete="off" aria-hidden name="website" value={hp} onChange={(e) => setHp(e.target.value)} />
        <div className="cm-bar">
          <small className={left < 100 ? "warn" : ""}>{body.length > 0 ? `${left} left` : "⌘/Ctrl + Enter to post"}</small>
          {parent != null && <button type="button" className="cm-btn ghost" onClick={onDone}>Cancel</button>}
          <button className="cm-btn" disabled={busy || !body.trim()}>{busy ? "Posting…" : parent ? "Reply" : "Comment"}</button>
        </div>
      </div>
      {err && <p className="cm-err" role="alert">{err}</p>}
    </form>
  );
}

const Heart = () => <svg viewBox="0 0 24 24" aria-hidden><path d="M12 21s-7-4.6-9.3-9A5.4 5.4 0 0 1 12 6.2 5.4 5.4 0 0 1 21.3 12C19 16.4 12 21 12 21z" /></svg>;
const Chat = () => <svg viewBox="0 0 24 24" aria-hidden><path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-5.4A8 8 0 1 1 21 12z" /></svg>;

function NodeView({ n, depth, parentName }: { n: Node; depth: number; parentName: string }) {
  const c = useContext(C), open = !c.folded.has(n.id), total = n.kids.reduce((s, k) => s + countAll(k), 0), cls = depth >= FLAT ? "flat" : depth >= SLIM ? "slim" : "";
  const [pop, setPop] = useState(false);
  return (
    <div className={`cm-node ${cls} ${n.id === c.fresh ? "new" : ""} ${n.removed ? "cm-removed" : ""}`} id={`c${n.id}`}>
      <div className="cm-rail">
        {!n.removed && <Avatar name={n.name} />}
        {open && n.kids.length > 0 && <button className="cm-line" aria-label={`Collapse replies to ${n.name || "this comment"}`} onClick={() => c.fold(n.id)} />}
      </div>
      <div className="cm-main">
        <div className="cm-card">
          <div className="cm-meta">
            {n.removed ? <strong>[removed]</strong> : <strong>{n.name}</strong>}
            {n.staff && <span className="cm-badge">Author</span>}
            {n.pending && <span className="cm-badge soft">Awaiting moderation</span>}
            {depth >= FLAT && parentName && <span className="cm-in">↳ replying to {parentName}</span>}
            <When iso={n.at} />
          </div>
          <p className="cm-body">{n.removed ? "This comment was removed." : n.body}</p>
          {!n.removed && !n.pending && (
            <div className="cm-acts">
              {c.me ? <button aria-pressed={n.liked} className={pop ? "cm-pop" : ""} onClick={() => { setPop(!n.liked); c.like(n); }} aria-label={`${n.liked ? "Unlike" : "Like"} (${n.likes})`}><Heart />{n.likes > 0 && n.likes}</button>
                : n.likes > 0 && <span style={{ padding: "4px 8px", fontSize: 13 }} aria-label={`${n.likes} likes`}>♥ {n.likes}</span>}
              {!c.closed && (c.me ? <button onClick={() => c.setReplying(c.replying === n.id ? null : n.id)} aria-expanded={c.replying === n.id}><Chat />Reply</button>
                : <a href={c.login} style={{ padding: "4px 8px", fontSize: 13, fontWeight: 600 }}>Sign in to reply</a>)}
              {n.kids.length > 0 && <button onClick={() => c.fold(n.id)} aria-expanded={open}>{open ? "Collapse" : `Expand (${total})`}</button>}
            </div>
          )}
        </div>
        {c.replying === n.id && <div className="cm-reply"><Avatar name={c.me ?? ""} /><Composer parent={n.id} focus onDone={() => c.setReplying(null)} /></div>}
        {!open && <button className="cm-fold" onClick={() => c.fold(n.id)}>Show {total} {total === 1 ? "reply" : "replies"}</button>}
        {open && n.kids.map((k) => <NodeView key={k.id} n={k} depth={depth + 1} parentName={n.name} />)}
      </div>
    </div>
  );
}

export default function Comments({ postId, initial, me, closed, login }: { postId: number; initial: Item[]; me: string | null; closed: boolean; login: string }) {
  const [items, setItems] = useState(initial), [sort, setSort] = useState<Sort>("best"), [folded, setFolded] = useState<Set<number>>(new Set()), [replying, setReplying] = useState<number | null>(null),
    [fresh, setFresh] = useState<number | null>(null), [msg, setMsg] = useState("");
  const tree = useMemo(() => buildTree(items, sort), [items, sort]);
  const shown = items.filter((i) => !i.removed && !i.pending).length;

  // Deep link (#c123): scroll to it and flash it. Replies are rendered open by default, so it is always in the DOM.
  useEffect(() => {
    const go = () => { const el = document.getElementById(location.hash.slice(1)); if (el && /^c\d+$/.test(el.id)) { el.scrollIntoView({ block: "center" }); el.classList.add("hit"); setTimeout(() => el.classList.remove("hit"), 2400); } };
    go(); addEventListener("hashchange", go); return () => removeEventListener("hashchange", go);
  }, []);

  const ctx: Ctx = {
    me, login, closed, postId, folded, replying, setReplying, fresh,
    fold: (id) => setFolded((s) => { const t = new Set(s); t.has(id) ? t.delete(id) : t.add(id); return t; }),
    say: (m) => { setMsg(m); setTimeout(() => setMsg(""), 8000); },
    add: (i) => { setItems((l) => [...l, i]); setFresh(i.id); if (i.parent) setFolded((s) => { const t = new Set(s); t.delete(i.parent!); return t; });
      setTimeout(() => document.getElementById(`c${i.id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 50); },
    like: async (i) => {
      const set = (liked: boolean, likes: number) => setItems((l) => l.map((x) => (x.id === i.id ? { ...x, liked, likes } : x)));
      set(!i.liked, i.likes + (i.liked ? -1 : 1)); // optimistic, then trust the server's count
      const r = await post("/api/blog/comments/like", { id: i.id }).catch(() => null);
      if (r?.ok) { const d = await r.json(); set(d.liked, d.likes); } else set(i.liked, i.likes);
    },
  };

  return (
    <section className="cm" aria-label="Comments">
      <div className="cm-head">
        <h3>{shown} comment{shown === 1 ? "" : "s"}</h3>
        {items.length > 1 && <div className="cm-sort" role="group" aria-label="Sort comments">
          {([["best", "Best"], ["new", "Newest"], ["old", "Oldest"]] as const).map(([k, l]) => <button key={k} aria-pressed={sort === k} onClick={() => setSort(k)}>{l}</button>)}
        </div>}
      </div>
      <p aria-live="polite" role="status" className="cm-hp">{msg}</p>
      <C.Provider value={ctx}>
        {closed ? <p className="cm-cta">Comments are closed on this post.</p>
          : me ? <div className="cm-composer"><Avatar name={me} /><div style={{ flex: 1, minWidth: 0 }}><Composer /></div></div>
          : <p className="cm-cta"><a href={login}>Sign in or register</a> to join the conversation.</p>}
        {msg.startsWith("Comment submitted") && <p className="cm-cta" style={{ marginTop: -12 }}>{msg}</p>}
        {tree.map((n) => <NodeView key={n.id} n={n} depth={0} parentName="" />)}
        {!tree.length && <p className="cm-empty">No comments yet. Start the conversation.</p>}
      </C.Provider>
    </section>
  );
}
