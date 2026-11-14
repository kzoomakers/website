import { notFound } from "next/navigation";
import MembersShell from "../../shell";
import { conversations, thread } from "@/lib/crm";
import Chat from "./reply";
import { Side } from "../side";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conversation | Kzoo Makers", robots: { index: false } };

export default async function Conversation({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id) || 0;
  return (
    <MembersShell title="Conversation" path={"/members/inbox/" + id}>
      {async (u) => {
        const [t, convos] = await Promise.all([thread(u.id, id), conversations(u.id)]);
        if (!t) notFound();
        const items = t.messages.map((m) => ({ id: m.id, mine: m.mine, name: t.name, body: m.body, at: String(m.at) }));
        return (
          <div className="ch-wrap">
            <Side convos={convos} current={id} hideSmall />
            <div style={{ minWidth: 0 }}>
              <p className="sub" style={{ margin: 0, padding: "8px 14px", background: "#fff" }}>{"← "}<a href="/members/inbox">Inbox</a></p>
              <Chat to={id} name={t.name} items={items} canReply={t.canReply} />
            </div>
          </div>
        );
      }}
    </MembersShell>
  );
}
