import { notFound, redirect } from "next/navigation";
import { currentFeedUser } from "../identity";
import { wearableHats, type WearableHat } from "../models/hats";
import { BODY_MAX, BODY_MIN, getMessage, listMessages, SUBJECT_MAX } from "../models/messages";
import { html } from "./comment";
import Shell from "./shell";
import { TimeLabel } from "./story-list";

// messages/index+show+_form+_subnav.
const viewer = async (path: string) => {
  const v = await currentFeedUser().catch(() => null);
  if (!v?.username) redirect(`/login?return=${path}`);
  return v;
};
const Subnav = () => <><li className="push-right"><a href="/inbox/all">Inbox</a></li><li><a href="/inbox/unread">Unread</a></li><li><a href="/messages">Messages</a></li><li><a href="/messages/sent">Sent</a></li><li><a href="/mod_mails">ModMail</a></li></>;

function Form({ csrf, mod, hats, to, subject, replying }: { csrf: string; mod: boolean; hats: WearableHat[]; to?: string; subject?: string; replying: boolean }) {
  return (
    <form method="post" action="/messages/action">
      <input type="hidden" name="csrf" value={csrf} /><input type="hidden" name="op" value="send" />
      <div className="labelled_grid">
        {replying ? <input type="hidden" name="to" value={to} /> : <><label htmlFor="to">To</label><input id="to" name="to" required autoCapitalize="off" autoCorrect="off" defaultValue={to} /></>}
        <label htmlFor="subject">Subject</label><input id="subject" name="subject" required maxLength={SUBJECT_MAX} defaultValue={subject} />
        <label htmlFor="body">Message</label><textarea id="body" name="body" required rows={5} minLength={BODY_MIN} maxLength={BODY_MAX} />
        {hats.length > 0 && <><label htmlFor="hat">Put on hat</label><select id="hat" name="hat"><option value="" />{hats.map((h) => <option key={h.short_id} value={h.short_id}>{h.hat}</option>)}</select></>}
        {mod && <><label htmlFor="mod_note" className="normal for_checkbox">ModNote 🔑</label><input id="mod_note" type="checkbox" name="mod_note" value="1" className="normal" /></>}
      </div>
      <input type="submit" value={replying ? "Reply" : "Send Message"} />
    </form>
  );
}

export async function MessagesIndex({ dir, to }: { dir: "in" | "out"; to?: string }) {
  const v = await viewer(dir === "in" ? "/messages" : "/messages/sent");
  const rows = await listMessages(v.id, dir);
  return (
    <Shell title={to ? "Send New Message" : dir === "in" ? "Messages" : "Messages Sent"} path={dir === "in" ? "/messages" : "/messages/sent"} subnav={<Subnav />}>
      <h1>{to ? "Send New Message" : dir === "in" ? "Messages" : "Messages Sent"}</h1>
      {rows.length ? (
        <form method="post" action="/messages/action">
          <input type="hidden" name="csrf" value={v.csrf} /><input type="hidden" name="op" value="batch_delete" />
          <table className="data zebra with_select_all" width="100%" cellSpacing={0}>
            <thead><tr><th style={{ width: "3%" }} /><th style={{ width: "15%" }}>{dir === "in" ? "From" : "To"}</th><th style={{ width: "17%" }}>{dir === "in" ? "Received" : "Sent"}</th><th style={{ width: "60%" }}>Subject</th></tr></thead>
            <tbody>
              {rows.map((m) => {
                const who = dir === "in" ? m.author : m.recipient;
                return (
                  <tr key={m.short_id} className={dir === "in" && m.unread ? "bold" : ""}>
                    <td><input type="checkbox" name="delete" value={m.short_id} aria-label={`Select ${m.subject}`} /></td>
                    <td><div style={{ whiteSpace: "nowrap" }}>{who ? <a href={`/~${who}`}>{who}</a> : "System"}{dir === "in" && m.hat && <> <span className={`hat hat_${m.hat.replace(/[^A-Za-z0-9]/g, "_").toLowerCase()}`}><span className="crown">{m.hat}</span></span></>}</div></td>
                    <td><TimeLabel time={m.created_at} loggedIn /></td>
                    <td><a href={`/messages/${m.short_id}`}>{m.subject}</a></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <input type="submit" value="Delete Selected" />
        </form>
      ) : <p>You do not have any {dir === "in" ? "" : "sent "}private messages.</p>}
      <p>Compose Message</p>
      <Form csrf={v.csrf} mod={v.isModerator} hats={await wearableHats(v.id)} to={to} replying={false} />
    </Shell>
  );
}

export async function MessageShow({ id }: { id: string }) {
  const v = await viewer(`/messages/${id}`);
  const m = await getMessage(v.id, id);
  if (!m) { redirect("/messages"); }
  const op = (name: string, label: string) => <form method="post" action="/messages/action"><input type="hidden" name="csrf" value={v.csrf} /><input type="hidden" name="op" value={name} /><input type="hidden" name="id" value={m.short_id} /><input type="submit" value={label} /></form>;
  return (
    <Shell title={m.subject} path={`/messages/${id}`} subnav={<Subnav />}>
      <h1>{m.subject}</h1>
      <h2>From {m.author ? <a href={`/~${m.author}`}>{m.author}</a> : "System"}{m.hat && <> <span className={`hat hat_${m.hat.replace(/[^A-Za-z0-9]/g, "_").toLowerCase()}`}><span className="crown">{m.hat}</span></span></>} to <a href={`/~${m.recipient}`}>{m.recipient}</a> <TimeLabel time={m.created_at} loggedIn /></h2>
      <div className="comment_text" dangerouslySetInnerHTML={html(m.html)} />
      <div className="row">{op("delete", "Delete Message")}{op("keep_as_new", "Keep As New")}{v.isModerator && op("mod_note", "ModNote")}</div>
      {m.replyTo ? <><p>Compose Reply To {m.replyTo}</p><Form csrf={v.csrf} mod={v.isModerator} hats={await wearableHats(v.id)} to={m.replyTo} subject={/^re:/i.test(m.subject) ? m.subject : `Re: ${m.subject}`} replying /></>
        : <p>For help with this message, contact <a href="/moderators">a moderator</a>.</p>}
    </Shell>
  );
}
