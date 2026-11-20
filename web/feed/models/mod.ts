import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { updateCachedColumns } from "./cached";
import { lockCommentStory, recalcComment } from "./comment-cache";
import { isFail, live, prepare, tx, writeStory, type Submission, type SubmitResult } from "./submit";

// Moderator delete and undelete of stories and comments (stories#destroy/#undelete for moderators, mod/comments_controller, comment.rb delete_by_moderator, story.rb log_moderation).
// Every change writes a feed.moderations row, which is the public /moderations log. Moderators are users.is_moderator.

export type ModResult = { ok: true } | { ok: false; error: string };
const REASON_MAX = 4000;

const log = (c: PoolClient, mod: number, target: { story_id?: number; comment_id?: number }, action: string, reason: string) =>
  c.query("INSERT INTO feed.moderations (moderator_user_id, story_id, comment_id, action, reason, token) VALUES ($1, $2, $3, $4, $5, $6)",
    [mod, target.story_id ?? null, target.comment_id ?? null, action, reason.trim() || null, `moderation_${randomBytes(16).toString("hex")}`]);

const mod = async (c: PoolClient, id: number) => { const u = await live(c, id); return u && u.is_moderator && !u.banned_at && !u.deleted_at ? u : null; };

/** Delete or undelete any story. Any change to someone else's story marks it moderated and it stays that way (story.rb log_moderation), so its author can't edit or undelete it. Acting on your own story is the ordinary author path and is not logged. */
export const modSetStoryDeleted = (moderator: { id: number }, shortId: string, deleted: boolean, reason = ""): Promise<ModResult> => tx(async (c) => {
  if (!(await mod(c, moderator.id))) return { ok: false, error: "not permitted" };
  const s = (await c.query("SELECT id, user_id, is_deleted FROM feed.stories WHERE short_id = $1 FOR UPDATE", [shortId])).rows[0];
  if (!s) return { ok: false, error: "Can't find story" };
  if (s.is_deleted === deleted) return { ok: true };
  await c.query("UPDATE feed.stories SET is_deleted = $2, is_moderated = is_moderated OR $3, updated_at = now() WHERE id = $1", [s.id, deleted, s.user_id !== moderator.id]);
  await c.query("INSERT INTO feed.keystores (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = COALESCE(feed.keystores.value, 0) + $2", [`user:${s.user_id}:stories_deleted`, deleted ? 1 : -1]);
  if (s.user_id !== moderator.id) await log(c, moderator.id, { story_id: s.id }, deleted ? "deleted story" : "undeleted story", reason.slice(0, REASON_MAX));
  await updateCachedColumns(c, s.id);
  return { ok: true };
});

/** Delete or undelete any comment. Deleting costs its author 2 karma per vote it got (each upvote earned 1), as delete_by_moderator does, and undeleting does not give it back (as in Lobsters). */
export const modSetCommentDeleted = (moderator: { id: number }, shortId: string, deleted: boolean, reason = ""): Promise<ModResult> => tx(async (c) => {
  if (!(await mod(c, moderator.id))) return { ok: false, error: "not permitted" };
  await lockCommentStory(c, shortId);
  const m = (await c.query("SELECT id, user_id, is_deleted, is_moderated FROM feed.comments WHERE short_id = $1 FOR UPDATE", [shortId])).rows[0];
  if (!m) return { ok: false, error: "Can't find comment" };
  if (deleted) {
    if (m.is_moderated) return { ok: true };
    await c.query("UPDATE feed.comments SET is_deleted = true, is_moderated = true, updated_at = now() WHERE id = $1", [m.id]);
    await log(c, moderator.id, { comment_id: m.id }, "deleted comment", reason.slice(0, REASON_MAX));
    const votes = (await c.query("SELECT count(*)::int n FROM feed.votes WHERE comment_id = $1", [m.id])).rows[0].n;
    await c.query("UPDATE feed.users SET karma = karma - $2 WHERE id = $1", [m.user_id, votes * 2]);
  } else {
    if (!m.is_deleted && !m.is_moderated) return { ok: true };
    await c.query("UPDATE feed.comments SET is_deleted = false, is_moderated = false, updated_at = now() WHERE id = $1", [m.id]);
    if (m.user_id !== moderator.id) await log(c, moderator.id, { comment_id: m.id }, "undeleted comment", "");
  }
  await recalcComment(c, m.id);
  return { ok: true };
});

/** Merge a story into another (target short id), or unmerge it (empty target). Mirrors the merged_story_id change in story.rb: validated, logged, and the story is marked moderated. Comment counts and hotness are refreshed on both stories. */
export const modMergeStory = (moderator: { id: number }, shortId: string, targetShortId: string, reason = ""): Promise<ModResult> => tx(async (c) => {
  if (!(await mod(c, moderator.id))) return { ok: false, error: "not permitted" };
  const s = (await c.query("SELECT id, user_id, merged_story_id FROM feed.stories WHERE short_id = $1 FOR UPDATE", [shortId])).rows[0];
  if (!s) return { ok: false, error: "Can't find story" };
  let target: { id: number; short_id: string; title: string; merged_story_id: number | null } | undefined;
  if (targetShortId) {
    target = (await c.query("SELECT id, short_id, title, merged_story_id FROM feed.stories WHERE short_id = $1", [targetShortId])).rows[0];
    if (!target) return { ok: false, error: "Can't find the story to merge into" };
    if (target.id === s.id) return { ok: false, error: "A story can't be merged into itself" };
    if (target.merged_story_id) return { ok: false, error: "That story is itself merged into another" }; // no chains, so comment lists and counts stay one level deep
    if ((await c.query("SELECT 1 FROM feed.stories WHERE merged_story_id = $1 LIMIT 1", [s.id])).rowCount) return { ok: false, error: "Other stories are merged into this one" };
  }
  const was: number | null = s.merged_story_id, now = target?.id ?? null;
  if (was === now) return { ok: true };
  await c.query("UPDATE feed.stories SET merged_story_id = $2, is_moderated = is_moderated OR $3, updated_at = now() WHERE id = $1", [s.id, now, s.user_id !== moderator.id]);
  if (was) await c.query("UPDATE feed.stories SET stories_count = stories_count - 1 WHERE id = $1", [was]);
  if (now) await c.query("UPDATE feed.stories SET stories_count = stories_count + 1 WHERE id = $1", [now]);
  if (s.user_id !== moderator.id) await log(c, moderator.id, { story_id: s.id }, target ? `merged into ${target.short_id} (${target.title})` : "unmerged from another story", reason.slice(0, REASON_MAX));
  await updateCachedColumns(c, s.id);
  if (was) await updateCachedColumns(c, was);
  return { ok: true };
});

const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
/** Ban or unban a domain or an origin (domains_ban_controller, origins_ban_controller): a reason is required and goes to the mod log. A name no story has used yet is created and banned in one step. */
export const modToggleBan = (moderator: { id: number }, kind: "domain" | "origin", name: string, reason: string): Promise<ModResult> => tx(async (c) => {
  if (!(await mod(c, moderator.id))) return { ok: false, error: "not permitted" };
  reason = reason.trim();
  if (!reason) return { ok: false, error: "Reason required for the modlog" };
  if (reason.length > 200) return { ok: false, error: "Reason is too long (200 characters at most)" };
  name = name.trim().toLowerCase();
  const host = name.split("/")[0];
  if (name.length > 255 || !HOST.test(host) || (kind === "domain" && name !== host)) return { ok: false, error: kind === "domain" ? "Not a valid domain" : "Not a valid origin" };
  const tok = (k: string) => `${k}_${randomBytes(16).toString("hex")}`;
  let row: { id: number; banned_at: Date | null };
  if (kind === "domain") {
    row = (await c.query("INSERT INTO feed.domains (domain, token) VALUES ($1, $2) ON CONFLICT (lower(domain)) DO UPDATE SET updated_at = now() RETURNING id, banned_at", [name, tok("domain")])).rows[0];
  } else {
    const d = (await c.query("INSERT INTO feed.domains (domain, token) VALUES ($1, $2) ON CONFLICT (lower(domain)) DO UPDATE SET updated_at = now() RETURNING id", [host, tok("domain")])).rows[0];
    row = (await c.query("INSERT INTO feed.origins (domain_id, identifier, token) VALUES ($1, $2, $3) ON CONFLICT (lower(identifier)) DO UPDATE SET updated_at = now() RETURNING id, banned_at", [d.id, name, tok("origin")])).rows[0];
  }
  const ban = !row.banned_at, t = `${kind}s`;
  await c.query(`UPDATE feed.${t} SET banned_at = ${ban ? "now()" : "NULL"}, banned_by_user_id = ${ban ? "$2" : "NULL"}, banned_reason = ${ban ? "$3" : "NULL"}, updated_at = now() WHERE id = $1`, ban ? [row.id, moderator.id, reason] : [row.id]);
  await c.query(`INSERT INTO feed.moderations (moderator_user_id, ${kind}_id, action, reason, token) VALUES ($1, $2, $3, $4, $5)`, [moderator.id, row.id, ban ? "Banned" : "Unbanned", reason, tok("moderation")]);
  return { ok: true };
});

const quote = (v: unknown) => JSON.stringify(v ?? "");
/** A moderator edits any story (stories#update with is_editable_by_user? true for moderators, and story.rb log_moderation). Each changed field goes to the mod log in one entry with the reason; the story is marked moderated; its deleted state is left alone. */
export const modUpdateStory = (moderator: { id: number }, shortId: string, input: Submission, reason = ""): Promise<SubmitResult> => tx(async (c) => {
  const m = await mod(c, moderator.id);
  if (!m) return { ok: false, errors: ["You cannot edit that story."] };
  const s = (await c.query("SELECT * FROM feed.stories WHERE short_id = $1 FOR UPDATE", [shortId])).rows[0];
  if (!s) return { ok: false, errors: ["You cannot edit that story."] };
  const p = await prepare(c, { is_moderator: true, created_at: new Date(0) }, input, s.id); // judged as an established user: the new-user limits are for submitters
  if (isFail(p)) return p;
  const oldTags: string[] = (await c.query("SELECT t.tag FROM feed.taggings tg JOIN feed.tags t ON t.id = tg.tag_id WHERE tg.story_id = $1 ORDER BY t.tag", [s.id])).rows.map((r) => r.tag);
  const newTags = p.tags.map((t) => t.tag).sort();
  const diffs: [string, string, string][] = [["title", s.title ?? "", p.title], ["url", s.url ?? "", p.cu.url], ["description", s.description ?? "", p.description], ["tags", oldTags.join(", "), newTags.join(", ")]];
  const changes = diffs.filter(([, a, b]) => a !== b).map(([k, a, b]) => (a && !b ? `blanked ${k} from ${quote(a)}` : `changed ${k} from ${quote(a)} to ${quote(b)}`));
  if (!!s.user_is_author !== p.isAuthor) changes.push(`changed user_is_author from ${s.user_is_author} to ${p.isAuthor}`);
  await writeStory(c, s, p, false);
  if (changes.length && s.user_id !== moderator.id) {
    await c.query("UPDATE feed.stories SET is_moderated = true WHERE id = $1", [s.id]);
    await log(c, moderator.id, { story_id: s.id }, changes.join(", "), reason.slice(0, REASON_MAX));
  }
  await updateCachedColumns(c, s.id);
  return { ok: true, shortId } as SubmitResult;
});
