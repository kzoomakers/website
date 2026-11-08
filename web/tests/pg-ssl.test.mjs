// Run with `npm test`. The database CA must survive a ?sslmode= in the URL (Aiven's default).
import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
import { pgConnection } from "../lib/config.ts";

const ConnectionParameters = createRequire(import.meta.url)("pg/lib/connection-parameters");
const used = (c) => new ConnectionParameters(pgConnection(c));

test("the CA is kept when the URL has sslmode=require, wherever it sits in the query", () => {
  for (const url of ["postgres://u:p@h:1/d?sslmode=require", "postgres://u:p@h:1/d?sslmode=require&application_name=x", "postgres://u:p@h:1/d?application_name=x&sslmode=require"]) {
    const p = used({ databaseUrl: url, databaseCa: "MYCA" });
    assert.equal(p.ssl.ca, "MYCA", url);
    assert.equal(p.database, "d");
  }
  assert.equal(pgConnection({ databaseUrl: "postgres://u:p@h:1/d?sslmode=require&application_name=x", databaseCa: "C" }).connectionString, "postgres://u:p@h:1/d?application_name=x");
});

test("without a CA the URL is left alone (local compose uses sslmode=no-verify)", () => {
  assert.equal(pgConnection({ databaseUrl: "postgres://u:p@h:1/d?sslmode=no-verify" }).connectionString, "postgres://u:p@h:1/d?sslmode=no-verify");
});
