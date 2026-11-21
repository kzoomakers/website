import { notFound, redirect } from "next/navigation";
import { conn } from "@/lib/db";
import { currentFeedUser } from "../identity";
import { suggestionForm } from "../models/suggestions";
import { TITLE_MAX } from "../story-rules";
import Shell from "./shell";

/** suggestions/new.html.erb: propose a different title and tag set for someone else's story. */
export default async function SuggestPage({ shortId }: { shortId: string }) {
  const path = `/stories/${shortId}/suggest`, v = await currentFeedUser().catch(() => null);
  if (!v) redirect(`/login?return=${path}`);
  const form = await suggestionForm(v.id, shortId);
  if (!form) notFound();
  const tags: { category: string; tag: string; description: string | null }[] = (await (await conn()).query(
    "SELECT c.category, t.tag, t.description FROM feed.tags t JOIN feed.categories c ON c.id = t.category_id WHERE t.active AND NOT t.privileged ORDER BY lower(c.category), lower(t.tag)")).rows;
  const groups = new Map<string, typeof tags>(), chosen = new Set(form.tags);
  for (const t of tags) groups.set(t.category, [...(groups.get(t.category) ?? []), t]);
  return (
    <Shell title="Suggest Story Changes" path={path}>
      <h1>Suggest Story Changes</h1>
      <p>Propose a better title or tags. When enough users agree, the change is made and shown in the moderation log as <em>(Users)</em>.</p>
      <form method="post" action={`/stories/${shortId}/suggest`} className="submit_grid">
        <input type="hidden" name="csrf" value={v.csrf} />
        <label htmlFor="title">Title</label>
        <input id="title" name="title" type="text" required maxLength={TITLE_MAX} defaultValue={form.title} autoComplete="off" />
        {[...groups].map(([cat, list]) => (
          <fieldset key={cat} className="tagset"><legend>{cat}</legend>
            <div className="chips">{list.map((t) => (
              <label key={t.tag} className="chip" title={t.description ?? undefined}><input type="checkbox" name="tags" value={t.tag} defaultChecked={chosen.has(t.tag)} /><span>{t.tag}</span></label>
            ))}</div>
          </fieldset>
        ))}
        <p><button type="submit">Suggest Changes</button> or <a href={`/s/${shortId}`}>cancel</a></p>
      </form>
    </Shell>
  );
}
