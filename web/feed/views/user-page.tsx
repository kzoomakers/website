import { getFeedConfig } from "../config";
import type { Profile } from "../models/users";
import { currentFeedUser } from "../identity";
import { notesFor } from "../models/mod-notes";
import { html } from "./comment";
import Shell from "./shell";
import { zoned } from "../util";
import { TimeLabel } from "./story-list";

/** users/show.html.erb for a visitor. Avatars come later (no third-party Gravatar); markdown for "about" arrives with the write path, so it is shown as plain text for now. */
export default async function UserPage({ u }: { u: Profile }) {
  const [cfg, me] = await Promise.all([getFeedConfig(), currentFeedUser().catch(() => null)]);
  const notes = me?.isModerator ? await notesFor(u.id) : [];
  const active = !u.deleted_at && !u.banned_at, isNew = !u.created_at || u.created_at.getTime() > Date.now() - cfg.newUserDays * 864e5;
  const canSubmit = u.karma >= cfg.minKarmaToSubmit, canInvite = !isNew && !u.disabled_invite_at && canSubmit;
  const shown = u.stories_submitted - u.stories_deleted;
  return (
    <Shell title={u.username} path={`/~${u.username}`}>
      <h1 className={!active ? "inactive_user" : isNew ? "new_user" : ""}>{u.username}</h1>
      <section className="profile">
        <dl className="labelled_grid">
          <dt>Status</dt>
          <dd>{u.banned_at ? "Banned by a moderator" : u.deleted_at ? "User deactivated own account" : <>Active {u.is_admin ? "administrator" : u.is_moderator ? "moderator" : "user"}{!canInvite && ` with invites${!canSubmit ? " and story submissions" : ""} disabled`}</>}</dd>
          <dt>Joined</dt>
          <dd>{u.created_at && <TimeLabel time={u.created_at} />}{u.invited_by && <> by <a href={`/users#${u.username}`}>invitation</a> from <a href={`/~${u.invited_by}`}>{u.invited_by}</a></>}</dd>
          {u.banned_at && <><dt>Banned</dt><dd><TimeLabel time={u.banned_at} />{u.banned_by && <> by <a href={`/~${u.banned_by}`}>{u.banned_by}</a>: <em>{u.banned_reason}</em></>}</dd></>}
          {u.deleted_at && <><dt>Deactivated</dt><dd><TimeLabel time={u.deleted_at} /></dd></>}
          {!u.is_admin && <><dt>Karma</dt><dd>{u.karma}</dd></>}
          <dt>Stories Submitted</dt>
          <dd><a href={`/~${u.username}/stories`}>{shown}</a>{u.common_tag && <>, most commonly tagged <a aria-label={`Tag ${u.common_tag.tag}`} className={`tag tag_${u.common_tag.tag}${u.common_tag.is_media ? " tag_is_media" : ""}`} title={u.common_tag.description ?? undefined} href={`/t/${u.common_tag.tag}`}>{u.common_tag.tag}</a></>}</dd>
          <dt>Comments Posted</dt>
          <dd><a href={`/~${u.username}/threads`}>{u.comments_posted}</a></dd>
          {u.hats.length > 0 && <><dt>Hats</dt><dd><ul className="hats">{u.hats.map((h, i) => (
            <li key={i}><span className={`hat hat_${h.hat.replace(/[^A-Za-z0-9]/g, "_").toLowerCase()}`} title={`Granted ${zoned(h.created_at).date}${h.link && !/^https?:\/\//.test(h.link) ? ` - ${h.link}` : ""}`}><span className="crown">{h.link && /^https?:\/\//.test(h.link) ? <a href={h.link} target="_blank" rel="noopener">{h.hat}</a> : h.hat}</span></span>{h.doffed_at ? <> doffed <TimeLabel time={h.doffed_at} /></> : me && (me.id === u.id || me.isModerator) && <> <a href={`/hats/${h.short_id}/doff`}>Doff</a></>}</li>
          ))}</ul></dd></>}
          {active && <><dt>About</dt><dd className="shorten_first_p">{u.about ? u.about.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>) : <span className="na">A mystery...</span>}</dd></>}
        </dl>
      </section>
      {me?.isModerator && (
        <section className="profile">
          <label>Mod Notes</label>
          {notes.length > 0 && (
            <table className="data zebra tall" width="100%" cellSpacing={0}>
              <tbody>
                <tr><th>Mod</th><th>Note</th></tr>
                {notes.map((n) => <tr key={n.id} className="nobottom"><td>{n.moderator ?? "(automatic)"}<br /><TimeLabel time={n.created_at} /></td><td dangerouslySetInnerHTML={html(n.markeddown_note)} /></tr>)}
              </tbody>
            </table>
          )}
          <form method="post" action="/mod/note">
            <input type="hidden" name="csrf" value={me.csrf} /><input type="hidden" name="username" value={u.username} />
            <div className="labelled_grid"><label htmlFor="note">New Note</label><textarea id="note" name="note" required rows={5} maxLength={65535} /></div>
            <input type="submit" value="ModNote" />
          </form>
        </section>
      )}
      {me?.isModerator && active && (
        <form method="post" action={`/~${u.username}/${u.disabled_invite_at ? "enable" : "disable"}_invitation`} className="story_mod_tools">
          <input type="hidden" name="csrf" value={me.csrf} />
          {!u.disabled_invite_at && <><input name="reason" required maxLength={200} placeholder="reason" aria-label="Reason invitations are disabled" />{" "}</>}
          <button type="submit">{u.disabled_invite_at ? "Enable invitations" : "Disable invitations"}</button>
        </form>
      )}
      {me?.username && me.id !== u.id && <p><a href={`/messages?to=${encodeURIComponent(u.username)}`}>Send a message</a></p>}
      {me?.isAdmin && me.id !== u.id && u.invited_by && <p><a href={`/mod/reparents/new?id=${encodeURIComponent(u.username)}`}>Reparent</a></p>}
      {me?.isModerator && me.id !== u.id && !u.is_moderator && (
        <form method="post" action={`/~${u.username}/${u.banned_at ? "unban" : "ban"}`} className="story_mod_tools">
          <input type="hidden" name="csrf" value={me.csrf} />
          <input name="reason" required={!u.banned_at} maxLength={256} placeholder="reason" aria-label="Reason for the mod log" />{" "}
          <button type="submit">{u.banned_at ? "Unban user" : "Ban user"}</button>
        </form>
      )}
    </Shell>
  );
}
