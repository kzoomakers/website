import { notFound } from "next/navigation";
import { listModerations, moderatorNames, WHAT, type ModRow, type What } from "../models/moderations";
import { titlePath } from "./story-list";
import Shell from "./shell";
import { Divider } from "./story-list";
import { titleAsSlug } from "../util";

export const stamp = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");

export function Target({ m }: { m: ModRow }) {
  if (m.story_short_id) return <a href={titlePath({ short_id: m.story_short_id, title: m.story_title! })}>Story: {m.story_title}</a>;
  if (m.comment_short_id) return <a href={`/s/${m.comment_story_short_id}/${titleAsSlug(m.comment_story_title!)}#c_${m.comment_short_id}`}>Comment by {m.comment_user} on {m.comment_story_title}</a>;
  if (m.tag) return <a href={`/t/${m.tag}`}>Tag: {m.tag}</a>;
  if (m.category) return <a href={`/categories/${m.category}`}>Category: {m.category}</a>;
  if (m.user_id) return m.user ? <a href={`/~${m.user}`}>User {m.user}</a> : <>User {m.user_id} (Deleted)</>;
  if (m.domain) return <>Domain <a href={`/domains/${m.domain}`}>{m.domain}</a></>;
  if (m.origin) return <>Origin <a href={`/origins/${m.origin}`}>{m.origin}</a></>;
  return <>Unknown object moderated</>;
}

/** moderations/index.html.erb: the public mod log. The filter is a GET form, so pages are links with the same query. */
export default async function ModerationsPage({ moderator, what, page }: { moderator: string; what: What[]; page: number }) {
  const [{ rows, pages }, mods] = await Promise.all([listModerations(moderator, what, page), moderatorNames()]);
  if (page > 1 && page > pages) notFound();
  const shown = what.length ? what : WHAT;
  const q = (p: number) => `/moderations?${new URLSearchParams([["moderator", moderator], ...what.map((w) => [`what[${w}]`, w]), ["page", String(p)]])}`;
  return (
    <Shell title="Moderation Log" path="/moderations">
      <h1>Moderation Log</h1>
      <div className="box wide">
        <form method="get" action="/moderations">
          <label className="normal" htmlFor="moderator">Moderator</label>
          <select name="moderator" id="moderator" defaultValue={moderator}>{["(All)", "(Moderators)", "(Users)", ...mods].map((m) => <option key={m}>{m}</option>)}</select>
          {WHAT.map((w) => <span key={w}><input type="checkbox" name={`what[${w}]`} id={`what_${w}`} value={w} defaultChecked={shown.includes(w)} /> <label className="normal" htmlFor={`what_${w}`}>{w[0].toUpperCase() + w.slice(1)}</label> </span>)}
          <input type="submit" value="Filter" />
        </form><br />
        <table className="data zebra moderations" width="100%" cellSpacing={0}>
          <tbody>
            <tr><th>Date/Time</th><th>Moderator</th><th>Thing, Action, Reason</th></tr>
            {rows.map((m) => (
              <MRow key={m.id} m={m} />
            ))}
          </tbody>
        </table>
      </div>
      <nav className="morelink">
        {page > 1 && <a href={q(page - 1)} rel="prev">{`Page ${page - 1}`}</a>}
        {page < pages && <>{page > 1 && <Divider />}<a href={q(page + 1)} rel="next">{`Page ${page + 1}`}</a></>}
      </nav>
    </Shell>
  );
}

const MRow = ({ m }: { m: ModRow }) => (
  <>
    <tr className={`nobottom ${m.moderator ? "mod" : ""}`}>
      <td>{stamp(m.created_at)}</td>
      <td>{m.moderator ? <a href={`/~${m.moderator}`}>{m.moderator}</a> : m.is_from_suggestions ? <em>(Users)</em> : null}</td>
      <td><Target m={m} /></td>
    </tr>
    <tr className={m.reason ? "nobottom" : ""}><td colSpan={2} /><td className="wrap">Action: <em>{m.action}</em></td></tr>
    {m.reason && <tr><td colSpan={2} /><td>Reason: <em>{m.reason}</em></td></tr>}
  </>
);
