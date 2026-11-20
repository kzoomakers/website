import { notFound, redirect } from "next/navigation";
import { getFeedConfig } from "../config";
import { currentFeedUser } from "../identity";
import { listRequests, requestsAccess } from "../models/invitations";
import Shell from "./shell";
import { TimeLabel } from "./story-list";

/** invitations/build.html.erb: the public form. `done` and `confirmed` come from the redirects that follow a request and its email link. */
export async function RequestPage({ done, confirmed, error }: { done?: boolean; confirmed?: boolean; error?: string }) {
  const cfg = await getFeedConfig();
  if (!cfg.invites.requests) redirect("/login");
  return (
    <Shell title="Request an Invitation" path="/invitations/request">
      <h1>Request an Invitation</h1>
      {confirmed && <div className="flash-notice" role="status">Your invitation request has been confirmed and will now be shown to other logged-in users.</div>}
      {done && <div className="flash-notice" role="status">If that address can be invited, we've emailed it a link to confirm your request.</div>}
      {error && <div className="flash-error" role="alert">{error}</div>}
      <p>If you don't know (or can't find) an existing person to ask for an invitation, you can make a public request. This will show your name and URL to other logged-in people who can then send you an invitation if they recognize you.</p>
      <p>Your email address must be valid and confirmed by visiting a link we email you before your request is shown. It is not shown to other users (except moderators).</p>
      <form method="post" action="/invitations/create_by_request">
        <div className="labelled_grid">
          <label htmlFor="name">Name (not username)</label><input id="name" name="name" required maxLength={255} />
          <label htmlFor="email">Email address</label><input id="email" name="email" type="email" required maxLength={100} autoCapitalize="off" />
          <label htmlFor="memo">URL</label><div><input id="memo" name="memo" type="url" required maxLength={255} autoCapitalize="off" /><span className="hint"> A page that shows who you are (a personal site, a GitHub profile...)</span></div>
        </div>
        <input type="submit" value="Request Invitation" />
      </form>
    </Shell>
  );
}

/** invitations/index.html.erb: the confirmed requests, for people who may invite. */
export async function RequestQueue() {
  const me = await currentFeedUser().catch(() => null);
  if (!me?.username) redirect("/login?return=/invitations/requests");
  const access = await requestsAccess(me.id);
  if (!access.ok) notFound();
  const rows = await listRequests();
  const act = (code: string, what: "send" | "delete") => (
    <form method="post" action="/invitations/requests/act"><input type="hidden" name="csrf" value={me.csrf} /><input type="hidden" name="code" value={code} /><input type="hidden" name="do" value={what} /><input type="submit" value={what === "send" ? "Send Invitation" : "Delete"} /></form>
  );
  return (
    <Shell title="Requested Invitations" path="/invitations/requests">
      <h1>Requested Invitations</h1>
      <p>These people asked for an invitation and confirmed their email address. If you recognize someone, send them one. If a request looks suspicious, delete it.</p>
      <table className="data zebra" width="100%" cellSpacing={0}>
        <tbody>
          <tr><th>Date/Time</th><th>Name</th><th>URL</th><th /><th /></tr>
          {rows.map((r) => (
            <tr key={r.id}>
              <td><TimeLabel time={r.created_at} /></td>
              <td>{r.name}{access.moderator && <><br /><em>{r.email}</em></>}</td>
              <td>{r.memo && /^https?:\/\//i.test(r.memo) ? <a href={r.memo} rel="nofollow ugc noreferrer" target="_blank">{r.memo}</a> : r.memo}</td>
              <td>{act(r.code, "send")}</td><td>{act(r.code, "delete")}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={5} align="center"><span className="na">No invitation requests</span></td></tr>}
        </tbody>
      </table>
    </Shell>
  );
}
