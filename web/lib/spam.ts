// Comment spam filter, ported from emdash's moderation flow (honeypot and rate limits live in comments.ts):
// hard-spam rules first, then "hold for review" rules, then the site's moderation mode. Pure, so it is easy to test.
export type Mode = "none" | "first_time" | "all";
export type Verdict = { status: "approved" | "pending" | "spam"; reason: string };

const LINK = /https?:\/\/|www\./gi;

export function judge(body: string, o: { mode: Mode; blocked: string[]; priorApproved: number; duplicate: boolean }): Verdict {
  const text = body.toLowerCase();
  if (o.duplicate) return { status: "spam", reason: "Duplicate of a recent comment" };
  const word = o.blocked.find((w) => w && text.includes(w));
  if (word) return { status: "spam", reason: `Blocked word: ${word}` };
  if (/\p{Script=Cyrillic}/u.test(body)) return { status: "spam", reason: "Cyrillic text" };
  const links = body.match(LINK)?.length ?? 0;
  if (links >= 4) return { status: "spam", reason: `${links} links` };
  if (links && !o.priorApproved) return { status: "pending", reason: "Link from a first-time commenter" };
  const letters = body.replace(/[^a-z]/gi, "");
  if (letters.length > 20 && letters.replace(/[^A-Z]/g, "").length / letters.length > 0.7) return { status: "pending", reason: "Mostly capitals" };
  if (/(.)\1{9,}/.test(body)) return { status: "pending", reason: "Repeated characters" };
  if (o.mode === "none" || (o.mode === "first_time" && o.priorApproved)) return { status: "approved", reason: "" };
  return { status: "pending", reason: o.mode === "all" ? "Held for review" : "First-time commenter" };
}
