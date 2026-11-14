import MembersShell from "../shell";
import { listNotes } from "@/lib/notifications";
import MarkRead from "./mark-read";
import { conversations } from "@/lib/crm";
import { Side } from "./side";
import { ago } from "../../admin/webmaster/ago";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inbox | Kzoo Makers", robots: { index: false } };

// Replies and other notices. New ones are marked read once the page is actually open in the browser (not while it renders on the server).
export default function Inbox() {
  return (
    <MembersShell title="Inbox" path="/members/inbox">
      {async (u) => {
        const [convos, { notes: all }] = await Promise.all([conversations(u.id), listNotes(u.id, 100)]);
        // Member messages live in their conversations (with their own unread counts); only other notices are listed below.
        const notes = all.filter((n) => n.kind !== "member.message");
        const unread = notes.filter((n) => !n.read).map((n) => n.id);
        return (<>
          <MarkRead ids={unread} />
          {convos.length > 0 && <div className="ch-wrap" style={{ marginBottom: 16 }}><Side convos={convos} /><div className="ch-main" style={{ display: "grid", placeItems: "center", color: "#8a8f94", padding: 24, minHeight: 120 }}>Choose a conversation to read it and reply.</div></div>}
          {notes.length ? (
          <div className="card">
            {notes.map((n) => (
              <div className="row" key={n.id} style={{ alignItems: "flex-start" }}>
                <span aria-hidden style={{ color: n.read ? "var(--mut)" : "#d97706" }}>{n.read ? "✉" : "●"}</span>{!n.read && <span className="sr-only">New: </span>}
                <div className="grow" style={{ whiteSpace: "normal" }}>
                  {n.url ? <a href={n.url}><b>{n.title}</b></a> : <b>{n.title}</b>}
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
