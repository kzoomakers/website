import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { conn } from "@/lib/db";
import { cleanUrl, hotness } from "../logic";
import { DELETE_DAYS, MAX_EDIT_MINS, RECENT_DAYS, cleanTitle, isNewUser, storyProblems } from "../story-rules";
import { updateCachedColumns } from "./cached";
import { tattle } from "./mod-notes";
import { renderPost } from "./render";
import { findTags } from "./stories";

// Submitting a story (stories_controller#create + story.rb callbacks). Everything runs in one transaction so a failure leaves nothing half-made.
// Tested against a scratch Postgres in tests/feed-submit-db.test.mjs (run with TEST_DATABASE_URL).

export type Submission = { title: string; url: string; description: string; tags: string[]; userIsAuthor: boolean; image?: string };
export type SubmitResult = { ok: true; shortId: string } | { ok: false; errors: string[]; similar?: { short_id: string; title: string }[] };

const token = (kind: string) => `${kind}_${randomBytes(16).toString("hex")}`;
const SHORT = "abcdefghijklmnopqrstuvwxyz0123456789";
const shortId = () => Array.from(randomBytes(6), (b) => SHORT[b % 36]).join("");
const bump = (c: PoolClient, key: string) => c.query("INSERT INTO feed.keystores (key, value) VALUES ($1, 1) ON CONFLICT (key) DO UPDATE SET value = feed.keystores.value + 1", [key]);

/** Domain.find_or_create_origin: the identifier is the URL rewritten by the domain's selector/replacement (github.com/user/repo becomes github.com/user), else null. */
function originIdentifier(d: { selector: string | null; replacement: string | null; domain: string }, url: string) {
  if (!d.selector || !d.replacement) return null;
  try {
    // shortcut: Lobsters stopped a slow selector after 0.1 s; JS can't interrupt a regex. Selectors are set by admins and the URL is at most 250 characters, so this stays; add a worker timeout if non-admins ever edit selectors.
    const re = new RegExp(d.selector, "i");
    return (re.test(url) ? url.replace(re, d.replacement.replace(/\\(\d)/g, "$$$1")) : d.domain).toLowerCase();
  } catch { return d.domain.toLowerCase(); } // a bad selector in the database must not stop submissions
}

export type Prep = { title: string; description: string; html: string; cu: ReturnType<typeof cleanUrl> | { url: ""; normalized: ""; domain: null }; tags: Awaited<ReturnType<typeof findTags>> & {}; domainId: number | null; originId: number | null; isAuthor: boolean };
const fail = (errors: string[], similar?: { short_id: string; title: string }[]): SubmitResult => ({ ok: false, errors, similar });

/** mod_note.rb tattle_on_story_domain!/_origin!: what a refused story looked like, so moderators can spot someone testing a banned site. */
const bannedNote = (what: string, u: { created_at: Date | null }, url: string, title: string, description: string, tags: { tag: string }[], isAuthor: boolean) =>
  `Attempted to post a story from a banned ${what}:\n- user joined: ${u.created_at ? new Date(u.created_at).toISOString().slice(0, 10) : "unknown"}\n- url: ${url}\n- title: ${title}\n- user_is_author: ${isAuthor}\n- tags: ${tags.map((t) => t.tag).join(" ")}\n- description: ${description}\n`;

/** Validates a submission and resolves its domain, origin and markdown. `storyId` is set when editing: the "already posted", banned and new-user checks only apply to new stories (as in story.rb). */
export async function prepare(c: PoolClient, u: { id?: number; is_moderator: boolean; created_at: Date | null }, input: Submission, storyId?: number): Promise<Prep | SubmitResult> {
  const isNew = isNewUser(u.created_at), title = cleanTitle(input.title.trim()), description = input.description.replace(/\s+$/, "");
  const tags = await findTags(input.tags);
  if (!tags || tags.some((t) => !t.active)) return fail(["Unknown tag."]); // inactive tags are retired: the form doesn't list them, and a hand-made POST can't use them either
  const cu = input.url.trim() ? cleanUrl(input.url) : { url: "" as const, normalized: "" as const, domain: null };
  const errors = storyProblems({ title, url: cu.url, description, tags, isNew, isModerator: u.is_moderator, image: !!input.image });
  if (errors.length) return fail(errors);

  let domainId: number | null = null, originId: number | null = null;
  if (cu.url) {
    if (!storyId) {
      // most recent similar story that is live or was moderated (find_similar_by_url)
      const sim = (await c.query("SELECT short_id, title, created_at FROM feed.stories WHERE normalized_url = $1 AND (NOT is_deleted OR is_moderated) AND merged_story_id IS NULL ORDER BY id DESC LIMIT 5", [cu.normalized])).rows;
      if (sim[0] && new Date(sim[0].created_at) >= new Date(Date.now() - RECENT_DAYS * 864e5)) return fail([`Url has already been submitted within the past ${RECENT_DAYS} days`], sim);
      if (sim[0] && isNew) return fail(["Url cannot be resubmitted by new users"], sim);
    }
    const name = cu.domain!.replace(/^www\d*\.(.+?\..+)/, "$1");
    let d = (await c.query("SELECT * FROM feed.domains WHERE lower(domain) = lower($1)", [name])).rows[0];
    if (!d) d = (await c.query("INSERT INTO feed.domains (domain, token) VALUES ($1, $2) ON CONFLICT (lower(domain)) DO UPDATE SET updated_at = now() RETURNING *", [name, token("domain")])).rows[0];
    if (!storyId) {
      if (d.banned_at) { if (u.id) void tattle(u.id, bannedNote("domain", u, cu.url, title, description, tags, input.userIsAuthor)); return fail([`Url is from banned domain ${d.domain}: ${d.banned_reason}`]); }
      if (isNew && !(await c.query("SELECT 1 FROM feed.stories WHERE domain_id = $1 AND NOT is_deleted LIMIT 1", [d.id])).rowCount) return fail(["Url is an unseen domain from a new user."]);
    }
    domainId = d.id;
    const ident = originIdentifier(d, cu.url);
    if (ident) {
      let o = (await c.query("SELECT * FROM feed.origins WHERE lower(identifier) = $1", [ident])).rows[0];
      if (!o) o = (await c.query("INSERT INTO feed.origins (domain_id, identifier, token) VALUES ($1, $2, $3) ON CONFLICT (lower(identifier)) DO UPDATE SET updated_at = now() RETURNING *", [d.id, ident, token("origin")])).rows[0];
      if (!storyId && o.banned_at) { if (u.id) void tattle(u.id, bannedNote("origin", u, cu.url, title, description, tags, input.userIsAuthor)); return fail([`Url is from banned origin ${o.identifier}: ${o.banned_reason}`]); }
      originId = o.id;
    }
  }
  return { title, description, html: await renderPost(c, description), cu, tags, domainId, originId, isAuthor: !cu.url || input.userIsAuthor }; // a text post is always by its submitter
}

export const isFail = (p: Prep | SubmitResult): p is SubmitResult => "ok" in p;
export async function tx<T>(f: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await (await conn()).connect();
  try { await c.query("BEGIN"); const r = await f(c); await c.query(r && typeof r === "object" && "ok" in r && !(r as { ok: boolean }).ok ? "ROLLBACK" : "COMMIT"); return r; }
  catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { c.release(); }
}
/** The acting user. Their requests are serialized by an advisory lock (so a resubmit can't race its twin), not a row lock: a row lock would block other people's karma updates on this user while we wait for the story lock, and the two can deadlock. Lock order everywhere: user (advisory), story, comment, other users' rows. */
export const live = async (c: PoolClient, id: number) => {
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended('feed:user:' || $1::text, 0))", [id]);
  return (await c.query("SELECT id, created_at, is_moderator, banned_at, deleted_at FROM feed.users WHERE id = $1", [id])).rows[0];
};

export const createStory = (user: { id: number }, input: Submission): Promise<SubmitResult> => tx(async (c) => {
  const u = await live(c, user.id);
  if (!u || u.banned_at || u.deleted_at) return fail(["You can't submit stories."]);
  const p = await prepare(c, u, input);
  if (isFail(p)) return p;
  if (input.image && !p.tags.some((t) => t.tag.toLowerCase() === "images")) return fail(["Add the images tag to post a picture."]);
  const now = new Date();
  // The unique index on short_id settles races: a taken id inserts nothing and we draw another.
  let sid = "", s: { id: number } | undefined;
  for (let i = 0; !s; i++) {
    if (i === 10) throw new Error("too many short id collisions");
    sid = shortId();
    s = (await c.query(
      `INSERT INTO feed.stories (user_id, url, normalized_url, title, description, markeddown_description, short_id, user_is_author, domain_id, origin_id, created_at, last_edited_at, token, image)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,$12,$13) ON CONFLICT (short_id) DO NOTHING RETURNING id`,
      [user.id, p.cu.url, p.cu.normalized || null, p.title, p.description, p.html, sid, p.isAuthor, p.domainId, p.originId, now, token("story"), input.image || null])).rows[0];
  }
  for (const t of p.tags) await c.query("INSERT INTO feed.taggings (story_id, tag_id) VALUES ($1, $2)", [s.id, t.id]);
  await c.query("INSERT INTO feed.votes (user_id, story_id, vote) VALUES ($1, $2, 1)", [user.id, s.id]); // the submitter's own upvote: score already starts at 1 and own votes earn no karma
  if (p.domainId) await c.query("UPDATE feed.domains SET stories_count = stories_count + 1 WHERE id = $1", [p.domainId]);
  if (p.originId) await c.query("UPDATE feed.origins SET stories_count = stories_count + 1 WHERE id = $1", [p.originId]);
  await bump(c, `user:${user.id}:stories_submitted`);
  await updateCachedColumns(c, s.id);
  return { ok: true, shortId: sid } as SubmitResult;
});

/** story.rb is_editable_by_user?: the submitter, until a moderator touches it or 6 hours pass. (Moderator edits arrive with the mod tools.) */
export const editable = (s: { user_id: number; is_moderated: boolean; created_at: Date }, userId: number, now = Date.now()) =>
  s.user_id === userId && !s.is_moderated && new Date(s.created_at).getTime() > now - MAX_EDIT_MINS * 60_000;

/** Delete/undelete window: the submitter, until a moderator touches it or 28 days pass. */
export const deletable = (s: { user_id: number; is_moderated: boolean; created_at: Date }, userId: number, now = Date.now()) =>
  s.user_id === userId && !s.is_moderated && new Date(s.created_at).getTime() > now - DELETE_DAYS * 864e5;

const owned = async (c: PoolClient, shortId: string, userId: number, ok = editable) => {
  const s = (await c.query("SELECT * FROM feed.stories WHERE short_id = $1 FOR UPDATE", [shortId])).rows[0];
  return s && ok(s, userId) ? s : null;
};

/** Writes an edited story: fields, tags and the domain/origin counter caches. `undelete` is true for the submitter (editing undeletes, as in Lobsters); a moderator's edit leaves the deleted state alone. */
export async function writeStory(c: PoolClient, s: { id: number; domain_id: number | null; origin_id: number | null }, p: Prep, undelete: boolean) {
  await c.query(
    `UPDATE feed.stories SET url = $2, normalized_url = $3, title = $4, description = $5, markeddown_description = $6, user_is_author = $7, domain_id = $8, origin_id = $9, is_deleted = ${undelete ? "false" : "is_deleted"}, last_edited_at = now(), updated_at = now() WHERE id = $1`,
    [s.id, p.cu.url, p.cu.normalized || null, p.title, p.description, p.html, p.isAuthor, p.domainId, p.originId]);
  await c.query("DELETE FROM feed.taggings WHERE story_id = $1", [s.id]);
  for (const t of p.tags) await c.query("INSERT INTO feed.taggings (story_id, tag_id) VALUES ($1, $2)", [s.id, t.id]);
  if (s.domain_id !== p.domainId) { // Rails counter caches
    if (s.domain_id) await c.query("UPDATE feed.domains SET stories_count = stories_count - 1 WHERE id = $1", [s.domain_id]);
    if (p.domainId) await c.query("UPDATE feed.domains SET stories_count = stories_count + 1 WHERE id = $1", [p.domainId]);
  }
  if (s.origin_id !== p.originId) {
    if (s.origin_id) await c.query("UPDATE feed.origins SET stories_count = stories_count - 1 WHERE id = $1", [s.origin_id]);
    if (p.originId) await c.query("UPDATE feed.origins SET stories_count = stories_count + 1 WHERE id = $1", [p.originId]);
  }
}

/** stories#update: edit your own story inside the edit window. Editing also undeletes it, as Lobsters does. */
export const updateStory = (user: { id: number }, shortId: string, input: Submission): Promise<SubmitResult> => tx(async (c) => {
  const u = await live(c, user.id), s = u && !u.banned_at && !u.deleted_at && await owned(c, shortId, user.id);
  if (!s) return fail(["You cannot edit that story."]);
  const p = await prepare(c, u, input, s.id);
  if (isFail(p)) return p;
  await writeStory(c, s, p, true);
  await updateCachedColumns(c, s.id);
  return { ok: true, shortId } as SubmitResult;
});

/** stories#destroy (delete = true) and #undelete. 28-day window (editing is 6 hours). */
export const setStoryDeleted = (user: { id: number }, shortId: string, deleted: boolean): Promise<SubmitResult> => tx(async (c) => {
  const u = await live(c, user.id), s = u && !u.banned_at && !u.deleted_at && await owned(c, shortId, user.id, deletable);
  if (!s) return fail(["You cannot delete that story."]);
  if (s.is_deleted !== deleted) {
    await c.query("UPDATE feed.stories SET is_deleted = $2, updated_at = now() WHERE id = $1", [s.id, deleted]);
    await c.query("INSERT INTO feed.keystores (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = COALESCE(feed.keystores.value, 0) + $2", [`user:${user.id}:stories_deleted`, deleted ? 1 : -1]);
  }
  return { ok: true, shortId } as SubmitResult;
});

/** The most recent live story with this normalized URL inside the "recently posted" window, for sending a submitter to the existing discussion. */
export async function recentSimilar(normalized: string): Promise<{ short_id: string; title: string } | null> {
  if (!normalized) return null;
  return (await (await conn()).query("SELECT short_id, title FROM feed.stories WHERE normalized_url = $1 AND (NOT is_deleted OR is_moderated) AND merged_story_id IS NULL AND created_at >= now() - ($2::int * interval '1 day') ORDER BY id DESC LIMIT 1", [normalized, RECENT_DAYS])).rows[0] ?? null;
}
