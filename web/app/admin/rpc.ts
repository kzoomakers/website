import { alertDialog } from "@/components/dialog";

/** The admin screens' way of calling their `POST { op, ...args }` route: returns the JSON, or throws the server's message. */
export const makeRpc = (url: string) => async (op: string, args: Record<string, unknown> = {}) => {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op, ...args }) });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
};
export const fail = (e: any) => alertDialog(e.message);
