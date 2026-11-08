import { NextResponse } from "next/server";
import { currentVerified } from "@/lib/readers";
import { SELF_FIELDS, deleteContact, getProfile, listContacts, saveContact, updateProfile } from "@/lib/profiles";

export const dynamic = "force-dynamic";

const who = async () => (await currentVerified().catch(() => null)) ?? null;
const fail = (e: any) => new NextResponse(e?.message ?? "failed", { status: 400 });
const noAuth = () => new NextResponse("Sign in first.", { status: 401 });

// The signed-in member's own details and emergency contacts.
export async function GET() {
  const u = await who();
  if (!u) return noAuth();
  return NextResponse.json({ profile: await getProfile(u.id), contacts: await listContacts(u.id) });
}

// PUT { first_name, last_name, phone, address1, ... } updates their details (card number, QuickBooks id and email are admin-only).
export async function PUT(req: Request) {
  const u = await who(), b = await req.json().catch(() => null);
  if (!u) return noAuth();
  if (!b) return new NextResponse("bad request", { status: 400 });
  try { await updateProfile(u.id, b, SELF_FIELDS, u.email); return NextResponse.json({ ok: true }); } catch (e) { return fail(e); }
}

// POST { id?, first_name, last_name, phone, relationship, address?, business_phone? } adds or edits an emergency contact.
export async function POST(req: Request) {
  const u = await who(), b = await req.json().catch(() => null);
  if (!u) return noAuth();
  if (!b) return new NextResponse("bad request", { status: 400 });
  try { await saveContact(u.id, b); return NextResponse.json(await listContacts(u.id)); } catch (e) { return fail(e); }
}

// DELETE ?contact=id
export async function DELETE(req: Request) {
  const u = await who(), id = Number(new URL(req.url).searchParams.get("contact"));
  if (!u) return noAuth();
  if (!Number.isInteger(id)) return new NextResponse("bad id", { status: 400 });
  await deleteContact(u.id, id);
  return NextResponse.json(await listContacts(u.id));
}
