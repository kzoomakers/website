"use client";
import { useRouter } from "next/navigation";
import { alertDialog, confirmDialog } from "@/components/dialog";

export default function Revoke({ id }: { id: number }) {
  const router = useRouter();
  const go = async () => {
    if (!(await confirmDialog("Revoke this link? It stops working at once."))) return;
    const r = await fetch("/api/library/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "revokeShare", id }) });
    if (r.ok) router.refresh(); else alertDialog(await r.text());
  };
  return <button onClick={go}>Revoke</button>;
}
