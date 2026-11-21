import Link from "next/link";
import { Fragment } from "react";
import { notFound } from "next/navigation";
import { directoryMember } from "@/lib/crm";
import { SOURCE_LABEL } from "@/lib/auth-source";
import { FIELDS, SOCIALS, socialHref } from "@/lib/fields";
import MembersShell from "../../shell";
import Message from "./message";

export const dynamic = "force-dynamic";
export const metadata = { title: "Member | Kzoo Makers", robots: { index: false } };

const day = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Detroit" });
const LEVEL: Record<string, string> = { learning: "learning", competent: "knows it", teach: "teaches" };

// One listed member, laid out as a page: who they are, what they can use in the shop and since when, what they know, and how to reach them.
export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  return (
    <MembersShell title="Member directory" path={`/members/directory/${id}`}>
      {async (u) => {
        const m = await directoryMember(id);
        if (!m) notFound();
        const f = (k: string) => m.fields[k]?.join(", ");
        const facts = Object.keys(FIELDS).filter((k) => f(k)).map((k) => [FIELDS[k as keyof typeof FIELDS].label, f(k)] as const);
        return (
          <article style={{ display: "grid", gap: 16, maxWidth: 760 }}>
            <p style={{ margin: 0 }}><Link href="/members/directory">← All members</Link></p>
            <header style={{ display: "flex", gap: 16, alignItems: "center" }}>
              {m.photo ? <img src={m.photo} alt="" width={96} height={96} style={{ borderRadius: "50%", objectFit: "cover" }} /> : <span aria-hidden style={{ width: 96, height: 96, borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--line, #ddd)", fontSize: 36 }}>{m.name[0]}</span>}
              <div><h2 style={{ margin: 0 }}>{m.name}</h2><p className="sub" style={{ margin: 0 }}>Member since {new Date(m.since).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</p></div>
            </header>
            {m.bio && <p style={{ margin: 0, whiteSpace: "pre-line" }}>{m.bio}</p>}
            <section>
              <h3>Authorized tools</h3>
              {m.tools.length ? <table style={{ width: "100%" }}><thead><tr><th style={{ textAlign: "left" }}>Tool</th><th style={{ textAlign: "left" }}>Date</th><th style={{ textAlign: "left" }}>How</th></tr></thead>
                <tbody>{m.tools.map((t) => <tr key={t.name}><td>{t.source === "training" ? "🏅" : "✅"} {t.name}</td><td>{t.source === "training" ? "Certified " : ""}{day(t.at)}</td><td>{SOURCE_LABEL[t.source] ?? t.source}</td></tr>)}</tbody></table> : <p className="sub">Not authorized on any tools yet.</p>}
            </section>
            {m.skills.length > 0 && <section><h3>Skills</h3><p>{m.skills.map((s) => <span key={s.name} className="dr-chip" style={{ marginRight: 6 }}>{s.name} <small>{LEVEL[s.level]}</small></span>)}</p></section>}
            {facts.length > 0 && <section><h3>About</h3><dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "4px 16px", margin: 0 }}>{facts.map(([k, v]) => <Fragment key={k}><dt className="sub">{k}</dt><dd style={{ margin: 0 }}>{v}</dd></Fragment>)}</dl></section>}
            <section>
              <h3>Contact</h3>
              <p>{m.phone && <a href={`tel:${m.phone}`}>{m.phone} </a>}{m.email && <a href={`mailto:${m.email}`}>{m.email} </a>}{m.discord && <span>Discord: {m.discord} </span>}
                {(Object.keys(SOCIALS) as (keyof typeof SOCIALS)[]).filter((k) => m.socials?.[k]).map((k) => <a key={k} href={socialHref(k, m.socials[k])} target="_blank" rel="noopener noreferrer nofollow">{SOCIALS[k].label} </a>)}</p>
              {m.id !== u.id && <Message to={m.id} name={m.name.split(" ")[0]} />}
            </section>
          </article>
        );
      }}
    </MembersShell>
  );
}
