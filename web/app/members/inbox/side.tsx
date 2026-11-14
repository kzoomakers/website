import { CHAT_CSS } from "@/components/chat";
import type { Conversation } from "@/lib/crm";
import { ago } from "../../admin/webmaster/ago";

const ini = (n: string) => (n.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("") || "?").toUpperCase();

/** Dark list of conversations on the left, used only in the members inbox. `hideSmall` hides it on phones while a chat is open. */
export function Side({ convos, current, hideSmall }: { convos: Conversation[]; current?: number; hideSmall?: boolean }) {
  return (
    <aside className={`ch-side${hideSmall ? " hide-sm" : ""}`}>
      <style>{CHAT_CSS}</style>
      <h2>Conversations</h2>
      {!convos.length && <p style={{ color: "#9aa4ae", padding: 16, margin: 0 }}>No conversations yet.</p>}
      {convos.map((c) => (
        <a key={c.id} href={`/members/inbox/${c.id}`} className={`ch-th${c.id === current ? " on" : ""}`}>
          <span className="ch-av" aria-hidden>{ini(c.name)}</span>
          <b>{c.name}</b>{c.unread > 0 ? <i>{c.unread} new</i> : <i style={{ background: "none", color: "#9aa4ae" }}>{ago(c.at)}</i>}
          <small>{c.mine ? "You: " : ""}{c.body.slice(0, 80)}</small>
        </a>
      ))}
    </aside>
  );
}
