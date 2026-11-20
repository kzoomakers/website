import { tagPost } from "@/feed/tag-routes";

export const dynamic = "force-dynamic";

// mod/tags#create. Admins only; the model checks.
export const POST = (req: Request) => tagPost(req, null);
