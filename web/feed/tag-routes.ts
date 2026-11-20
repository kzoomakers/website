import { formPost } from "./form-post";
import { putError } from "./flash";
import { saveCategory, saveTag } from "./models/tag-admin";

const s = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").slice(0, max);
const on = (f: FormData, k: string) => f.get(k) === "1";
const enc = encodeURIComponent;

/** POST /mod/tags (current = null) and /mod/tags/:tag/update. Success goes to the tag, a refusal back to the form with the reason. */
export const tagPost = (req: Request, current: string | null) => formPost(req, async (v, f) => {
  const r = await saveTag(v.id, current, { tag: s(f, "tag"), category: s(f, "category"), description: s(f, "description", 500), quorum: s(f, "quorum", 20), hotness_mod: s(f, "hotness_mod", 20),
    permit_by_new_users: on(f, "permit_by_new_users"), privileged: on(f, "privileged"), is_media: on(f, "is_media"), active: on(f, "active") });
  if (r.ok) { putError(v.id, `Tag ${r.name} ${current === null ? "created" : "has been updated"}`, true); return `/t/${enc(r.name)}`; }
  putError(v.id, `${current === null ? "New tag not created" : "Tag not updated"}: ${r.error}`);
  return current === null ? "/mod/tags/new" : `/mod/tags/${enc(current)}/edit`;
});

/** POST /categories and /categories/:name/update. */
export const categoryPost = (req: Request, current: string | null) => formPost(req, async (v, f) => {
  const r = await saveCategory(v.id, current, s(f, "category"));
  if (r.ok) { putError(v.id, `Category ${r.name} has been ${current === null ? "created" : "updated"}`, true); return "/tags"; }
  putError(v.id, `${current === null ? "New category not created" : "Category not updated"}: ${r.error}`);
  return current === null ? "/categories/new" : `/categories/${enc(current)}/edit`;
});
