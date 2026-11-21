"use client";
import { useEffect, useState } from "react";
import { alertDialog, confirmDialog } from "@/components/dialog";
import Viewer from "@/app/members/waiver/viewer";

type Doc = { id: number; slug: string; title: string; type: string; tier: string; tags: string[]; folders: number[]; pages: number };
type Folder = { id: number; parent_id: number | null; title: string };
const TYPES = ["manual", "safety", "sop", "spec", "form", "other"], TIERS = [["staff", "Staff only"], ["authorized", "Authorized members"], ["members", "All members"], ["public", "Public"]];
const rpc = async (op: string, args: Record<string, unknown> = {}) => {
  const r = await fetch("/api/library/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op, ...args }) });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
};
const ordered = (fs: Folder[], parent: number | null = null, depth = 0): (Folder & { depth: number })[] => fs.filter((f) => f.parent_id === parent).flatMap((f) => [{ ...f, depth }, ...ordered(fs, f.id, depth + 1)]);

// One draft at a time: PDF on the left, fields on the right. Enter saves and publishes, then the next draft appears.
export default function Triage() {
  const [queue, setQueue] = useState<Doc[] | null>(null), [folders, setFolders] = useState<Folder[]>([]), [f, setF] = useState({ title: "", type: "manual", tier: "members", tags: "", folder: "" }), [done, setDone] = useState(0), [busy, setBusy] = useState(false);
  const d = queue?.[0];
  useEffect(() => { Promise.all([rpc("list", { needsDetails: true }).then(setQueue), rpc("folders").then(setFolders)]).catch((e) => alertDialog(e.message)); }, []);
  useEffect(() => { if (d) setF({ title: d.title, type: d.type, tier: d.tier === "staff" ? "members" : d.tier, tags: d.tags.join(", "), folder: String(d.folders[0] ?? "") }); }, [d?.id]);
  const next = () => setQueue((q) => q!.slice(1));
  async function save() {
    if (!d || busy) return;
    if (f.tier === "public" && !(await confirmDialog("Anyone on the internet will be able to read this document. Do you have the right to publish it? (Manufacturer manuals are often copyrighted.)"))) return;
    setBusy(true);
    try {
      await rpc("edit", { id: d.id, title: f.title, type: f.type, tier: f.tier, tags: f.tags.split(","), status: "published", ...(f.tier === "public" ? { confirmed: true } : {}) });
      await rpc("place", { id: d.id, folders: f.folder ? [f.folder] : [] });
      setDone(done + 1); next();
    } catch (e: any) { alertDialog(e.message); }
    setBusy(false);
  }
  if (!queue) return <p>Loading…</p>;
  if (!d) return <div><h1>Triage</h1><p>{done ? `All done: ${done} published.` : "No drafts waiting."} <a href="/admin/library">Back to the library</a></p></div>;
  return (
    <div>
      <h1>Triage <span className="sub">{queue.length} left</span></h1>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div key={d.id} style={{ flex: "2 1 420px" }}><Viewer src={`/api/library/file/${d.slug}`} open /></div>
        <form style={{ flex: "1 1 260px", display: "grid", gap: 8 }} onSubmit={(e) => { e.preventDefault(); save(); }}>
          <label>Title <input autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
          <label>Type <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
          <label>Who can see it <select value={f.tier} onChange={(e) => setF({ ...f, tier: e.target.value })}>{TIERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label>Tags, comma separated <input value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} /></label>
          <label>Folder <select value={f.folder} onChange={(e) => setF({ ...f, folder: e.target.value })}><option value="">No folder</option>{ordered(folders).map((x) => <option key={x.id} value={x.id}>{"  ".repeat(x.depth)}{x.title}</option>)}</select></label>
          <div className="bar"><button type="submit" disabled={busy}>Publish and next (Enter)</button><button type="button" onClick={next}>Skip</button></div>
        </form>
      </div>
    </div>
  );
}
