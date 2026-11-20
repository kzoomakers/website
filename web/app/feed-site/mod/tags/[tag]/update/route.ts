import { tagPost } from "@/feed/tag-routes";

export const dynamic = "force-dynamic";

// mod/tags#update. Lobsters sends PATCH /mod/tags/:tag; a plain form POST to /update stands in for it.
export async function POST(req: Request, { params }: { params: Promise<{ tag: string }> }) { return tagPost(req, (await params).tag); }
