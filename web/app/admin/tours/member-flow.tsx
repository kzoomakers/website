"use client";
import { useEffect, useState } from "react";
import { alertDialog, confirmDialog, promptDialog } from "@/components/dialog";
import { crm } from "../crm/rpc";
import type { MembershipClass } from "@/lib/membership";
import type { Acct } from "@/lib/tours";
import { isStaffEmail } from "@/lib/tours-fmt";
import { tours } from "./rpc";

// Turning a walk-up or a booked tour into a member, and undoing it: the same buttons, wording and steps on both pages.
export const useClasses = () => {
  const [classes, set] = useState<MembershipClass[]>([]);
  useEffect(() => { crm<MembershipClass[]>("membershipClasses").then(set, () => {}); }, []);
  return classes;
};

const STEP: Record<string, string> = { waiver: "hasn't signed the waiver yet", handbook: "signed the waiver, handbook next", id: "signed the waiver, photo ID next", done: "fully set up" };
/** Where this person is on the way to being a member, from their site account (matched by email). Empty when they have none. */
export const stage = (a: Acct) => (!a ? "" : a.approval === "approved" ? `Member${a.level ? ` (${a.level})` : ""}: ${STEP[a.step] ?? a.step}` : `Has an account (${a.approval})`);

type P = { kind: "request" | "booking"; id: number; first: string; last: string; email: string; acct: Acct; activatedAt: string | null; activatedBy: string };
const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1]);

/** The member buttons for one row: class + "Activate now" before, "Undo activation" after. Goes inside the row's action bar. */
export default function MemberActions({ p, classes, me, canActivate, reload, fail }: { p: P; classes: MembershipClass[]; me: string; canActivate: boolean; reload: () => Promise<unknown>; fail: (m: string) => void }) {
  const [level, setLevel] = useState(""), [busy, setBusy] = useState(false);
  const chosen = level || classes[0]?.name || "", name = `${p.first} ${p.last}`.trim(), what = p.kind === "request" ? "request" : "tour";
  const go = async (fn: () => Promise<void>) => { fail(""); setBusy(true); try { await fn(); await reload(); } catch (e: any) { fail(e.message); } finally { setBusy(false); } };
  const activate = async () => {
    // One dialog: the email is how they will sign in, so staff confirm it with the prospect here (and can fix it) before anything is sent.
    const typed = await promptDialog(`Make ${name} a member now?\n\nStep 1: Ask ${p.first} to confirm this email address. It is how they will log in, and we send the sign-in link to it. Fix it below if it is wrong.\n\nStep 2: Press "Activate now". They get an email to sign the agreement, read the handbook and upload an ID.\n\nChanged your mind? You can undo it afterwards.`, p.email, { ok: "Activate now", title: `Activate ${p.first}` });
    if (typed === null) return;
    const email = typed.trim().toLowerCase() || p.email;
    await go(async () => {
      const j = await tours("activate", { kind: p.kind, id: p.id, level: chosen, email });
      await alertDialog(j.emailed ? `Done! ${p.first} is now a member. We emailed a sign-in link to ${email}.` : `${p.first} is now a member, but the email did not go out. Ask them to sign in at the website with ${email}. Their agreement will be waiting.`);
    });
  };
  const undo = async () => {
    await go(async () => {
      const c = await tours("undoActivation", { kind: p.kind, id: p.id, check: true }), g = c.progress as { waiver: boolean; handbook: boolean; id: boolean } | null;
      const started = c.needsConfirm && g;
      if (started) {
        const done = list([g.waiver && "signed the membership waiver", g.handbook && "read the handbook", g.id && "uploaded a photo ID"].filter(Boolean) as string[]);
        if (!isStaffEmail(me)) return void (await alertDialog(`${name} has already ${done}, so you can\u2019t undo this yourself. Please ask a staff member with a kzoomakers.org login to do it.`));
        if (!(await confirmDialog(`${name} has already ${done}.\n\nIf you go ahead, their signed waiver${g.id ? " and photo ID will be" : " will be"} deleted for good and they will have to start over.\n\nAre you sure?`, { ok: "Yes, reset them", danger: true, title: "Reset a signed-up member" }))) return;
      } else if (!(await confirmDialog(`Undo making ${name} a member? The ${what} goes back to how it was. They haven't signed anything yet, so nothing is lost.`, { ok: "Undo activation" }))) return;
      await tours("undoActivation", { kind: p.kind, id: p.id, confirm: !!started });
    });
  };
  if (p.activatedAt) return <button className="danger" disabled={busy} onClick={undo}>Undo activation</button>;
  if (!canActivate || p.acct?.approval === "approved") return null; // already a member: nothing to activate
  return (
    <>
      {classes.length > 0 && <select aria-label="Membership class" value={chosen} onChange={(e) => setLevel(e.target.value)}>{classes.map((c) => <option key={c.name} value={c.name}>{c.name} (${c.price} per {c.per})</option>)}</select>}
      <button disabled={busy} onClick={activate}>Activate now</button>
    </>
  );
}
