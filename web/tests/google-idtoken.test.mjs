import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";

const { verifyIdToken } = await import("../lib/google-idtoken.ts");
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwks = [{ ...publicKey.export({ format: "jwk" }), kid: "k1" }];
const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const mint = (claims, head = { alg: "RS256", kid: "k1" }, key = privateKey) => {
  const body = `${b(head)}.${b({ iss: "https://accounts.google.com", aud: "web-id", exp: Math.floor(Date.now() / 1000) + 600, email: "a@b.org", ...claims })}`;
  return `${body}.${sign("RSA-SHA256", Buffer.from(body), key).toString("base64url")}`;
};

test("Google ID token: only a correctly signed, unexpired token for our client id passes", () => {
  assert.equal(verifyIdToken(mint({}), jwks, "web-id")?.email, "a@b.org");
  assert.equal(verifyIdToken(mint({ aud: "someone-else" }), jwks, "web-id"), null, "token for another app");
  assert.equal(verifyIdToken(mint({ exp: 1 }), jwks, "web-id"), null, "expired");
  assert.equal(verifyIdToken(mint({ iss: "https://evil.example" }), jwks, "web-id"), null, "wrong issuer");
  assert.equal(verifyIdToken(mint({}, { alg: "none", kid: "k1" }), jwks, "web-id"), null, "alg none");
  assert.equal(verifyIdToken(mint({}, { alg: "RS256", kid: "other" }), jwks, "web-id"), null, "unknown key id");
  assert.equal(verifyIdToken(mint({}, undefined, generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey), jwks, "web-id"), null, "signed by a different key");
  const [h, p, s] = mint({}).split(".");
  assert.equal(verifyIdToken(`${h}.${b({ aud: "web-id", iss: "accounts.google.com", exp: 9e9, email: "boss@x.org" })}.${s}`, jwks, "web-id"), null, "body swapped");
  assert.equal(verifyIdToken("garbage", jwks, "web-id"), null);
});
