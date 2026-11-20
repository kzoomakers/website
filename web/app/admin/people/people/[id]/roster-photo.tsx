"use client";
import { useRef, useState } from "react";
import { confirmDialog, alertDialog } from "@/components/dialog";
import { sendUpload } from "@/lib/upload-client";

// The member-roster portrait: a staff-taken photo for the internal roster. Sits at the right of the header; never shown to members or the public.
export default function RosterPhoto({ id, name, initial, canEdit }: { id: number; name: string; initial: boolean; canEdit: boolean }) {
  const [v, setV] = useState(initial ? 1 : 0), [busy, setBusy] = useState(false), pick = useRef<HTMLInputElement>(null);
  const url = `/api/webmaster/users/${id}/roster`;
  const upload = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    const fd = new FormData(); fd.append("file", f);
    const r = await sendUpload(url, fd);
    setBusy(false);
    if (r?.ok) setV(Date.now()); else alertDialog(r ? await r.text() : "Network error. Try again.");
  };
  return (
    <figure className="pp-roster" aria-label="Roster photo">
      {v ? <img src={`${url}?v=${v}`} alt={`Roster photo of ${name}`} /> : <div className="pp-roster-empty"><span aria-hidden>📷</span>No roster photo</div>}
      <span className="pp-roster-flag">Internal use only</span>
      {canEdit && <figcaption>
        <input ref={pick} type="file" accept="image/*" hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
        <button type="button" disabled={busy} onClick={() => pick.current?.click()}>{busy ? "Uploading…" : v ? "Replace" : "Add photo"}</button>
        {v ? <button type="button" disabled={busy} aria-label="Remove roster photo" onClick={async () => { if (await confirmDialog(`Remove the roster photo of ${name}?`, { ok: "Remove", danger: true })) { await fetch(url, { method: "DELETE" }); setV(0); } }}>✕</button> : null}
      </figcaption>}
    </figure>
  );
}
