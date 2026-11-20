import { notFound } from "next/navigation";
import { getFeedConfig } from "../config";
import { listUsers, type ListedUser } from "../models/user-list";
import Shell from "./shell";

const karma = (u: ListedUser) => (u.is_admin ? "(administrator)" : u.is_moderator ? "(moderator)" : `(${u.karma})`);
const UserLink = ({ u, days }: { u: ListedUser; days: number }) => {
  const isNew = !u.created_at || u.created_at.getTime() > Date.now() - days * 864e5, inactive = !!(u.banned_at || u.deleted_at);
  const cls = [inactive && "inactive_user", isNew && "new_user"].filter(Boolean).join(" ");
  return <a id={u.username} className={cls || undefined} aria-label={isNew ? `${u.username} - New user` : inactive ? `${u.username} - Inactive user` : undefined} href={`/~${u.username}`}>{u.username}</a>;
};

/** One branch per person, their invitees beneath. Roots are people nobody (still listed) invited. Recursion depth is the invite chain, which is short. */
function Branch({ u, kids, days }: { u: ListedUser; kids: Map<number | null, ListedUser[]>; days: number }) {
  const sub = kids.get(u.id);
  return (
    <li className={u.invited_by_user_id ? "" : "noparent"}>
      <UserLink u={u} days={days} /> {karma(u)}
      {sub && <ul className="user_tree">{sub.map((k) => <Branch key={k.id} u={k} kids={kids} days={days} />)}</ul>}
    </li>
  );
}

export default async function UsersPage({ which }: { which: "tree" | "karma" | "moderators" }) {
  const cfg = await getFeedConfig();
  if (which !== "moderators" && !cfg.invites.tree) notFound(); // the admin can keep the member list private
  const users = await listUsers(which);
  const title = which === "karma" ? "Users By Karma" : which === "moderators" ? "Moderators and Administrators" : "Users";
  const path = which === "moderators" ? "/moderators" : which === "karma" ? "/users?by=karma" : "/users";
  if (which !== "tree") {
    return (
      <Shell title={title} path={path}>
        <div className="box wide">
          <p><strong>{title} ({users.length})</strong></p>
          <ul className="user_tree">{users.map((u) => <li key={u.id}><UserLink u={u} days={cfg.newUserDays} /> {karma(u)}</li>)}</ul>
        </div>
      </Shell>
    );
  }
  const ids = new Set(users.map((u) => u.id)), kids = new Map<number | null, ListedUser[]>();
  for (const u of [...users].reverse()) { // oldest first within each branch
    const parent = u.invited_by_user_id && ids.has(u.invited_by_user_id) ? u.invited_by_user_id : null;
    kids.set(parent, [...(kids.get(parent) ?? []), u]);
  }
  return (
    <Shell title={title} path={path}>
      <div className="box wide">
        <h1>{title} ({users.length.toLocaleString("en-US")})</h1>
        <p>Newest users: {users.slice(0, 10).map((u, i, a) => <span key={u.id}><UserLink u={u} days={cfg.newUserDays} /> {karma(u)}{i < a.length - 1 && ", "}</span>)}</p>
        <p><a href="/users?by=karma">By karma</a></p>
        <ul className="tree user_tree noparent">{(kids.get(null) ?? []).map((u) => <Branch key={u.id} u={u} kids={kids} days={cfg.newUserDays} />)}</ul>
      </div>
    </Shell>
  );
}
