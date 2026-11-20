"use client";
import { useState } from "react";
import { alertDialog } from "@/components/dialog";
import { training } from "../rpc";

export default function Settings({ enabled, canEdit }: { enabled: boolean; canEdit: boolean }) {
  const [on, setOn] = useState(enabled);
  return (
    <>
      <h1>Training settings</h1>
      <p className="sub">Training is off until you switch it on. Switching it off hides the member Training page and stops training emails; it never removes anyone's tool authorization.</p>
      <div className="card" style={{ padding: 16 }}>
        <label><input type="checkbox" checked={on} disabled={!canEdit} onChange={(e) => { const v = e.target.checked; training("setEnabled", { enabled: v }).then(() => setOn(v), (x) => alertDialog(x.message)); }} /> Training is on</label>
      </div>
    </>
  );
}
