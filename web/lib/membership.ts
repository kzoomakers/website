import { conn, db } from "./db";
import { logAudit } from "./store";

// Membership classes: what we offer, what each costs, and the text the Pricing page shows for it. Staff edit them under Admin > Setup.
// A member's class is a row in `memberships`.
export type MembershipClass = { name: string; price: number; per: string; normal?: string; offer?: string; blurb?: string; note?: string; features?: string };

// The three plans from the Pricing page, used until staff save their own list.
export const DEFAULT_CLASSES: MembershipClass[] = [
  { name: "Kzoo Makers Membership", price: 5, per: "month", blurb: "Collaborative Workspaces\nCome Hangout and Make!", features: "Community of Makers\nCollaborative Workspace\nYour Own Small Tools\nCoffee Machine and Fridge\nWIFI" },
  { name: "Clean Side Tools", price: 20, per: "month", normal: "Normally $45/m", offer: "Limited Time Price!", blurb: "Clean Side Area Tools", note: "A Membership is Required", features: "Clean Side Area Tools\nLaser Cutters and Engravers\n3D Printers\nCraft and Fabrics\nStorage Options" },
  { name: "Everything Tools", price: 60, per: "month", normal: "Normally $85/m", offer: "Limited Time Price!", blurb: "The Whole Shebang!\nClean Side, Plus Dust and Chips Tools!", note: "A Membership is Required", features: "**Woodshop Tools**\n**Metalshop Equipment**\nClean Side Area Tools\nLaser Cutters and Engravers\n3D Printers\nCraft and Fabrics\nStorage Options" },
];

const KEY = "membership:classes";
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

/** A plan as the Pricing page used to store it ("/month", price as text) turned into a class. */
export const fromLegacy = (p: any): MembershipClass => ({
  name: clip(p?.name, 80), price: parseFloat(String(p?.price ?? "").replace(/[^0-9.]/g, "")) || 0, per: clip(p?.per, 30).replace(/^\//, "") || "month",
  normal: clip(p?.normal, 80), offer: clip(p?.offer, 80), blurb: clip(p?.blurb, 500), note: clip(p?.note, 200), features: clip(p?.features, 2000),
});

/** Until staff save a list, the classes are the plans already on the Pricing page (so nothing on the site changes), else the defaults. */
export async function membershipClasses(): Promise<MembershipClass[]> {
  if (!db()) return DEFAULT_CLASSES;
  const c = await conn(), s = (await c.query("SELECT data FROM settings WHERE key = $1", [KEY])).rows[0]?.data;
  if (Array.isArray(s)) return s;
  const old = (await c.query("SELECT data FROM settings WHERE key = 'guided:pricing'")).rows[0]?.data?.plans;
  const plans = (Array.isArray(old) ? old : []).map(fromLegacy).filter((p) => p.name);
  return plans.length ? plans : DEFAULT_CLASSES;
}

/** The card the Pricing page draws for a class. Every card signs up the same way. */
export const toPlan = (c: MembershipClass) => ({ name: c.name, price: c.price, per: "/" + c.per, normal: c.normal ?? "", offer: c.offer ?? "", blurb: c.blurb ?? "", note: c.note ?? "", features: c.features ?? "", buttonLabel: "Signup", buttonHref: "/tours" });

/** Replaces the whole list. Removing a class stops offering it; members already in it keep it. */
export async function saveMembershipClasses(input: unknown, who: string): Promise<MembershipClass[]> {
  const out: MembershipClass[] = [];
  for (const r of Array.isArray(input) ? input : []) {
    const name = clip(r?.name, 80), per = clip(r?.per, 30) || "month";
    const price = r?.price === "" || r?.price == null ? NaN : Number(r.price);
    if (!name) throw new Error("Every membership class needs a name.");
    if (out.some((o) => o.name.toLowerCase() === name.toLowerCase())) throw new Error(`"${name}" is listed twice.`);
    if (!Number.isFinite(price) || price < 0 || price > 100000) throw new Error(`The fee for ${name} must be a number from 0 to 100000.`);
    out.push({ name, price: Math.round(price * 100) / 100, per, normal: clip(r?.normal, 80), offer: clip(r?.offer, 80), blurb: clip(r?.blurb, 500), note: clip(r?.note, 200), features: clip(r?.features, 2000) });
  }
  await (await conn()).query("INSERT INTO settings (key, data) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data", [KEY, JSON.stringify(out)]);
  await logAudit(who, "membership.classes", out.map((o) => `${o.name} $${o.price}/${o.per}`).join("; "));
  return out;
}

/** The class a person is put in when activated. Must be one of the offered classes; null when none are set up yet. */
export async function pickClass(level: unknown): Promise<string | null> {
  const names = (await membershipClasses()).map((c) => c.name), l = clip(level, 80);
  if (!names.length) return null;
  if (!names.includes(l)) throw new Error("Choose a membership class.");
  return l;
}
