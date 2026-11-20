import { categoryPost } from "@/feed/tag-routes";

export const dynamic = "force-dynamic";

// categories#update. Lobsters posts to /categories/:name; that path is the category page here (an optional catch-all), so the form posts to /update.
export async function POST(req: Request, { params }: { params: Promise<{ category: string }> }) { return categoryPost(req, (await params).category); }
