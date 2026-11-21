import Link from "next/link";
import { notFound } from "next/navigation";
import { courseOutline } from "@/lib/courses/player";
import { learnFlags } from "@/lib/learn-flags";
import { viewer } from "@/lib/library/viewer";
import MembersShell from "../../shell";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

// A course: its outline with check marks and locks, and one Continue button. Staff can add ?preview=1 to see a draft with nothing locked (no progress is recorded).
export default async function CoursePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ preview?: string }> }) {
  const { slug } = await params, v = await viewer(), preview = (await searchParams).preview === "1";
  if (!(await learnFlags()).courses && !v.staff) notFound();
  const o = await courseOutline(v, slug, preview);
  if (!o) notFound();
  const q = o.preview ? "?preview=1" : "", total = o.order.length;
  return (
    <MembersShell title={o.title} path={`/members/courses/${slug}`}>
      {() => (
        <>
          {o.preview && <p role="status"><b>Preview.</b> Nothing you do here is saved.</p>}
          {o.summary && <p>{o.summary}</p>}
          {o.change_note && <p className="sub">Updated {new Date(o.updated_at).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "America/Detroit" })}: {o.change_note}</p>}
          <p>{o.doneCount} of {total} lessons done. {o.next ? <Link className="btn" href={`/members/courses/${slug}/${o.next}${q}`}>{o.doneCount ? "Continue" : "Start"}</Link> : total > 0 && "🎉 Course complete."}</p>
          {o.sections.map((s) => (
            <section key={s.id}>
              <h2>{s.title}</h2>
              <ol>{s.lessons.map((l) => <li key={l.id}>{l.locked ? <span aria-label={`${l.title} (locked until you finish the lesson before it)`}>🔒 {l.title}</span> : <Link href={`/members/courses/${slug}/${l.id}${q}`}>{l.done ? "✅ " : ""}{l.title}</Link>}</li>)}</ol>
            </section>
          ))}
        </>
      )}
    </MembersShell>
  );
}
