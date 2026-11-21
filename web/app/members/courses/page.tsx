import Link from "next/link";
import { notFound } from "next/navigation";
import { memberCourses } from "@/lib/courses/player";
import { learnFlags } from "@/lib/learn-flags";
import { viewer } from "@/lib/library/viewer";
import MembersShell from "../shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Courses | Kzoo Makers", robots: { index: false } };

export default async function CoursesPage() {
  const v = await viewer();
  if (!(await learnFlags()).courses && !v.staff) notFound();
  return (
    <MembersShell title="Courses" path="/members/courses">
      {async () => {
        const list = await memberCourses(v);
        return !list.length ? <p className="sub">No courses yet.</p> : (
          <>{list.map((c) => (
            <div className="row" key={c.id}>
              <Link href={`/members/courses/${c.slug}`}><b>{c.title}</b></Link> <span className="tag">{c.done === c.lessons ? "✅ done" : `${c.done} of ${c.lessons} lessons`}</span>
              {c.summary && <div className="sub">{c.summary}</div>}
            </div>
          ))}</>
        );
      }}
    </MembersShell>
  );
}
