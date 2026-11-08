/** Chores admin RPC: resolves with the JSON body, rejects with the server's message. */
export async function chores<T = any>(op: string, args: Record<string, unknown> = {}): Promise<T> {
  const r = await fetch("/api/webmaster/chores", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op, ...args }) });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
