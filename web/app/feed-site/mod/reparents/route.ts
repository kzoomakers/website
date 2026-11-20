import { putError } from "@/feed/flash";
import { formPost } from "@/feed/form-post";
import { reparentUser } from "@/feed/models/mod-reparent";

export const dynamic = "force-dynamic";

// mod/reparents#create. Admins only; the model checks.
export const POST = (req: Request) => formPost(req, async (v, f) => {
  const id = String(f.get("id") ?? "").slice(0, 60), r = await reparentUser(v, id, String(f.get("reason") ?? "").slice(0, 2000));
  if (r.ok) { putError(v.id, "User has been reparented to you.", true); return `/~${encodeURIComponent(r.username ?? id)}`; }
  putError(v.id, `Couldn't reparent: ${r.error}.`);
  return `/mod/reparents/new?id=${encodeURIComponent(id)}`;
});
