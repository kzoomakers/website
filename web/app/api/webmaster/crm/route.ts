import { NextResponse } from "next/server";
import { actor, editingAllowed } from "@/lib/guard";
import { logAudit } from "@/lib/store";
import * as c from "@/lib/crm";
import * as ap from "@/lib/approvals";
import { baseUrl } from "@/lib/mail";

// One CRM admin RPC endpoint: POST { op, ...args }. Reads need CRM view access, everything else CRM edit access.
export const dynamic = "force-dynamic";
const READS = new Set(["member", "plans", "skills", "fieldValues", "tools", "classes", "roster", "proposals", "classRules", "applicants", "applicant"]);

export async function POST(req: Request) {
  const a = await req.json().catch(() => null);
  if (!a?.op) return new NextResponse("bad request", { status: 400 });
  if (!(await editingAllowed("crm", READS.has(a.op) ? "read" : "write"))) return new NextResponse("not found", { status: 404 });
  const who = await actor();
  try {
    const res = await (async () => { switch (a.op) {
      case "plans": return NextResponse.json(await c.planNames());
      case "member": return NextResponse.json({ levels: await c.memberships(a.id), auths: await c.authsFor(a.id), skills: await c.mySkills(a.id), classes: await c.memberClasses(a.id), tools: await c.listTools(), plans: await c.planNames() });
      case "setLevels": await c.setMemberships(a.id, a.levels, who); break;
      case "grant": await c.grantAuth(a.id, a.tool, a.expires, a.note, who); break;
      case "revoke": await c.revokeAuth(a.id, a.tool, who); break;
      case "skills": return NextResponse.json(await c.listSkills());
      case "renameSkill": await c.renameSkill(a.id, a.name); break;
      case "deleteSkill": await c.deleteSkill(a.id); break;
      case "mergeSkill": await c.mergeSkills(a.id, a.into); break;
      case "fieldValues": return NextResponse.json(await c.listFieldValues());
      case "renameValue": await c.renameFieldValue(String(a.field), String(a.value), String(a.to)); break;
      case "deleteValue": await c.deleteFieldValue(String(a.field), String(a.value)); break;
      case "tools": return NextResponse.json(await c.listTools());
      case "saveTool": await c.saveTool(a.tool); break;
      case "deleteTool": await c.deleteTool(a.id); break;
      case "classes": return NextResponse.json(await c.allClasses());
      case "saveClass": await c.saveClass(a.klass); break;
      case "deleteClass": await c.deleteClass(a.id); break;
      case "proposals": return NextResponse.json({ rows: await c.listProposals(String(a.status ?? "pending")), counts: await c.proposalCounts() });
      case "classRules": return NextResponse.json({ minDays: await c.classMinDays() });
      case "setMinDays": await c.setClassMinDays(a.days, who); break;
      case "decide": await c.decideProposal(Number(a.id), a.action === "approve" ? "approve" : "decline", a.edit, String(a.reason ?? ""), who); break;
      case "applicants": return NextResponse.json({ rows: await ap.listApplicants(String(a.state ?? "pending")), counts: await ap.counts() });
      case "applicant": return NextResponse.json(await ap.detail(Number(a.id)));
      case "applicantSay": return NextResponse.json(await ap.say(Number(a.id), who, String(a.body ?? ""), !!a.wait, await baseUrl(req)));
      case "applicantNote": await ap.note(Number(a.id), who, String(a.body ?? "")); break;
      case "applicantMove": return NextResponse.json(await ap.move(Number(a.id), String(a.from), String(a.to), who, { confirmed: a.confirmed === true, reason: a.reason, edit: a.edit }, await baseUrl(req)));
      case "roster": return NextResponse.json(await c.roster(a.id));
      default: return new NextResponse("unknown op", { status: 400 });
    } return NextResponse.json({ ok: true }); })();
    // Every successful change is logged (crm.<op>); the target is whatever names the thing changed.
    if (res.ok && !READS.has(a.op) && !["setLevels", "grant", "revoke", "setMinDays", "applicantSay", "applicantNote", "applicantMove"].includes(a.op)) await logAudit(who, "crm." + a.op, String(a.name ?? a.form?.name ?? a.campaign?.subject ?? a.subscriber?.email ?? a.tool?.name ?? a.klass?.name ?? a.id ?? a.value ?? ""));
    return res;
  } catch (e: any) {
    return new NextResponse(e.message ?? "failed", { status: 400 });
  }
}
