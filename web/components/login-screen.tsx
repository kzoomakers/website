"use client";
import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import PrivacyText from "./privacy-text";

const post = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const BGS = ["greetingskalamazoo", "dtown", "dtown2", "kalamazoo", "kalamazoo-background"].map((n) => `/images/login/${n}.png`);
const EVERY = 5000; // ms between photos

const Icon = ({ d }: { d: string }) => <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden><path d={d} /></svg>;
const USER = "M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.095a1.23 1.23 0 00.41-1.412A9.992 9.992 0 0010 12a9.992 9.992 0 00-6.535 2.493z";
const LOCK = "M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z";
const MAIL = "M3 4a2 2 0 00-2 2v.4l9 5.2 9-5.2V6a2 2 0 00-2-2H3zm16 4.7l-9 5.2-9-5.2V14a2 2 0 002 2h14a2 2 0 002-2V8.7z";

/** Sign-in / registration for everyone (site accounts and admins). `denied` = signed in, but without access to the page asked for. */
export default function LoginScreen({ next, expired, denied, notAdmin, google, privacy, admin }: { admin?: boolean; privacy: string; next: string; expired: boolean; denied?: string; notAdmin?: boolean; google: boolean }) {
  const [cur, setCur] = useState(-1), [email, setEmail] = useState(""), [name, setName] = useState(""), [pw, setPw] = useState(""), [reg, setReg] = useState(false), [flash, setFlash] = useState(!!notAdmin), [busy, setBusy] = useState(false), [sent, setSent] = useState(false);
  const [msg, setMsg] = useState(denied ? `${denied} doesn't have access to that page. Ask an admin to grant it, or sign in with a different account.` : expired ? "That link has expired or was already used. Request a new one." : "");
  // Start on a random photo, then fade to the next one every few seconds (reduced-motion users get one still photo).
  useEffect(() => {
    setCur(Math.floor(Math.random() * BGS.length));
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setCur((c) => (c + 1) % BGS.length), EVERY);
    return () => clearInterval(t);
  }, []);
  const go = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg("");
    // Sign in with a password if one was typed; otherwise (or when registering) email a link.
    const pwLogin = !reg && !!pw;
    const r = await (pwLogin ? post("/api/blog/auth/password", { email, password: pw, next }) : post("/api/blog/auth", { email, name: reg ? name : "", next })).catch(() => null);
    setBusy(false);
    if (r?.ok) { if (pwLogin) location.href = (await r.json()).next; else setSent(true); } else setMsg(r ? await r.text() : "Network error. Try again.");
  };
  return (
    <main className="lg">
      {flash && <div className="lg-flash" role="alert">
        <span>That Google account isn't a makerspace admin. <a href="/login">Member? Sign in here.</a></span>
        <button type="button" aria-label="Dismiss" onClick={() => setFlash(false)}>✕</button>
      </div>}
      {BGS.map((src, i) => <div key={src} className="lg-bg" aria-hidden style={{ backgroundImage: `url(${src})`, opacity: i === cur ? 1 : 0 }} />)}
      <div className="lg-wrap">
        <h1>Kzoo Makers</h1>
        <p className="lg-sub">{admin ? "Admin sign in" : reg ? "Create your account" : "Sign in"}</p>
        {sent ? (
          <p className="lg-msg lg-ok" role="status">Check your email. {reg ? <>We sent a link to <strong>{email}</strong> to finish creating your account.</> : <>If <strong>{email}</strong> has an account, a sign-in link is on its way.</>} It works once, for 30 minutes.</p>
        ) : (
          <form onSubmit={go}>
            <div className="lg-box"><input type="email" required autoComplete="email" aria-label="Email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} /><Icon d={MAIL} /></div>
            {reg && <div className="lg-box"><input required aria-label="Name" autoComplete="name" placeholder="Your name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /><Icon d={USER} /></div>}
            {!reg && <div className="lg-box"><input type="password" autoComplete="current-password" aria-label="Password" placeholder="Password (or leave blank for an email link)" value={pw} onChange={(e) => setPw(e.target.value)} /><Icon d={LOCK} /></div>}
            <button className="lg-btn" type="submit" disabled={busy}>{busy ? "Working…" : reg ? "Register" : pw ? "Sign in" : "Email me a sign-in link"}</button>
          </form>
        )}
        {msg && <p className="lg-msg lg-bad" role="alert">{msg}</p>}
        {admin && google && !sent && <button className="lg-btn lg-alt" type="button" onClick={() => signIn("google", { callbackUrl: next })}>Sign in with Google</button>}
        <p className="lg-note">Prefer no password? Leave it blank and we email you a link that works once. {admin ? <>Member? <a href="/login">Member sign in</a></> : <>{reg ? <>Registering also adds you to our email updates list. Have an account? </> : <>Don't have an account? </>}<a href="#" onClick={(e) => { e.preventDefault(); setReg(!reg); setMsg(""); setSent(false); }}>{reg ? "Sign in" : "Register"}</a></>} · <a href="/">Back to the site</a></p>
        <details className="lg-priv"><summary>Privacy statement</summary><PrivacyText text={privacy} /></details>
      </div>
    </main>
  );
}
