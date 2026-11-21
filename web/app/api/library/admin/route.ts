import { NextResponse } from "next/server";
import { errMsg } from "@/lib/errmsg";
import { actor, editingAllowed } from "@/lib/guard";
import { logAudit } from "@/lib/store";
import { createFolder, deleteFolder, listFolders, placeDoc, renameFolder } from "@/lib/library/folders";
import { allTags, bulkEdit, renameTag, deleteDoc, editDoc, listDocs, restoreDoc } from "@/lib/library/docs";
import { saveLearnFlags, learnFlags } from "@/lib/learn-flags";

export const dynamic = "force-dynamic";
// Library admin RPC: POST { op, ...args }. list needs read access; the rest need write.
const STAFF = { id: null, member: true, staff: true };
const OPS = new Set(["list", "edit", "delete", "restore", "flags", "setFlags", "folders", "addFolder", "renameFolder", "deleteFolder", "place", "trash", "tags", "renameTag", "bulk"]);

export async function POST(req: Request) {
  const a = await req.json().catch(() => null);
  if (!a || !OPS.has(a.op) || !(await editingAllowed("library", ["list", "flags", "folders", "trash", "tags"].includes(a.op) ? "read" : "write", "documents"))) return new NextResponse("not found", { status: 404 });
  const who = await actor(), id = Number(a.id);
  try {
    switch (a.op) {
      case "list": return NextResponse.json(await listDocs(STAFF, { q: typeof a.q === "string" ? a.q : "", needsDetails: a.needsDetails === true }));
      case "trash": return NextResponse.json(await listDocs(STAFF, { trash: true }));
      case "folders": return NextResponse.json(await listFolders(STAFF));
      case "addFolder": await createFolder(a.parent == null ? null : Number(a.parent), String(a.title ?? "")); await logAudit(who, "library.folder", String(a.title)); return NextResponse.json({ ok: true });
      case "tags": return NextResponse.json(await allTags());
      case "bulk": await bulkEdit((Array.isArray(a.ids) ? a.ids : []).map(Number).filter(Number.isInteger), a); await logAudit(who, "library.bulk", `${a.ids?.length ?? 0} documents`); return NextResponse.json({ ok: true });
      case "flags": return NextResponse.json(await learnFlags());
      case "setFlags": await saveLearnFlags({ library: a.library }); await logAudit(who, "library.settings", `Library ${a.library === true ? "switched on" : "switched off"}`); return NextResponse.json({ ok: true });
    }
    if (!Number.isInteger(id)) return new NextResponse("bad id", { status: 400 });
    if (a.op === "renameTag") await renameTag(id, String(a.name ?? ""));
    else if (a.op === "renameFolder") await renameFolder(id, String(a.title ?? ""));
    else if (a.op === "deleteFolder") await deleteFolder(id);
    else if (a.op === "place") await placeDoc(id, (Array.isArray(a.folders) ? a.folders : []).map(Number));
    else if (a.op === "edit") await editDoc(id, a);
    else if (a.op === "delete") await deleteDoc(id);
    else await restoreDoc(id);
    await logAudit(who, `library.${a.op}`, String(id));
    return NextResponse.json({ ok: true });
  } catch (e) { return new NextResponse(errMsg(e), { status: 400 }); }
}
