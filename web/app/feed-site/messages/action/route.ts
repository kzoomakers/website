import { formPost } from "@/feed/form-post";
import { putError } from "@/feed/flash";
import { deleteMessages, keepAsNew, noteMessage, sendMessage } from "@/feed/models/messages";
import { hit } from "@/lib/limit";

export const dynamic = "force-dynamic";

// messages#create, #destroy, #batch_delete, #keep_as_new and #mod_note behind one POST, picked by `op` (a form can't send DELETE).
export const POST = (req: Request) => formPost(req, async (v, f) => {
  const s = (k: string, n: number) => String(f.get(k) ?? "").slice(0, n), op = s("op", 20), id = s("id", 30);
  const idOk = /^[a-z0-9]{1,30}$/.test(id);
  if (op === "send") {
    if (!(await hit(`feed:message:${v.id}`, 30, 3_600_000, true))) { putError(v.id, "You're sending messages too fast. Please wait a bit."); return "/messages"; }
    const r = await sendMessage(v, { to: s("to", 100), subject: s("subject", 400), body: s("body", 20_000), hat: s("hat", 10), modNote: v.isModerator && f.get("mod_note") === "1" });
    if (r.ok) putError(v.id, `Your message has been sent to ${r.to}.`, true);
    else putError(v.id, `Your message failed: ${r.errors.join(", ")}.`);
    return "/messages";
  }
  if (op === "batch_delete") {
    const n = await deleteMessages(v.id, f.getAll("delete").map((x) => String(x).slice(0, 30)).filter((x) => /^[a-z0-9]{1,30}$/.test(x)).slice(0, 200));
    putError(v.id, `Deleted ${n} ${n === 1 ? "message" : "messages"}`, true);
    return "/messages";
  }
  if (op === "delete" && idOk) { const n = await deleteMessages(v.id, [id]); putError(v.id, n ? "Deleted message." : "Could not find message.", !!n); return "/messages"; }
  if (op === "keep_as_new" && idOk) { await keepAsNew(v.id, id); return "/messages"; }
  if (op === "mod_note" && idOk) {
    const r = await noteMessage(v.id, id);
    putError(v.id, r.ok ? "ModNote created" : r.errors.join(", "), r.ok);
    return `/messages/${id}`;
  }
  return "/messages";
});
