import { getFeedConfig } from "../config";
import type { Profile } from "../models/users";
import Shell from "./shell";
import { TimeLabel } from "./story-list";

/** users/show.html.erb for a visitor. Avatars come later (no third-party Gravatar); markdown for "about" arrives with the write path, so it is shown as plain text for now. */
export default async function UserPage({ u }: { u: Profile }) {
  const cfg = await getFeedConfig();
  const active = !u.deleted_at && !u.banned_at, isNew = !u.created_at || u.created_at.getTime() > Date.now() - cfg.newUserDays * 864e5;
  const canSubmit = u.karma >= cfg.minKarmaToSubmit, canInvite = !isNew && !u.disabled_invite_at && canSubmit;
  const shown = u.stories_submitted - u.stories_deleted;
  return (
    <Shell title={u.username} path={`/~${u.username}`}>
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
            <li key={i}><span className={`hat hat_${h.hat.replace(/[^A-Za-z0-9]/g, "_").toLowerCase()}`}><span className="crown">{h.link && /^https?:\/\//.test(h.link) ? <a href={h.link} target="_blank" rel="noopener">{h.hat}</a> : h.hat}</span></span>{h.doffed_at && <> doffed <TimeLabel time={h.doffed_at} /></>}</li>
          ))}</ul></dd></>}
          {active && <><dt>About</dt><dd className="shorten_first_p">{u.about ? u.about.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>) : <span className="na">A mystery...</span>}</dd></>}
        </dl>
      </section>
    </Shell>
  );
}
