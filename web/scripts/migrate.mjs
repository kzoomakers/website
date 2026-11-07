// Legacy ../*.html -> data/pages/<slug>.json (Puck Data). Re-runnable; never overwrites hand-built pages.
// Usage: node scripts/migrate.mjs            (all pages)
import { load } from "cheerio";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const OUT = path.resolve(import.meta.dirname, "../data/pages");
const HAND_BUILT = new Set(["about"]);
// Need custom components (inline scripts / forms): Phase 4.
const SKIP = new Set(["calendar", "handbook", "history", "how-to", "ical-demo", "sop", "single-post",
  "tools-we-are-seeking-donations-kalamazoo", "woodshop-inventory", "index",
  "calendar2", "contact-new", "index-text", "onepage-slider", "onepage-text", "demo", "demo1", "demo3"]);

// "x.html#a" -> "/x#a"; leave absolute/external alone. 'index' -> '/'
const fixHref = (h) => {
  if (!h || /^(https?:|mailto:|tel:|#|\/)/.test(h)) return h;
  const m = h.match(/^([^#?]+)\.html([#?].*)?$/);
  if (!m) return h;
  return (m[1] === "index" ? "/" : "/" + m[1]) + (m[2] ?? "");
};
// relative asset refs would break if a page ever lives at a nested path
const fixSrc = (s) => (!s || /^(https?:|data:|\/|#)/.test(s) ? s : "/" + s);

const report = { migrated: [], skipped: [], warnings: [] };
let n = 0;
const id = (t) => `${t}-${++n}`;

for (const file of fs.readdirSync(ROOT).filter((f) => f.endsWith(".html"))) {
  const slug = file.slice(0, -5);
  if (HAND_BUILT.has(slug)) continue;
  if (SKIP.has(slug) || /\s/.test(slug)) { report.skipped.push(slug); continue; }

  const $ = load(fs.readFileSync(path.join(ROOT, file), "utf8"));
  const content = [];
  $("body").children().each((_, el) => {
    const $el = $(el);
    if (el.tagName === "script" || $el.is("#preloader, header.navigation, footer#footer")) return;
    if ($el.is("section.single-page-header")) {
      const h = $el.find("h1, h2").first();
      content.push({ type: "PageHeader", props: { id: id("PageHeader"), title: h.text().trim(), tag: h[0]?.tagName ?? "h2", crumb: $el.find(".breadcrumb-item.active").text().trim(),
        // middle crumbs (everything between "Home" and the active item)
        trail: $el.find(".breadcrumb-item:not(.active)").slice(1).map((_, li) => ({ label: $(li).text().trim(), href: fixHref($(li).find("a").attr("href") ?? "#") })).get() } });
      return;
    }
    if ($el.is("section.counter-wrapper")) { content.push({ type: "Counters", props: { id: id("Counters") } }); return; }
    $el.find("script").remove();
    $el.find("[href]").each((_, a) => $(a).attr("href", fixHref($(a).attr("href"))));
    $el.find("[src]").each((_, a) => $(a).attr("src", fixSrc($(a).attr("src"))));
    const html = $.html(el).trim();
    if (html) content.push({ type: "HtmlSection", props: { id: id("HtmlSection"), html } });
  });

  // page-specific head CSS / stylesheets / scripts (the standard theme set is provided by the layout)
  const css = $("head style").map((_, e) => $(e).text()).get().join("\n");
  const styles = $('head link[rel="stylesheet"]').map((_, e) => $(e).attr("href")).get()
    .filter((h) => !/^\/?(plugins\/|css\/style\.css$)/.test(h)).map((href) => ({ href }));
  const STD = /plugins\/|dynamic\/js\/(navbar|footer|counters|hours)\.js|js\/script\.js|googleapis\.com\/maps/;
  const scripts = $("script[src]").map((_, e) => $(e).attr("src")).get().filter((s) => !STD.test(s)).map((src) => ({ src }));
  const refresh = $('meta[http-equiv="refresh"]').attr("content") ?? "";
  const bodyClass = $("body").attr("class") ?? "";
  const title = $("title").first().text().trim();
  const description = $('meta[name="description"]').attr("content") ?? "";
  if (!content.length) report.warnings.push(`${slug}: no content`);
  fs.writeFileSync(path.join(OUT, slug + ".json"), JSON.stringify({ root: { props: { title, description, bodyClass, refresh, css, styles, scripts } }, content, zones: {} }, null, 1));
  report.migrated.push(slug);
}
console.log(`migrated ${report.migrated.length}, skipped ${report.skipped.length}: ${report.skipped.join(", ")}`);
report.warnings.forEach((w) => console.log("WARN", w));
