import { notFound, redirect } from "next/navigation";
import { currentFeedUser } from "../identity";
import { reparentTarget, REPARENT_REASON_MAX } from "../models/mod-reparent";
import Shell from "./shell";

/** mod/reparents/new.html.erb: /mod/reparents/new?id=username. Admins only. */
export default async function ReparentPage({ id }: { id: string }) {
  const path = `/mod/reparents/new?id=${encodeURIComponent(id)}`;
  const me = await currentFeedUser().catch(() => null);
  if (!me?.username) redirect(`/login?return=${encodeURIComponent(path)}`);
  if (!me.isAdmin) notFound();
  const t = await reparentTarget(id);
  if (!t) notFound();
  return (
    <Shell title={`Reparent ${t.username}`} path="/mod/reparents/new">
      <h1>Reparent {t.username}</h1>
      <form method="post" action="/mod/reparents">
        <input type="hidden" name="csrf" value={me.csrf} /><input type="hidden" name="id" value={t.username} />
        <p>This will reparent {t.username}{t.inviter && <> (now invited by <a href={`/~${t.inviter}`}>{t.inviter}</a>)</>} to you in the invite tree, create a mod note on the user with their old inviter, and put an entry in the moderation log with the given reason.</p>
        <p>This should be used rarely because it makes it harder to investigate sockpuppets and voting rings. Currently the only known purpose is if this user was abused off-site by their inviter and we can't really do anything about it here except try to disassociate them. Write a good reason here, it's going to get attention by virtue of being rare.</p>
        <div className="boxline"><label htmlFor="reason">Reason</label> <input id="reason" name="reason" required size={80} maxLength={REPARENT_REASON_MAX} /></div>
        <input type="submit" value="Reparent" />
      </form>
    </Shell>
  );
}
