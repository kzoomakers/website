import { conn } from "@/lib/db";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getFeedConfig } from "../config";
import { safeReturn } from "../auth";
import { currentFeedUser, resetLinkValid } from "../identity";
import { liveInvitation } from "../models/invitations";
import Shell from "./shell";
import { Icon } from "./icons";
import { Nav } from "./nav";

// Every message a page can show. Pages look the code up here; nothing from the address bar or a form is ever printed.
const ERRORS: Record<string, string> = {
  login_bad: "Wrong email or password.", slow_down: "Too many tries. Please wait a few minutes and try again.", banned: "This account can't sign in.", deactivated: "You deactivated this account. Use \"Forgot password\" to come back.",
  not_allowed: "You can't sign in this way. Members need an approved account on the main site; admins need an admin Google account.",
  handoff: "That sign-in link didn't work. It may have expired or been used already. Please try again.", link_bad: "That link didn't work. It may have expired or been used already.",
  email_bad: "That email address doesn't look right.", password_bad: "Passwords need 10 to 200 characters, and can't be your email address.",
  signup_closed: "New accounts aren't being created right now.", invite_bad: "That invitation code isn't valid or has expired.",
  username_bad: "Usernames are 2 to 24 letters, digits, _ or -, starting with a letter or digit, and some names are reserved.", username_taken: "That username isn't available.",
  error: "Something went wrong. Please try again.",
};
const NOTICES: Record<string, string> = {
  verify_sent: "If that address can be used, a confirmation email is on its way.", reset_sent: "If that address has an account, a reset email is on its way.",
  verified: "Your email address is confirmed. You can log in now.", logged_out: "You are logged out.",
};
const own = (o: Record<string, string>, k?: string) => (k && Object.hasOwn(o, k) ? o[k] : undefined);

type Q = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

function Page({ title, path, q, children }: { title: string; path: string; q: Q; children: ReactNode }) {
  const e = own(ERRORS, one(q.e)), n = own(NOTICES, one(q.n));
  return (
    <Shell title={title} path={path}>
      <div className="box wide">
        {e && <div className="flash-error" role="alert">{e}</div>}
        {n && <div className="flash-notice" role="status">{n}</div>}
        <h2>{title}</h2>
        {children}
      </div>
    </Shell>
  );
}

const Field = ({ id, label, ...p }: { id: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) => (
  <>
    <label htmlFor={id}>{label}</label>
    <input id={id} name={id} {...p} />
  </>
);

export async function LoginPage({ q }: { q: Q }) {
  if (await currentFeedUser().catch(() => null)) redirect("/");
  const ret = safeReturn(one(q.return)), open = (await getFeedConfig()).signup !== "closed", via = (role: string) => `/login/start?${new URLSearchParams({ role, return: ret })}`;
  return (
    <Page title="Log in" path="/login" q={q}>
      <p>Kzoo Makers members and admins log in through the main site.</p>
      <p>
        <a className="button" href={via("member")}>Log in as a member</a> <a className="button" href={via("admin")}>Log in as an admin</a>
      </p>
      <h3>Everyone else</h3>
      <form method="post" action="/auth/login">
        <div className="labelled_grid">
          <Field id="email" label="Email" type="email" required maxLength={100} autoComplete="username" autoCapitalize="off" />
          <Field id="password" label="Password" type="password" required maxLength={200} autoComplete="current-password" />
        </div>
        <input type="hidden" name="return" value={ret} />
        <input type="submit" value="Log in" />
        <p>Forgot your password? <a href="/login/forgot_password">Reset your password</a>.</p>
        {open && <p>Not a user yet? <a href="/signup">Create an account</a>.</p>}
      </form>
    </Page>
  );
}

export async function SignupPage({ q }: { q: Q }) {
  if (await currentFeedUser().catch(() => null)) redirect("/");
  const cfg = await getFeedConfig(), mode = cfg.signup;
  const code = typeof q.code === "string" ? q.code.slice(0, 60) : "", inv = code ? await liveInvitation(code) : null; // /invitations/:code lands here
  return (
    <Page title="Create an account" path="/signup" q={q}>
      {mode === "invite" && code && !inv && <div className="flash-error" role="alert">That invitation is not valid any more. Ask the person who invited you to send a new one.</div>}
      {mode === "closed" ? <p>New accounts aren't being created right now.</p> : (
        <form method="post" action="/auth/signup">
          <div className="labelled_grid">
            <Field id="email" label="Email" type="email" required maxLength={100} autoComplete="email" autoCapitalize="off" defaultValue={inv?.email || undefined} />
            <Field id="password" label="Password" type="password" required minLength={10} maxLength={200} autoComplete="new-password" />
            {mode === "invite" && <Field id="code" label="Invitation code" type="text" required maxLength={60} autoComplete="off" defaultValue={inv ? code : undefined} />}
          </div>
          <p>We'll email you a link to confirm your address before you can post.</p>
          <input type="submit" value="Create account" />
        </form>
      )}
      {mode === "invite" && cfg.invites.requests && <p>No invitation? <a href="/invitations/request">Request one</a>.</p>}
      <p>Already have an account? <a href="/login">Log in</a>.</p>
    </Page>
  );
}

export function ForgotPage({ q }: { q: Q }) {
  return (
    <Page title="Reset your password" path="/login/forgot_password" q={q}>
      <form method="post" action="/auth/forgot">
        <div className="labelled_grid"><Field id="email" label="Email" type="email" required maxLength={100} autoComplete="email" autoCapitalize="off" /></div>
        <input type="submit" value="Send reset email" />
      </form>
    </Page>
  );
}

export async function ResetPage({ q }: { q: Q }) {
  const t = one(q.t).slice(0, 100);
  const ok = !!t && (await resetLinkValid(t).catch(() => false));
  return (
    <Page title="Choose a new password" path="/login/set_new_password" q={q}>
      <meta name="referrer" content="no-referrer" />
      {ok ? (
        <form method="post" action="/auth/reset">
          <div className="labelled_grid"><Field id="password" label="New password" type="password" required minLength={10} maxLength={200} autoComplete="new-password" /></div>
          <input type="hidden" name="t" value={t} />
          <input type="submit" value="Save password" />
        </form>
      ) : <p>That link didn't work. It may have expired or been used already. <a href="/login/forgot_password">Ask for a new one</a>.</p>}
    </Page>
  );
}

/** Members and admins choose their own username on first visit (never taken from their name or email). */
export async function UsernamePage({ q }: { q: Q }) {
  const v = await currentFeedUser().catch(() => null);
  if (!v) redirect("/login");
  const ret = safeReturn(one(q.return));
  if (v.username) redirect(ret);
  return (
    <Page title="Choose a username" path="/login/username" q={q}>
      <p>This is the name other people see. It can't be changed later, and it isn't your real name unless you choose that.</p>
      <form method="post" action="/auth/username">
        <div className="labelled_grid"><Field id="username" label="Username" type="text" required minLength={2} maxLength={24} pattern="[A-Za-z0-9][A-Za-z0-9_\-]{1,23}" autoComplete="off" autoCapitalize="off" /></div>
        <input type="hidden" name="csrf" value={v.csrf} />
        <input type="hidden" name="return" value={ret} />
        <input type="submit" value="Save username" />
      </form>
    </Page>
  );
}

/** The right end of the top menu: Login for visitors; username and Logout once signed in. */
export async function Account({ path = "" }: { path?: string }) {
  const v = await currentFeedUser().catch(() => null);
  if (!v) return <li className="push-right"><Nav href="/login" path={path} icon="login">Login</Nav></li>;
  const unreadMessages = v.username ? (await (await conn()).query("SELECT count(*)::int AS n FROM feed.notifications WHERE user_id = $1 AND notifiable_type = 'Message' AND read_at IS NULL", [v.id])).rows[0].n : 0;
  const post = (action: string, label: string) => (
    <form method="post" action={`/auth/${action}`} style={{ display: "inline" }}>
      <input type="hidden" name="csrf" value={v.csrf} />
      <button type="submit">{action === "logout" && <Icon name="logout" />}<span>{label}</span></button>
    </form>
  );
  if (!v.username) return (
    <>
      <li className="push-right"><Nav href="/login/username" path={path} icon="user">Choose a username</Nav></li>
      {v.kind === "external" && !v.verified && <li>{post("resend", "Confirm your email")}</li>}
      <li className="logout">{post("logout", "Logout")}</li>
    </>
  );
  // the everyday links stay on the bar; the rest live under the username so the bar fits at any width
  return (
    <>
      <li className="push-right"><Nav href="/stories/new" path={path} icon="submit">Submit</Nav></li>
      <li><Nav href="/messages" path={path} icon="messages">Messages{unreadMessages > 0 && ` (${unreadMessages})`}</Nav></li>
      <li className="usermenu">
        <details>
          <summary><Icon name="user" /><span>{v.username}</span><svg className="chev" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg></summary>
          <ul>
            <li><Nav href={`/~${v.username}`} path={path} icon="user">Profile</Nav></li>
            <li><Nav href="/invitations" path={path} icon="invitations">Invitations</Nav></li>
            <li><Nav href="/settings" path={path} icon="settings">Settings</Nav></li>
            {v.isModerator && <li><Nav href="/mod/mails" path={path} icon="mod">Mod Mail</Nav></li>}
            {v.isModerator && <li><Nav href="/hat_requests" path={path} icon="hats">Hat Requests</Nav></li>}
            {v.kind === "external" && !v.verified && <li>{post("resend", "Confirm your email")}</li>}
            <li className="logout">{post("logout", "Logout")}</li>
          </ul>
        </details>
      </li>
    </>
  );
}
