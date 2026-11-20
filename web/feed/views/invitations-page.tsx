import { redirect } from "next/navigation";
import { getFeedConfig } from "../config";
import { currentFeedUser } from "../identity";
import { inviteRights, MEMO_MAX, sentInvitations } from "../models/invitations";
import Shell from "./shell";
import { TimeLabel } from "./story-list";

/** The send form and the list of what you've sent (Lobsters keeps these in settings; there is no settings page yet). */
export default async function InvitationsPage() {
  const me = await currentFeedUser().catch(() => null);
  if (!me?.username) redirect("/login?return=/invitations");
  const [rights, sent, cfg] = await Promise.all([inviteRights(me.id), sentInvitations(me.id), getFeedConfig()]);
  return (
    <Shell title="Invitations" path="/invitations">
      <h1>Invitations</h1>
      <div className="box wide">
        {rights.ok ? (
          <form method="post" action="/invitations/send">
            <input type="hidden" name="csrf" value={me.csrf} />
            <div className="labelled_grid">
              <label htmlFor="email">Email</label><input id="email" name="email" type="email" required maxLength={100} autoComplete="off" autoCapitalize="off" />
              <label htmlFor="memo">Note</label><input id="memo" name="memo" maxLength={MEMO_MAX} autoComplete="off" placeholder="optional, included in the email" />
            </div>
            <p>{rights.staff ? "As a moderator you can send as many as you need." : `You can have ${rights.left} more waiting.`} Each invitation works once, only for this address, and expires after {cfg.invites.expiryDays} days.</p>
            <input type="submit" value="Send invitation" />
          </form>
        ) : <p>{rights.why}</p>}
      </div>
      {cfg.invites.requests && <p><a href="/invitations/requests">Requested invitations</a> from people who asked for one.</p>}
      <h2>Sent</h2>
      {sent.length === 0 ? <p>You haven't invited anyone yet.</p> : (
        <table className="data zebra" width="100%" cellSpacing={0}>
          <tbody>
            <tr><th>Sent</th><th>To</th><th>Note</th><th>Status</th></tr>
            {sent.map((i) => (
              <tr key={i.id}>
                <td><TimeLabel time={i.created_at} loggedIn /></td><td>{i.email}</td><td>{i.memo}</td>
                <td>{i.used_at ? (i.new_user ? <>Joined as <a href={`/~${i.new_user}`}>{i.new_user}</a></> : "Used") : i.expires_at.getTime() < Date.now() ? "Expired" : <>Waiting, expires <TimeLabel time={i.expires_at} loggedIn /></>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Shell>
  );
}
