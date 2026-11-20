import { formPost } from "@/feed/form-post";
import { putError } from "@/feed/flash";
import { doffHat, editHat } from "@/feed/models/hats";

export const dynamic = "force-dynamic";

// hats#doff_by_user, #update_in_place and #update_by_recreating (the form's second button posts with ?recreate=1).
export const POST = (req: Request) => formPost(req, async (v, f) => {
  const s = (k: string, n: number) => String(f.get(k) ?? "").slice(0, n), op = s("op", 10), id = s("id", 10);
  if (!/^[a-z0-9]{1,10}$/.test(id)) return "/hats";
  if (op === "doff") {
    const r = await doffHat(v.id, id, s("reason", 1000));
    if (r.ok) return `/~${r.username}`;
    putError(v.id, r.error); return `/hats/${id}/doff`;
  }
  if (op === "update") {
    const r = await editHat(v.id, id, { hat: s("hat", 400), link: s("link", 400) }, new URL(req.url).searchParams.get("recreate") === "1");
    if (r.ok) return "/hats";
    putError(v.id, r.error); return `/hats/${id}/edit`;
  }
  return "/hats";
});
