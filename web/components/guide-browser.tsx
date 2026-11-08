"use client";
import { useState } from "react";

type Cat = { name: string; icon: string; articles: { title: string; url: string; icon: string }[] };

// Two panels: pick a category, see its guides. Classes come from the page's legacy CSS (section-card, category-item…).
export function GuideBrowser({ categories }: { categories: Cat[] }) {
  const [sel, setSel] = useState<number | null>(null);
  const cat = sel === null ? null : categories[sel];
  return (
    <div className="product-groups-container">
      <div className="selected-badges">
        {cat && <span className="selection-badge">{cat.name}<span className="remove-badge" role="button" tabIndex={0} aria-label="Clear selection" onClick={() => setSel(null)} onKeyDown={(e) => e.key === "Enter" && setSel(null)}>×</span></span>}
      </div>
      <div className="row justify-content-center">
        <div className="col-md-6"><div className="section-card">
          <div className="section-header"><h6 className="section-title">Equipment Categories</h6></div>
          <div className="section-content">
            {categories.map((c, i) => (
              <div key={i} className={`category-item${sel === i ? " active" : ""}`} role="button" tabIndex={0} aria-pressed={sel === i}
                onClick={() => setSel(i)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSel(i)}>
                <span><i className={`fas ${c.icon} category-icon`} />{c.name}</span><i className="fas fa-chevron-right category-arrow" />
              </div>
            ))}
          </div>
        </div></div>
        <div className="col-md-6"><div className="section-card">
          <div className="section-header"><h6 className="section-title">How-To Articles</h6></div>
          <div className="section-content">
            {cat ? (cat.articles.length ? cat.articles.map((a, i) => <a key={i} href={a.url} className="article-link"><i className={`fas ${a.icon}`} />{a.title}</a>)
              : <div className="empty-state">No guides in this category yet</div>)
              : <div className="empty-state"><i className="fas fa-arrow-left text-muted mb-2" /><div>Select a category to view guides</div></div>}
          </div>
        </div></div>
      </div>
    </div>
  );
}
