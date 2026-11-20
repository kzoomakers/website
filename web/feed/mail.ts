import { pushToUser } from "@/lib/pushover";
import { getMailCfg, mailReady, sendQueued } from "@/lib/mail";

/** Plain-text email from the site's configured sender. Never throws: a message that can't go out waits in the retry queue, and an unconfigured mailer only logs (the action that asked for it has already happened). */
export async function feedMail(to: string, subject: string, text: string, headers?: Record<string, string>): Promise<void> {
  try {
    const cfg = await getMailCfg();
    if (!mailReady(cfg)) { console.error("feed email not sent: mail is not set up"); return; }
    await sendQueued({ to, subject, text, headers }, cfg);
  } catch (e) { console.error("feed email failed:", e); }
}

export type Push = { key: string; title: string; message: string; click: string };
/** Pushover alert to one person's own key. Never throws. */
export const feedPush = (p: Push): Promise<void> => pushToUser(p.key, p);
