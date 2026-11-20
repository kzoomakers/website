import { notFound, redirect } from "next/navigation";
import { currentFeedUser } from "../identity";
import { activeHats, hatFor, listRequests } from "../models/hats";
import { html } from "./comment";
import Shell from "./shell";
import { TimeLabel } from "./story-list";

const viewer = async (path: string) => {
  const v = await currentFeedUser().catch(() => null);
  if (!v?.username) redirect(`/login?return=${path}`);
  return v;
};
const hatClass = (h: string) => `hat hat_${h.replace(/[^A-Za-z0-9]/g, "_").toLowerCase()}`;
const Hidden = ({ csrf, op, id }: { csrf: string; op: string; id?: string }) => <><input type="hidden" name="csrf" value={csrf} /><input type="hidden" name="op" value={op} />{id && <input type="hidden" name="id" value={id} />}</>;

/** hats/index: the active hats. Link text is shown to signed-in people only for non-URL links (an email address), as Lobsters does. */
export async function HatsIndex() {
  const me = await currentFeedUser().catch(() => null), hats = await activeHats();
  return (
    <Shell title="Hats" path="/hats">
      <h1>Hats</h1>
      <p>A hat is a formal, verified, way of posting a comment while speaking for a project, organization, or company. Each user may have multiple hats, one of which may be selected to be worn when posting a comment or sending a private message. Doffed hats are not listed in this table, check a user's profile page.</p>
      {me?.username && <h2><a href="/hat_requests/new">Request Hat</a></h2>}
      <table className="data zebra" width="100%" cellSpacing={0}>
        <thead><tr><th style={{ width: 130 }}>User</th><th>Hat</th><th>Link</th><th /></tr></thead>
        <tbody>
          {hats.map((h) => (
            <tr key={h.short_id}>
              <td><a href={`/~${h.username}`}>{h.username}</a></td>
              <td><span className={hatClass(h.hat)}><span className="crown">{h.hat}</span></span></td>
              <td>{!h.link ? <span className="na">None</span> : /^https?:\/\//.test(h.link) ? <a href={h.link} rel="ugc nofollow">{h.link}</a> : me?.username ? h.link : h.link.includes("@") ? h.link.split("@").pop() : h.link}</td>
              <td>{me?.isModerator && <a href={`/hats/${h.short_id}/edit`}>Edit</a>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Shell>
  );
}

export async function HatDoff({ id }: { id: string }) {
  const v = await viewer(`/hats/${id}/doff`), h = await hatFor(v.id, v.isModerator, id);
  if (!h) notFound();
  return (
    <Shell title="Doffing a Hat" path={`/hats/${id}/doff`}>
      <h1>Doffing a Hat</h1>
      <form method="post" action="/hats/action">
        <Hidden csrf={v.csrf} op="doff" id={id} />
        <div className="labelled_grid">
          <label>User</label><a href={`/~${h.username}`}>{h.username}</a>
          <label>Hat</label><span className={hatClass(h.hat)}><span className="crown">{h.hat}</span></span>
          <label htmlFor="reason">Reason</label><span><input id="reason" name="reason" required maxLength={1000} /><span className="hint"> Short public explanation, like "Left project"</span></span>
        </div>
        <input type="submit" value="Doff Hat" />
      </form>
    </Shell>
  );
}

export async function HatEdit({ id }: { id: string }) {
  const v = await viewer(`/hats/${id}/edit`);
  if (!v.isModerator) notFound();
  const h = await hatFor(v.id, true, id);
  if (!h) notFound();
  return (
    <Shell title="Edit a Hat" path={`/hats/${id}/edit`}>
      <h1>Edit a Hat</h1>
      <form method="post" action="/hats/action">
        <Hidden csrf={v.csrf} op="update" id={id} />
        <div className="labelled_grid">
          <label>User</label><a href={`/~${h.username}`}>{h.username}</a>
          <label htmlFor="hat">Hat</label><input id="hat" name="hat" required maxLength={255} defaultValue={h.hat} />
          <label htmlFor="link">Link</label><input id="link" name="link" maxLength={255} defaultValue={h.link} />
        </div>
        <div className="row"><input type="submit" value="Edit In-Place" /> <input type="submit" name="recreate" value="Doff & Create" formAction="/hats/action?recreate=1" /></div>
      </form>
    </Shell>
  );
}

export async function HatRequestNew() {
  const v = await viewer("/hat_requests/new");
  return (
    <Shell title="Request a Hat" path="/hat_requests/new">
      <h1>Request a Hat</h1>
      <p>A hat is a formal, verified way of speaking officially for a project, organization, or company. A user can have more than one hat, but only wear one at a time on a comment or private message.</p>
      <p>Hats are for making public statements, not commemorating contributions to a project or jobs held. Please request one only if you'll be acting officially here, like if you're a core project developer or company employee authorized to post on behalf of your organization.</p>
      <p>Provide a short description of the hat (e.g., "OpenBSD Developer"), a public link shown when hovering over the hat (such as your e-mail address at that project or company, or a company page showing your employment), and private comments that only moderators see during approval.</p>
      <form method="post" action="/hat_requests/action">
        <Hidden csrf={v.csrf} op="create" />
        <div className="labelled_grid">
          <label htmlFor="hat">Hat</label><input id="hat" name="hat" required maxLength={255} placeholder="XYZ Project Member" />
          <label htmlFor="link">Link</label><input id="link" name="link" required maxLength={255} autoCapitalize="off" placeholder="user@project.org, or a URL to an employment page" />
          <label htmlFor="comment">Comment</label><textarea id="comment" name="comment" required rows={5} placeholder="Will only be shown to moderators during approval." />
        </div>
        <input type="submit" value="Request Hat" />
      </form>
    </Shell>
  );
}

export async function HatRequests() {
  const v = await viewer("/hat_requests");
  if (!v.isModerator) notFound();
  const rs = await listRequests();
  return (
    <Shell title="Hat Requests" path="/hat_requests">
      <h1>Hat Requests</h1>
      {rs.length === 0 && <p>No hat requests.</p>}
      {rs.map((r, i) => (
        <div key={r.id}>
          {i > 0 && <hr />}
          <form method="post" action="/hat_requests/action">
            <Hidden csrf={v.csrf} op="approve" id={String(r.id)} />
            <div className="labelled_grid">
              <label>User</label><span><a href={`/~${r.username}`}>{r.username}</a> <TimeLabel time={r.created_at} loggedIn /></span>
              <label htmlFor={`hat${r.id}`}>Hat</label><input id={`hat${r.id}`} name="hat" required maxLength={255} defaultValue={r.hat} />
              <label htmlFor={`link${r.id}`}>Link</label><input id={`link${r.id}`} name="link" required maxLength={255} autoCapitalize="off" defaultValue={r.link} />
              {/^https?:\/\//.test(r.link) && <><label>Open</label><a href={r.link} rel="ugc nofollow">{r.link}</a></>}
              <label>Comment</label><div className="shorten_first_p" dangerouslySetInnerHTML={html(r.comment_html)} />
              <label htmlFor={`reason${r.id}`}>Reason</label><textarea id={`reason${r.id}`} name="reason" required />
            </div>
            <div className="row"><input type="submit" value="Approve Hat Request" /> <input type="submit" name="reject" value="Reject Hat Request" className="deletion" formAction="/hat_requests/action?reject=1" /></div>
          </form>
        </div>
      ))}
    </Shell>
  );
}
