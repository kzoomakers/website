import { baseUrl, getPrefs, handleWebhook, savePrefs, tokenAction, trackClick, trackOpen, unsubReason, webhookKeyOk } from "@/lib/mail";

export const dynamic = "force-dynamic";
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const page = (msg: string) => new Response(`<!doctype html><meta name=viewport content="width=device-width"><body style="font:18px system-ui;max-width:480px;margin:20vh auto;padding:0 20px;text-align:center"><p>${msg}</p><p><a href="/">Back to the site</a></p>`, { headers: { "content-type": "text/html" } });
// 1x1 transparent GIF
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

// GET = link click; POST = the mail client's one-click unsubscribe (List-Unsubscribe-Post).
async function run(req: Request, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params, p = new URL(req.url).searchParams;
  if (action === "open") {
    await trackOpen(p.get("s") ?? "").catch(() => {});
    return new Response(PIXEL, { headers: { "content-type": "image/gif", "cache-control": "no-store" } });
  }
  if (action === "click") {
    const to = await trackClick(p.get("s") ?? "", p.get("u") ?? "", p.get("h") ?? "").catch(() => null);
    return to ? Response.redirect(to, 302) : page("That link isn't valid.");
  }
  if (action === "webhook") { // SMTP2GO delivery events; the secret in the URL is the only auth
    if (req.method !== "POST" || !(await webhookKeyOk(p.get("k") ?? "").catch(() => false))) return new Response("no", { status: 403 });
    await handleWebhook(await req.json().catch(() => null)).catch(() => {});
    return new Response("ok");
  }
  const t = p.get("t") ?? "";
  if (action === "preferences") return prefs(req, t);
  if (action === "reason") { // optional follow-up after unsubscribing
    const f = await req.formData().catch(() => null);
    await unsubReason(t, String(f?.get("reason") ?? "")).catch(() => {});
    return page("Thanks for letting us know.");
  }
  if (action !== "confirm" && action !== "unsubscribe") return page("That link isn't valid.");
  if (!(await tokenAction(action, t, await baseUrl(req), p.get("s") ?? "").catch(() => false))) return page("That link isn't valid.");
  if (action === "confirm") return page("You're subscribed. Thank you!");
  const opt = ["I get too many emails", "The content isn't relevant to me", "I never signed up for this", "Other"];
  return page(`You've been unsubscribed.</p><form method="post" action="/mail/reason?t=${esc(t)}" style="text-align:left"><p>Mind telling us why? (optional)</p>${opt.map((o) => `<label style="display:block;margin:6px 0"><input type="radio" name="reason" value="${esc(o)}"> ${esc(o)}</label>`).join("")}<p><button>Send</button></p></form><p><a href="/mail/preferences?t=${esc(t)}">Changed your mind? Manage preferences</a>`);
}
export { run as GET, run as POST };

async function prefs(req: Request, t: string) {
  if (req.method === "POST") {
    const f = await req.formData().catch(() => null);
    if (!f) return page("That didn't work.");
    // The one-click List-Unsubscribe POST also lands on /mail/unsubscribe, never here, so a POST here is always our form.
    return (await savePrefs(t, String(f.get("name") ?? ""), f.getAll("list").map(Number).filter(Boolean)).catch(() => false)) ? page("Your preferences are saved.") : page("That link isn't valid.");
  }
  const d = await getPrefs(t).catch(() => null);
  if (!d) return page("That link isn't valid.");
  if (d.status === "bounced" || d.status === "complained") return page("Email to this address is turned off.");
  return page(`<form method="post" style="text-align:left"><h2 style="text-align:center">Your preferences</h2><label>Name<br><input name="name" value="${esc(d.name)}" style="font:inherit;width:100%;box-sizing:border-box"></label><p>Send me:</p>${d.lists.map((l: any) => `<label style="display:block;margin:6px 0"><input type="checkbox" name="list" value="${l.id}"${l.on && d.status !== "unsubscribed" ? " checked" : ""}> ${esc(l.name)}</label>`).join("")}<p>Untick everything to stop all email.</p><p style="text-align:center"><button style="font:inherit">Save</button></p></form><p>`);
}
