import Link from "next/link";
import { notFound } from "next/navigation";
import { overview } from "@/lib/training/attempts";
import { trainingEnabled } from "@/lib/training/settings";
import MembersShell from "../shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Training | Kzoo Makers", robots: { index: false } };

const when = (d: Date | string | null) => (d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Detroit" }) : "");

export default async function TrainingPage() {
  if (!(await trainingEnabled())) notFound();
  return (
    <MembersShell title="Training" path="/members/training">
      {async (u) => {
        const { cards, history } = await overview(u.id);
        if (!cards.length) return <p className="sub">No tool tests are open yet. Ask a trainer about training on a tool.</p>;
        return (
          <>
            <div className="card-grid">
              {cards.map((c) => (
                <section key={c.test_id} className="card" style={{ padding: 16, marginBottom: 12 }}>
                  <h3 style={{ margin: "0 0 4px" }}>{c.tool}</h3>
                  <p className="sub" style={{ margin: "0 0 10px" }}>{c.category}</p>
                  {c.state === "certified" && <p>✅ You're certified on this tool.</p>}
                  {c.state === "awaiting_trainer" && <p>✅ You passed. A trainer still needs to sign you off before you can use the tool.</p>}
                  {c.state === "cooldown" && <p>You can try again in about {c.wait_hours} hour{c.wait_hours === 1 ? "" : "s"}.</p>}
                  {c.state === "locked" && <p>You've used all your attempts. Ask a trainer to help.</p>}
                  {c.state === "retake" && <p>Retake by {c.retake_by} to keep your authorization.</p>}
                  {["not_started", "retake"].includes(c.state) && <Link className="btn" href={`/members/training/test/${c.test_id}`}>Take the test</Link>}
                  {c.state === "in_progress" && <Link className="btn" href={`/members/training/test/${c.test_id}`}>Resume{c.due_at ? ` (due ${new Date(c.due_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Detroit" })})` : ""}</Link>}
                </section>
              ))}
            </div>
            {history.length > 0 && (
              <>
                <h2>My attempts</h2>
                <ul>{history.map((h: any) => <li key={h.id}>{when(h.submitted_at)}: {h.tool}, {h.status === "expired" ? "time ran out" : `${h.pct}%`}, {h.passed ? "passed" : "not passed"}</li>)}</ul>
              </>
            )}
          </>
        );
      }}
    </MembersShell>
  );
}
