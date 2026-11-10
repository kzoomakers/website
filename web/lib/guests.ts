import { randomBytes } from "crypto";
import { conn } from "./db";
import { logAudit } from "./store";
import { open, seal, sha256 } from "./vault";
import { processImage } from "./image";
import { checkId } from "./onboarding";
import { RELATIONSHIPS, phoneOk, type Contact } from "./profiles";
import { signGuest, type GuestSign, type Proof } from "./sign";
import { getMailCfg, mailReady, send } from "./mail";
import { latestVersion } from "./waiver";
import { DEFAULT_CFG, deleteText, noticeAllowance, type GuestCfg, type Tier } from "./guest-rules";
export { DEFAULT_CFG, deleteText, noticeAllowance, type GuestCfg, type Tier };

// Guests of members: the host member creates them, and either the host or the guest (on their own phone, through a private expiring link) fills in the wizard.
// A guest is "ready" only when details, an emergency contact, the current agreement (with the retention tick) and a photo ID are all on file. Rules live here, not in the screens.
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const TZ = "America/Detroit";

// ---- settings (Admin > People > Guests)
const num = (v: unknown, lo: number, hi: number, name: string) => { const n = Number(v); if (!Number.isInteger(n) || n < lo || n > hi) throw new Error(`${name} must be a whole number from ${lo} to ${hi}.`); return n; };

export async function getCfg(): Promise<GuestCfg> {
  const r = (await (await conn()).query("SELECT data FROM settings WHERE key = 'guest:cfg'")).rows[0]?.data ?? {};
  return { ...DEFAULT_CFG, ...r, noticeTiers: Array.isArray(r.noticeTiers) && r.noticeTiers.length ? r.noticeTiers : DEFAULT_CFG.noticeTiers };
}
export async function saveCfg(b: any, who: string) {
  const tiers = (Array.isArray(b?.noticeTiers) ? b.noticeTiers : []).map((t: any) => ({ from: num(t?.from, 0, 100000, "Each 'emails today' number"), send: num(t?.send, 0, 1000, "Each 'guest emails' number") }));
  if (!tiers.some((t: Tier) => t.from === 0)) throw new Error("Keep one row that starts at 0 emails, so there is always a daily amount.");
  const c: GuestCfg = { retentionYears: num(b?.retentionYears, 1, 20, "Years to keep records"), linkHours: num(b?.linkHours, 1, 168, "Guest link hours"), weeklyLimit: num(b?.weeklyLimit, 1, 50, "Visits a week"),
    deletePerDay: num(b?.deletePerDay, 0, 1000, "Deletions a day"), noticeTiers: tiers.sort((a: Tier, b: Tier) => a.from - b.from) };
  await (await conn()).query("INSERT INTO settings (key, data) VALUES ('guest:cfg', $1) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data", [JSON.stringify(c)]);
  await logAudit(who, "guest.settings", `retention ${c.retentionYears}y, links ${c.linkHours}h`);
  return c;
}
// ---- private links (the QR code, and the "update your signature" link in emails)
export async function mintLink(guestId: number, hours: number) {
  const token = randomBytes(24).toString("hex"), c = await conn();
  await c.query("DELETE FROM guest_links WHERE guest_id = $1 AND expires_at < now()", [guestId]);
  await c.query("INSERT INTO guest_links (token_hash, guest_id, expires_at) VALUES ($1,$2, now() + make_interval(hours => $3))", [sha256(token), guestId, hours]);
  return token;
}
export async function guestOfLink(token: string): Promise<number | null> {
  if (!/^[0-9a-f]{48}$/.test(token)) return null;
  return (await (await conn()).query("SELECT guest_id FROM guest_links WHERE token_hash = $1 AND expires_at > now()", [sha256(token)])).rows[0]?.guest_id ?? null;
}

// ---- what we know about a guest
const VIEW = `SELECT g.id, g.host_id, g.first_name, g.last_name, g.email, g.phone, g.address, g.zip, g.state, g.minor, g.guardian_name, g.retention_ack_at, g.delete_requested_at, g.created_at, h.name AS host_name,
  (g.first_name <> '' AND g.last_name <> '' AND g.email <> '' AND g.phone <> '' AND g.address <> '' AND g.zip <> '' AND g.state <> '') AS d_details,
  EXISTS (SELECT 1 FROM guest_contacts c WHERE c.guest_id = g.id) AS d_contacts,
  (g.retention_ack_at IS NOT NULL AND g.minor IS NOT NULL AND s.id IS NOT NULL AND s.version_id >= COALESCE((SELECT max(id) FROM waiver_versions WHERE kind = 'guest' AND mandatory), 0)) AS d_agreement,
  EXISTS (SELECT 1 FROM guest_ids i WHERE i.guest_id = g.id) AS has_photo,
  s.id IS NOT NULL AS ever_signed, s.completed_at AS signed_at,
  (SELECT max(at) FROM guest_visits v WHERE v.guest_id = g.id) AS last_visit
  FROM guests g JOIN site_users h ON h.id = g.host_id
  LEFT JOIN LATERAL (SELECT id, version_id, completed_at FROM sign_docs WHERE guest_id = g.id AND kind = 'guest' AND status = 'complete' ORDER BY id DESC LIMIT 1) s ON true`;
export type Step = "details" | "emergency" | "agreement" | "photo";
export const STEPS: Step[] = ["details", "emergency", "agreement", "photo"];

function shape(r: any, cfg: GuestCfg) {
  const done: Record<Step, boolean> = { details: r.d_details, emergency: r.d_contacts, agreement: r.d_agreement, photo: r.has_photo };
  const next = STEPS.find((s) => !done[s]) ?? null; // first unfinished step; null = ready
  // Records are kept for the retention period after the last visit (or, with no visit yet, after signing). Never signed = nothing to keep.
  const base = [r.last_visit, r.signed_at].filter(Boolean).map((d: string) => +new Date(d)).sort((a, b) => b - a)[0];
  const until = r.ever_signed && base ? new Date(new Date(base).setFullYear(new Date(base).getFullYear() + cfg.retentionYears)) : null;
  const dayOf = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD in Detroit: a guest becomes deletable on the day after their date, so records are always kept the full period
  return { id: r.id as number, host_id: r.host_id as number, host_name: r.host_name as string, first_name: r.first_name, last_name: r.last_name, email: r.email, phone: r.phone, address: r.address, zip: r.zip, state: r.state,
    minor: r.minor as boolean | null, guardian_name: r.guardian_name, done, next, ready: next === null, has_photo: r.has_photo as boolean, last_visit: r.last_visit as string | null,
    ever_signed: r.ever_signed as boolean, retain_until: until && until.toISOString(), deletable: !until || dayOf(new Date()) > dayOf(until), delete_requested_at: r.delete_requested_at as string | null,
    needs_resign: r.ever_signed && !r.d_agreement && r.retention_ack_at !== null };
}
export type Guest = ReturnType<typeof shape>;

export async function getGuest(id: number): Promise<Guest | null> {
  const r = (await (await conn()).query(`${VIEW} WHERE g.id = $1`, [id])).rows[0];
  return r ? shape(r, await getCfg()) : null;
}
export async function listGuests(hostId: number): Promise<Guest[]> {
  const cfg = await getCfg();
  return (await (await conn()).query(`${VIEW} WHERE g.host_id = $1 ORDER BY lower(g.last_name), lower(g.first_name), g.id`, [hostId])).rows.map((r) => shape(r, cfg));
}
/** The host's own list shows names and progress only; everything else comes with one guest. */
export const brief = (g: Guest) => ({ id: g.id, first_name: g.first_name, last_name: g.last_name, ready: g.ready, next: g.next, has_photo: g.has_photo, last_visit: g.last_visit });

export async function createGuest(hostId: number) {
  const c = await conn();
  // A blank, never-started guest from a minute ago is reused, so a double click or a re-opened wizard doesn't litter the list.
  const old = (await c.query(`SELECT id FROM guests WHERE host_id = $1 AND first_name = '' AND last_name = '' AND email = '' AND created_at > now() - interval '1 day' ORDER BY id DESC LIMIT 1`, [hostId])).rows[0];
  if (old) return old.id as number;
  if ((await c.query("SELECT count(*)::int n FROM guests WHERE host_id = $1", [hostId])).rows[0].n >= 500) throw new Error("That's a lot of guests. Delete some you no longer need.");
  return (await c.query("INSERT INTO guests (host_id) VALUES ($1) RETURNING id", [hostId])).rows[0].id as number;
}

export async function saveDetails(id: number, b: Record<string, unknown>) {
  const v = { first_name: clip(b.first_name, 80), last_name: clip(b.last_name, 80), email: clip(b.email, 200).toLowerCase(), phone: clip(b.phone, 30), address: clip(b.address, 300), zip: clip(b.zip, 12), state: clip(b.state, 40) };
  if (!v.first_name || !v.last_name) throw new Error("Enter the guest's first and last name.");
  if (!/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(v.email)) throw new Error("Enter a valid email address: the signed agreement is sent there.");
  if (!phoneOk(v.phone)) throw new Error("Enter a valid phone number.");
  if (!v.address || !v.zip || !v.state) throw new Error("Address, zip code and state are all required.");
  await (await conn()).query("UPDATE guests SET first_name=$2, last_name=$3, email=$4, phone=$5, address=$6, zip=$7, state=$8, updated_at=now() WHERE id=$1", [id, v.first_name, v.last_name, v.email, v.phone, v.address, v.zip, v.state]);
}
/** Cancel on any step keeps what was typed so far (blank or partial is fine). */
export async function savePartial(id: number, b: Record<string, unknown>) {
  const f = (k: string, n: number) => (typeof b[k] === "string" ? clip(b[k], n) : null);
  await (await conn()).query(`UPDATE guests SET first_name=COALESCE($2,first_name), last_name=COALESCE($3,last_name), email=COALESCE($4,email), phone=COALESCE($5,phone), address=COALESCE($6,address), zip=COALESCE($7,zip), state=COALESCE($8,state), updated_at=now() WHERE id=$1`,
    [id, f("first_name", 80), f("last_name", 80), f("email", 200)?.toLowerCase() ?? null, f("phone", 30), f("address", 300), f("zip", 12), f("state", 40)]);
}

export const listContacts = async (id: number): Promise<Contact[]> =>
  (await (await conn()).query("SELECT id, first_name, last_name, phone, relationship, address, business_phone FROM guest_contacts WHERE guest_id = $1 ORDER BY id", [id])).rows;
export async function addContact(id: number, b: Record<string, unknown>) {
  const c = await conn();
  const v = { first_name: clip(b.first_name, 80), last_name: clip(b.last_name, 80), phone: clip(b.phone, 30), relationship: clip(b.relationship, 30), address: clip(b.address, 300), business_phone: clip(b.business_phone, 30) };
  if (!v.first_name || !v.last_name) throw new Error("A first and last name are required.");
  if (!phoneOk(v.phone)) throw new Error("A valid phone number is required.");
  if (v.business_phone && !phoneOk(v.business_phone)) throw new Error("That business phone number doesn't look right.");
  if (!(RELATIONSHIPS as readonly string[]).includes(v.relationship)) throw new Error("Please choose the relationship.");
  if ((await c.query("SELECT count(*)::int n FROM guest_contacts WHERE guest_id = $1", [id])).rows[0].n >= 10) throw new Error("That's the maximum of 10 emergency contacts.");
  await c.query("INSERT INTO guest_contacts (guest_id, first_name, last_name, phone, relationship, address, business_phone) VALUES ($1,$2,$3,$4,$5,$6,$7)", [id, v.first_name, v.last_name, v.phone, v.relationship, v.address, v.business_phone]);
}
export const deleteContact = async (id: number, contact: number) => void (await (await conn()).query("DELETE FROM guest_contacts WHERE id = $1 AND guest_id = $2", [contact, id]));

/** The guest (or guardian) reads and signs the current guest agreement. The retention tick is required; a minor needs a guardian who types their name and signs too. */
export async function sign(g: Guest, i: { signature: string; initials: string; drawn: string; minor: boolean; ack: boolean; guardian?: { name: string; signature: string; drawn: string } }, proof: Proof, base: string) {
  if (!g.done.details) throw new Error("Finish the guest's details first.");
  if (!g.done.emergency) throw new Error("Add an emergency contact first.");
  if (i.ack !== true) throw new Error("The guest must tick that they understand how long their records are kept.");
  if (i.minor && !i.guardian) throw new Error("A minor's parent or legal guardian must be present and sign too.");
  const v = await latestVersion("guest"), input: GuestSign = { signature: i.signature, initials: i.initials, drawn: i.drawn, guardian: i.minor ? i.guardian : undefined };
  await signGuest({ id: g.id, name: `${g.first_name} ${g.last_name}`, email: g.email }, (await (await conn()).query("SELECT email FROM site_users WHERE id = $1", [g.host_id])).rows[0].email, v, input, proof, base);
  await (await conn()).query("UPDATE guests SET minor=$2, guardian_name=$3, retention_ack_at=now(), updated_at=now() WHERE id=$1", [g.id, i.minor, i.minor ? clip(i.guardian?.name, 100) : ""]);
}

export async function storePhoto(id: number, kind: string, expires: string, file: File) {
  checkId(kind, expires);
  const img = (await processImage(file, { still: true, fit: { width: 2200, height: 2200 } })).data; // re-encoded: metadata (GPS and the like) is dropped
  await (await conn()).query("INSERT INTO guest_ids (guest_id, kind, expires_on, data) VALUES ($1,$2,$3,$4) ON CONFLICT (guest_id) DO UPDATE SET kind = EXCLUDED.kind, expires_on = EXCLUDED.expires_on, data = EXCLUDED.data, uploaded_at = now()", [id, kind, expires || null, seal(img)]);
  await (await conn()).query("UPDATE guests SET updated_at = now() WHERE id = $1", [id]);
}
export async function photoOf(id: number) {
  const r = (await (await conn()).query("SELECT data FROM guest_ids WHERE guest_id = $1", [id])).rows[0];
  return r ? open(r.data) : null;
}

// ---- check-in
export type CheckIn = { already: boolean; at: string; week: number; nag: boolean };
export async function checkIn(g: Guest): Promise<CheckIn> {
  if (!g.ready) throw new Error("This guest isn't ready to be checked in yet. Finish their steps first.");
  const c = await conn(), cfg = await getCfg();
  const today = (await c.query(`SELECT at FROM guest_visits WHERE guest_id = $1 AND (at AT TIME ZONE $2)::date = (now() AT TIME ZONE $2)::date ORDER BY at DESC LIMIT 1`, [g.id, TZ])).rows[0];
  const week = async () => (await c.query("SELECT count(DISTINCT (at AT TIME ZONE $2)::date)::int n FROM guest_visits WHERE guest_id = $1 AND at > now() - interval '7 days'", [g.id, TZ])).rows[0].n as number;
  if (today) return { already: true, at: today.at, week: await week(), nag: false };
  const at = (await c.query("INSERT INTO guest_visits (guest_id, host_id) VALUES ($1,$2) RETURNING at", [g.id, g.host_id])).rows[0].at as string;
  await c.query("UPDATE guests SET delete_requested_at = NULL WHERE id = $1", [g.id]); // coming back cancels a deletion request
  const n = await week();
  return { already: false, at, week: n, nag: n > cfg.weeklyLimit };
}
export const visitsOf = async (id: number) => (await (await conn()).query("SELECT at FROM guest_visits WHERE guest_id = $1 ORDER BY at DESC LIMIT 100", [id])).rows.map((r) => r.at as string);
/** The host's own recent guest visits, for the member home page. */
export const recentVisits = async (hostId: number) => (await (await conn()).query(`SELECT v.at, g.first_name, g.last_name FROM guest_visits v JOIN guests g ON g.id = v.guest_id WHERE v.host_id = $1 ORDER BY v.at DESC LIMIT 10`, [hostId])).rows as { at: string; first_name: string; last_name: string }[];

// ---- deleting
const fmtDate = (d: string | Date) => new Date(d).toLocaleDateString("en-US", { timeZone: TZ, month: "2-digit", day: "2-digit", year: "numeric" });
/** Deletes everything about one guest (details, contacts, signed PDF, photo ID, visits). A member can only do it once the retention period has passed (a guest who never signed has nothing to keep); an admin may override, knowingly. */
export async function deleteGuest(g: Guest, by: { who: string; override?: boolean }) {
  if (!g.deletable && !by.override) throw new Error(`Sorry! We have to retain their records for ${(await getCfg()).retentionYears} years. They can be deleted after ${fmtDate(g.retain_until!)}.`);
  await (await conn()).query("DELETE FROM guests WHERE id = $1", [g.id]); // cascades to every table above and to their signed documents
  await logAudit(by.who, "guest.delete", `guest #${g.id}${!g.deletable ? " (override: before the retention period ended)" : ""}`); // no personal data in the log
}

/** The guest's own "delete my profile" from an email. Past the retention date (or never signed) it happens at once; otherwise it is scheduled and the job deletes it on the date. */
export async function requestDelete(id: number) {
  const g = await getGuest(id);
  if (!g) throw new Error("This link is no longer valid.");
  if (g.deletable) { await deleteGuest(g, { who: "guest (own request)" }); return { deleted: true as const }; }
  await (await conn()).query("UPDATE guests SET delete_requested_at = COALESCE(delete_requested_at, now()) WHERE id = $1", [id]);
  await logAudit("guest", "guest.delete.request", `guest #${id}`);
  return { deleted: false as const, on: g.retain_until!, host: g.host_name.split(" ")[0], text: deleteText(g.retain_until!, g.host_name.split(" ")[0], (await getCfg()).retentionYears) };
}
// ---- admin
export async function adminList(q: string) {
  const like = "%" + clip(q, 80).replace(/[\\%_]/g, "\\$&") + "%", cfg = await getCfg();
  return (await (await conn()).query(`${VIEW} WHERE g.first_name ILIKE $1 OR g.last_name ILIKE $1 OR g.email ILIKE $1 OR h.name ILIKE $1 ORDER BY g.id DESC LIMIT 300`, [like])).rows
    .map((r) => { const g = shape(r, cfg); return { id: g.id, name: `${g.first_name} ${g.last_name}`.trim() || "(not started)", email: g.email, host: g.host_name, ready: g.ready, next: g.next, last_visit: g.last_visit, retain_until: g.retain_until, deletable: g.deletable, delete_requested_at: g.delete_requested_at }; });
}
export async function adminVisits() {
  return (await (await conn()).query(`SELECT v.at, g.first_name, g.last_name, h.name AS host FROM guest_visits v JOIN guests g ON g.id = v.guest_id JOIN site_users h ON h.id = v.host_id ORDER BY v.at DESC LIMIT 100`)).rows as { at: string; first_name: string; last_name: string; host: string }[];
}

// ---- the hourly job: revision notices (a trickle that backs off as the day's email total fills up) and scheduled deletions
const esc = (s: string) => s.replace(/[<>&"]/g, "");
export async function runGuestMail() {
  const c = await conn(), cfg = await getCfg(), mail = await getMailCfg();
  if (!mailReady(mail)) return;
  const base = (mail.siteUrl || process.env.SITE_URL || "").replace(/\/+$/, "");
  if (!base) return;
  const day = `(now() AT TIME ZONE '${TZ}')::date`;
  const total = async () => (await c.query(`SELECT COALESCE((SELECT n FROM mail_daily WHERE day = ${day}), 0)::int n`)).rows[0].n as number;
  const sentToday = (await c.query(`SELECT count(*)::int n FROM guest_notices WHERE (sent_at AT TIME ZONE '${TZ}')::date = ${day}`)).rows[0].n as number;
  let sent = 0;
  for (;;) {
    if (!noticeAllowance(cfg.noticeTiers, await total(), sentToday + sent)) break;
    const n = (await c.query(`SELECT n.guest_id, n.version_id, g.first_name, g.email, v.revision, v.summary FROM guest_notices n JOIN guests g ON g.id = n.guest_id JOIN waiver_versions v ON v.id = n.version_id
      WHERE n.sent_at IS NULL AND g.email <> '' ORDER BY n.queued_at, n.guest_id LIMIT 1`)).rows[0];
    if (!n) break;
    const token = await mintLink(n.guest_id, 24 * 30), link = `${base}/guest/${token}`, del = `${base}/guest/${token}/delete`;
    try {
      await send({ to: n.email, subject: "We've updated the Kzoo Makers Guest Agreement",
        text: `Hi ${n.first_name},\n\nWe've updated the Kzoo Makers Guest Agreement (revision ${n.revision}).\n\nWhat changed:\n${n.summary}\n\nReview and sign the new version: ${link}\n\nI want to delete my profile: ${del}\n\nWe keep guest records for at least 2 years after a guest's last visit, as you agreed when you signed.`,
        html: `<p>Hi ${esc(n.first_name)},</p><p>We've updated the Kzoo Makers Guest Agreement (revision ${esc(n.revision)}).</p><p><strong>What changed</strong></p><p style="white-space:pre-wrap">${esc(n.summary)}</p><p><a href="${link}">Review and sign the new version</a></p><p><a href="${del}">I want to delete my profile</a></p><p><small>We keep guest records for at least 2 years after a guest's last visit, as you agreed when you signed.</small></p>` }, mail);
    } catch (e) { console.error("guest notice:", e); break; } // try again next hour
    await c.query("UPDATE guest_notices SET sent_at = now() WHERE guest_id = $1 AND version_id = $2", [n.guest_id, n.version_id]);
    sent++;
  }
  await runScheduledDeletes(cfg, mail, base);
}

async function runScheduledDeletes(cfg: GuestCfg, mail: Awaited<ReturnType<typeof getMailCfg>>, base: string) {
  const c = await conn(), key = `guest:del:${(await c.query(`SELECT (now() AT TIME ZONE '${TZ}')::date AS d`)).rows[0].d.toISOString().slice(0, 10)}`;
  let done = Number((await c.query("SELECT data FROM settings WHERE key = $1", [key])).rows[0]?.data?.n ?? 0);
  for (const r of (await c.query(`${VIEW} WHERE g.delete_requested_at IS NOT NULL ORDER BY g.delete_requested_at LIMIT 50`)).rows) {
    if (done >= cfg.deletePerDay) break;
    const g = shape(r, cfg);
    if (!g.deletable) continue;
    try { if (g.email) await send({ to: g.email, subject: "Your Kzoo Makers guest data is being deleted", text: `Hi ${g.first_name},\n\nAs you asked, we are deleting your guest profile and all the personal data we hold about you (details, emergency contacts, signed agreement and photo ID). This is the last email you will get from us.\n\nKzoo Makers (${base})` }, mail); }
    catch (e) { console.error("guest delete notice:", e); continue; } // no deletion without the heads-up; try again next hour
    await deleteGuest(g, { who: "guest (scheduled request)" });
    done++;
    await c.query("INSERT INTO settings (key, data) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data", [key, JSON.stringify({ n: done })]);
  }
}
