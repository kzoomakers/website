import type { ReactNode } from "react";
import { takeError } from "../flash";
import { currentFeedUser } from "../identity";
import { Account } from "./auth";
import { Icon } from "./icons";
import { Nav } from "./nav";

export const SITE_NAME = "Kzoo Makers Talk";

async function Notice() {
  const me = await currentFeedUser().catch(() => null), msg = me ? takeError(me.id) : null;
  return msg ? <div className={msg.ok ? "flash-notice" : "flash-error"} role={msg.ok ? "status" : "alert"}>{msg.msg}</div> : null;
}

/** The color scheme and contrast stylesheet for the signed-in person's choices (system-system for everyone else). */
async function Theme() {
  const me = await currentFeedUser().catch(() => null), ok = (v: string | undefined, all: string[], d = "system") => (v && all.includes(v) ? v : d);
  return <link rel="stylesheet" href={`/feed/css/${ok(me?.prefs.scheme, ["system", "light", "dark"], "dark")}-${ok(me?.prefs.contrast, ["system", "normal", "high"])}.css`} precedence="feed" />;
}

export default function Shell({ title, path, subnav, children }: { title?: string; path: string; subnav?: ReactNode; children: ReactNode }) {
  return (
    <>
      <title>{title ? `${title} | ${SITE_NAME}` : SITE_NAME}</title>
      <meta name="theme-color" content="#AC130D" />
      <meta name="robots" content="noai, noimageai" />
      <link rel="stylesheet" href="/feed/css/application.css" precedence="feed" />
      <link rel="stylesheet" href="/feed/css/talk.css" precedence="feed-late" />
      <Theme />
      <script type="module" src="/feed/js/application.js" async />
      <header id="header">
        <div id="header-top">
          <h1 id="logo"><a href="/" title={SITE_NAME}><svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f0abfc" /><stop offset="1" stopColor="#818cf8" /></linearGradient></defs><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" fill="url(#lg)" /></svg><span>Makertalk</span></a></h1>
          <input type="checkbox" id="nav_toggle" className="nav_toggle" aria-label="Show menu" />
          <label htmlFor="nav_toggle" className="nav_burger" aria-hidden="true"><i /><i /><i /></label>
          <nav aria-label="Menu">
            <ul>
              <li><Nav href="/comments" path={path} icon="comments">Comments</Nav></li>
              <li className="search"><form action="/search" method="get" role="search"><Icon name="search" /><input type="search" name="q" placeholder="Search" aria-label="Search stories and comments" maxLength={200} autoComplete="off" /></form></li>
              <Account path={path} />
            </ul>
          </nav>
        </div>
        {subnav && <nav id="subnav" aria-label="Subnavigation"><ul>{subnav}</ul></nav>}
      </header>
      <main id="inside"><Notice />{children}</main>
      <footer>
        <span id="office-hours-live" />
        <nav>
          <a href="/about">About</a>
          <a href="/tags">Tags</a>
          <a href="/filters">Filter</a>
          <a href="/moderations">Moderation Log</a>
          <a href="/moderators">Moderators</a>
        </nav>
      </footer>
    </>
  );
}

/** stories/_subnav.html.erb */
export const StoriesSubnav = ({ path }: { path: string }) => (
  <>
    <li className="push-right"><Nav href="/newest" path={path}>Newest</Nav></li>
    <li><Nav href="/top" path={path}>Top</Nav></li>
  </>
);
