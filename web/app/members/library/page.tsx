import Link from "next/link";
import { notFound } from "next/navigation";
import { libraryOn } from "@/lib/learn-flags";
import { listDocs, tagList } from "@/lib/library/docs";
import { listFolders, withDescendants } from "@/lib/library/folders";
import { viewer } from "@/lib/library/viewer";
import MembersShell from "../shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Library | Kzoo Makers", robots: { index: false } };

// Manuals, safety guides and SOPs the member may see. The tier filter runs inside the query (lib/library/rules.ts), so search never reveals a title the member can't open.
export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ q?: string; tag?: string; folder?: string }> }) {
  const v = await viewer();
  if (!(await libraryOn()) && !v.staff) notFound();
  const { q = "", tag = "", folder = "" } = await searchParams;
  return (
    <MembersShell title="Library" path="/members/library">
      {async () => {
        const folders = await listFolders(v), fid = folders.find((f) => String(f.id) === folder)?.id;
        const [docs, tags] = await Promise.all([listDocs(v, { q, tag, folder: fid ? withDescendants(folders, fid) : undefined }), tagList(v)]);
        const kids = folders.filter((f) => f.parent_id === (fid ?? null)), up = folders.find((f) => f.id === fid)?.parent_id;
        return (
          <>
            <form action="/members/library" role="search" className="bar">
              <input name="q" type="search" aria-label="Search the library" placeholder="Search manuals, safety guides and SOPs" defaultValue={q} />
              <button>Search</button>
            </form>
            {(fid || kids.length > 0) && <p>{fid && <Link href={up ? `/members/library?folder=${up}` : "/members/library"}>← Up</Link>} {kids.map((f) => <Link key={f.id} className="tag" href={`/members/library?folder=${f.id}`}>📁 {f.title}</Link>)}</p>}
            {tags.length > 0 && <p>{tags.map((t) => <Link key={t.slug} className="tag" href={`/members/library?tag=${t.slug}`} aria-current={t.slug === tag ? "true" : undefined}>{t.name} ({t.n})</Link>)}</p>}
            {docs.length === 0 ? <p className="sub">{q || tag ? "No documents match." : "No documents yet."}</p> : docs.map((d) => (
              <div className="row" key={d.id} style={{ display: "flex", gap: 12 }}>
                {d.has_thumb && <img src={`/api/library/thumb/${d.slug}`} alt="" width={60} loading="lazy" />}
                <div><Link href={`/members/library/${d.slug}`}><b>{d.title}</b></Link> <span className="tag">{d.type}</span> {d.pinned && <span className="tag">pinned</span>}
                {d.description && <div className="sub" style={{ margin: 0 }}>{d.description}</div>}
                {d.snippet && <div className="sub" style={{ margin: 0 }}>{d.snippet.split(/(<<|>>)/).reduce<{ on: boolean; out: React.ReactNode[] }>((a, p, i) => (p === "<<" ? { ...a, on: true } : p === ">>" ? { ...a, on: false } : { ...a, out: [...a.out, a.on ? <mark key={i}>{p}</mark> : p] }), { on: false, out: [] }).out}</div>}
              </div></div>
            ))}
          </>
        );
      }}
    </MembersShell>
  );
}
