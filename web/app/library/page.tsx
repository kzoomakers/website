import { notFound } from "next/navigation";
import { conn } from "@/lib/db";
import { libraryOn } from "@/lib/learn-flags";

export const dynamic = "force-dynamic";
export const metadata = { title: "Library | Kzoo Makers", description: "Safety posters and manuals the shop shares publicly." };

// Only documents an admin marked public AND listed, and only while the library switch is on. Everything else stays behind sign-in (/members/library).
export default async function PublicLibrary() {
  if (!(await libraryOn())) notFound();
  const docs = (await (await conn()).query("SELECT slug, title, type, description FROM lib_docs WHERE tier = 'public' AND listed AND status = 'published' AND deleted_at IS NULL ORDER BY pinned DESC, lower(title)")).rows;
  return (
    <main style={{ maxWidth: 720, margin: "6vh auto", padding: 16 }}>
      <h1>Library</h1>
      <p className="sub">Safety guides and manuals we share with everyone. Members can find more after signing in.</p>
      {!docs.length ? <p className="sub">Nothing is listed here yet.</p> : docs.map((d) => (
        <div className="row" key={d.slug}><a href={`/api/library/file/${d.slug}`}><b>{d.title}</b></a> <span className="tag">{d.type}</span>{d.description && <div className="sub" style={{ margin: 0 }}>{d.description}</div>}</div>
      ))}
    </main>
  );
}
