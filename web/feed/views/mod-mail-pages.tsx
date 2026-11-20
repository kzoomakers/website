import { notFound, redirect } from "next/navigation";
import { currentFeedUser } from "../identity";
import { getModMail, listModMails, MESSAGE_MAX, SUBJECT_MAX } from "../models/mod-mail";
import { html } from "./comment";
import Shell from "./shell";
import { TimeLabel, titlePath } from "./story-list";

// mod_mails/index+show and mod/mails/index+show+new+edit, with mod_mail_messages' form. Moderators use the /mod/mails URLs and see everything; recipients use /mod_mails.
const viewer = async (path: string) => {
  const v = await currentFeedUser().catch(() => null);
  if (!v?.username) redirect(`/login?return=${path}`);
  return v;
};
const base = (mod: boolean) => (mod ? "/mod/mails" : "/mod_mails");

export async function ModMailIndex({ mod }: { mod: boolean }) {
  const v = await viewer(base(mod));
  if (mod && !v.isModerator) notFound();
  const mails = await listModMails(v);
  return (
    <Shell title="ModMail" path={base(mod)}>
      <h1>{mod ? "Mod Mailbox" : "ModMail"}</h1>
      {mails.length === 0 && <p>Nothing here yet.</p>}
      <ul id="mod_mails">
        {mails.map((m) => <li key={m.short_id}><a href={`${base(mod)}/${m.short_id}`}>{m.subject}</a>{m.unread > 0 && <> <strong>({m.unread} new)</strong></>} <span className="hint">with {m.recipients.join(", ")}, <TimeLabel time={m.updated_at} loggedIn /></span></li>)}
      </ul>
      {mod && <p><a href="/mod/mails/new">New ModMail</a></p>}
    </Shell>
  );
}

export async function ModMailShow({ mod, id }: { mod: boolean; id: string }) {
  const v = await viewer(`${base(mod)}/${id}`);
  if (mod && !v.isModerator) notFound();
  if (!mod && v.isModerator) redirect(`/mod/mails/${id}`); // mod_mails#show sends moderators to their own view
  const m = await getModMail(id, v);
  if (!m) notFound();
  return (
    <Shell title={m.subject} path={`${base(mod)}/${id}`}>
      <div id={`mod_mail_${m.short_id}`}>
        <p><strong>Subject:</strong> {m.subject}</p>
        {(m.commentRefs.length > 0 || m.storyRefs.length > 0) && (
          <><p><strong>References:</strong></p><ul>
            {m.commentRefs.map((c) => <li key={c.short_id}><a href={`/s/${c.story_short_id}#c_${c.short_id}`}>Comment by {c.user} on {c.story_title}</a></li>)}
            {m.storyRefs.map((s) => <li key={s.short_id}><a href={titlePath(s)}>Story ({s.title}) submitted by {s.user}</a></li>)}
          </ul></>
        )}
        <p><strong>Recipients:</strong> {m.recipients.map((r) => <span key={r}><a href={`/~${r}`}>{r}</a>{" "}</span>)}</p>
        <section>
          {m.messages.map((x) => (
            <div key={x.id}>
              <hr />
              <div className="message" id={`mod_mail_message_${x.id}`}><div className="details">
                <div className="byline"><a href={`/~${x.username}`}>{x.username}</a> <TimeLabel time={x.created_at} loggedIn /></div>
                <div className="message-body" dangerouslySetInnerHTML={html(x.html)} />
              </div></div>
            </div>
          ))}
          <h3>Compose Message</h3>
          <form method="post" action="/mod_mails/post-message">
            <input type="hidden" name="csrf" value={v.csrf} /><input type="hidden" name="id" value={m.short_id} />
            <div className="labelled_grid"><label htmlFor="message" style={{ display: "block" }}>Message</label><textarea id="message" name="message" rows={5} required minLength={20} maxLength={MESSAGE_MAX} /></div>
            <input type="submit" value="Send Message" />
          </form>
        </section>
      </div>
      <p>{mod && <><a href={`/mod/mails/${m.short_id}/edit`}>Edit this ModMail</a> | </>}<a href={base(mod)}>Back to {mod ? "ModMailbox" : "ModMail"}</a></p>
    </Shell>
  );
}

/** mod/mails new and edit: subject, references and recipients, as space-separated names and short ids. */
export async function ModMailForm({ id }: { id?: string }) {
  const v = await viewer(id ? `/mod/mails/${id}/edit` : "/mod/mails/new");
  if (!v.isModerator) notFound();
  const m = id ? await getModMail(id, v) : null;
  if (id && !m) notFound();
  return (
    <Shell title={id ? "Edit mod mail" : "New mod mail"} path={id ? `/mod/mails/${id}/edit` : "/mod/mails/new"}>
      <h1>{id ? "Edit mod mail" : "New mod mail"}</h1>
      <form method="post" action="/mod/mails/save">
        <input type="hidden" name="csrf" value={v.csrf} />{id && <input type="hidden" name="id" value={id} />}
        <div className="labelled_grid">
          <label htmlFor="subject">Subject</label><input id="subject" name="subject" required maxLength={SUBJECT_MAX} defaultValue={m?.subject} />
          <label htmlFor="comment_refs">Comment short ids</label><input id="comment_refs" name="comment_refs" defaultValue={m?.commentRefs.map((c) => c.short_id).join(" ")} />
          <label htmlFor="story_refs">Story short ids</label><input id="story_refs" name="story_refs" defaultValue={m?.storyRefs.map((s) => s.short_id).join(" ")} />
          <label htmlFor="recipients">To</label><input id="recipients" name="recipients" required autoCapitalize="off" defaultValue={m?.recipients.join(" ")} />
        </div>
        <input type="submit" value={id ? "Update mod mail" : "Create mod mail"} />
      </form>
      <p><a href="/mod/mails">Back to mod mails</a></p>
    </Shell>
  );
}
