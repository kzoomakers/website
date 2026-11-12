"use client";
import { useRef, useState } from "react";
import { alertDialog } from "@/components/dialog";
import { tours } from "./rpc";

/** Export CSV / Import CSV… for a list on the Tours pages. `what` names the rows ("walk-ups"); `ops` are the server operations. */
export default function CsvBar({ what, file, ops, args, reload, fail }: { what: string; file: string; ops: { export: string; import: string }; args?: Record<string, unknown>; reload: () => Promise<unknown>; fail: (m: string) => void }) {
  const ref = useRef<HTMLInputElement>(null), [busy, setBusy] = useState(false);
  const exportCsv = async () => {
    fail("");
    try { const { csv } = await tours(ops.export, args); const u = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); const a = document.createElement("a"); a.href = u; a.download = `${file}-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); }
    catch (e: any) { fail(e.message); }
  };
  const upload = async (f?: File) => {
    if (!f) return;
    fail(""); setBusy(true);
    try {
      const j = await tours(ops.import, { csv: await f.text() }); await reload();
      await alertDialog(`Added ${j.added} ${what}${j.dupes ? `; ${j.dupes} already here` : ""}.${j.skipped.length ? ` Skipped ${j.skipped.length}:\n${j.skipped.slice(0, 8).join("\n")}${j.skipped.length > 8 ? `\n…and ${j.skipped.length - 8} more` : ""}` : ""}`);
    } catch (e: any) { fail(e.message); } finally { setBusy(false); }
  };
  return (
    <>
      <button onClick={exportCsv}>Export CSV</button>
      <button disabled={busy} onClick={() => ref.current?.click()}>Import CSV…</button>
      <input ref={ref} type="file" accept=".csv,text/csv" hidden disabled={busy} onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
    </>
  );
}
