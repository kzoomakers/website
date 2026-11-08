"use client";
import { useState } from "react";
import { alertDialog, confirmDialog, promptDialog } from "@/components/dialog";

/** Disable / enable a member's account. Disabling asks for the reason they will be shown at sign-in (blank = "Account is disabled"). */
export default function DisableButton({ id, name, disabled, onChange }: { id: number; name: string; disabled: boolean; onChange: (disabled: boolean, reason: string) => void }) {
  const [busy, setBusy] = useState(false);
  const click = async () => {
    let reason = "";
    if (disabled) { if (!(await confirmDialog(`Enable ${name}'s account again?`, { ok: "Enable" }))) return; }
    else {
      const r = await promptDialog(`Disable ${name}'s account? They are signed out now and told this reason when they try to sign in. Leave it blank to show "Account is disabled".`);
      if (r === null) return;
      reason = r;
    }
    setBusy(true);
    const res = await fetch(`/api/webmaster/users/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(disabled ? { action: "enable" } : { action: "disable", reason }) }).catch(() => null);
    setBusy(false);
    if (res?.ok) onChange(!disabled, reason); else await alertDialog(res ? await res.text() : "Network error. Try again.");
  };
  return <button disabled={busy} onClick={click} style={disabled ? undefined : { color: "var(--bad)" }}>{disabled ? "Enable account" : "Disable account"}</button>;
}
