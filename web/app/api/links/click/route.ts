import { recordClick } from "@/lib/links";
import { hit } from "@/lib/limit";
import { clientIp } from "@/lib/comments";

// Beacon from the site's own pages when a visitor clicks a link that leaves kzoomakers.org. sendBeacon posts text/plain JSON { url, screen, page }. Always answers 204: the visitor never sees anything.
export async function POST(req: Request) {
  const ip = clientIp(req);
  // The site-wide cap keeps a script with many IPs or random URLs from filling the tables: real traffic is a few clicks an hour.
  if ((await hit("click:" + ip, 60, 60_000)) && (await hit("click:all", 3000, 3600_000))) {
    const b = await req.json().catch(() => null);
    if (b && typeof b === "object") await recordClick(b.url, { ip, ua: req.headers.get("user-agent") ?? "", screen: b.screen, page: b.page }).catch(() => {});
  }
  return new Response(null, { status: 204 });
}
