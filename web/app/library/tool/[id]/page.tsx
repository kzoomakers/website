import Link from "next/link";
import { notFound } from "next/navigation";
import { conn } from "@/lib/db";
import { learnFlags } from "@/lib/learn-flags";
import { visibleSql } from "@/lib/library/rules";
import { viewer } from "@/lib/library/viewer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tool | Kzoo Makers", robots: { index: false, follow: false } };

const ORDER = ["safety", "sop", "manual"];
// What a QR code on a machine opens: the tool's own state for a signed-in member, its safety documents first, the manual, and the course. Only documents this viewer may already see are listed (same rule as the library), so a visitor sees public ones and nothing else.
export default async function ToolLanding({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id), v = await viewer(), f = await learnFlags();
  if (!Number.isInteger(id) || (!f.library && !v.staff)) notFound();
  const c = await conn(), tool = (await c.query("SELECT id, name, description FROM tools WHERE id = $1 AND archived_at IS NULL", [id])).rows[0];
  if (!tool) notFound();
  const [docs, courses, auth] = await Promise.all([
    c.query(`SELECT d.slug, d.title, d.type, td.role FROM tool_docs td JOIN lib_docs d ON d.id = td.doc_id WHERE td.tool_id = $2 AND ${visibleSql(v, "$1")} ORDER BY lower(d.title)`, [v.id, id]).then((r) => r.rows),
    v.member && (f.courses || v.staff) ? c.query("SELECT c.slug, c.title FROM course_tools ct JOIN courses c ON c.id = ct.course_id AND c.deleted_at IS NULL AND c.status = 'published' WHERE ct.tool_id = $1 ORDER BY lower(c.title)", [id]).then((r) => r.rows) : [],
    v.id !== null ? c.query("SELECT granted_at, expires_on FROM tool_auths WHERE user_id = $1 AND tool_id = $2", [v.id, id]).then((r) => r.rows[0]) : undefined,
  ]);
  const sorted = [...docs].sort((a, b) => ORDER.indexOf(a.role) - ORDER.indexOf(b.role)), here = `/library/tool/${id}`;
  const open = (slug: string) => (v.member ? `/members/library/${slug}` : `/api/library/file/${slug}`);
  const live = auth && (!auth.expires_on || new Date(auth.expires_on) >= new Date(new Date().toDateString()));
  return (
    <main style={{ maxWidth: 560, margin: "6vh auto", padding: 16 }}>
      <h1>{tool.name}</h1>
      {tool.description && <p className="sub">{tool.description}</p>}
      {v.id !== null ? (live ? <p>✅ You're authorized on this tool.</p> : <p>You're not authorized on this tool yet. <Link href="/members/training">See what's needed</Link>.</p>) : <p><Link href={`/login?next=${encodeURIComponent(here)}`}>Sign in</Link> to see your own authorization and the members-only documents.</p>}
      {sorted.length > 0 && <><h2>Safety and manuals</h2><ul>{sorted.map((d) => <li key={d.slug}><a href={open(d.slug)}><b>{d.title}</b></a> <span className="tag">{d.type}</span></li>)}</ul></>}
      {courses.length > 0 && <><h2>Learn</h2><ul>{courses.map((x: any) => <li key={x.slug}><Link href={`/members/courses/${x.slug}`}>🎓 {x.title}</Link></li>)}</ul></>}
      {!sorted.length && !courses.length && <p className="sub">Nothing has been added for this tool yet.</p>}
      <p><Link href="/contact">Report a problem with this machine</Link></p>
    </main>
  );
}
