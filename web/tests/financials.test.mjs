// Run with `npm test`. Financials upload checks.
import { test } from "node:test";
import assert from "node:assert";

const { validYear, isPdf } = await import("../lib/financials.ts");

test("year must be a whole number from 1990 to 2100", () => {
  assert.ok(validYear(2024) && validYear(1990) && validYear(2100));
  assert.ok(!validYear(NaN) && !validYear(2024.5) && !validYear(1989) && !validYear(2101));
});

test("only real PDFs pass", () => {
  assert.ok(isPdf(Buffer.from("%PDF-1.7 ...")));
  assert.ok(!isPdf(Buffer.from("<html>")) && !isPdf(Buffer.alloc(0)));
});
