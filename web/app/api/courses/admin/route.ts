import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { actor, editingAllowed } from "@/lib/guard";
import { logAudit } from "@/lib/store";
import { learnFlags, saveLearnFlags } from "@/lib/learn-flags";
import { practiceQuestions, practiceTests, setAllPractice, setPractice } from "@/lib/courses/practice";
import { setToolLearning, toolLearning } from "@/lib/courses/tools";
import { conn } from "@/lib/db";
import { MAX_IMPORT_BYTES } from "@/lib/courses/courses";
import { createQuiz, exportQuiz } from "@/lib/courses/quizzes";
import { docChoices, addLesson, addSection, createCourse, deleteCourse, deleteLesson, deleteSection, duplicateCourse, editCourse, exportCourse, getCourse, importCourse, getLesson, listCourses, move, renameSection, restoreCourse, restoreLesson, saveLesson } from "@/lib/courses/courses";

export const dynamic = "force-dynamic";

// Course admin RPC: POST { op, ...args }. One table says what each op does, whether it only reads, and any library access it also needs (a tool link decides who may open a document, so it is not for course authors alone). `audit` returns null to skip (autosaves).
type Args = any;
const OPS: Record<string, { read?: boolean; noId?: boolean; lib?: "read" | "write"; audit?: (a: Args) => string | null; run: (a: Args, who: string) => Promise<unknown> }> = {
  list: { read: true, noId: true, run: (a) => listCourses(a.trash === true) },
  docs: { read: true, noId: true, run: async () => docChoices(await editingAllowed("library", "read", "documents")) },
  practiceTests: { read: true, noId: true, run: () => practiceTests() },
  practiceQs: { read: true, run: (a) => practiceQuestions(a.id) },
  setPractice: { noId: true, audit: (a) => `${a.qkey} ${JSON.stringify({ ok: a.practice_ok })}`, run: (a) => setPractice(a.qkey, a) },
  setAllPractice: { audit: (a) => `${a.id} ${a.on === true}`, run: (a) => setAllPractice(a.id, a.on === true) },
  createQuiz: { noId: true, audit: (a) => String(a.title), run: (a, who) => createQuiz(a.title, a.text, who) },
  exportQuiz: { read: true, run: (a) => exportQuiz(a.id) },
  tools: { read: true, noId: true, run: async () => (await (await conn()).query("SELECT id, name FROM tools WHERE archived_at IS NULL ORDER BY lower(name)")).rows },
  toolLearning: { read: true, lib: "read", run: (a) => toolLearning(a.id) },
  setToolLearning: { lib: "write", audit: (a) => `tool ${a.id}: course ${a.require_course === true}, ack ${a.require_ack === true}`, run: (a) => setToolLearning(a.id, a) },
  get: { read: true, run: (a) => getCourse(a.id) },
  lesson: { read: true, run: (a) => getLesson(a.id) },
  restoreLesson: { audit: (a) => String(a.id), run: (a) => restoreLesson(a.id) },
  flags: { read: true, noId: true, run: () => learnFlags() },
  setFlags: { noId: true, audit: (a) => JSON.stringify({ courses: a.courses }), run: (a) => saveLearnFlags({ courses: a.courses }) },
  create: { noId: true, audit: (a) => String(a.title), run: (a, who) => createCourse(a.title, who) },
  export: { read: true, run: (a) => exportCourse(a.id) },
  import: { noId: true, audit: (a) => String(a.data?.title ?? ""), run: (a, who) => importCourse(a.data, who) },
  duplicate: { audit: (a) => String(a.id), run: (a, who) => duplicateCourse(a.id, who) },
  edit: { audit: (a) => `${a.id} ${a.status ?? ""}`, run: (a) => editCourse(a.id, a) },
  delete: { audit: (a) => String(a.id), run: (a) => deleteCourse(a.id) },
  restore: { audit: (a) => String(a.id), run: (a) => restoreCourse(a.id) },
  addSection: { run: (a) => addSection(a.id, a.title) },
  renameSection: { run: (a) => renameSection(a.id, a.title) },
  deleteSection: { audit: (a) => String(a.id), run: (a) => deleteSection(a.id) },
  addLesson: { run: (a) => addLesson(a.id, a.title) },
  deleteLesson: { audit: (a) => String(a.id), run: (a) => deleteLesson(a.id) },
  saveLesson: { audit: (a) => (a.significant === true ? `${a.id} (significant)` : null), run: (a, who) => saveLesson(a.id, a, who) },
  move: { run: (a) => move(a.kind === "section" ? "section" : "lesson", a.id, a.dir) },
};

export async function POST(req: Request) {
  if (!(Number(req.headers.get("content-length")) <= MAX_IMPORT_BYTES + 100_000)) return new NextResponse("That request is too big.", { status: 413 }); // checked before the body is read; a missing length is refused too
  const a = await req.json().catch(() => null), op = typeof a?.op === "string" && Object.hasOwn(OPS, a.op) ? OPS[a.op] : null;
  if (!op || !(await editingAllowed("learning", op.read ? "read" : "write", "courses")) || (op.lib && !(await editingAllowed("library", op.lib, "documents")))) return new NextResponse("not found", { status: 404 });
  if (!op.noId && !Number.isInteger((a.id = Number(a.id)))) return new NextResponse("bad id", { status: 400 });
  const who = await actor();
  try {
    const out = (await op.run(a, who)) ?? { ok: true };
    const note = op.audit?.(a);
    if (note != null) await logAudit(who, `courses.${a.op}`, note);
    return NextResponse.json(out);
  } catch (e) { return new NextResponse(errMsg(e), { status: 400 }); }
}
