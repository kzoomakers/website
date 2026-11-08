// Renders the privacy statement text: "## Heading" starts a section, "- " lines are bullets, anything else is a paragraph.
export const privacySections = (text: string) => {
  const out: { h: string; items: { li: boolean; t: string }[] }[] = [];
  for (const raw of text.split("\n")) {
    const l = raw.trim();
    if (!l) continue;
    if (l.startsWith("## ")) { out.push({ h: l.slice(3), items: [] }); continue; }
    if (!out.length) out.push({ h: "", items: [] });
    out.at(-1)!.items.push(l.startsWith("- ") ? { li: true, t: l.slice(2) } : { li: false, t: l });
  }
  return out;
};

export default function PrivacyText({ text }: { text: string }) {
  return <>{privacySections(text).map((s, i) => {
    const bullets = s.items.filter((x) => x.li), paras = s.items.filter((x) => !x.li);
    return <section key={i}>{s.h && <h2>{s.h}</h2>}{paras.map((p, j) => <p key={j}>{p.t}</p>)}{bullets.length > 0 && <ul>{bullets.map((b, j) => <li key={j}>{b.t}</li>)}</ul>}</section>;
  })}</>;
}
