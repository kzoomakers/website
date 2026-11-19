import { NextResponse } from "next/server";
import { feedOrigin } from "@/feed/config";
import { csrfOk, originOk } from "@/feed/auth";
import { viewerFor } from "@/feed/identity";
import { putFlash } from "@/feed/flash";
import { setStoryDeleted, updateStory, type Submission } from "@/feed/models/submit";
import { readSubmission } from "../../form";

export const dynamic = "force-dynamic";
const H = { "cache-control": "no-store", "referrer-policy": "no-referrer" };
const to = (path: string) => NextResponse.redirect(feedOrigin() + path, { status: 303, headers: H });

// stories#update, #destroy and #undelete (Lobsters uses PATCH/DELETE; these are POSTs so the same-site and CSRF checks cover every change).
export async function POST(req: Request, { params }: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await params;
  if (!/^[a-z0-9]{1,10}$/.test(id) || !["update", "delete", "undelete"].includes(action)) return new NextResponse("not found", { status: 404 });
  if (!originOk(req.headers)) return new NextResponse("forbidden", { status: 403 });
  const f = await req.formData().catch(() => null);
  if (!f) return new NextResponse("bad request", { status: 400 });
  const cookie = req.headers.get("cookie")?.match(/(?:^|;\s*)feed_session=([\w.-]{1,200})/)?.[1] ?? "";
  const v = await viewerFor(cookie);
  if (!v || !v.username || !csrfOk(cookie, String(f.get("csrf") ?? "").slice(0, 100))) return new NextResponse("forbidden", { status: 403 });
  try {
    if (action === "update") {
      const input: Submission = readSubmission(f);
      const r = await updateStory(v, id, input);
      if (r.ok) return to(`/s/${id}`);
      putFlash(v.id, { input, errors: r.errors });
      return to(`/stories/${id}/edit`);
    }
    const r = await setStoryDeleted(v, id, action === "delete");
    return to(r.ok ? `/s/${id}` : "/");
  } catch (e) { console.error("feed story:", action, e); return to("/"); }
}
