import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { actor, editingAllowed, siteAdmin } from "@/lib/guard";
import { logAudit } from "@/lib/store";
import * as m from "@/lib/mail";

// One admin RPC endpoint: POST { op, ...args }. Everything is behind the same admin check as /webmaster.
export const dynamic = "force-dynamic";

// Ops that only look; every other op changes something (or sends mail) and needs write access.
const READS = new Set(["state", "forms", "subscribers", "dashboard", "exportPerson", "exportSubscribers", "emails", "campaign", "recipients", "activity", "stats", "queue", "trackingReport", "trackingOverview", "clickLog"]);
// The admin page each op belongs to (see lib/access.ts), so a person given just that page can use it. An op not listed here needs a whole-section grant.
const PAGE: Record<string, string | string[]> = {
  state: "*", saveCfg: "settings", saveList: "lists", deleteList: "lists", forms: "forms", saveForm: "forms", deleteForm: "forms",
  subscribers: "subscribers", saveSubscriber: "subscribers", bulkSubscribers: "subscribers", exportPerson: "subscribers", erasePerson: "subscribers", addSubscribers: "subscribers", exportSubscribers: "subscribers", activity: "subscribers",
  dashboard: "overview", emails: "emails", campaign: "emails", saveCampaign: "emails", campaignAction: "emails", recipients: "emails", stats: "emails", saveTemplate: "emails", deleteTemplate: "emails", test: "emails", send: "emails", ai: "emails",
  trackingReport: "tracking", trackingOverview: "tracking", clickLog: "tracking",
  queue: "queue", dropQueued: "queue",
};

export async function POST(req: Request) {
  const a = await req.json().catch(() => null);
  if (!a?.op) return new NextResponse("bad request", { status: 400 });
  if (!(await editingAllowed("mail", READS.has(a.op) ? "read" : "write", PAGE[a.op]))) return new NextResponse("not found", { status: 404 });
  // Who opened or clicked what is for hard-coded site admins only; everyone else with access to Email gets totals.
  const admin = await siteAdmin();
  if (!admin && (a.op === "recipients" || a.op === "clickLog")) return new NextResponse("Only site administrators can see who opened or clicked an email.", { status: 403 });
  const blind = (rows: any[]) => (admin ? rows : rows.map(({ opened_at, opens, clicks, urls, ...r }) => r));
  try {
    const res = await (async () => { switch (a.op) {
      case "state": return NextResponse.json({ lists: await m.getLists(), tags: await m.allTags(), templates: await m.getTemplates(), cfg: await m.publicMailCfg() });
      case "saveCfg": await m.saveMailCfg(a.cfg); break;
      case "saveList": await m.saveList(a); break;
      case "deleteList": await m.deleteList(a.id); break;
      case "forms": return NextResponse.json(await m.getForms());
      case "saveForm": await m.saveForm(a.form); break;
      case "deleteForm": await m.deleteForm(a.id); break;
      case "subscribers": return NextResponse.json(await m.querySubscribers(a));
      case "saveSubscriber": await m.saveSubscriber(a.subscriber); break;
      case "bulkSubscribers": await m.bulkSubscribers(a.ids ?? [], a.action, a.list, a.tag); break;
      case "dashboard": return NextResponse.json(await m.dashboard());
      case "exportPerson": { const x: any = await m.exportPerson(a.id); return NextResponse.json({ ...x, emails: blind(x.emails) }); }
      case "erasePerson": await m.erasePerson(a.id); break;
      case "addSubscribers": return NextResponse.json({ added: await m.addSubscribers(String(a.text ?? ""), (a.lists ?? []).map(Number), a.status) });
      case "exportSubscribers": return NextResponse.json({ csv: await m.exportSubscribers(a) });
      case "emails": return NextResponse.json(await m.getCampaigns(a));
      case "campaign": return NextResponse.json(await m.getCampaign(a.id));
      case "saveCampaign": return NextResponse.json({ id: await m.saveCampaign(a.campaign) });
      case "campaignAction": return NextResponse.json({ id: await m.campaignAction(a.id, a.action) });
      case "recipients": return NextResponse.json(await m.campaignRecipients(a.id, a.filter));
      case "activity": return NextResponse.json(blind(await m.subscriberActivity(a.id)));
      case "stats": return NextResponse.json(await m.campaignStats(a.id));
      case "saveTemplate": await m.saveTemplate(a.name, a.design); break;
      case "deleteTemplate": await m.deleteTemplate(a.id); break;
      case "test": await m.sendTest(a.id, a.to, await m.baseUrl(req)); break;
      case "send": return NextResponse.json({ recipients: await m.sendCampaign(a.id, await m.baseUrl(req), a.at) });
      case "trackingReport": return NextResponse.json({ ...(await m.trackingReport(Number(a.id))), admin });
      case "trackingOverview": return NextResponse.json({ ...(await m.trackingOverview()), admin });
      case "clickLog": return NextResponse.json(await m.clickLog(Number(a.id)));
      case "queue": return NextResponse.json(await m.listQueue());
      case "dropQueued": return NextResponse.json({ deleted: await m.dropQueued(a.all ? undefined : (a.ids ?? []).map(Number)) });
      case "ai": return NextResponse.json(await m.composeWithAI(String(a.prompt ?? ""), a.current));
      default: return new NextResponse("unknown op", { status: 400 });
    } return NextResponse.json({ ok: true }); })();
    // Every successful change is logged (mail.<op>); the target is whatever names the thing changed.
    if (res.ok && !READS.has(a.op)) await logAudit(await actor(), "mail." + a.op, String(a.name ?? a.form?.name ?? a.campaign?.subject ?? a.subscriber?.email ?? a.tool?.name ?? a.klass?.name ?? a.id ?? ""));
    return res;
  } catch (e: any) {
    return new NextResponse(errMsg(e), { status: 400 });
  }
}
