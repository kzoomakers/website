import type { Design } from "@/lib/mail-render";

export async function rpc<T = any>(op: string, args: object = {}): Promise<T> {
  const r = await fetch("/api/mailer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op, ...args }) });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
export type List = { id: number; name: string; description: string; created_at: string; subscribed: number; unconfirmed: number; unsubscribed: number };
export type Cfg = {
  fromName: string; from: string; replyTo: string; siteUrl: string; aiModel: string; doubleOptIn: boolean; confirmSubject: string; confirmBody: string;
  welcomeOn: boolean; welcomeSubject: string; welcomeBody: string; perMinute: number; perDay: number; trackOpens: boolean; trackClicks: boolean; webhookKey: string;
  smtp2goKey: string; smtpUrl: string; deepseekKey: string; isSet: Record<string, boolean>; mail: boolean; ai: boolean;
};
export type State = { lists: List[]; tags: string[]; templates: { id: number; name: string; design: Design }[]; cfg: Cfg };
export type Camp = { id?: number; name: string; subject: string; preview: string; design: Design; list_ids: number[]; sender_name?: string; sender_address?: string; reply_to?: string; status?: string; tags?: string[] };

export const when = (d?: string | null) => (d ? new Date(d).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "");
export const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) + "%" : "–");
