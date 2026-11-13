import { markOpened } from "@/lib/tours";

export const dynamic = "force-dynamic";
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

// The 1x1 image in check-in emails: loading it records that the email was opened. Always answers with the image, so a bad token reveals nothing.
export async function GET(req: Request) {
  await markOpened(new URL(req.url).searchParams.get("t") ?? "").catch(() => {});
  return new Response(GIF, { headers: { "content-type": "image/gif", "cache-control": "no-store, max-age=0" } });
}
