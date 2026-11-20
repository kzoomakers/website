import { categoryPost } from "@/feed/tag-routes";

export const dynamic = "force-dynamic";

// categories#create. Admins only; the model checks.
export const POST = (req: Request) => categoryPost(req, null);
