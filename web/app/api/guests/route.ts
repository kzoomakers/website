import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { access, isRes } from "@/lib/guest-access";
import { clientIp } from "@/lib/comments";
import { hit } from "@/lib/limit";
import { baseUrl } from "@/lib/mail";
import { currentMember } from "@/lib/readers";
import { ID_KINDS } from "@/lib/onboarding";
import { RELATIONSHIPS } from "@/lib/profiles";
import { uploadLimitMb } from "@/lib/upload-cfg";
import { latestVersion } from "@/lib/waiver";
import * as G from "@/lib/guests";

export const dynamic = "force-dynamic";
const no = { headers: { "cache-control": "no-store" } };

// GET: the signed-in member's guests (names and progress only); GET ?g=<id> (host) or ?t=<link token> (the guest): one guest, with what the wizard needs.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  if (!q.get("g") && !q.get("t")) {
    const m = await currentMember().catch(() => null);
    return m ? NextResponse.json({ guests: (await G.listGuests(m.id)).map(G.brief) }, no) : new NextResponse("Sign in first.", { status: 401 });
  }
  const a = await access(req);
  if (isRes(a)) return a;
  const { g } = a, cfg = await G.getCfg();
  return NextResponse.json({
    guest: g, host: a.host, retention_years: cfg.retentionYears, weekly_limit: cfg.weeklyLimit, relationships: RELATIONSHIPS, kinds: ID_KINDS, upload_mb: await uploadLimitMb(),
    version: g.next === "agreement" || g.done.agreement ? await latestVersion("guest") : null,
    visits: a.host ? await G.visitsOf(g.id) : [],
  }, no);
}

// POST { op, g | t, ... }: create (host), partial / details / sign (host or guest), link / checkin / delete (host only).
export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  if (!b?.op) return new NextResponse("bad request", { status: 400 });
  try {
    if (b.op === "create") {
      const m = await currentMember().catch(() => null);
      return m ? NextResponse.json({ id: await G.createGuest(m.id) }) : new NextResponse("Sign in first.", { status: 401 });
    }
    const a = await access(req, b);
    if (isRes(a)) return a;
    const { g } = a;
    switch (b.op) {
      case "partial": await G.savePartial(g.id, b); return NextResponse.json({ ok: true }); // Cancel: keep whatever was typed
      case "details": await G.saveDetails(g.id, b); return NextResponse.json({ ok: true });
      case "sign": {
        if (!(await hit("guest-sign:" + g.id, 10, 3600_000))) return new NextResponse("Too many tries. Try again later.", { status: 429 });
        await G.sign(g, { signature: String(b.signature ?? ""), initials: String(b.initials ?? ""), drawn: String(b.drawn ?? ""), minor: b.minor === true, ack: b.ack === true,
          guardian: b.guardian ? { name: String(b.guardian.signature ?? ""), signature: String(b.guardian.signature ?? ""), drawn: String(b.guardian.drawn ?? "") } : undefined },
          { ip: clientIp(req), ua: req.headers.get("user-agent") ?? "" }, await baseUrl(req));
        return NextResponse.json({ ok: true });
      }
      case "requestDelete": { // from the email link only; asking is rate-limited per guest
        if (a.host || !(await hit("guest-del:" + g.id, 5, 3600_000))) return new NextResponse("not found", { status: 404 });
        return NextResponse.json(await G.requestDelete(g.id));
      }
      case "link": { // the QR code: a private link that works for the configured number of hours
        if (!a.host) return new NextResponse("not found", { status: 404 });
        if (!(await hit("guest-link-mint:" + g.host_id, 30, 3600_000))) return new NextResponse("Too many links made. Try again later.", { status: 429 });
        return NextResponse.json({ url: `${await baseUrl(req)}/guest/${await G.mintLink(g.id, (await G.getCfg()).linkHours)}` });
      }
      case "emailLink": { // host only: sends the same private link as the QR code to an address they type
        if (!a.host) return new NextResponse("not found", { status: 404 });
        if (!(await hit("guest-link-mail:" + g.host_id, 10, 3600_000))) return new NextResponse("Too many emails sent. Try again later.", { status: 429 });
        await G.emailLink(g, String(b.to ?? ""), `${await baseUrl(req)}/guest/${await G.mintLink(g.id, (await G.getCfg()).linkHours)}`);
        return NextResponse.json({ ok: true });
      }
      case "checkin": if (!a.host) return new NextResponse("not found", { status: 404 }); return NextResponse.json(await G.checkIn(g));
      case "delete": if (!a.host) return new NextResponse("not found", { status: 404 }); await G.deleteGuest(g, { who: (await currentMember())!.email }); return NextResponse.json({ ok: true });
      default: return new NextResponse("unknown op", { status: 400 });
    }
  } catch (e: any) { return new NextResponse(errMsg(e), { status: 400 }); }
}
