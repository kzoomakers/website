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
async function StoryFormPage({ path, edit, start, notice }: { path: string; edit?: { shortId: string; input: Submission; byModerator?: boolean }; start?: Partial<Submission>; notice?: string }) {
  const v = await currentFeedUser().catch(() => null);
  if (!v) redirect(`/login?return=${path}`);
  if (!v.username) redirect(`/login/username?return=${path}`);
  const flash = takeFlash(v.id), f = flash?.input ?? edit?.input ?? (start as Submission | undefined);
  const tags: { tag: string; description: string | null; privileged: boolean; is_media: boolean; category: string }[] = (await (await conn()).query(
    "SELECT c.category, t.tag, t.description, t.privileged, t.is_media FROM feed.tags t JOIN feed.categories c ON c.id = t.category_id WHERE t.active ORDER BY lower(c.category), lower(t.tag)")).rows.filter((t) => !t.privileged || v.isModerator);
  const groups = new Map<string, typeof tags>();
  for (const t of tags) groups.set(t.category, [...(groups.get(t.category) ?? []), t]);
  const chosen = new Set(f?.tags.map((t) => t.toLowerCase()));
  return (
    <Shell title={edit ? "Edit Story" : "Submit Story"} path={path}>
      <script src="/feed/js/submit.js" defer />
      <div className="submit">
        <header className="submit_head">
          <h1>{edit ? "Edit your story" : "Submit a story"}</h1>
          <p>Share a link, write something, or post a picture. A good title and the right tags are what get a post read.</p>
        </header>
        {!edit && (
          <form method="get" action="/stories/new" className="submit_fetch">
            <label htmlFor="start_url">Have a link?</label>
            <input id="start_url" name="url" type="url" maxLength={URL_MAX} defaultValue={start?.url} placeholder="https://" />
            <button type="submit">Fetch title</button>
          </form>
        )}
        {notice && <div className="flash-notice" role="status">{notice}</div>}
        {flash?.errors.length ? <div className="flash-error" role="alert"><ul>{flash.errors.map((e) => <li key={e}>{e}</li>)}</ul></div> : null}
        {flash?.similar?.length ? <div className="flash-notice"><p>Similar stories:</p><ul>{flash.similar.map((s) => <li key={s.short_id}><a href={`/s/${s.short_id}`}>{s.title}</a></li>)}</ul></div> : null}
        <form method="post" action={edit ? `/stories/${edit.shortId}/update` : "/stories"} encType="multipart/form-data" className="submit_grid">
          <input type="hidden" name="csrf" value={v.csrf} />
          <div className="submit_main">
            <section className="card">
              <h2><span className="step">1</span>Title</h2>
              <input id="title" name="title" type="text" required maxLength={TITLE_MAX} defaultValue={f?.title} autoComplete="off" placeholder="Make it specific and honest" data-count="title_count" />
              <p className="meta"><span id="title_count">0</span> / {TITLE_MAX}</p>
            </section>
            <section className="card">
              <h2><span className="step">2</span>Content <small>link, text, or both</small></h2>
              <label htmlFor="url">Link</label>
              <input id="url" name="url" type="url" maxLength={URL_MAX} defaultValue={f?.url} autoComplete="off" placeholder="https:// (leave blank for a text or picture post)" />
              <label htmlFor="description">Text</label>
              <textarea id="description" name="description" rows={8} maxLength={65535} defaultValue={f?.description} placeholder="Markdown is supported." />
              <label className="check"><input id="user_is_author" name="user_is_author" type="checkbox" defaultChecked={f?.userIsAuthor} /> I'm the author of the story at this link.</label>
            </section>
            {!edit && (
              <section className="card dropzone_card">
                <h2><span className="step">+</span>Picture</h2>
                <label className="dropzone" htmlFor="image">
                  <input id="image" name="image" type="file" accept="image/*" />
                  <span className="dz_icon" aria-hidden="true" />
                  <span className="dz_text"><b>Drop a picture here</b> or click to choose one</span>
                  <img className="dz_preview" alt="" hidden />
                </label>
                <p className="meta">JPG, PNG, WebP, GIF or HEIC. It is resized and shown as a thumbnail you can expand in the list.</p>
              </section>
            )}
            {edit?.byModerator && <section className="card"><label htmlFor="reason">Reason</label><input id="reason" name="reason" type="text" maxLength={200} placeholder="for the moderation log" autoComplete="off" /></section>}
          </div>
          <aside className="submit_side">
            <section className="card">
              <h2><span className="step">3</span>Tags</h2>
              <p className="meta">Pick at least one topic. Media tags can't stand alone.{!edit && <> Choose <b>images</b> to attach a picture.</>}</p>
              {[...groups].map(([cat, list]) => (
                <fieldset key={cat} className="tagset"><legend>{cat}</legend>
                  <div className="chips">{list.map((t) => (
                    <label key={t.tag} className={`chip${t.is_media ? " chip_media" : ""}`} title={t.description ?? undefined}>
                      <input id={`tag_${t.tag}`} type="checkbox" name="tags" value={t.tag} defaultChecked={chosen.has(t.tag.toLowerCase())} /><span>{t.tag}</span>
                    </label>))}
                  </div>
                </fieldset>
              ))}
            </section>
            <button type="submit" className="submit_go">{edit ? "Save changes" : "Submit story"}</button>
            <ul className="tips">
              <li>Use the original title; skip ALL CAPS and emoji.</li>
              <li>Link to the source, and say what's interesting in a line or two.</li>
              <li>Search first: duplicates get merged.</li>
            </ul>
          </aside>
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
  const byModerator = v.isModerator && s?.user_id !== v.id;
  if (!s || !(byModerator || editable(s, v.id))) notFound();
  return <StoryFormPage path={`/stories/${shortId}/edit`} edit={{ shortId, input: { title: s.title, url: s.url ?? "", description: s.description ?? "", tags: s.tags, userIsAuthor: s.user_is_author }, byModerator }} />;
}
