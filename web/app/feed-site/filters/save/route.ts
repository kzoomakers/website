import { putError } from "@/feed/flash";
import { formPost } from "@/feed/form-post";
import { saveFilters } from "@/feed/models/filters";

export const dynamic = "force-dynamic";

// filters#update. The id comes from the session. Rails posts tags[name]=name; Next hands those over as plain form keys.
export const POST = (req: Request) => formPost(req, async (v, f) => {
  const names = [...f.keys()].filter((k) => /^tags\[[\w-]{1,25}\]$/.test(k)).map((k) => k.slice(5, -1)).slice(0, 500);
  await saveFilters(v.id, v.isModerator, names);
  putError(v.id, "Your filters have been updated.", true);
  return "/filters";
});
