import { NextResponse } from "next/server";
import { editingAllowed } from "@/lib/guard";
import * as m from "@/lib/mail";

// One admin RPC endpoint: POST { op, ...args }. Everything is behind the same admin check as /webmaster.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!(await editingAllowed())) return new NextResponse("not found", { status: 404 });
  const a = await req.json().catch(() => null);
  if (!a?.op) return new NextResponse("bad request", { status: 400 });
  try {
    switch (a.op) {
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
      case "exportPerson": return NextResponse.json(await m.exportPerson(a.id));
      case "erasePerson": await m.erasePerson(a.id); break;
      case "addSubscribers": return NextResponse.json({ added: await m.addSubscribers(String(a.text ?? ""), (a.lists ?? []).map(Number), a.status) });
      case "exportSubscribers": return NextResponse.json({ csv: await m.exportSubscribers(a) });
      case "emails": return NextResponse.json(await m.getCampaigns(a));
      case "campaign": return NextResponse.json(await m.getCampaign(a.id));
      case "saveCampaign": return NextResponse.json({ id: await m.saveCampaign(a.campaign) });
      case "campaignAction": return NextResponse.json({ id: await m.campaignAction(a.id, a.action) });
      case "recipients": return NextResponse.json(await m.campaignRecipients(a.id, a.filter));
      case "activity": return NextResponse.json(await m.subscriberActivity(a.id));
      case "stats": return NextResponse.json(await m.campaignStats(a.id));
      case "saveTemplate": await m.saveTemplate(a.name, a.design); break;
      case "deleteTemplate": await m.deleteTemplate(a.id); break;
      case "test": await m.sendTest(a.id, a.to, await m.baseUrl(req)); break;
      case "send": return NextResponse.json({ recipients: await m.sendCampaign(a.id, await m.baseUrl(req), a.at) });
      case "ai": return NextResponse.json(await m.composeWithAI(String(a.prompt ?? ""), a.current));
      default: return new NextResponse("unknown op", { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return new NextResponse(e.message ?? "failed", { status: 400 });
  }
}
