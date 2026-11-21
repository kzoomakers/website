import Link from "next/link";
import { authsFor, upcomingClasses } from "@/lib/crm";
import { conn } from "@/lib/db";
import { overview } from "@/lib/training/attempts";
import { discordView } from "@/lib/training/discord";
import { trainingEnabled } from "@/lib/training/settings";
import Announce from "./announce";
import MembersShell from "../shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tool authorizations | Kzoo Makers", robots: { index: false } };

const day = (d: Date | string | null) => (d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Detroit" }) : "");
const HOW: Record<string, string> = { training: "test and sign-off", legacy: "before online training", manual: "by an administrator", override: "by exception" };

// Every tool the shop has, with where the member stands on it. The test and the classes appear only when the tool has them; the authorization is what counts.
export default async function ToolsPage() {
  const on = await trainingEnabled();
  return (
    <MembersShell title="Tool authorizations" path="/members/training">
      {async (u) => {
        const c = await conn();
        const [tools, auths, classes, { cards, history }] = await Promise.all([
          c.query("SELECT id, name, category, description FROM tools WHERE archived_at IS NULL ORDER BY lower(category), lower(name)").then((r) => r.rows),
          authsFor(u.id), upcomingClasses(u.id), on ? overview(u.id) : { cards: [] as any[], history: [] as any[] },
        ]);
        const dc = on && (await discordView()).enabled ? (await c.query("SELECT discord_announce FROM site_users WHERE id = $1", [u.id])).rows[0]?.discord_announce ?? "" : null;
        const mine = auths.filter((a) => !a.expired);
        const groups = new Map<string, typeof tools>();
        for (const t of tools) groups.set(t.category || "Other", [...(groups.get(t.category || "Other") ?? []), t]);
        return (
          <>
            <p className="sub">Browse the shop's tools. {on ? "Where a tool has a test, pass it and a trainer finishes your sign-off. " : ""}Classes are a good way to learn a tool, but only an authorization lets you use it on your own.</p>
            {mine.length > 0 && <p><b>You're authorized on {mine.length} tool{mine.length === 1 ? "" : "s"}:</b> {mine.map((a) => a.name).join(", ")}</p>}
            {dc !== null && <Announce mode={dc} />}
            {[...groups].map(([cat, ts]) => (
              <section key={cat}>
                <h2>{cat}</h2>
                <div className="card-grid">
                  {ts.map((t) => {
                    const a = auths.find((x) => x.tool_id === t.id), card = cards.find((x: any) => x.tool_id === t.id), cls = classes.filter((k) => k.tool_id === t.id);
                    const state = a && !a.expired ? "certified" : card?.state;
                    return (
                      <section key={t.id} className="card" style={{ padding: 16, marginBottom: 12 }}>
                        <h3 style={{ margin: "0 0 4px" }}>{t.name}</h3>
                        {t.description && <p className="sub" style={{ margin: "0 0 10px" }}>{t.description}</p>}
                        {state === "certified" && <p>✅ Authorized since {day(a!.granted_at)} ({HOW[a!.source] ?? a!.source}){a!.expires_on ? `, until ${a!.expires_on}` : ""}.{a!.retake_due_on ? ` Retake the test by ${a!.retake_due_on} to keep it.` : ""}</p>}
                        {state === "awaiting_trainer" && <p>✅ You passed. A trainer still needs to sign you off before you can use the tool.</p>}
                        {state === "cooldown" && <p>You can try again in about {card.wait_hours} hour{card.wait_hours === 1 ? "" : "s"}.</p>}
                        {state === "locked" && <p>You've used all your attempts. Ask a trainer to help.</p>}
                        {state === "lapsed" && <p>Your authorization lapsed because the test changed. Pass the new test to get it back.</p>}
                        {a?.expired && !card && <p>Your authorization expired {a.expires_on}. Ask a trainer.</p>}
                        {!state && !card && <p className="sub">No online test for this tool. Ask a trainer, or take a class below.</p>}
                        {card && ["not_started", "retake", "lapsed"].includes(card.state) && <Link className="btn" href={`/members/training/test/${card.test_id}`}>{card.state === "retake" ? "Retake the test" : "Take the test"}</Link>}
                        {card?.state === "in_progress" && <Link className="btn" href={`/members/training/test/${card.test_id}`}>Resume{card.due_at ? ` (due ${new Date(card.due_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Detroit" })})` : ""}</Link>}
                        {cls.length > 0 && <div style={{ marginTop: 10 }}><b>Classes</b><ul style={{ margin: "4px 0 0" }}>{cls.map((k) => <li key={k.id}><Link href="/members/classes">{k.title}</Link>, {day(k.starts_at)}{k.mine ? " (you're signed up)" : ""}</li>)}</ul></div>}
                      </section>
                    );
                  })}
                </div>
              </section>
            ))}
            {!tools.length && <p className="sub">No tools have been added yet.</p>}
            {history.length > 0 && (
              <>
                <h2>My attempts</h2>
                <ul>{history.map((h: any) => <li key={h.id}>{day(h.submitted_at)}: {h.tool}, {h.status === "expired" ? "time ran out" : `${h.pct}%`}, {h.passed ? "passed" : "not passed"}</li>)}</ul>
              </>
            )}
          </>
        );
      }}
    </MembersShell>
  );
}
