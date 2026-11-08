// Run with `npm test`. Guards the rule that people still in the approval queue only get Home, Account and comments:
// members-only code must ask for currentMember (approved), never currentVerified / currentApplicant.
import { test } from "node:test";
import assert from "node:assert";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const MEMBERS_ONLY = [...walk("app/api/members"), ...walk("app/api/notifications"), ...walk("app/api/reviews"), ...walk("app/members/directory"), ...walk("app/members/classes"), ...walk("app/members/profile"),
  ...walk("app/members/inbox"), ...walk("app/members/skills"), ...walk("app/members/notifications"), "app/members/shell.tsx", "lib/guard.ts"].filter((f) => /\.tsx?$/.test(f));

test("members-only code never accepts an unapproved sign-in", () => {
  for (const f of MEMBERS_ONLY) assert.doesNotMatch(readFileSync(f, "utf8"), /currentVerified|currentApplicant/, f);
});

test("every API route that identifies the user is classified", () => {
  const OPEN = new Set(["app/api/blog/comments/route.ts", "app/api/blog/comments/like/route.ts", "app/api/blog/auth/route.ts", "app/api/account/route.ts", "app/api/pending/route.ts"]);
  for (const f of walk("app/api").filter((f) => /route\.ts$/.test(f))) {
    const s = readFileSync(f, "utf8");
    if (/currentVerified|currentApplicant/.test(s)) assert.ok(OPEN.has(f), `${f} lets unapproved people in: add it to OPEN only if that is intended`);
  }
});
