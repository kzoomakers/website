import { notFound, redirect } from "next/navigation";
import { conn } from "@/lib/db";
import { currentFeedUser } from "../identity";
import { takeFlash } from "../flash";
import { TITLE_MAX, URL_MAX } from "../story-rules";
import { hit } from "@/lib/limit";
import { fetchUrlAttributes } from "../fetch-url";
import { URL_RE, cleanUrl } from "../logic";
import { editable, recentSimilar, type Submission } from "../models/submit";
import Shell from "./shell";

/** stories/new.html.erb + edit.html.erb + _form.html.erb, trimmed to the fields the port supports. `edit` carries the story being edited. */
async function StoryFormPage({ path, edit, start, notice }: { path: string; edit?: { shortId: string; input: Submission }; start?: Partial<Submission>; notice?: string }) {
  const v = await currentFeedUser().catch(() => null);
  if (!v) redirect(`/login?return=${path}`);
  if (!v.username) redirect(`/login/username?return=${path}`);
  const flash = takeFlash(v.id), f = flash?.input ?? edit?.input ?? (start as Submission | undefined);
  const tags: { tag: string; description: string | null; privileged: boolean; is_media: boolean }[] = (await (await conn()).query(
    "SELECT t.tag, t.description, t.privileged, t.is_media FROM feed.tags t JOIN feed.categories c ON c.id = t.category_id WHERE t.active ORDER BY lower(c.category), lower(t.tag)")).rows.filter((t) => !t.privileged || v.isModerator);
  return (
    <Shell title={edit ? "Edit Story" : "Submit Story"} path={path}>
      <div className="box wide">
        {!edit && (
          <form method="get" action="/stories/new">
            <label htmlFor="start_url">Start from a link: </label><input id="start_url" name="url" type="url" maxLength={URL_MAX} defaultValue={start?.url} />{" "}
            <input type="submit" value="Fetch title" />
          </form>
        )}
        {notice && <div className="flash-notice" role="status">{notice}</div>}
        {flash?.errors.length ? <div className="flash-error" role="alert"><ul>{flash.errors.map((e) => <li key={e}>{e}</li>)}</ul></div> : null}
        {flash?.similar?.length ? <div className="flash-notice"><p>Similar stories:</p><ul>{flash.similar.map((s) => <li key={s.short_id}><a href={`/s/${s.short_id}`}>{s.title}</a></li>)}</ul></div> : null}
        <form method="post" action={edit ? `/stories/${edit.shortId}/update` : "/stories"}>
          <input type="hidden" name="csrf" value={v.csrf} />
          <div className="labelled_grid">
            <label htmlFor="url">URL</label>
            <input id="url" name="url" type="url" maxLength={URL_MAX} defaultValue={f?.url} autoComplete="off" />
            <label htmlFor="title">Title</label>
            <input id="title" name="title" type="text" required maxLength={TITLE_MAX} defaultValue={f?.title} autoComplete="off" />
            <label htmlFor="user_is_author">Author</label>
            <span><input id="user_is_author" name="user_is_author" type="checkbox" defaultChecked={f?.userIsAuthor} /> I'm the author of the story at this URL.</span>
            <label htmlFor="description">Text</label>
            <textarea id="description" name="description" rows={8} maxLength={65535} defaultValue={f?.description} />
            <label htmlFor="tags">Tags</label>
            <select id="tags" name="tags" multiple size={10} defaultValue={f?.tags}>
              {tags.map((t) => <option key={t.tag} value={t.tag} title={t.description ?? undefined}>{t.tag}{t.description ? ` - ${t.description}` : ""}</option>)}
            </select>
          </div>
          <p>Leave the URL blank to post text only. Hold Ctrl or Cmd to choose several tags; at least one must not be a media tag.</p>
          <input type="submit" value={edit ? "Save" : "Submit"} />
        </form>
      </div>
    </Shell>
  );
}

/** stories#new: with ?url=, look the page up (title, canonical URL) and, if it was posted recently, go to that discussion instead. */
export async function NewStoryPage({ url }: { url?: string }) {
  if (!url) return <StoryFormPage path="/stories/new" />;
  const v = await currentFeedUser().catch(() => null);
  if (!v) redirect("/login?return=/stories/new");
  const cu = cleanUrl(url.slice(0, 400));
  if (!URL_RE.test(cu.url)) return <StoryFormPage path="/stories/new" start={{ url: cu.url }} notice="That doesn't look like a valid link (http or https, with a domain)." />;
  // each lookup makes this server fetch someone else's page, so it is capped per person
  if (!(await hit(`feed:fetch:${v.id}`, 20, 3_600_000, true))) return <StoryFormPage path="/stories/new" start={{ url: cu.url }} notice="Too many lookups. Please wait a bit, or fill in the title yourself." />;
  const a = await fetchUrlAttributes(cu.url), canonical = a.url !== cu.url ? cleanUrl(a.url) : cu;
  const dup = await recentSimilar(canonical.normalized);
  if (dup) redirect(`/s/${dup.short_id}`); // "This URL has already been submitted recently."
  return <StoryFormPage path="/stories/new" start={{ url: canonical.url, title: a.title }} notice={canonical.url !== cu.url ? "Note: the link was changed to the page's canonical address." : undefined} />;
}

export async function EditStoryPage({ shortId }: { shortId: string }) {
  const v = await currentFeedUser().catch(() => null);
  if (!v) redirect(`/login?return=/stories/${shortId}/edit`);
  const s = (await (await conn()).query(
    `SELECT s.user_id, s.is_moderated, s.created_at, s.title, s.url, s.description, s.user_is_author, COALESCE((SELECT array_agg(t.tag) FROM feed.taggings tg JOIN feed.tags t ON t.id = tg.tag_id WHERE tg.story_id = s.id), '{}') tags
     FROM feed.stories s WHERE s.short_id = $1`, [shortId])).rows[0];
  if (!s || !editable(s, v.id)) notFound();
  return <StoryFormPage path={`/stories/${shortId}/edit`} edit={{ shortId, input: { title: s.title, url: s.url ?? "", description: s.description ?? "", tags: s.tags, userIsAuthor: s.user_is_author } }} />;
}
