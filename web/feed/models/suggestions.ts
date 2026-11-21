import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { conn } from "@/lib/db";
import { getFeedConfig } from "../config";
import { TITLE_MAX, TITLE_MIN, cleanTitle, isNewUser, storyProblems } from "../story-rules";
import { updateCachedColumns } from "./cached";
import { findTags } from "./stories";
import { tx } from "./submit";

// Title and tag suggestions (suggestions_controller + story.rb save_suggested_*_for_user!). Users with enough karma suggest changes to someone else's story; once a quorum agrees, the change goes live and is logged as "(Users)".

export const TITLE_QUORUM = 2; // story.rb SUGGESTION_QUORUM
export type SuggestResult = { ok: true; changed: boolean; applied: boolean } | { ok: false; errors: string[] };
type Story = { id: number; user_id: number; title: string; is_moderated: boolean };

/** story.rb can_have_suggestions_from_user?: not your own story, not a moderated one, none with a privileged tag; user.rb can_offer_suggestions?: past the new-user period and enough karma. */
async function allowed(c: PoolClient | Awaited<ReturnType<typeof conn>>, userId: number, s: Story, minKarma: number): Promise<boolean> {
  if (s.user_id === userId || s.is_moderated) return false;
  const u = (await c.query("SELECT created_at, karma, banned_at, deleted_at, disabled_invite_at FROM feed.users WHERE id = $1", [userId])).rows[0];
  if (!u || u.banned_at || u.deleted_at || u.disabled_invite_at || isNewUser(u.created_at) || u.karma < minKarma) return false;
  return !(await c.query("SELECT 1 FROM feed.taggings tg JOIN feed.tags t ON t.id = tg.tag_id WHERE tg.story_id = $1 AND t.privileged LIMIT 1", [s.id])).rowCount;
}

const storyRow = async (c: PoolClient | Awaited<ReturnType<typeof conn>>, shortId: string, lock = false) =>
  (await c.query(`SELECT id, user_id, title, is_moderated FROM feed.stories WHERE short_id = $1 AND NOT is_deleted AND merged_story_id IS NULL${lock ? " FOR UPDATE" : ""}`, [shortId])).rows[0] as Story | undefined;

/** For the suggest page and link: null when this user may not suggest on the story, else the story's title and tags with the user's own earlier suggestion filled in. */
export async function suggestionForm(userId: number, shortId: string): Promise<{ title: string; tags: string[] } | null> {
  const c = await conn(), s = await storyRow(c, shortId);
  if (!s || !(await allowed(c, userId, s, (await getFeedConfig()).minKarmaToSuggest))) return null;
  const mineTitle = (await c.query("SELECT title FROM feed.suggested_titles WHERE story_id = $1 AND user_id = $2", [s.id, userId])).rows[0]?.title;
  const tagRows = (await c.query(
    `SELECT t.tag FROM feed.suggested_taggings x JOIN feed.tags t ON t.id = x.tag_id WHERE x.story_id = $1 AND x.user_id = $2
     UNION ALL SELECT t.tag FROM feed.taggings x JOIN feed.tags t ON t.id = x.tag_id WHERE x.story_id = $1 AND NOT EXISTS (SELECT 1 FROM feed.suggested_taggings WHERE story_id = $1 AND user_id = $2)`, [s.id, userId])).rows;
  return { title: mineTitle ?? s.title, tags: tagRows.map((r) => r.tag) };
}

/** suggestions#create. Records the user's suggested title and tag set (replacing their earlier ones) and applies whatever has reached quorum. */
export const suggest = (user: { id: number }, shortId: string, input: { title: string; tags: string[] }): Promise<SuggestResult> => tx(async (c) => {
  const s = await storyRow(c, shortId, true);
  if (!s || !(await allowed(c, user.id, s, (await getFeedConfig()).minKarmaToSuggest))) return { ok: false, errors: ["You are not allowed to offer suggestions on that story."] };
  const title = cleanTitle(input.title.trim()), tags = await findTags(input.tags);
  if (!tags || tags.some((t) => !t.active)) return { ok: false, errors: ["Unknown tag."] };
  const author = (await c.query("SELECT created_at FROM feed.users WHERE id = $1", [s.user_id])).rows[0]?.created_at ?? null;
  const errors = storyProblems({ title, url: "", description: "x", tags, isNew: isNewUser(author), isModerator: false }); // tags must be ones the story's author could use; the story's own url/text were checked when it was posted
  if (errors.length) return { ok: false, errors };

  const oldTags: string[] = (await c.query("SELECT t.tag FROM feed.taggings tg JOIN feed.tags t ON t.id = tg.tag_id WHERE tg.story_id = $1 ORDER BY t.tag", [s.id])).rows.map((r) => r.tag);
  const newTags = tags.map((t) => t.tag).sort();
  let changed = false;
  if (title !== s.title) {
    changed = true;
    await c.query("DELETE FROM feed.suggested_titles WHERE story_id = $1 AND user_id = $2", [s.id, user.id]);
    await c.query("INSERT INTO feed.suggested_titles (story_id, user_id, title) VALUES ($1, $2, $3)", [s.id, user.id, title]);
  }
  if (newTags.join() !== oldTags.join()) {
    changed = true;
    await c.query("DELETE FROM feed.suggested_taggings WHERE story_id = $1 AND user_id = $2", [s.id, user.id]);
    for (const t of tags) await c.query("INSERT INTO feed.suggested_taggings (story_id, tag_id, user_id, created_at, updated_at) VALUES ($1, $2, $3, now(), now())", [s.id, t.id, user.id]);
  }
  if (!changed) return { ok: true, changed, applied: false };

  // quorum: a title agreed by TITLE_QUORUM users; every tag suggested by at least its own quorum of users (story.rb promotes the tags that qualify)
  const changes: string[] = [];
  const top = (await c.query("SELECT title FROM feed.suggested_titles WHERE story_id = $1 GROUP BY title HAVING count(*) >= $2 ORDER BY count(*) DESC, max(id) DESC LIMIT 1", [s.id, TITLE_QUORUM])).rows[0]?.title as string | undefined;
  if (top && top !== s.title && top.length >= TITLE_MIN && top.length <= TITLE_MAX) {
    await c.query("UPDATE feed.stories SET title = $2, updated_at = now() WHERE id = $1", [s.id, top]);
    changes.push(`changed title from ${JSON.stringify(s.title)} to ${JSON.stringify(top)}`);
  }
  const winners: { id: number; tag: string; is_media: boolean }[] = (await c.query(
    `SELECT t.id, t.tag, t.is_media FROM feed.suggested_taggings x JOIN feed.tags t ON t.id = x.tag_id WHERE x.story_id = $1 AND t.active GROUP BY t.id HAVING count(*) >= COALESCE(t.quorum, 2)`, [s.id])).rows;
  const finalTags = winners.map((t) => t.tag).sort();
  if (finalTags.length && finalTags.join() !== oldTags.join() && winners.some((t) => !t.is_media)) {
    await c.query("DELETE FROM feed.taggings WHERE story_id = $1", [s.id]);
    for (const t of winners) await c.query("INSERT INTO feed.taggings (story_id, tag_id) VALUES ($1, $2)", [s.id, t.id]);
    changes.push(`changed tags from ${JSON.stringify(oldTags.join(", "))} to ${JSON.stringify(finalTags.join(", "))}`);
  }
  if (changes.length) {
    await c.query("UPDATE feed.stories SET is_moderated = true WHERE id = $1", [s.id]);
    await c.query("INSERT INTO feed.moderations (story_id, action, reason, is_from_suggestions, token) VALUES ($1, $2, $3, true, $4)", [s.id, changes.join(", "), "Automatically changed from user suggestions", `moderation_${randomBytes(16).toString("hex")}`]);
    await updateCachedColumns(c, s.id);
  }
  return { ok: true, changed, applied: changes.length > 0 };
});
