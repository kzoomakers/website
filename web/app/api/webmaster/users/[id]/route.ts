import { NextResponse } from "next/server";
import { actor, editingAllowed, me } from "@/lib/guard";
import { ADMIN_FIELDS, deleteUser, getProfile, listContacts, mayTakeOver, setDisabled, updateProfile } from "@/lib/profiles";
import { adminSetPassword, sendReset } from "@/lib/readers";
import { baseUrl } from "@/lib/mail";
import { logAudit } from "@/lib/store";

type Ctx = { params: Promise<{ id: string }> };
const off = () => new NextResponse("not found", { status: 404 });
const fail = (e: any) => new NextResponse(e?.message ?? "failed", { status: 400 });
const fullAdmin = async () => (await me())?.perms.admin === "write";
const locked = () => new NextResponse("Only a full administrator can do that to someone who has admin access.", { status: 403 });
const uid = async (c: Ctx) => { const n = Number((await c.params).id); return Number.isInteger(n) ? n : null; };

// A member's details and emergency contacts.
export async function GET(_: Request, c: Ctx) {
  const id = await uid(c);
  if (id === null || !(await editingAllowed("crm", "read", ["people", "approvals"]))) return off();
  const profile = await getProfile(id);
  return profile ? NextResponse.json({ profile, contacts: await listContacts(id) }) : off();
}

// PUT { first_name, last_name, email, phone, address1, ..., access_card_number, qb_id, notes }
export async function PUT(req: Request, c: Ctx) {
  const id = await uid(c), b = await req.json().catch(() => null);
  if (id === null || !b || !(await editingAllowed("crm", "write", "people"))) return off();
  const cur = await getProfile(id);
  if (!cur) return off();
  if (typeof b.email === "string" && b.email.trim().toLowerCase() !== cur.email && !(await mayTakeOver(await fullAdmin(), id))) return locked();
  try { await updateProfile(id, b, ADMIN_FIELDS, await actor()); return NextResponse.json({ ok: true }); } catch (e) { return fail(e); }
}

// POST { action: "sendReset" | "setPassword", password } or { action: "disable", reason } / { action: "enable" }
export async function POST(req: Request, c: Ctx) {
  const id = await uid(c), b = await req.json().catch(() => null);
  if (id === null || !(await editingAllowed("crm", "write", "people"))) return off();
  if (!(await mayTakeOver(await fullAdmin(), id))) return locked();
  try {
    const p = await getProfile(id);
    if (!p) return off();
    if (b?.action === "disable" || b?.action === "enable") await setDisabled(id, b.action === "disable" ? (typeof b.reason === "string" ? b.reason : "") : null, await actor());
    else if (b?.action === "sendReset") await sendReset(id, await baseUrl(req));
    else if (b?.action === "setPassword" && typeof b.password === "string") await adminSetPassword(id, b.password);
    else return new NextResponse("bad request", { status: 400 });
    if (b.action === "sendReset" || b.action === "setPassword") await logAudit(await actor(), b.action === "sendReset" ? "user.reset_email" : "user.set_password", p.email);
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}

export async function DELETE(_: Request, c: Ctx) {
  const id = await uid(c);
  if (id === null || !(await editingAllowed("crm", "write", "people"))) return off();
  if (!(await mayTakeOver(await fullAdmin(), id))) return locked();
  try { return (await deleteUser(id, await actor())) ? NextResponse.json({ ok: true }) : off(); } catch (e) { return fail(e); }
}
