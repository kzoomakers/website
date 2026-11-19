import { handleFeed } from "@/feed/feeds";
import { FEED_HOST, isFeedHost } from "@/feed/config";

export const dynamic = "force-dynamic";

// /newest.rss, /t/ruby.rss ... (middleware.ts maps them here). Links in a feed always use the feed's own address.
export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const url = new URL(req.url), host = req.headers.get("host");
  const origin = isFeedHost(host) && process.env.NODE_ENV !== "production" ? `${url.protocol}//${host}` : `https://${FEED_HOST}`;
  const p = url.pathname.startsWith("/feed-site/rss") ? url.pathname.slice("/feed-site/rss".length).replace(/^\/hottest$/, "/rss" ) + (url.pathname === "/feed-site/rss/hottest" ? "" : ".rss") : url.pathname; // the address as the client asked for it
  return handleFeed("rss", (await params).path, origin, origin + p, FEED_HOST);
}
