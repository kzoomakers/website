import Link from "next/link";
import { redirect } from "next/navigation";
import { authsFor, conversations, memberships, upcomingClasses } from "@/lib/crm";
import { currentApplicant } from "@/lib/readers";
import Status from "../pending/status";
import MembersShell from "./shell";
import GuestCard from "./guests";
import { recentVisits } from "@/lib/guests";

export const dynamic = "force-dynamic";
export const metadata = { title: "Members | Kzoo Makers", robots: { index: false } };
const when = (s: string) => new Date(s).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

// Home for everyone signed in. Until someone is approved it is the only members page they get: their application status and the conversation with the team.
export default async function Members() {
  const a = await currentApplicant().catch(() => null);
  if (a?.approval === "approved" && a.onboarding === "resign") redirect("/members/onboarding");
  if (a?.approval === "approved" && a.onboarding !== "done") return <h1>Welcome</h1>; // the welcome wizard is open over this
  if (a && a.approval !== "approved") return <><h1>Welcome</h1><Status /></>;
  return (
    <MembersShell title="Home" path="/members">
      {async (u) => {
        const [levels, auths, classes, convos, visits] = await Promise.all([memberships(u.id), authsFor(u.id), upcomingClasses(u.id), conversations(u.id), recentVisits(u.id).catch(() => [])]);
        const mine = classes.filter((c) => c.mine), next = mine[0], expired = auths.filter((a) => a.expired), unread = convos.reduce((n, c) => n + (c.unread || 0), 0);
        return (
          <div style={{ display: "grid", gap: 32 }}>
            <p>Welcome, {u.name.split(" ")[0]}.</p>
            <div className="needs">
              <GuestCard />
              <a className="card" href="/members/classes"><b>{next ? when(next.starts_at) : "No classes yet"}</b>{next ? <>{next.title}{next.mine === "waitlist" ? " (waitlist)" : ""}</> : "Browse upcoming classes"}</a>
              <a className="card" href="/members/inbox"><b>{unread}</b>unread {unread === 1 ? "message" : "messages"}</a>
              <a className="card" href="/members/profile"><b>{expired.length ? expired.length : auths.length}</b>{expired.length ? `tool ${expired.length === 1 ? "sign-off has" : "sign-offs have"} expired. Ask at the space about a refresher.` : `tool ${auths.length === 1 ? "sign-off" : "sign-offs"} current`}</a>
            </div>
            <section>
              <h2>Your membership</h2>
              {levels.length ? <ul>{levels.map((l) => <li key={l.level}><strong>{l.level}</strong> <small>since {new Date(l.since).toLocaleDateString([], { dateStyle: "medium" })}</small></li>)}</ul>
                : <p>No membership is on file for you yet. See <a href="/pricing">Pricing</a> or ask at the space.</p>}
            </section>
            <section>
              <h2>Your tool sign-offs</h2>
              {auths.length ? <ul>{auths.map((a) => <li key={a.tool_id}><strong>{a.name}</strong>{a.category && <> <small>({a.category})</small></>}{a.expired ? <> <em style={{ color: "var(--bad)" }}>expired {a.expires_on}</em></> : a.expires_on ? <> <small>until {a.expires_on}</small></> : null}</li>)}</ul>
                : <p>None yet. Tool sign-offs happen after an orientation or class at the space.</p>}
            </section>
            <section>
              <h2>Your classes</h2>
              {mine.length ? <ul>{mine.map((c) => <li key={c.id}><strong>{c.title}</strong>, {when(c.starts_at)} {c.mine === "waitlist" && <em>(waitlist)</em>}</li>)}</ul>
                : <p>You're not signed up for anything. <a href="/members/classes">See upcoming classes</a>.</p>}
            </section>
            <section>
              <h2>Guest visits</h2>
              {visits.length ? <ul>{visits.map((v) => <li key={v.at}><strong>{v.first_name} {v.last_name}</strong> <small>{when(v.at)}</small></li>)}</ul> : <p>None yet. Use “I brought a Guest” above.</p>}
            </section>
            <p><Link href="/members/directory">Find a member with a skill</Link> · <Link href="/members/profile">Edit your profile and skills</Link> · <Link href="/members/notifications">Phone alerts</Link></p>
          </div>
        );
      }}
    </MembersShell>
  );
}
