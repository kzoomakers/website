import { formPost } from "@/feed/form-post";
import { putError } from "@/feed/flash";
import { decideRequest, requestHat } from "@/feed/models/hats";
import { hit } from "@/lib/limit";

export const dynamic = "force-dynamic";

// hat_requests#create, #approve and #reject (the reject button posts with ?reject=1).
export const POST = (req: Request) => formPost(req, async (v, f) => {
  const s = (k: string, n: number) => String(f.get(k) ?? "").slice(0, n), op = s("op", 10);
  if (op === "create") {
    if (!(await hit(`feed:hatreq:${v.id}`, 5, 86_400_000, true))) { putError(v.id, "You've requested too many hats today."); return "/hat_requests/new"; }
    const r = await requestHat(v.id, { hat: s("hat", 400), link: s("link", 400), comment: s("comment", 70_000) });
    if (r.ok) { putError(v.id, "Successfully submitted hat request.", true); return "/hats"; }
    putError(v.id, r.error); return "/hat_requests/new";
  }
  const id = Number(s("id", 18));
  if ((op === "approve") && Number.isSafeInteger(id)) {
    const reject = new URL(req.url).searchParams.get("reject") === "1";
    const r = await decideRequest(v.id, id, !reject, { hat: s("hat", 400), link: s("link", 400), reason: s("reason", 5000) });
    putError(v.id, r.ok ? `Successfully ${reject ? "rejected" : "approved"} hat request.` : r.error, r.ok);
    return "/hat_requests";
  }
  return "/hat_requests";
});
