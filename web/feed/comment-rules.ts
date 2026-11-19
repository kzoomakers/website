// Comment validation and windows ported from comment.rb. Pure, so tests load it directly.
export const MAX_DEPTH = 18, MAX_EDIT_MINS = 360, DELETEABLE_DAYS = 14, COMMENTABLE_DAYS = 90, COMMENT_MAX = 65_535;
// story.rb GRAPHICS_RE
const GRAPHICS = /[\u0000-\u001F←→-➿]|[\u{1F000}-\u{1F9FF}]/gu;
const UPPER_PUNCT = "\\p{Lu}\\p{P}\\p{S}";

/** The "please don't" checks from comment.rb's validate block. Returns messages; empty means fine. */
export function commentProblems(raw: string): string[] {
  const out: string[] = [], t = raw.trim();
  if (!raw.replace(/\s+$/, "")) return ["Comment cannot be empty."];
  if (raw.length > COMMENT_MAX) out.push("Comment is too long.");
  let m: RegExpMatchArray | null;
  if ((m = t.match(/^(t)his([.!])?$/i))) out.push((m[1] === "T" ? "N" : "n") + "ope" + (m[2] ?? ""));
  if (/^tl;?dr.?$/i.test(t)) out.push("Wow!  A blue car!");
  if (/^(> *?\n?)+$/.test(t)) out.push("If a tree falls in the woods and no one hears it, does it make a sound?");
  if (/^bump/i.test(t)) out.push("Don't bump threads.");
  if (new RegExp(`^([${UPPER_PUNCT}] )+[${UPPER_PUNCT}]?$`, "u").test(t)) out.push("D O N ' T");
  if (/^(me too|nice|\+1)([.!])?$/i.test(t)) out.push("Please just upvote the parent post instead.");
  if (!raw.replace(GRAPHICS, "").trim()) out.push("🚫");
  return out;
}

/** comment.rb breaks_speed_limit?: minutes to wait between your comments in one thread: 2, plus one per flag on the chain, plus one per flag you put there. */
export const speedDelayMins = (flagsOnChain: number, yourFlags: number) => 2 + flagsOnChain + yourFlags;

export const isEditable = (c: { user_id: number; is_deleted: boolean; is_moderated: boolean; last_edited_at: Date }, userId: number, now = Date.now()) =>
  c.user_id === userId && !c.is_deleted && !c.is_moderated && now - new Date(c.last_edited_at).getTime() < MAX_EDIT_MINS * 60_000;

export const isDeletable = (c: { user_id: number; created_at: Date }, userId: number, now = Date.now()) =>
  c.user_id === userId && new Date(c.created_at).getTime() >= now - DELETEABLE_DAYS * 864e5;
