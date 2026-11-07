import type { ReactNode } from "react";

// Posts written in the rich editor are HTML (authored only by signed-in admins, like the site's other HTML sections).
// Older posts are plain text with "## " headings, [text](url) links and ![alt](url) images; React escapes those.
const URL_OK = /^(https?:\/\/|\/|mailto:)/;
const inline = (t: string): ReactNode[] =>
  t.split(/(!?\[[^\]]*\]\([^)\s]+\))/).map((s, i) => {
    const m = s.match(/^(!?)\[([^\]]*)\]\(([^)\s]+)\)$/);
    if (!m || !URL_OK.test(m[3])) return s;
    return m[1] ? <img key={i} src={m[3]} alt={m[2]} style={{ maxWidth: "100%" }} /> : <a key={i} href={m[3]}>{m[2]}</a>;
  });

export const Body = ({ text }: { text: string }) => /^\s*</.test(text)
  ? <div className="blog-body" dangerouslySetInnerHTML={{ __html: text }} />
  : <>{text.split(/\n\s*\n/).filter((b) => b.trim()).map((b, i) => (b.startsWith("## ") ? <h2 key={i}>{inline(b.slice(3))}</h2> : <p key={i}>{inline(b.trim())}</p>))}</>;
