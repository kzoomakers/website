import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { conn } from "@/lib/db";
import { cleanUrl, hotness } from "../logic";
import { mentionedUsers, renderMarkdown } from "../markdown";
import { RECENT_DAYS, cleanTitle, isNewUser, storyProblems } from "../story-rules";
import { findTags } from "./stories";

// Submitting a story (stories_controller#create + story.rb callbacks). Everything runs in one transaction so a failure leaves nothing half-made.
// Tested against a scratch Postgres in tests/feed-submit-db.test.mjs (run with TEST_DATABASE_URL).

export type Submission = { title: string; url: string; description: string; tags: string[]; userIsAuthor: boolean };
export type SubmitResult = { ok: true; shortId: string } | { ok: false; errors: string[]; similar?: { short_id: string; title: string }[] };

const token = (kind: string) => `${kind}_${randomBytes(16).toString("hex")}`;
const SHORT = "abcdefghijklmnopqrstuvwxyz0123456789";
const shortId = () => Array.from(randomBytes(6), (b) => SHORT[b % 36]).join("");
const bump = (c: PoolClient, key: string) => c.query("INSERT INTO feed.keystores (key, value) VALUES ($1, 1) ON CONFLICT (key) DO UPDATE SET value = feed.keystores.value + 1", [key]);

/** Domain.find_or_create_origin: the identifier is the URL rewritten by the domain's selector/replacement (github.com/user/repo becomes github.com/user), else null. */
function originIdentifier(d: { selector: string | null; replacement: string | null; domain: string }, url: string) {
  if (!d.selector || !d.replacement) return null;
  try {
    const re = new RegExp(d.selector, "i");
    return (re.test(url) ? url.replace(re, d.replacement.replace(/\\(\d)/g, "$$$1")) : d.domain).toLowerCase();
  } catch { return d.domain.toLowerCase(); } // a bad selector in the database must not stop submissions
}

export async function createStory(user: { id: number }, input: Submission): Promise<SubmitResult> {
  const c = await (await conn()).connect();
  try {
    await c.query("BEGIN");
    const u = (await c.query("SELECT id, created_at, is_moderator, banned_at, deleted_at FROM feed.users WHERE id = $1 FOR UPDATE", [user.id])).rows[0];
    if (!u || u.banned_at || u.deleted_at) { await c.query("ROLLBACK"); return { ok: false, errors: ["You can't submit stories."] }; }
    const isNew = isNewUser(u.created_at), title = cleanTitle(input.title.trim()), description = input.description.replace(/\s+$/, "");
    const tags = await findTags(input.tags);
    if (!tags) { await c.query("ROLLBACK"); return { ok: false, errors: ["Unknown tag."] }; }
    const cu = input.url.trim() ? cleanUrl(input.url) : { url: "", normalized: "", domain: null as string | null };
    const errors = storyProblems({ title, url: cu.url, description, tags, isNew, isModerator: u.is_moderator });
    if (errors.length) { await c.query("ROLLBACK"); return { ok: false, errors }; }

    let domainId: number | null = null, originId: number | null = null;
    if (cu.url) {
      // already posted recently / by a new user: most recent similar story that is live or was moderated (find_similar_by_url)
      const sim = (await c.query("SELECT short_id, title, created_at FROM feed.stories WHERE normalized_url = $1 AND (NOT is_deleted OR is_moderated) AND merged_story_id IS NULL ORDER BY id DESC LIMIT 5", [cu.normalized])).rows;
      if (sim[0] && new Date(sim[0].created_at) >= new Date(Date.now() - RECENT_DAYS * 864e5)) { await c.query("ROLLBACK"); return { ok: false, errors: [`Url has already been submitted within the past ${RECENT_DAYS} days`], similar: sim }; }
      if (sim[0] && isNew) { await c.query("ROLLBACK"); return { ok: false, errors: ["Url cannot be resubmitted by new users"], similar: sim }; }

      const name = cu.domain!.replace(/^www\d*\.(.+?\..+)/, "$1");
      let d = (await c.query("SELECT * FROM feed.domains WHERE lower(domain) = lower($1)", [name])).rows[0];
      if (!d) d = (await c.query("INSERT INTO feed.domains (domain, token) VALUES ($1, $2) ON CONFLICT (lower(domain)) DO UPDATE SET updated_at = now() RETURNING *", [name, token("domain")])).rows[0];
      if (d.banned_at) { await c.query("ROLLBACK"); return { ok: false, errors: [`Url is from banned domain ${d.domain}: ${d.banned_reason}`] }; }
      if (isNew && !(await c.query("SELECT 1 FROM feed.stories WHERE domain_id = $1 AND NOT is_deleted LIMIT 1", [d.id])).rowCount) { await c.query("ROLLBACK"); return { ok: false, errors: ["Url is an unseen domain from a new user."] }; }
      domainId = d.id;
      const ident = originIdentifier(d, cu.url);
      if (ident) {
        let o = (await c.query("SELECT * FROM feed.origins WHERE lower(identifier) = $1", [ident])).rows[0];
        if (!o) o = (await c.query("INSERT INTO feed.origins (domain_id, identifier, token) VALUES ($1, $2, $3) ON CONFLICT (lower(identifier)) DO UPDATE SET updated_at = now() RETURNING *", [d.id, ident, token("origin")])).rows[0];
        if (o.banned_at) { await c.query("ROLLBACK"); return { ok: false, errors: [`Url is from banned origin ${o.identifier}: ${o.banned_reason}`] }; }
        originId = o.id;
      }
    }

    const isAuthor = !cu.url || input.userIsAuthor; // a text post is always by its submitter
    const mods = new Set<string>(); const names = mentionedUsers(description);
    if (names.length) for (const r of (await c.query("SELECT lower(username) n FROM feed.usernames WHERE lower(username) = ANY($1::text[]) AND (renamed_away_at IS NULL)", [names])).rows) mods.add(r.n);
    const html = renderMarkdown(description, { users: mods }); // images only for users with a hat in use (can_have_images?), which isn't wired yet
    const now = new Date(), base = tags.reduce((n, t) => n + (t.hotness_mod ?? 0), 0) + (isAuthor && cu.url ? 0.25 : 0);
    let sid = "";
    for (let i = 0; i < 10; i++) { sid = shortId(); if (!(await c.query("SELECT 1 FROM feed.stories WHERE short_id = $1", [sid])).rowCount) break; if (i === 9) throw new Error("too many short id collisions"); }
    const s = (await c.query(
      `INSERT INTO feed.stories (user_id, url, normalized_url, title, description, markeddown_description, short_id, hotness, user_is_author, domain_id, origin_id, created_at, last_edited_at, token)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,$13) RETURNING id`,
      [user.id, cu.url, cu.normalized || null, title, description, html, sid, hotness({ score: 1, base, createdAt: now }), isAuthor, domainId, originId, now, token("story")])).rows[0];
    for (const t of tags) await c.query("INSERT INTO feed.taggings (story_id, tag_id) VALUES ($1, $2)", [s.id, t.id]);
    await c.query("INSERT INTO feed.votes (user_id, story_id, vote) VALUES ($1, $2, 1)", [user.id, s.id]); // the submitter's own upvote: score already starts at 1 and own votes earn no karma
    if (domainId) await c.query("UPDATE feed.domains SET stories_count = stories_count + 1 WHERE id = $1", [domainId]);
    if (originId) await c.query("UPDATE feed.origins SET stories_count = stories_count + 1 WHERE id = $1", [originId]);
    await bump(c, `user:${user.id}:stories_submitted`);
    await c.query("COMMIT");
    return { ok: true, shortId: sid };
  } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { c.release(); }
}
