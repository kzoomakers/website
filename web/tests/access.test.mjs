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
  assert.equal(levelFor({ "tours:walkups": "write" }, "people", "walkups"), undefined, "page grants never cross sections");
  assert.equal(levelFor({ tours: "read", "tours:walkups": "write" }, "tours", "walkups"), "write", "a page can be raised above the section");
  assert.equal(levelFor({ "tours:stats": "read", "tours:walkups": "write" }, "tours", ["stats", "walkups"]), "write", "the best of several pages");
  assert.equal(levelFor({ "tours:stats": "read" }, "tours", "*"), "read");
  assert.equal(levelFor({ system: "write" }, "email", "queue"), "write");
  assert.equal(levelFor({ system: "read" }, "email", "queue"), undefined, "admin view-only is not access elsewhere");
});

test("tabs show for any access in the section, and lead to the first page the person may open", () => {
  assert.equal(anyLevel({ "tours:walkups": "read" }, "tours"), "read");
  assert.equal(anyLevel({ "tours:walkups": "read" }, "people"), undefined);
  assert.equal(entryPath({ tours: "read" }, "tours"), "/admin/tours");
  assert.equal(entryPath({ "tours:availability": "read", "tours:walkups": "write" }, "tours"), "/admin/tours/walkups");
  assert.equal(entryPath({}, "tours"), undefined);
});

test("a URL belongs to the longest page path above it", () => {
  const k = (u) => { const p = pageOf(u); return p && `${p.section}:${p.key}`; };
  assert.equal(k("/admin/tours"), "tours:bookings"); assert.equal(k("/admin/tours/walkups"), "tours:walkups"); assert.equal(k("/admin/tours/walkups/"), "tours:walkups");
  assert.equal(k("/admin/people/people/42"), "people:people"); assert.equal(k("/admin/people/approvals"), "people:approvals");
  assert.equal(k("/admin/email/email/7/send"), "email:emails"); assert.equal(k("/admin/email/queue"), "email:queue"); assert.equal(k("/admin/email"), "email:overview");
  assert.equal(k("/admin/website/guided/about"), "website:guided"); assert.equal(k("/admin/website/history"), "website:pages");
  assert.equal(k("/admin/system/privacy"), "system:privacy"); assert.equal(k("/admin/system"), "system:setup"); assert.equal(k("/admin/system/access/special"), "system:special"); assert.equal(k("/admin/system/access"), "system:users");
  assert.equal(k("/admin/nowhere"), undefined);
});

test("the pages split out of Setup (and Membership classes) are admin-section pages, so a whole People grant cannot reach them", () => {
  for (const k of ["seal", "maps", "captcha", "uploads", "membership-classes"]) { assert.ok(has("system", k), k); assert.equal(levelFor({ people: "write" }, "system", k), undefined); }
  assert.equal(pageOf("/admin/people/membership-classes").section, "system");
});

test("menu zones and tab matching", async () => {
  const { NAV, ENTRIES, zoneOf } = await import("../lib/nav-manifest.ts");
  const { tabOf } = await import("../app/admin/tabs.ts");
  for (const [t, e] of ENTRIES) assert.ok(!e.zone || t.zones.includes(e.zone), `${e.href}: zone ${e.zone} is not one of ${t.label}'s zones`);
  assert.equal(zoneOf(NAV[0], ENTRIES.find(([, e]) => e.href === "/admin/website/calendar")[1]), "Settings");
  assert.equal(zoneOf(NAV[0], ENTRIES.find(([, e]) => e.href === "/admin/website/reviews")[1]), "Work");
  assert.equal(tabOf("/admin/system/privacy"), "/admin/website"); assert.equal(tabOf("/admin/system/google-analytics"), "/admin/website");
  assert.equal(tabOf("/admin/system/seal"), "/admin/system"); assert.equal(tabOf("/admin/system"), "/admin/system"); assert.equal(tabOf("/admin/website/guided/about"), "/admin/website");
  assert.equal(tabOf("/admin/people/membership-classes"), "/admin/people"); assert.equal(tabOf("/admin/nowhere"), undefined);
});

test("Database & storage: test never needs a Fly secret, blank URL keeps the saved one, blank keys keep the saved keys", async () => {
  const { planDb, mergeS3 } = await import("../lib/setup-plan.ts");
  const had = { databaseUrl: "postgres://old/db" };
  assert.match(planDb({ env: { databaseUrl: "x" }, had, url: "", ca: "", test: false, fly: false }).error, /environment variable/);
  assert.equal(planDb({ env: null, had: null, url: "", ca: "", test: true, fly: false }).error, "Database URL required");
  assert.deepEqual(planDb({ env: null, had, url: "  ", ca: "", test: false, fly: false }).cfg, had);
  assert.equal(planDb({ env: null, had, url: "postgres://new/db", ca: "ca", test: false, fly: false }).cfg.databaseCa, "ca");
  assert.match(planDb({ env: null, had, url: "postgres://new/db", ca: "", test: false, fly: true }).error, /Fly secrets/);
  assert.equal(planDb({ env: null, had, url: "postgres://new/db", ca: "", test: true, fly: true }).cfg.databaseUrl, "postgres://new/db");
  const old = { endpoint: "http://a", bucket: "b", region: "r", accessKey: "AK", secretKey: "SK" };
  assert.deepEqual(mergeS3({ endpoint: " http://c ", accessKey: "", secretKey: "NEW" }, old), { endpoint: "http://c", bucket: "uploads", region: "us-east-1", accessKey: "AK", secretKey: "NEW" });
});

test("the pages that change who has access (or show who looked at personal data) are never grantable one by one", () => {
  assert.deepEqual(PAGES.filter((p) => p.full).map((p) => p.key).sort(), ["pii", "special", "users"]); // Audit PII is opened by full admins or the "Audit PII" special permission instead
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

test("every menu link is a registered page, and no label repeats inside a menu", async () => {
  const { NAV, ENTRIES, flat, menuOf } = await import("../lib/nav-manifest.ts");
  assert.ok(ENTRIES.length > 80);
  for (const [, e] of ENTRIES) {
    assert.ok(pageOf(e.href), `${e.href} is in the manifest but is not a page`);
  }
  for (const t of NAV) { const l = flat(menuOf(t)).map((e) => e.label); assert.equal(new Set(l).size, l.length, `duplicate label in ${t.label}`); }
  const keys = ENTRIES.filter(([, e]) => e.key).map(([t, e]) => `${e.section ?? t.section}:${e.key}`); assert.equal(new Set(keys).size, keys.length, "duplicate permission page");
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

test("old permission names still resolve, and every old admin URL redirects to its new home", async () => {
  const { modernKey } = await import("../lib/access.ts");
  assert.equal(modernKey("crm:classes"), "people:classes"); assert.equal(modernKey("admin"), "system"); assert.equal(modernKey("webmaster:guided"), "website:guided"); assert.equal(modernKey("tours:walkups"), "tours:walkups");
  const rs = await (await import("../next.config.mjs")).default.redirects();
  const to = (u) => { const r = rs.find((x) => new RegExp("^" + x.source.replace(/:p\*/, "(.*)").replace(/\(\.html\)\?/, "(?:\\.html)?") + "$").test(u)); return r && r.destination.replace(":p*", u.slice(r.source.indexOf(":p*"))); };
  assert.equal(to("/admin/webmaster/guided/about"), "/admin/website/guided/about"); assert.equal(to("/admin/crm/people/42"), "/admin/people/people/42");
  assert.equal(to("/admin/mailer/email/7/send"), "/admin/email/email/7/send"); assert.equal(to("/admin/services/seal"), "/admin/system/seal");
  assert.equal(to("/admin/users/special"), "/admin/system/access/special"); assert.equal(to("/admin/esign/templates"), "/admin/signdocs/templates"); assert.equal(to("/admin/forms/contact"), "/admin/messages/contact");
});

test("every section is in exactly one top-bar group, and URLs find their group", async () => {
  const { GROUPS, NAV } = await import("../lib/nav-manifest.ts");
  const { groupOf } = await import("../app/admin/tabs.ts");
  for (const t of NAV) assert.equal(GROUPS.filter((g) => g.sections.includes(t.section)).length, 1, t.section);
  assert.deepEqual(GROUPS.map((g) => g.label), ["Home", "Members", "Communications", "Website", "SignDocs", "System"]);
  const g = (u) => groupOf(u).label;
  assert.equal(g("/admin/landing"), "Home"); assert.equal(g("/admin/tours/walkups"), "Members"); assert.equal(g("/admin/makerfavor"), "Members"); assert.equal(g("/admin/blog/comments"), "Communications");
  assert.equal(g("/admin/email/queue"), "Communications"); assert.equal(g("/admin/system/privacy"), "Website"); assert.equal(g("/admin/system/seal"), "System"); assert.equal(g("/admin/signdocs/new"), "SignDocs");
});

test("the top bar shows Home plus the groups you can open, each opening on your first page", async () => {
  const { visibleGroups } = await import("../app/admin/tabs.ts");
  const show = (allowed) => visibleGroups(allowed).map((v) => `${v.group.label}:${v.href}`);
  assert.deepEqual(show({ tours: "/admin/tours/walkups" }), ["Home:/admin/landing", "Members:/admin/tours/walkups"]);
  assert.deepEqual(show({ makerfavor: "/admin/makerfavor", people: "/admin/people/approvals" }), ["Home:/admin/landing", "Members:/admin/people/approvals"]);
  assert.deepEqual(show({ blog: "/admin/blog", system: "/admin/system" }), ["Home:/admin/landing", "Communications:/admin/blog", "System:/admin/system"]);
  assert.deepEqual(show({ website: "" }), ["Home:/admin/landing", "Website:/admin/website"]); // a section with no page found still opens its front URL
  assert.deepEqual(show({}), ["Home:/admin/landing"]);
});
