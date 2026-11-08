import { authsFor, memberships, upcomingClasses } from "@/lib/crm";
import { currentApplicant } from "@/lib/readers";
import Status from "../pending/status";
import MembersShell from "./shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Members | Kzoo Makers", robots: { index: false } };
const when = (s: string) => new Date(s).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

// Home for everyone signed in. Until someone is approved it is the only members page they get: their application status and the conversation with the team.
export default async function Members() {
  const a = await currentApplicant().catch(() => null);
  if (a && a.approval !== "approved") return <><h1>Welcome</h1><Status /></>;
  return (
    <MembersShell title="Members area" path="/members">
      {async (u) => {
        const [levels, auths, classes] = await Promise.all([memberships(u.id), authsFor(u.id), upcomingClasses(u.id)]);
        const mine = classes.filter((c) => c.mine);
        return (
          <div style={{ display: "grid", gap: 32 }}>
            <p>Welcome, {u.name.split(" ")[0]}.</p>
            <section>
              <h2>Your membership</h2>
              {levels.length ? <ul>{levels.map((l) => <li key={l.level}><strong>{l.level}</strong> <small>since {new Date(l.since).toLocaleDateString()}</small></li>)}</ul>
                : <p>No membership is on file for you yet. See <a href="/pricing">Pricing</a> or ask at the space.</p>}
            </section>
            <section>
              <h2>Your tool authorizations</h2>
              {auths.length ? <ul>{auths.map((a) => <li key={a.tool_id}><strong>{a.name}</strong>{a.category && <> <small>({a.category})</small></>}{a.expired ? <> <em style={{ color: "#b00020" }}>expired {a.expires_on}</em></> : a.expires_on ? <> <small>until {a.expires_on}</small></> : null}</li>)}</ul>
                : <p>None yet. Tool sign-offs happen after an orientation or class at the space.</p>}
            </section>
            <section>
              <h2>Your classes</h2>
              {mine.length ? <ul>{mine.map((c) => <li key={c.id}><strong>{c.title}</strong>, {when(c.starts_at)} {c.mine === "waitlist" && <em>(waitlist)</em>}</li>)}</ul>
                : <p>You're not signed up for anything. <a href="/members/classes">See upcoming classes</a>.</p>}
            </section>
            <p><a href="/members/directory">Find a member with a skill</a> · <a href="/members/profile">Edit your profile and skills</a> · <a href="/members/notifications">Phone notifications</a></p>
          </div>
        );
      }}
    </MembersShell>
  );
}
