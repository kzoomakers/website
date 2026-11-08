import type { ReactNode } from "react";
import { Navbar, Footer, ThemeCss } from "@/components/chrome";
import { getPublicMenu } from "@/lib/store";

// Site header/footer around blog content (like the Puck pages), plus the search box and reader sign-in state.
export default async function Shell({ title, children, q = "", search = true }: { title: string; children: ReactNode; q?: string; search?: boolean }) {
  return (
    <>
      <ThemeCss />
      <Navbar menu={await getPublicMenu()} />
      <section className="single-page-header"><div className="container"><div className="row"><div className="col-md-12"><h1>{title}</h1></div></div></div></section>
      <section className="section"><div className="container" style={{ maxWidth: 800 }}>
        {search && <form action="/blog" role="search" style={{ marginBottom: 24 }}><input name="q" type="search" aria-label="Search the blog" placeholder="Search the blog" defaultValue={q} /> <button className="btn btn-sm" type="submit">Search</button></form>}
        {children}
      </div></section>
      <Footer />
    </>
  );
}
