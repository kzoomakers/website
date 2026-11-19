import { redirect } from "next/navigation";
import { conn } from "@/lib/db";
import { currentFeedUser } from "../identity";
import { takeFlash } from "../flash";
import { TITLE_MAX, URL_MAX } from "../story-rules";
import Shell from "./shell";

/** stories/new.html.erb + _form.html.erb, trimmed to the fields the port supports. */
export async function NewStoryPage() {
  const v = await currentFeedUser().catch(() => null);
  if (!v) redirect("/login?return=/stories/new");
  if (!v.username) redirect("/login/username?return=/stories/new");
  const flash = takeFlash(v.id), f = flash?.input;
  const tags: { tag: string; description: string | null; privileged: boolean; is_media: boolean }[] = (await (await conn()).query(
    "SELECT t.tag, t.description, t.privileged, t.is_media FROM feed.tags t JOIN feed.categories c ON c.id = t.category_id WHERE t.active ORDER BY lower(c.category), lower(t.tag)")).rows.filter((t) => !t.privileged || v.isModerator);
  return (
    <Shell title="Submit Story" path="/stories/new">
      <div className="box wide">
        {flash?.errors.length ? <div className="flash-error" role="alert"><ul>{flash.errors.map((e) => <li key={e}>{e}</li>)}</ul></div> : null}
        {flash?.similar?.length ? <div className="flash-notice"><p>Similar stories:</p><ul>{flash.similar.map((s) => <li key={s.short_id}><a href={`/s/${s.short_id}`}>{s.title}</a></li>)}</ul></div> : null}
        <form method="post" action="/stories">
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
          <input type="submit" value="Submit" />
        </form>
      </div>
    </Shell>
  );
}
