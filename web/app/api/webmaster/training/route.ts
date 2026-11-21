import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { actor, canSpecial, editingAllowed, levelOf, me } from "@/lib/guard";
import * as dc from "@/lib/training/discord";
import { listTools } from "@/lib/tools";
import { override } from "@/lib/training/overrides";
import { REPORTS, toCsv } from "@/lib/training/reports";
import * as k from "@/lib/training/certs";
import * as rc from "@/lib/training/recert";
import { logAudit } from "@/lib/store";
import { cleanCfg, saveTrainingCfg, trainingCfg } from "@/lib/training/settings";
import * as t from "@/lib/training/tests";

// Training admin RPC: POST { op, ...args }. Each op is tied to the page (lib/access.ts) that unlocks it; reads need view access, everything else edit access.
export const dynamic = "force-dynamic";
const PAGE: Record<string, string> = {
  setEnabled: "settings", getCfg: "settings", saveCfg: "settings", discordGet: "settings", discordSave: "settings", discordTest: "settings",
  queue: "queue", file: "queue", startTraining: "queue", markReady: "queue", note: "queue", reject: "queue", signOff: "queue",
  rolloutPreview: "tests", rollouts: "reports", rolloutMembers: "reports", extendRollout: "reports", undoRollout: "reports", confirmLapse: "reports", memberOverride: "reports", override: "reports", reportTools: "reports", report: "reports", reportCsv: "reports",
  trainers: "trainers", findMembers: "trainers", setTrainer: "trainers", saveToolTraining: "trainers",
  tests: "tests", toolsFree: "tests", test: "tests", revision: "tests", compare: "tests", export: "tests", preview: "tests", previewGrade: "tests", publishCheck: "tests",
  createTest: "tests", renameTest: "tests", archiveTest: "tests", deleteTest: "tests", newDraft: "tests", saveSettings: "tests", saveQuestion: "tests", deleteQuestion: "tests", reorder: "tests", discardDraft: "tests", import: "tests", publish: "tests",
};
const READS = new Set(["tests", "toolsFree", "test", "revision", "compare", "export", "preview", "previewGrade", "publishCheck", "getCfg", "discordGet", "queue", "file", "trainers", "findMembers", "rolloutPreview", "rollouts", "rolloutMembers", "report", "reportCsv", "reportTools"]);
const gone = () => new NextResponse("not found", { status: 404 });

export async function POST(req: Request) {
  if (Number(req.headers.get("content-length") ?? 0) > 3_000_000) return new NextResponse("too large", { status: 413 });
  const a = await req.json().catch(() => null);
  if (!a?.op || !PAGE[a.op] || !(await editingAllowed("training", READS.has(a.op) ? "read" : "write", PAGE[a.op]))) return gone();
  const who = await actor(), m = await me(), act = await k.actorFor(who, levelOf(m, "training") === "write", !!levelOf(m, "training")); // a queue-only grant sees just the tools they're a trainer for
  try {
    const res = await (async (): Promise<unknown> => { switch (a.op) {
      case "setEnabled": await saveTrainingCfg({ enabled: a.enabled === true }); await logAudit(who, "training.settings", `Training ${a.enabled === true ? "switched on" : "switched off"}`); return { ok: true };
      case "getCfg": return trainingCfg();
      case "saveCfg": await saveTrainingCfg(cleanCfg(a.cfg)); await logAudit(who, "training.settings", "Training notices changed"); return { ok: true };
      case "discordGet": case "discordSave": case "discordTest":
        if (!(await canSpecial("training.discord"))) return new NextResponse("You don't have the special permission for Discord announcements. Ask an administrator (Admin > Access > Special permissions).", { status: 403 });
        if (a.op === "discordGet") return { cfg: await dc.discordView(), sends: await dc.recentSends() };
        if (a.op === "discordTest") { const r = await dc.testPost(); await logAudit(who, "training.discord.config", "Test post sent"); return r; }
        await dc.saveDiscord(a.cfg); await logAudit(who, "training.discord.config", "Discord announcements changed"); return { ok: true };
      case "queue": return k.queue(act);
      case "file": return k.file(act, a.id);
      case "startTraining": return k.startTraining(act, a.id);
      case "markReady": return k.markReady(act, a.id);
      case "note": return k.addNote(act, a.id, a.note, a.shared, a.session);
      case "reject": return k.reject(act, a.id, a.reason);
      case "signOff": return k.signOff(act, a.id, a.note);
      case "trainers": return k.trainerMatrix();
      case "findMembers": return k.findMembers(a.q);
      case "setTrainer": await k.setTrainer(a.tool, a.user, a.on, who); return { ok: true };
      case "saveToolTraining": await k.saveToolTraining(a.tool, a.settings, who); return { ok: true };
      case "rolloutPreview": return rc.preview(a.id);
      case "rollouts": return rc.rollouts();
      case "rolloutMembers": return rc.rolloutMembers(a.id);
      case "extendRollout": case "undoRollout": case "confirmLapse":
        if (!(await canSpecial("training.rollout"))) return new NextResponse("You don't have the special permission to change rollouts. Ask an administrator (Admin > Access > Special permissions).", { status: 403 });
        if (a.op === "extendRollout") await rc.extendRollout(a.id, a.deadline, who); else if (a.op === "undoRollout") await rc.undoRollout(a.id, who); else await rc.confirmLapse(a.id, who);
        return { ok: true };
      case "override":
        if (!(await canSpecial("training.override"))) return new NextResponse("You don't have the special permission for overrides. Ask an administrator (Admin > Access > Special permissions).", { status: 403 });
        return override(act, a);
      case "reportTools": return listTools();
      case "report": return REPORTS[a.name]?.() ?? gone();
      case "reportCsv": return REPORTS[a.name] ? new NextResponse(toCsv(await REPORTS[a.name]()), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="training-${a.name}.csv"` } }) : gone();
      case "memberOverride":
        if (!(await canSpecial(a.how === "exempt" ? "training.override" : "training.rollout"))) return new NextResponse("You don't have the special permission for that. Ask an administrator (Admin > Access > Special permissions).", { status: 403 });
        await rc.memberOverride(a.id, a.user, a.tool, a.how, a.date, a.reason, who); return { ok: true };
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
        if (a.deadline && !(await canSpecial("training.rollout"))) return new NextResponse("Starting a re-pass needs the special permission “Force a re-pass”. Ask an administrator (Admin > Access > Special permissions).", { status: 403 });
        return t.publish(a.id, a.at, a, who);
    } return new NextResponse("bad request", { status: 400 }); })();
    return res instanceof NextResponse ? res : NextResponse.json(res);
  } catch (e) { return new NextResponse(errMsg(e), { status: 400 }); }
}
