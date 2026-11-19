// Story validation ported from story.rb (validations, check_tags, fix_bogus_chars). Pure, so tests load it directly. The forge, bug-tracker and "push.cx stream" checks are
// Lobsters community policy and are not ported (shortcut: add them here if this community wants them).
import { URL_RE } from "./logic";

export const TITLE_MIN = 3, TITLE_MAX = 150, URL_MAX = 250, DESCRIPTION_MAX = 65_535, RECENT_DAYS = 30, NEW_USER_DAYS = 70, MAX_EDIT_MINS = 360;
const GRAPHICS_RE = /[\u0000-\u001F←→-➿]|[\u{1F000}-\u{1F9FF}]/u;

/** story.rb fix_bogus_chars: non-breaking spaces become spaces. */
export const cleanTitle = (t: string) => t.replaceAll(" ", " ");

export type Tag = { tag: string; permit_by_new_users: boolean; privileged: boolean; is_media: boolean };

/** user.rb is_new?: under 70 days old. */
export const isNewUser = (createdAt: Date | null, now = new Date()) => !createdAt || createdAt.getTime() > now.getTime() - NEW_USER_DAYS * 864e5;

export function storyProblems(s: { title: string; url: string; description: string; tags: Tag[]; isNew: boolean; isModerator: boolean }): string[] {
  const out: string[] = [];
  const t = s.title;
  if (t.length < TITLE_MIN || t.length > TITLE_MAX) out.push(`Title is too short or too long (${TITLE_MIN} to ${TITLE_MAX} characters)`);
  if (s.url.length > URL_MAX) out.push(`Url is too long (at most ${URL_MAX} characters)`);
  if (s.description.length > DESCRIPTION_MAX) out.push("Description is too long");
  if (s.url) { if (!URL_RE.test(s.url)) out.push("Url is not valid"); }
  else if (!s.description.trim()) out.push("Description must contain text if no URL posted");
  if (t.startsWith("Ask") && s.tags.some((x) => x.tag === "ask")) out.push("Title starting 'Ask' or similar is redundant with the ask tag.");
  if (GRAPHICS_RE.test(t)) out.push("Title may not contain emoji, dingbats, or other graphics");
  // eslint-disable-next-line no-control-regex
  if (t && /^[\x00-\x7f]*$/.test(t) && t === t.toUpperCase() && t !== t.toLowerCase()) out.push("Title doesn't need to scream, ASCII has supported lowercase since June 17, 1963.");
  const bad = s.tags.filter((x) => !x.permit_by_new_users);
  if (s.isNew && bad.length) out.push(`New users can't submit stories with the tag(s) ${bad.map((x) => x.tag).join(", ")}`);
  const priv = s.tags.filter((x) => x.privileged);
  if (!s.isModerator && priv.length) out.push(`You don't have permission to use the tag(s) ${priv.map((x) => x.tag).join(", ")}`);
  if (!s.tags.some((x) => !x.is_media)) out.push("Must have at least one non-media (PDF, video) tag. If no tags apply to your content, it probably doesn't belong here.");
  return out;
}
