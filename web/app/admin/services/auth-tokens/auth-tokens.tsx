"use client";
import Notice from "@/components/notice";
import { useEffect, useState } from "react";
import { confirmDialog } from "@/components/dialog";

type T = { hash: string; kind: "member" | "admin"; email: string; name: string; device: string; created_at: string; last_used_at: string | null; expires_at: string };
const rpc = async (op: string, args: Record<string, unknown> = {}) => {
  const r = await fetch("/api/webmaster/auth-tokens", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op, ...args }) });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
};
const when = (s: string | null) => (s ? new Date(s).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "never");

// Everyone signed in on the phone app, one row per device. Revoking signs that device out the next time it talks to the site.
export default function AuthTokens({ canEdit }: { canEdit: boolean }) {
  const [tokens, setTokens] = useState<T[]>([]), [err, setErr] = useState("");
  const load = async () => setTokens((await rpc("list")).tokens);
  useEffect(() => { load().catch((e) => setErr(e.message)); }, []);
  const run = async (fn: () => Promise<unknown>) => { setErr(""); try { await fn(); await load(); } catch (e: any) { setErr(e.message); } };
  const people = [...new Set(tokens.map((t) => t.email))];
  const one = async (t: T) => { if (await confirmDialog(`Sign ${t.email} out of "${t.device || "this device"}"?`, { ok: "Revoke", danger: true })) run(() => rpc("revoke", { hash: t.hash, email: t.email, device: t.device })); };
  const all = async (email: string) => { if (await confirmDialog(`Sign ${email} out of every phone?`, { ok: "Revoke all", danger: true })) run(() => rpc("revokePerson", { email })); };
  return (
    <section>
      <h1>Auth tokens</h1>
      <p className="sub">People signed in on the phone app, one line per phone. Revoking signs that phone out the next time it talks to the site. To stop an admin for good, also take them off the admin list.</p>
      {err && <Notice kind="error">{err}</Notice>}
      {people.map((email) => (
        <div className="card" key={email}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}><strong>{tokens.find((t) => t.email === email)?.name || email}</strong><span className="sub">{email}</span><span style={{ flex: 1 }} />
            {canEdit && <button className="danger" onClick={() => all(email)}>Revoke all</button>}</div>
          {tokens.filter((t) => t.email === email).map((t) => (
            <div key={t.hash} style={{ padding: "8px 0", borderTop: "1px solid var(--line)", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span className="tag">{t.kind === "admin" ? "Admin (Google)" : "Member"}</span><strong>{t.device || "Unknown device"}</strong>
              <span className="tag">Signed in {when(t.created_at)}</span><span className="tag">Last used: {when(t.last_used_at)}</span><span className="tag">Expires {when(t.expires_at)}</span>
              <span style={{ flex: 1 }} />{canEdit && <button className="danger" onClick={() => one(t)}>Revoke</button>}
            </div>
          ))}
        </div>
      ))}
      {!tokens.length && <div className="card"><p className="sub">Nobody is signed in on the app.</p></div>}
    </section>
  );
}
