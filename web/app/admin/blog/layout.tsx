import type { ReactNode } from "react";
import Link from "next/link";

const TABS = [["/admin/blog", "Posts"], ["/admin/blog/categories", "Categories"], ["/admin/blog/authors", "Authors"], ["/admin/blog/media", "Media"], ["/admin/blog/comments", "Comments"]];

export default function BlogAdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="adm-body" style={{ gridTemplateColumns: "1fr" }}>
      <main className="adm-main">
        <nav className="bar" aria-label="Blog admin">{TABS.map(([h, l]) => <Link key={h} href={h}><button>{l}</button></Link>)}</nav>
        {children}
      </main>
    </div>
  );
}
