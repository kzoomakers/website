import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const { PAGES, SECTIONS, pageOf, pagesOf, levelFor, anyLevel, entryPath } = await import("../lib/access.ts");
const { isStaffEmail } = await import("../lib/tours-fmt.ts");

test("a whole-section grant covers every page; a page grant covers only that page", () => {
  assert.equal(levelFor({ tours: "read" }, "tours", "walkups"), "read");
  assert.equal(levelFor({ tours: "write" }, "tours"), "write");
  assert.equal(levelFor({ "tours:walkups": "write" }, "tours", "walkups"), "write");
  assert.equal(levelFor({ "tours:walkups": "write" }, "tours", "stats"), undefined);
  assert.equal(levelFor({ "tours:walkups": "write" }, "tours"), undefined, "no page named: only a whole-section grant counts");
  assert.equal(levelFor({ "tours:walkups": "write" }, "crm", "walkups"), undefined, "page grants never cross sections");
  assert.equal(levelFor({ tours: "read", "tours:walkups": "write" }, "tours", "walkups"), "write", "a page can be raised above the section");
  assert.equal(levelFor({ "tours:stats": "read", "tours:walkups": "write" }, "tours", ["stats", "walkups"]), "write", "the best of several pages");
  assert.equal(levelFor({ "tours:stats": "read" }, "tours", "*"), "read");
  assert.equal(levelFor({ admin: "write" }, "mail", "queue"), "write");
  assert.equal(levelFor({ admin: "read" }, "mail", "queue"), undefined, "admin view-only is not access elsewhere");
});

test("tabs show for any access in the section, and lead to the first page the person may open", () => {
  assert.equal(anyLevel({ "tours:walkups": "read" }, "tours"), "read");
  assert.equal(anyLevel({ "tours:walkups": "read" }, "crm"), undefined);
  assert.equal(entryPath({ tours: "read" }, "tours"), "/admin/tours");
  assert.equal(entryPath({ "tours:availability": "read", "tours:walkups": "write" }, "tours"), "/admin/tours/walkups");
  assert.equal(entryPath({}, "tours"), undefined);
});

test("a URL belongs to the longest page path above it", () => {
  const k = (u) => { const p = pageOf(u); return p && `${p.section}:${p.key}`; };
  assert.equal(k("/admin/tours"), "tours:bookings"); assert.equal(k("/admin/tours/walkups"), "tours:walkups"); assert.equal(k("/admin/tours/walkups/"), "tours:walkups");
  assert.equal(k("/admin/crm/people/42"), "crm:people"); assert.equal(k("/admin/crm/approvals"), "crm:approvals");
  assert.equal(k("/admin/mailer/email/7/send"), "mail:emails"); assert.equal(k("/admin/mailer/queue"), "mail:queue"); assert.equal(k("/admin/mailer"), "mail:overview");
  assert.equal(k("/admin/webmaster/guided/about"), "webmaster:guided"); assert.equal(k("/admin/webmaster/history"), "webmaster:pages");
  assert.equal(k("/admin/services/privacy"), "admin:privacy"); assert.equal(k("/admin/services"), "admin:setup"); assert.equal(k("/admin/users/special"), "admin:special"); assert.equal(k("/admin/users"), "admin:users");
  assert.equal(k("/admin/nowhere"), undefined);
});

test("the pages that change who has access are never grantable one by one", () => {
  assert.deepEqual(PAGES.filter((p) => p.full).map((p) => p.key).sort(), ["special", "users"]);
});

// ---- the code agrees with the registry
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.name === "node_modules" || e.name === ".next" ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(d, e.name)] : []);
const files = ["app", "lib"].flatMap((d) => walk(new URL("../" + d, import.meta.url).pathname));
const src = (f) => fs.readFileSync(f, "utf8");
const has = (sec, key) => PAGES.some((p) => p.section === sec && p.key === key);

test("every admin page's gate() names a section that owns that URL", () => {
  let n = 0;
  for (const f of files) for (const m of src(f).matchAll(/gate\("(\w+)",\s*([^)]*)\)/g)) {
    const url = (m[2].match(/["'`](\/admin[^"'`$]*)/) ?? [])[1]; if (!url) continue;
    const p = pageOf(url); n++;
    assert.ok(p && p.section === m[1], `${f}: gate("${m[1]}", ${url}) resolves to ${p ? p.section : "no page"}`);
  }
  assert.ok(n > 40);
});

test("every menu link is a registered page", () => {
  const nav = src(new URL("../app/admin/nav.tsx", import.meta.url).pathname);
  const hrefs = [...nav.matchAll(/href: "(\/admin[^"]*)"/g)].map((m) => m[1]);
  assert.ok(hrefs.length > 40);
  for (const h of hrefs) assert.ok(pageOf(h), `${h} is in the menu but is not a page in lib/access.ts`);
});

test("every page named in an API check exists in the section it is checked against", () => {
  let n = 0;
  for (const f of files) {
    const s = src(f), maps = {};
    // PAGE maps: op -> page(s)
    const pm = s.match(/const PAGE: [^=]*= \{([\s\S]*?)\n\};/);
    const secs = [...s.matchAll(/editingAllowed\("(\w+)",[^;]*?PAGE\[a\.op\]/g)].map((m) => m[1]);
    if (pm) { assert.ok(secs.length, `${f} has a PAGE map but never uses it`); for (const v of pm[1].matchAll(/:\s*(\[[^\]]*\]|"[^"]*")/g)) for (const k of [...v[1].matchAll(/"([^"]+)"/g)].map((x) => x[1])) { n++; if (k !== "*") assert.ok(has(secs[0], k), `${f}: PAGE names ${secs[0]}:${k}`); } }
    for (const m of s.matchAll(/editingAllowed\("(\w+)",\s*[^,]+?,\s*(\[[^\]]*\]|"[^"]*")\)/g)) for (const k of [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1])) { n++; if (k !== "*") assert.ok(has(m[1], k), `${f}: ${m[1]}:${k}`); }
  }
  assert.ok(n > 80);
});

test("every sub-paged API is checked with a page, so a page-only grant can reach it", () => {
  // Endpoints of a section with several pages should name their page(s) at every check; a bare check there means only whole-section grants pass (fine for the admin-only ones listed).
  const WHOLE_ONLY = new Set(["app/api/webmaster/users/route.ts", "app/api/webmaster/signups/route.ts", "app/api/special/route.ts", "app/api/webmaster/forms/route.ts"]);
  const root = new URL("..", import.meta.url).pathname;
  for (const f of files.filter((f) => f.includes("/app/api/") || f.includes("/app/edit/"))) {
    if (WHOLE_ONLY.has(path.relative(root, f))) continue;
    for (const m of src(f).matchAll(/editingAllowed\(([^;]*?)\)\)/g)) {
      const a = m[1], sec = (a.match(/^"(\w+)"/) ?? [])[1];
      if (sec && pagesOf(sec).length > 1) assert.ok(/,\s*(\[|"|PAGE|kind)/.test(a.replace(/^"\w+"/, "").replace(/"(read|write)"/, "")) || a.split(",").length > 2, `${path.relative(root, f)}: editingAllowed(${a}) names no page`);
    }
  }
});
test("staff check is unchanged", () => assert.equal(isStaffEmail("a@kzoomakers.org"), true));
