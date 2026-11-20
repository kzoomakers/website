import { COMMENT_REASONS, STORY_REASONS } from "../models/vote";

// Plain POST forms for the actions in routes /stories/:id/:action and /c/:id/:action. No JavaScript: each posts, the route redirects back. The server checks every rule again.
export type Me = { id: number; csrf: string; isModerator: boolean };

export function ActionForm({ path, me, label, children, className }: { path: string; me: Me; label: string; children?: React.ReactNode; className?: string }) {
  return <form method="post" action={path} style={{ display: "inline" }}><input type="hidden" name="csrf" value={me.csrf} />{children}<button type="submit" className={className}>{label}</button></form>;
}

/** The score arrow: a button that upvotes, or takes your vote back when you already upvoted. Your own posts show a plain number. */
export function Upvoter({ base, me, voted, score, own }: { base: string; me: Me | null; voted: boolean; score: number | string; own: boolean }) {
  if (!me) return <a className="upvoter" href="/login">{score}</a>;
  if (own) return <span className="upvoter" style={{ pointerEvents: "none" }}>{score}</span>;
  return <ActionForm path={`${base}/${voted ? "unvote" : "upvote"}`} me={me} label={String(score)} className="upvoter" />;
}

/** Flag (with a reason) or take your flag back. */
export function Flagger({ base, me, kind, flagged }: { base: string; me: Me; kind: "story" | "comment"; flagged: boolean }) {
  if (flagged) return <ActionForm path={`${base}/unvote`} me={me} label="unflag" />;
  const reasons = Object.entries(kind === "story" ? STORY_REASONS : COMMENT_REASONS);
  return (
    <ActionForm path={`${base}/flag`} me={me} label="flag">
      <select name="reason" aria-label="Flag reason" required defaultValue="">{[<option key="" value="" disabled>reason</option>, ...reasons.map(([k, v]) => <option key={k} value={k}>{v}</option>)]}</select>{" "}
    </ActionForm>
  );
}

/** Moderator delete (with a reason) or undelete. */
export function ModDelete({ base, me, deleted }: { base: string; me: Me; deleted: boolean }) {
  if (deleted) return <ActionForm path={`${base}/mod-undelete`} me={me} label="mod undelete" />;
  return <ActionForm path={`${base}/mod-delete`} me={me} label="mod delete"><input name="reason" maxLength={200} placeholder="reason" aria-label="Moderation reason" />{" "}</ActionForm>;
}
