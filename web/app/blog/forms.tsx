"use client";
import { useState } from "react";

const post = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export function LoginForm({ next, expired }: { next: string; expired: boolean }) {
  const [email, setEmail] = useState(""), [name, setName] = useState(""), [msg, setMsg] = useState(expired ? "That link has expired or was already used. Request a new one." : ""), [sent, setSent] = useState(false);
  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await post("/api/blog/auth", { email, name, next });
    if (r.ok) setSent(true); else setMsg(await r.text());
  };
  if (sent) return <p>Check your email. If <strong>{email}</strong> has an account (or you gave your name to register), a sign-in link is on its way. It works once, for 30 minutes.</p>;
  return (
    <form onSubmit={go} style={{ display: "grid", gap: 10, maxWidth: 420 }}>
      <p>Enter your email and we'll send you a link. New here? Add your name and it registers you at the same time.</p>
      <small style={{ opacity: 0.75 }}>Registering also adds you to our email updates list. You can unsubscribe at any time from any email.</small>
      <input type="email" required aria-label="Email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input aria-label="Name (new accounts)" placeholder="Name (first time only)" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
      {msg && <p role="alert" style={{ color: "#b00020", margin: 0 }}>{msg}</p>}
      <button className="btn btn-main" type="submit">Email me a link</button>
    </form>
  );
}
