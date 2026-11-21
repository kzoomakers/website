import { notFound } from "next/navigation";
import { lessonFor } from "@/lib/courses/player";
import { learnFlags } from "@/lib/learn-flags";
import { viewer } from "@/lib/library/viewer";
import MembersShell from "../../../shell";
import Lesson from "./lesson";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

export default async function LessonPage({ params, searchParams }: { params: Promise<{ slug: string; lesson: string }>; searchParams: Promise<{ preview?: string }> }) {
  const { slug, lesson } = await params, v = await viewer(), preview = (await searchParams).preview === "1";
  if (!(await learnFlags()).courses && !v.staff) notFound();
  const r = await lessonFor(v, slug, Number(lesson), preview);
  if (!r) notFound();
  const q = r.outline.preview ? "?preview=1" : "";
  return (
    <MembersShell title={r.lesson.title} path={`/members/courses/${slug}/${lesson}`}>
      {() => <Lesson key={r.lesson.id} slug={slug} q={q} course={r.outline.title} sequential={r.outline.sequential} preview={r.outline.preview} lesson={r.lesson} data={r.data} complete={r.complete} docs={r.docs} quizzes={r.quizzes} prev={r.prev} next={r.next} position={r.outline.order.indexOf(r.lesson.id) + 1} total={r.outline.order.length} />}
    </MembersShell>
  );
}
