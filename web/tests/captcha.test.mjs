// Run with `npm test`. reCAPTCHA is skipped while no keys are saved (forms keep working), and key input is validated.
process.env.CONFIG_PATH = "/nonexistent"; delete process.env.DATABASE_URL;
import { test } from "node:test";
import assert from "node:assert";

const { verifyCaptcha, captchaCfg, setCaptcha } = await import("../lib/captcha.ts");

test("with no keys configured nothing is checked and no widget key is served", async () => {
  assert.equal(await captchaCfg(), null);
  await verifyCaptcha(new Request("http://x/"), undefined);
});

test("saving needs a database (no keys can be saved to nowhere)", async () => {
  await assert.rejects(() => setCaptcha("6Labcdefghijklmnopqrstuvwxyz0123456789", "6Lsecretsecretsecretsecret0123456789"), /not configured/);
});
