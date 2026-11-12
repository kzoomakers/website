/** Signed docs RPC: resolves with the JSON body, rejects with the server's message. */
export async function board<T = any>(op: string, args: Record<string, unknown> = {}): Promise<T> {
  const r = await fetch("/api/webmaster/esign", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op, ...args }) });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
