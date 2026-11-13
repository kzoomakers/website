import { mailEvent } from "@/lib/tours";

export const dynamic = "force-dynamic";
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

// The 1x1 image at the end of every visitor email: loading it records an open. Always answers with the image, so a bad id reveals nothing.
export async function GET(req: Request) {
  await mailEvent(new URL(req.url).searchParams.get("m") ?? "", "open", req.headers.get("user-agent") ?? "").catch(() => {});
  return new Response(GIF, { headers: { "content-type": "image/gif", "cache-control": "no-store, max-age=0" } });
}
