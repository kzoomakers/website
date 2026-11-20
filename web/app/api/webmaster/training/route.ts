import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { actor, canSpecial, editingAllowed } from "@/lib/guard";
import { logAudit } from "@/lib/store";
import { saveTrainingCfg } from "@/lib/training/settings";
import * as t from "@/lib/training/tests";

// Training admin RPC: POST { op, ...args }. Each op is tied to the page (lib/access.ts) that unlocks it; reads need view access, everything else edit access.
export const dynamic = "force-dynamic";
const PAGE: Record<string, string> = {
  setEnabled: "settings",
  tests: "tests", toolsFree: "tests", test: "tests", revision: "tests", compare: "tests", export: "tests", preview: "tests", previewGrade: "tests", publishCheck: "tests",
  createTest: "tests", renameTest: "tests", archiveTest: "tests", deleteTest: "tests", newDraft: "tests", saveSettings: "tests", saveQuestion: "tests", deleteQuestion: "tests", reorder: "tests", discardDraft: "tests", import: "tests", publish: "tests",
};
const READS = new Set(["tests", "toolsFree", "test", "revision", "compare", "export", "preview", "previewGrade", "publishCheck"]);
const gone = () => new NextResponse("not found", { status: 404 });

export async function POST(req: Request) {
  if (Number(req.headers.get("content-length") ?? 0) > 3_000_000) return new NextResponse("too large", { status: 413 });
  const a = await req.json().catch(() => null);
  if (!a?.op || !PAGE[a.op] || !(await editingAllowed("training", READS.has(a.op) ? "read" : "write", PAGE[a.op]))) return gone();
  const who = await actor();
  try {
    const res = await (async (): Promise<unknown> => { switch (a.op) {
      case "setEnabled": await saveTrainingCfg({ enabled: a.enabled === true }); await logAudit(who, "training.settings", `Training ${a.enabled === true ? "switched on" : "switched off"}`); return { ok: true };
      case "tests": return t.listTests();
      case "toolsFree": return t.toolsWithoutTest();
      case "test": return (await t.getTest(a.id)) ?? gone();
      case "revision": return (await t.getRevision(a.id)) ?? gone();
      case "compare": return t.compare(a.a, a.b);
      case "export": return t.exportRevision(a.id);
      case "preview": return t.previewQuestions(a.id, Number.isInteger(a.seed) ? a.seed : 1);
      case "previewGrade": return t.previewGrade(a.id, a.answers);
      case "publishCheck": return { problems: await t.publishProblems(a.id) };
      case "createTest": return { id: await t.createTest(a.tool, a.title, who) };
      case "renameTest": await t.renameTest(a.id, a.title); return { ok: true };
      case "archiveTest": await t.archiveTest(a.id, a.on, who); return { ok: true };
      case "deleteTest": await t.deleteTest(a.id, who); return { ok: true };
      case "newDraft": return { id: await t.newDraft(a.id, who) };
      case "saveSettings": return t.saveSettings(a.id, a.at, a.settings ?? {});
      case "saveQuestion": return t.saveQuestion(a.id, a.at, a.question);
      case "deleteQuestion": return t.deleteQuestion(a.id, a.at, a.qid);
      case "reorder": return t.reorderQuestions(a.id, a.at, a.ids);
      case "discardDraft": await t.discardDraft(a.id, who); return { ok: true };
      case "import": return t.importIntoDraft(a.id, a.at, a.data);
      case "publish":
        if (!(await canSpecial("training.publish"))) return new NextResponse("You don't have the special permission to publish tests. Ask an administrator (Admin > Access > Special permissions).", { status: 403 });
        return t.publish(a.id, a.at, a, who);
    } return new NextResponse("bad request", { status: 400 }); })();
    return res instanceof NextResponse ? res : NextResponse.json(res);
  } catch (e) { return new NextResponse(errMsg(e), { status: 400 }); }
}
