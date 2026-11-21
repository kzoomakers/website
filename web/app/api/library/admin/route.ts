import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { actor, editingAllowed } from "@/lib/guard";
import { logAudit } from "@/lib/store";
import { learnFlags, saveLearnFlags } from "@/lib/learn-flags";
import { ackReport } from "@/lib/library/acks";
import { bulkEdit, deleteDoc, editDoc, listDocs, restoreDoc, versionsOf } from "@/lib/library/docs";
import { createFolder, deleteFolder, listFolders, placeDoc, renameFolder } from "@/lib/library/folders";
import { STAFF_VIEW } from "@/lib/library/rules";
import { createShare, revokeShare, sharesFor } from "@/lib/library/shares";
import { allTags, renameTag } from "@/lib/library/tags";

export const dynamic = "force-dynamic";

// Library admin RPC: POST { op, ...args }. One table says which permission page unlocks each op, whether it only reads, and what it does. `audit` ops are written to the audit log.
type Args = any; // the body of the request: each op reads only the fields it needs and the libraries check them
const list = (a: Args) => listDocs(STAFF_VIEW, { q: typeof a.q === "string" ? a.q : "", needsDetails: a.needsDetails === true, overdue: a.overdue === true });
const OPS: Record<string, { page: "documents" | "shares"; read?: boolean; audit?: (a: Args) => string; run: (a: Args, who: string) => Promise<unknown> }> = {
  list: { page: "documents", read: true, run: list },
  trash: { page: "documents", read: true, run: () => listDocs(STAFF_VIEW, { trash: true }) },
  flags: { page: "documents", read: true, run: () => learnFlags() },
  setFlags: { page: "documents", audit: (a) => `Library ${a.library === true ? "switched on" : "switched off"}`, run: (a) => saveLearnFlags({ library: a.library }) },
  folders: { page: "documents", read: true, run: () => listFolders(STAFF_VIEW) },
  addFolder: { page: "documents", audit: (a) => `folder ${a.title}`, run: (a) => createFolder(a.parent == null ? null : Number(a.parent), String(a.title ?? "")) },
  renameFolder: { page: "documents", audit: (a) => `folder ${a.id}`, run: (a) => renameFolder(a.id, String(a.title ?? "")) },
  deleteFolder: { page: "documents", audit: (a) => `folder ${a.id}`, run: (a) => deleteFolder(a.id) },
  place: { page: "documents", run: (a) => placeDoc(a.id, (Array.isArray(a.folders) ? a.folders : []).map(Number)) },
  tags: { page: "documents", read: true, run: () => allTags() },
  renameTag: { page: "documents", audit: (a) => `tag ${a.id}`, run: (a) => renameTag(a.id, String(a.name ?? "")) },
  edit: { page: "documents", audit: (a) => String(a.id), run: (a) => editDoc(a.id, a) },
  bulk: { page: "documents", audit: (a) => `${a.ids?.length ?? 0} documents`, run: (a) => bulkEdit((Array.isArray(a.ids) ? a.ids : []).map(Number).filter(Number.isInteger), a) },
  delete: { page: "documents", audit: (a) => String(a.id), run: (a) => deleteDoc(a.id) },
  restore: { page: "documents", audit: (a) => String(a.id), run: (a) => restoreDoc(a.id) },
  versions: { page: "documents", read: true, run: (a) => versionsOf(a.id) },
  acks: { page: "documents", read: true, run: (a) => ackReport(a.id) },
  shares: { page: "shares", read: true, run: (a) => sharesFor(Number.isInteger(a.id) ? a.id : undefined) },
  share: { page: "shares", audit: (a) => `document ${a.id}, ${a.days ?? 30} days${a.allowDownload === true ? ", download" : ""}`, run: (a, who) => createShare(a.id, a, who) },
  revokeShare: { page: "shares", audit: (a) => String(a.id), run: (a) => revokeShare(a.id) },
};
const NO_ID = new Set(["list", "trash", "flags", "setFlags", "folders", "addFolder", "tags", "bulk", "shares"]);

export async function POST(req: Request) {
  const a = await req.json().catch(() => null), op = typeof a?.op === "string" && Object.hasOwn(OPS, a.op) ? OPS[a.op] : null;
  if (!op || !(await editingAllowed("library", op.read ? "read" : "write", op.page))) return new NextResponse("not found", { status: 404 });
  if (!NO_ID.has(a.op) && !Number.isInteger((a.id = Number(a.id)))) return new NextResponse("bad id", { status: 400 });
  const who = await actor();
  try {
    const out = (await op.run(a, who)) ?? { ok: true };
    if (op.audit) await logAudit(who, `library.${a.op}`, op.audit(a));
    return NextResponse.json(out);
  } catch (e) { return new NextResponse(errMsg(e), { status: 400 }); }
}
