import MembersShell from "../shell";
import { listNotes, markRead } from "@/lib/notifications";
import { conversations } from "@/lib/crm";
import { ago } from "../../admin/webmaster/ago";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inbox | Kzoo Makers", robots: { index: false } };

// Replies and other notices. Opening the page marks them read, after showing which ones were new.
export default function Inbox() {
  return (
    <MembersShell title="Inbox" path="/members/inbox">
      {async (u) => {
        const [convos, { notes: all }] = await Promise.all([conversations(u.id), listNotes(u.id, 100)]);
        // Member messages live in their conversations (with their own unread counts); only other notices are listed below.
        const notes = all.filter((n) => n.kind !== "member.message");
        if (notes.some((n) => !n.read)) await markRead(u.id, notes.filter((n) => !n.read).map((n) => n.id));
        return (<>
          {convos.length > 0 && <div className="card">
            {convos.map((c) => (
              <div className="row" key={c.id} style={{ alignItems: "flex-start" }}>
                <span aria-hidden style={{ color: c.unread ? "#d97706" : "var(--mut)" }}>{c.unread ? "●" : "✉"}</span>
                <div className="grow" style={{ whiteSpace: "normal" }}>
                  <a href={`/members/inbox/${c.id}`}><b>{c.name}</b>{c.unread > 0 && <> ({c.unread} new)</>}</a>
                  <div className="sub" style={{ margin: "2px 0 0" }}>{c.mine ? "You: " : ""}{c.body.slice(0, 120)}</div>
                </div>
                <span className="tag" title={new Date(c.at).toLocaleString()}>{ago(c.at)}</span>
              </div>
            ))}
          </div>}
          {notes.length ? (
          <div className="card">
            {notes.map((n) => (
              <div className="row" key={n.id} style={{ alignItems: "flex-start" }}>
                <span aria-hidden style={{ color: n.read ? "var(--mut)" : "#d97706" }}>{n.read ? "✉" : "●"}</span>
                <div className="grow" style={{ whiteSpace: "normal" }}>
                  <a href={n.url || "#"}><b>{n.title}</b></a>
                  {n.body && <div className="sub" style={{ margin: "2px 0 0" }}>{n.body.slice(0, 160)}</div>}
                </div>
                <span className="tag" title={new Date(n.at).toLocaleString()}>{ago(n.at)}</span>
              </div>
            ))}
          </div>
        ) : !convos.length && <p className="sub">Nothing here yet. You'll see messages from other members here, and a note when someone replies to your blog comments.</p>}
        </>);
      }}
    </MembersShell>
  );
}
