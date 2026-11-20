import { notFound, redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { adminGuest } from "@/lib/guests";
import Guest from "./guest";

export const dynamic = "force-dynamic";

export default async function GuestPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const level = await gate("people", "/admin/people/guests/" + id);
  if (!getConfig()) redirect("/admin/system");
  const d = Number.isInteger(id) ? await adminGuest(id) : null;
  if (!d) notFound();
  // Phone, address, emergency contacts, the signed agreement and the ID are never in the page: the admin retrieves each one and the request is logged (lib/pii.ts).
  return <Guest guest={d.guest} visits={d.visits} canEdit={level === "write"} />;
}
