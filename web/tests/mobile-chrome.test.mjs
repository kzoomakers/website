import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("app/admin/webmaster/webmaster.css", "utf8");
const nav = readFileSync("app/admin/nav.tsx", "utf8");

test("phone block: menu toggle, no horizontal page scroll", () => {
  const phone = css.slice(css.indexOf("@media (max-width:720px){\n  .adm{"));
  for (const r of [".adm-links[data-open]", ".adm-burger{display:flex", "minmax(0,1fr)", ".adm table{min-width:100%;display:block;overflow-x:auto"]) assert.ok(phone.includes(r), r);
});
test("main area has no width cap", () => assert.doesNotMatch(css, /\.adm-main\{[^}]*max-width/));
test("Node hooks run before its early return", () => assert.ok(nav.indexOf("useState(false)") < nav.indexOf('if (!("items" in item))')));
