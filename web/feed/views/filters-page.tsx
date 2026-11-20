import { currentFeedUser } from "../identity";
import { filtersIndex } from "../models/filters";
import Shell from "./shell";

const sign = (n: number) => (n > 0 ? "+" : "") + n;

/** filters/index.html.erb */
export default async function FiltersPage() {
  const me = await currentFeedUser().catch(() => null);
  if (!me) return (
    <Shell title="Filtered Tags" path="/filters">
      <h1>Filtered Tags</h1>
      <div className="box wide"><p>To hide stories with certain <a href="/tags">tags</a> from across the site, <a href="/login?return=/filters">log in</a> and check them here.</p></div>
    </Shell>
  );
  const cats = await filtersIndex(me.id);
  return (
    <Shell title="Filtered Tags" path="/filters">
      <h1>Filtered Tags</h1>
      <div className="box wide">
        <p>To hide stories with certain <a href="/tags">tags</a> from across the site, check them below.</p>
        <form method="post" action="/filters/save">
          <input type="hidden" name="csrf" value={me.csrf} />
          <table className="data zebra" cellSpacing={0}>
            <tbody>
              <tr><th>Hide</th><th>Tag</th><th>Description</th><th style={{ textAlign: "right" }}>Stories</th><th style={{ textAlign: "right", paddingRight: "1em" }}>Filtering</th></tr>
              {cats.map((c) => [
                <tr key={c.category}><th /><th colSpan={4}>{c.category}</th></tr>,
                ...c.tags.map((t) => (
                  <tr key={t.id} id={t.tag}>
                    <td>{(!t.privileged || me.isModerator) && <input type="checkbox" name={`tags[${t.tag}]`} id={`tags[${t.tag}]`} value={t.tag} defaultChecked={t.filtered} />}</td>
                    <td><a aria-label={`Tag ${t.tag}`} className={`tag tag_${t.tag}${t.is_media ? " tag_is_media" : ""}`} title={t.description ?? undefined} href={`/t/${t.tag}`}>{t.tag}</a></td>
                    <td><label htmlFor={`tags[${t.tag}]`}><span>{t.description}</span>{!!t.hotness_mod && <> | <em>hotness mod {sign(t.hotness_mod)}</em></>}</label></td>
                    <td style={{ textAlign: "right" }}>{t.stories.toLocaleString("en-US")}</td>
                    <td style={{ textAlign: "right", paddingRight: "1em" }}>{t.filtering.toLocaleString("en-US")}</td>
                  </tr>
                )),
              ])}
            </tbody>
          </table>
          <p><input type="submit" value="Save Filters" /></p>
        </form>
      </div>
    </Shell>
  );
}
