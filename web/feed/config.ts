import { db } from "@/lib/db";

// Feed settings (Admin > Services > Feed), stored in settings key "feed:config". Read on every feed request by middleware, so cached 30 s per process like the security headers.
export type FeedConfig = {
  enabled: boolean;
  signup: "invite" | "open" | "closed";
  invites: { who: "staff" | "members" | "members+trusted" | "everyone"; requests: boolean; perUserLimit: number; expiryDays: number; tree: boolean };
  membersAutoCreate: boolean;
  membersTrusted: boolean;
  newUserDays: number; minKarmaToFlag: number; minKarmaToSuggest: number; minKarmaToSubmit: number; minKarmaForInviteRequests: number;
};

// Off until launch (plan phase 7); trust constants are the small-community values from the plan, Lobsters' own are 70 / 50 / 10 / -4 / 50.
export const DEFAULTS: FeedConfig = {
  enabled: false, signup: "invite",
  invites: { who: "members+trusted", requests: false, perUserLimit: 5, expiryDays: 14, tree: true },
  membersAutoCreate: true, membersTrusted: true,
  newUserDays: 14, minKarmaToFlag: 10, minKarmaToSuggest: 10, minKarmaToSubmit: -4, minKarmaForInviteRequests: 10,
};

const pick = <T extends string>(v: unknown, ok: readonly T[], d: T): T => (ok.includes(v as T) ? (v as T) : d);
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const int = (v: unknown, d: number, lo: number, hi: number) => (Number.isInteger(v) ? Math.min(hi, Math.max(lo, v as number)) : d);

/** Anything stored or posted becomes a valid config: unknown keys dropped, bad values replaced by the default. */
export function normalize(x: unknown): FeedConfig {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, any>, i = (o.invites && typeof o.invites === "object" ? o.invites : {}) as Record<string, unknown>, D = DEFAULTS;
  return {
    enabled: bool(o.enabled, D.enabled),
    signup: pick(o.signup, ["invite", "open", "closed"], D.signup),
    invites: {
      who: pick(i.who, ["staff", "members", "members+trusted", "everyone"], D.invites.who), requests: bool(i.requests, D.invites.requests),
      perUserLimit: int(i.perUserLimit, D.invites.perUserLimit, 0, 100), expiryDays: int(i.expiryDays, D.invites.expiryDays, 1, 365), tree: bool(i.tree, D.invites.tree),
    },
    membersAutoCreate: bool(o.membersAutoCreate, D.membersAutoCreate), membersTrusted: bool(o.membersTrusted, D.membersTrusted),
    newUserDays: int(o.newUserDays, D.newUserDays, 0, 365), minKarmaToFlag: int(o.minKarmaToFlag, D.minKarmaToFlag, -100, 1000), minKarmaToSuggest: int(o.minKarmaToSuggest, D.minKarmaToSuggest, -100, 1000),
    minKarmaToSubmit: int(o.minKarmaToSubmit, D.minKarmaToSubmit, -100, 1000), minKarmaForInviteRequests: int(o.minKarmaForInviteRequests, D.minKarmaForInviteRequests, -100, 1000),
  };
}

const g = globalThis as unknown as { feedCfg?: { at: number; v: FeedConfig } };
const TTL = 30_000;

export async function getFeedConfig(): Promise<FeedConfig> {
  if (g.feedCfg && Date.now() - g.feedCfg.at < TTL) return g.feedCfg.v;
  let v = DEFAULTS;
  try {
    const d = db();
    if (d) { await d.ready; v = normalize((await d.pool.query("SELECT data FROM settings WHERE key = 'feed:config'")).rows[0]?.data); }
  } catch { /* database down: stay off */ }
  g.feedCfg = { at: Date.now(), v };
  return v;
}

export async function saveFeedConfig(x: unknown, who: string) {
  const v = normalize(x), d = db();
  if (!d) throw new Error("not configured");
  await d.ready;
  await d.pool.query(`INSERT INTO settings (key, data) VALUES ('feed:config', $1) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data`, [JSON.stringify(v)]);
  const { logAudit } = await import("@/lib/store");
  await logAudit(who, "feed.config", "edited feed settings", v);
  g.feedCfg = { at: Date.now(), v };
  return v;
}

/** The feed's own host. Local dev: FEED_DEV=1 makes every host the feed (never in production). */
export const FEED_HOST = (process.env.FEED_HOST ?? "talk.kzoomakers.org").toLowerCase();
export const isFeedHost = (host: string | null) =>
  (host ?? "").split(":")[0].toLowerCase() === FEED_HOST || (process.env.FEED_DEV === "1" && process.env.NODE_ENV !== "production");
/** Where the feed lives, for links in emails and the login handoff. Local dev sets FEED_ORIGIN (e.g. http://localhost:3000). */
export const feedOrigin = () => (process.env.FEED_ORIGIN ?? `https://${FEED_HOST}`).replace(/\/+$/, "");
/** The main site, where members and admins prove who they are. Fixed by configuration, never taken from a request. */
export const mainOrigin = () => (process.env.MAIN_ORIGIN ?? process.env.AUTH_URL ?? "https://kzoomakers.org").replace(/\/+$/, "");
