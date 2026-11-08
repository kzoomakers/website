import { notFound } from "next/navigation";
import MembersShell from "../../shell";
import { thread } from "@/lib/crm";
import Reply from "./reply";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conversation | Kzoo Makers", robots: { index: false } };

export default async function Conversation({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id) || 0;
  return (
    <MembersShell title="Conversation" path={"/members/inbox/" + id}>
      {async (u) => {
        const t = await thread(u.id, id);
        if (!t) notFound();
        return (
          <div style={{ display: "grid", gap: 12, maxWidth: 620 }}>
            <p style={{ margin: 0 }}><a href="/members/inbox">← Inbox</a> · with <b>{t.name}</b></p>
            {t.messages.map((m) => (
              <div key={m.id} style={{ justifySelf: m.mine ? "end" : "start", maxWidth: "85%", background: m.mine ? "#e8f0fe" : "#f1f1f1", color: "#1a1a1a", borderRadius: 10, padding: "8px 12px" }}>
                <div style={{ whiteSpace: "pre-wrap" }}>{m.body}</div>
                <small style={{ color: "#666" }}>{m.mine ? "You" : t.name} · {new Date(m.at).toLocaleString()}</small>
              </div>
            ))}
            {t.canReply ? <Reply to={id} /> : <p className="sub">{t.name} isn't in the directory right now, so you can't reply.</p>}
          </div>
        );
      }}
    </MembersShell>
  );
}
