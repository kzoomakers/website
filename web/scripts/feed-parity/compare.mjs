// Dev-only (see README.md): fetches the same URLs from the Rails Lobsters and from our port, normalizes the page body to one element per line, and prints the differences.
// usage: node compare.mjs <rails base url> <our base url> [urls file]   (urls file: one path per line, # comments allowed)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { load } from "cheerio";

const [rails, ours, file = new URL("./urls.txt", import.meta.url).pathname] = process.argv.slice(2);
if (!rails || !ours) { console.error("usage: node compare.mjs <rails url> <our url> [urls file]"); process.exit(1); }
const urls = fs.readFileSync(file, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
// With EXPORT_DIR (the folder export.rb wrote) pages for real rows are added: stories (by comments, merged, deleted), tags, categories, domains, users.
if (process.env.EXPORT_DIR) {
  const rows = (t) => JSON.parse(fs.readFileSync(path.join(process.env.EXPORT_DIR, t + ".json"), "utf8"));
  const stories = rows("stories"), by = (f) => stories.filter(f);
  const slug = (s) => s;
  const pick = [...by((s) => s.comments_count > 0 && !s.is_deleted).sort((a, b) => b.comments_count - a.comments_count).slice(0, 6), ...by((s) => s.merged_story_id).slice(0, 2), ...by((s) => s.stories_count > 0).slice(0, 2), ...by((s) => s.is_deleted).slice(0, 2)];
  for (const s of pick) urls.push(`/s/${slug(s.short_id)}`);
  for (const t of rows("tags").slice(0, 4)) urls.push(`/t/${t.tag}`);
  const tags = rows("tags"); if (tags.length > 1) urls.push(`/t/${tags[0].tag},${tags[1].tag}`);
  for (const c of rows("categories").slice(0, 2)) urls.push(`/categories/${c.category}`);
  for (const d of rows("domains").slice(0, 3)) urls.push(`/domains/${d.domain}`);
  for (const u of rows("users").slice(0, 6)) urls.push(`/~${u.username}`, `/~${u.username}/stories`);
  urls.push("/rss", "/hottest", "/newest.rss", "/newest.json", "/active.json", "/top/3d.rss", "/comments.rss", "/tags.json");
  for (const t of rows("tags").slice(0, 2)) urls.push(`/t/${t.tag}.rss`, `/t/${t.tag}.json`);
  for (const u of rows("users").slice(2, 4)) urls.push(`/~${u.username}.json`, `/~${u.username}/stories.rss`, `/~${u.username}/comments.rss`);
  for (const s of pick.slice(0, 3)) urls.push(`/s/${s.short_id}.json`);
  for (const c of rows("comments").slice(0, 3)) urls.push(`/c/${c.short_id}.json`);
  urls.push("/t/nosuchtag", "/domains/nosuch.example", "/~nosuchuser", "/s/nosuch");
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "parity-"));

// What is expected to differ and is not compared (also Rails development-only boxes: slow-query notice, user stats): branding, the title, avatars (not ported), and times (their text; the unix value stays).
const BRANDING = [[/Lobsters|lobste\.rs/gi, "SITE"], [/Kzoo Makers Talk/g, "SITE"]];
function lines(html) {
  const $ = load(html);
  $("#gravatar, .flash-notice, section.profile:has(.user-stats), div[hidden]:empty, script, style, noscript, #iab-pcm-sdk, #iab-autofill-sdk, img.avatar, #office-hours-live, link, meta").remove();
  $("dt").filter((_, e) => $(e).text().trim() === "Homepage").each((_, e) => { $(e).next("dd").remove(); $(e).remove(); }); // not ported (see README)
  $("#header-top h1#logo a").removeAttr("title");
  $(".hat").removeAttr("title"); // the grant date is shown in our own time zone, Rails' is Central
  $("time").each((_, el) => { $(el).text(""); $(el).removeAttr("title").removeAttr("datetime"); });
  $("a[tabindex='-1'][aria-hidden='true']").remove();
  const out = [];
  const walk = (el, depth) => {
    let text = ""; // neighbouring text pieces are one piece of text to a reader (React splits them, ERB does not)
    const flush = () => { const t = text.replace(/\s+/g, " ").trim(); if (t) out.push(`${" ".repeat(depth)}"${t}"`); text = ""; };
    for (const n of el.children ?? []) {
      if (n.type === "text") text += n.data;
      else if (n.type === "tag") {
        flush();
        const a = Object.entries(n.attribs).filter(([k]) => !["style", "data-turbo-track", "rel"].includes(k)).sort().map(([k, v]) => `${k}=${v.replace(/\s+/g, " ").trim()}`).join(" ");
        out.push(`${" ".repeat(depth)}<${n.name}${a ? " " + a : ""}>`);
        walk(n, depth + 1);
      }
    }
    flush();
  };
  walk($("body").get(0) ?? $.root().get(0), 0);
  return out.map((l) => BRANDING.reduce((s, [re, to]) => s.replace(re, to), l)).join("\n") + "\n";
}

// JSON and RSS: the site's own address and every timestamp (any zone) are reduced to the same form; the rest must match exactly.
function plain(body, base, type) {
  const own = (t) => [base, "http://localhost:3000", "https://lobste.rs"].reduce((x, o) => x.split(o).join("ORIGIN"), t).replace(/@(lobste\.rs|talk\.kzoomakers\.org)/g, "@DOMAIN");
  if (/json/.test(type)) {
    const fix = (v) => v && v.avatar_url !== undefined ? fix({ ...v, avatar_url: undefined }) : fixAll(v);
    const fixAll = (v) => Array.isArray(v) ? v.map(fix) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fix(x)])) : typeof v === "string" ? (/^\d{4}-\d\d-\d\dT[\d:.]+(Z|[+-]\d\d:\d\d)$/.test(v) ? "T" + Math.floor(Date.parse(v) / 1000) : own(v).replace(/Lobsters/gi, "SITE")) : v;
    try { return JSON.stringify(fix(JSON.parse(body)), null, 1) + "\n"; } catch { return body; }
  }
  return own(body).replace(/<pubDate>[^<]*<\/pubDate>/g, (m) => `<pubDate>${Math.floor(Date.parse(m.slice(9, -10)) / 1000)}</pubDate>`).replace(/(Kzoo Makers Talk|Lobsters)/g, "SITE").replace(/rel="self"\/>/g, "/>").replace(/<atom:link[^>]*>/g, "") + "\n";
}
const get = async (base, p) => { const r = await fetch(base + p, { redirect: "manual", headers: { accept: p.endsWith(".json") || p === "/hottest" ? "application/json" : "text/html" } }); return { status: r.status, loc: r.headers.get("location") ?? "", type: r.headers.get("content-type") ?? "", body: await r.text() }; };
let same = 0, differ = 0;
for (const p of urls) {
  const [a, b] = await Promise.all([get(rails, p), get(ours, p)]);
  const head = (r) => `${{ 301: 308, 302: 307 }[r.status] ?? r.status} ${r.loc.replace(/^https?:\/\/[^/]+/, "")} ${r.type.split(";")[0]}`;
  const isHtml = /html/.test(a.type) && /html/.test(b.type);
  const redirect = (a.status >= 300 && a.status < 400) || a.status >= 400; // error pages are each site's own: only the status is compared
  const A = redirect ? "" : isHtml ? lines(a.body) : plain(a.body, rails, a.type), B = redirect ? "" : isHtml ? lines(b.body) : plain(b.body, ours, b.type);
  if (head(a) === head(b) && A === B) { same++; console.log(`same    ${p}`); continue; }
  differ++;
  console.log(`DIFFERS ${p}   rails: ${head(a)}   ours: ${head(b)}`);
  const fa = path.join(tmp, "rails.txt"), fb = path.join(tmp, "ours.txt");
  fs.writeFileSync(fa, A); fs.writeFileSync(fb, B);
  try { execFileSync("diff", ["-u", "--label", "rails", "--label", "ours", fa, fb], { encoding: "utf8" }); } catch (e) { console.log((e.stdout ?? "").split("\n").slice(0, 40).join("\n")); }
}
console.log(`\n${same} same, ${differ} differ`);
process.exitCode = differ ? 1 : 0;
