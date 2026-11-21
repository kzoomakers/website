import { alertDialog } from "@/components/dialog";

export const rpc = async (op: string, args: Record<string, unknown> = {}) => {
  const r = await fetch("/api/courses/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op, ...args }) });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
};
export const fail = (e: any) => alertDialog(e.message);
