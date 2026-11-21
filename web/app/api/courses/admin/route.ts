import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { actor, editingAllowed } from "@/lib/guard";
import { logAudit } from "@/lib/store";
import { learnFlags, saveLearnFlags } from "@/lib/learn-flags";
import { practiceQuestions, practiceTests, setAllPractice, setPractice } from "@/lib/courses/practice";
import { setToolLearning, toolLearning } from "@/lib/courses/tools";
import { conn } from "@/lib/db";
import { docChoices, addLesson, addSection, createCourse, deleteCourse, deleteLesson, deleteSection, editCourse, getCourse, listCourses, move, renameSection, restoreCourse, saveLesson } from "@/lib/courses/courses";

export const dynamic = "force-dynamic";

// Course admin RPC: POST { op, ...args }. One table says what each op does and whether it only reads; writes are audited.
type Args = any;
const OPS: Record<string, { read?: boolean; noId?: boolean; audit?: (a: Args) => string; run: (a: Args, who: string) => Promise<unknown> }> = {
  list: { read: true, noId: true, run: (a) => listCourses(a.trash === true) },
  docs: { read: true, noId: true, run: () => docChoices() },
  practiceTests: { read: true, noId: true, run: () => practiceTests() },
  practiceQs: { read: true, run: (a) => practiceQuestions(a.id) },
  setPractice: { noId: true, audit: (a) => `${a.qkey} ${JSON.stringify({ ok: a.practice_ok })}`, run: (a) => setPractice(a.qkey, a) },
  setAllPractice: { audit: (a) => `${a.id} ${a.on === true}`, run: (a) => setAllPractice(a.id, a.on === true) },
  tools: { read: true, noId: true, run: async () => (await (await conn()).query("SELECT id, name FROM tools WHERE archived_at IS NULL ORDER BY lower(name)")).rows },
  toolLearning: { read: true, run: (a) => toolLearning(a.id) },
  setToolLearning: { audit: (a) => `tool ${a.id}: course ${a.require_course === true}, ack ${a.require_ack === true}`, run: (a) => setToolLearning(a.id, a) },
  get: { read: true, run: (a) => getCourse(a.id) },
  flags: { read: true, noId: true, run: () => learnFlags() },
  setFlags: { noId: true, audit: (a) => JSON.stringify({ courses: a.courses }), run: (a) => saveLearnFlags({ courses: a.courses }) },
  create: { noId: true, audit: (a) => String(a.title), run: (a, who) => createCourse(a.title, who) },
  edit: { audit: (a) => `${a.id} ${a.status ?? ""}`, run: (a) => editCourse(a.id, a) },
  delete: { audit: (a) => String(a.id), run: (a) => deleteCourse(a.id) },
  restore: { audit: (a) => String(a.id), run: (a) => restoreCourse(a.id) },
  addSection: { run: (a) => addSection(a.id, a.title) },
  renameSection: { run: (a) => renameSection(a.id, a.title) },
  deleteSection: { audit: (a) => String(a.id), run: (a) => deleteSection(a.id) },
  addLesson: { run: (a) => addLesson(a.id, a.title) },
  deleteLesson: { audit: (a) => String(a.id), run: (a) => deleteLesson(a.id) },
  saveLesson: { audit: (a) => `${a.id}${a.significant === true ? " (significant)" : ""}`, run: (a, who) => saveLesson(a.id, a, who) },
  move: { run: (a) => move(a.kind === "section" ? "section" : "lesson", a.id, a.dir) },
};

export async function POST(req: Request) {
  const a = await req.json().catch(() => null), op = typeof a?.op === "string" && Object.hasOwn(OPS, a.op) ? OPS[a.op] : null;
  if (!op || !(await editingAllowed("learning", op.read ? "read" : "write", "courses"))) return new NextResponse("not found", { status: 404 });
  if (!op.noId && !Number.isInteger((a.id = Number(a.id)))) return new NextResponse("bad id", { status: 400 });
  const who = await actor();
  try {
    const out = (await op.run(a, who)) ?? { ok: true };
    if (op.audit) await logAudit(who, `courses.${a.op}`, op.audit(a));
    return NextResponse.json(out);
  } catch (e) { return new NextResponse(errMsg(e), { status: 400 }); }
}
