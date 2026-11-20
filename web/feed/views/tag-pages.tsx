import { notFound, redirect } from "next/navigation";
import { currentFeedUser } from "../identity";
import { categoryNames, DESCRIPTION_MAX, getCategoryName, getTagAdmin, NAME_MAX, tagsIndex } from "../models/tag-admin";
import { Divider } from "./story-list";
import Shell from "./shell";

const Tag = ({ t }: { t: { tag: string; description: string | null; is_media: boolean } }) => <a aria-label={`Tag ${t.tag}`} className={`tag tag_${t.tag}${t.is_media ? " tag_is_media" : ""}`} title={t.description ?? undefined} href={`/t/${t.tag}`} id={t.tag}>{t.tag}</a>;

/** tags/index.html.erb. shortcut: no per-user "filtered" marker until /filters is built. */
export async function TagsPage() {
  const [cats, me] = await Promise.all([tagsIndex(), currentFeedUser().catch(() => null)]);
  const admin = !!me?.isAdmin;
  return (
    <Shell title="Tags" path="/tags">
      <h1>Tags</h1>
      <p>Inactive tags can no longer be used on new stories.</p>
      {cats.map((c) => (
        <div key={c.category}>
          <div className="tag-title">
            <h2 id={c.category}><a href={`/categories/${c.category}`}>{c.category}</a></h2>
            {admin && <p className="byline"><Divider /> <a href={`/categories/${c.category}/edit`} id={`editlink-${c.category}`}>edit</a></p>}
          </div>
          <ol className="category_tags" aria-labelledby={c.category}>
            {c.tags.map((t) => (
              <li key={t.tag}>
                <Tag t={t} /> <span className={t.active ? "" : "inactive_tag"}>{t.description}</span>
                <span className="byline">
                  {!t.active && <><Divider /> <em>inactive</em></>}
                  {admin && <> <Divider /> <a href={`/mod/tags/${t.tag}/edit`} id={`editlink-${t.tag}`}>edit</a></>}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ))}
      {admin && <p><a href="/mod/tags/new">Create New Tag</a><br /><a href="/categories/new">Create New Category</a></p>}
    </Shell>
  );
}

async function adminOnly(path: string) {
  const v = await currentFeedUser().catch(() => null);
  if (!v?.username) redirect(`/login?return=${path}`);
  if (!v.isAdmin) notFound();
  return v;
}
const Check = ({ name, label, on }: { name: string; label: string; on: boolean }) => <><label htmlFor={name} className="for_checkbox">{label}</label><input type="checkbox" id={name} name={name} value="1" defaultChecked={on} /></>;

/** mod/tags/new and edit (a form for one tag; `name` null creates). */
export async function TagFormPage({ name }: { name: string | null }) {
  const path = name === null ? "/mod/tags/new" : `/mod/tags/${name}/edit`, me = await adminOnly(path);
  const [t, cats] = await Promise.all([name === null ? null : getTagAdmin(name), categoryNames()]);
  if (name !== null && !t) notFound();
  const title = name === null ? "Create Tag" : "Edit Tag";
  return (
    <Shell title={title} path={path}>
      <h1>{title}</h1>
      {t && <p><a href={`/t/${t.tag}`}>Filter By Tag {t.tag}</a></p>}
      <form method="post" action={t ? `/mod/tags/${t.tag}/update` : "/mod/tags"}>
        <input type="hidden" name="csrf" value={me.csrf} />
        <div className="labelled_grid">
          <label htmlFor="tag">Name</label><input id="tag" name="tag" required autoCapitalize="off" pattern="[A-Za-z0-9_\-]+" maxLength={NAME_MAX} defaultValue={t?.tag ?? ""} />
          <label htmlFor="category">Category</label><select id="category" name="category" defaultValue={t?.category}>{cats.map((c) => <option key={c}>{c}</option>)}</select>
          <label htmlFor="description">Description</label><input id="description" name="description" maxLength={DESCRIPTION_MAX} defaultValue={t?.description ?? ""} />
          <label htmlFor="quorum">Quorum</label><input id="quorum" name="quorum" defaultValue={t ? (t.quorum ?? "") : 2} />
          <Check name="permit_by_new_users" label="Permit by new users" on={t?.permit_by_new_users ?? true} />
          <Check name="privileged" label="Privileged" on={t?.privileged ?? false} />
          <Check name="is_media" label="Is Media" on={t?.is_media ?? false} />
          <Check name="active" label="Active" on={t?.active ?? true} />
          <label htmlFor="hotness_mod">Hotness Mod</label><input id="hotness_mod" name="hotness_mod" type="number" step="0.01" min="-10" max="10" required defaultValue={t?.hotness_mod ?? 0} />
        </div>
        <input type="submit" value={t ? "Update Tag" : "Create Tag"} />
      </form>
    </Shell>
  );
}

/** categories/new and edit. */
export async function CategoryFormPage({ name }: { name: string | null }) {
  const path = name === null ? "/categories/new" : `/categories/${name}/edit`, me = await adminOnly(path);
  const current = name === null ? null : await getCategoryName(name);
  if (name !== null && !current) notFound();
  const title = current ? "Edit Category" : "Create Category";
  return (
    <Shell title={title} path={path}>
      <h1>{title}</h1>
      <form method="post" action={current ? `/categories/${current}/update` : "/categories"}>
        <input type="hidden" name="csrf" value={me.csrf} />
        <div className="labelled_grid">
          <label htmlFor="category">Name</label><input id="category" name="category" required autoCapitalize="off" pattern="[A-Za-z0-9_\-]+" maxLength={NAME_MAX} defaultValue={current ?? ""} />
        </div>
        <input type="submit" value={current ? "Update Category" : "Create Category"} />
      </form>
    </Shell>
  );
}
