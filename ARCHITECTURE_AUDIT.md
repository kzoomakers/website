# Architecture & Technical Debt Audit — Kzoo Makers website

**Repository:** `kzoomakers-web` (Next.js 15, App Router) · **Branch:** `ux/audit-p0-p1` · **Commit:** `64f93cd`
**Scope:** `web/app` (206 routes/pages), `web/lib` (75 modules), `web/components` (29 components), `web/data`, `web/workers`, `web/scripts`, deployment (`fly.toml`, `Dockerfile`, `docker-compose.yml`).
**Method:** read-only review of the full source tree, dependency graph, data layer, API surface, scheduling, and deployment config. No code was changed.

> Severity key: **P0** = incorrect behavior / data-integrity risk now · **P1** = structural debt that slows every future change · **P2** = quality / operational gap · **P3** = polish.

---

## 0. What this is

A single deployable Next.js monolith that is simultaneously:

1. A **public CMS** — Postgres-backed pages rendered via the Puck visual editor (`app/[[...path]]`, `app/edit`, `lib/puck-config.tsx`), with "guided" form-edited pages (`lib/guided.ts`).
2. A **member portal** — directory, classes, skills/tool authorizations, onboarding, inbox, profile (`app/members/*`).
3. A **CRM + admin back office** — 10+ admin sections under `app/admin/*` with per-section RBAC (`lib/guard.ts`).
4. An **email marketing system** — lists, subscribers, campaigns, open/click tracking, queue, webhooks (`lib/mail.ts`).
5. An **e-signature system** — PDF sealing, signer links, field placement (`lib/sign.ts`, `lib/sign-pdf.ts`, `lib/pdf-seal.ts`).
6. A **push-notification server** — a from-scratch ntfy-compatible API (`lib/ntfy.ts`, `app/ntfy`).
7. **Tour scheduling, chores tracking, blog with comments, financial PDFs, HTTP access logging, AI integration, image processing.**

~20,450 LOC across `app`/`lib`/`components` (TS/TSX), 75 API route handlers, 29 unit-test files.

The codebase is **careful about security and data integrity** (see §6) but has **grown without a layering or domain-boundary discipline**, and it pays for that in a flat 75-file `lib/`, a hand-rolled inline schema "migration" system, and a mix of REST and stringly-typed RPC endpoints.

---

## 1. Architectural consistency & system organization

### 1.1 · Flat `lib/` directory — no layering or domain grouping (P1)

`web/lib/` holds **75 modules in a single directory** with no subfolders. Persistence, auth, domain services, and one-off utilities sit side by side:

```
lib/db.ts        (schema + pool)      lib/mail.ts      (622 LOC — full ESP)
lib/readers.ts   (member auth)        lib/tours.ts     (448 LOC)
lib/guard.ts     (admin RBAC)         lib/crm.ts       (417 LOC)
lib/store.ts     (pages/settings)     lib/sign.ts      (346 LOC)
lib/vault.ts     (crypto)             lib/ntfy.ts      (317 LOC)
lib/httplog.ts   (access log)         lib/chores-calc.ts (307 LOC)
lib/ai.ts        (AI dispatch)        lib/redact.ts    (PII scrubbing)
... 60 more, all peers
```

There is no `lib/<domain>/…`, no `lib/infra/…`, no `lib/http/…`. Domain boundaries exist only as filename conventions, which do not survive growth (e.g. tour logic is split across `tours.ts`, `tours-fmt.ts`, `tours-notify.ts`, `calendar-feed.ts`, `chores-calc.ts` with no grouping). **Recommendation:** introduce a small, opinionated grouping (e.g. `lib/domains/<name>/`, `lib/infra/`, `lib/web/`) and migrate incrementally. This is mechanical and safe — move a module, fix its `@/lib/...` imports, run the test suite.

### 1.2 · Inconsistent API style: REST *and* ad-hoc RPC (P1)

Two incompatible API conventions coexist:

- **REST** — `app/api/pages/route.ts` exposes `GET`/`PUT`/`POST`/`DELETE` with typed request bodies.
- **Stringly-typed RPC** — 13+ handlers dispatch a giant `switch (a.op)` over `POST { op, ...args }`:

```
app/api/webmaster/crm/route.ts           (~40 cases)
app/api/webmaster/tours/route.ts
app/api/webmaster/signed-docs/route.ts
app/api/webmaster/chores/route.ts
app/api/webmaster/ntfy/route.ts
app/api/webmaster/handbook/route.ts
app/api/webmaster/seal/route.ts
app/api/webmaster/ai/route.ts
app/api/webmaster/waiver/route.ts
app/api/mailadmin/route.ts
app/api/chores/route.ts
app/api/members/route.ts
app/api/members/chores/route.ts
```

Each RPC endpoint takes `const a = await req.json().catch(() => null)`, then reads `a.id`, `a.tool`, `a.levels`, `a.expires` as **untyped `any`**. A mistyped or missing field becomes `undefined` and flows into SQL or a domain function without any schema validation — the failure mode is a 400 with an opaque `errMsg`, or worse, a silently no-op'd write. **Recommendation:** keep the RPC *shape* (it is convenient for the admin client wrappers in `app/admin/*/rpc.ts`), but add a per-op validation layer (e.g. a zod schema keyed by `op`) at the single choke point each route already has, and stop reading raw `a.*` into domain calls.

### 1.3 · Architectural drift from the documented plan (P2)

`docs/notes/todo-modularization.md` (the migration plan this codebase grew out of) explicitly specified:

> **"Migrations tool (Drizzle or Prisma) with migration files committed; run in a Fly `release_command`."**

That was not done. See §2.2. The same document planned *"Phase 2 moves to ISR + revalidate on publish"* for the catch-all route — the code still says `export const dynamic = "force-dynamic"` with a `// POC` comment. The plan is now actively misleading as a reference; either update it or close the gap.

### 1.4 · Misleading README ("store = all queries") (P3)

`README.md` describes `lib/store.ts` as *"store (all queries)"*. In reality `store.ts` (319 LOC) covers only pages, menu, settings, and the audit log. Every other module (`crm.ts`, `mail.ts`, `tours.ts`, `sign.ts`, `ntfy.ts`, …) embeds its own SQL. The "single store" mental model does not match the code.

---

## 2. Coupling, cohesion & module boundaries

### 2.1 · God modules (P1)

The largest files are feature monoliths, not modules:

| File | LOC | Actually contains |
|---|---|---|
| `lib/mail.ts` | 622 | config, lists, forms, subscribers, campaigns, sending, queue, open/click tracking, webhooks, templates, AI compose, dashboard |
| `components/guided.tsx` | 542 | renderers for ~18 guided page types, each a bespoke component with inline styles |
| `lib/tours.ts` | 448 | blocks, bookings, requests, walk-ups, threads, timeline, reminders, stats |
| `lib/crm.ts` | 417 | directory, messaging, skills, tools, classes, proposals, fields |
| `lib/sign.ts` | 346 | docs, signers, fields, templates, public links, codes |
| `lib/ntfy.ts` | 317 | an entire ntfy-compatible server (topics, tokens, publish, SSE subscribe, filtering) |
| `lib/chores-calc.ts` | 307 | chore scheduling math |
| `lib/store.ts` | 319 | pages, menu, settings, audit |

These are *single-responsibility* violations at the file level, but the deeper issue is **cohesion**: `mail.ts` alone could reasonably be five modules (config, subscribers, campaigns, delivery, tracking). `components/guided.tsx` should be `components/guided/<type>.tsx` with a registry. **Recommendation:** split along the seams that already exist (the `export` list of each file is a ready-made split map), starting with `mail.ts` and `guided.tsx`.

### 2.2 · Persistence is inlined everywhere — no data-access layer (P1)

SQL is embedded in nearly every `lib/*.ts` module (cross-layer violation: infrastructure leaks into every domain). Each file re-declares its own connection helper:

```ts
// duplicated verbatim in store.ts, readers.ts, crm.ts, mail.ts, tours.ts, sign.ts, ntfy.ts, ...
async function conn() { const d = db(); if (!d) throw new Error("not configured"); await d.ready; return d.pool; }
```

Worse, **there are two independent, divergent schema-migration paths**:

1. `lib/db.ts migrate()` — ~180 lines of `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE … ADD COLUMN IF NOT EXISTS`, reconstructed on every boot under `pg_advisory_lock`.
2. `lib/mail.ts init()` — its own `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ADD COLUMN` for the mail tables, run lazily on first mail access.

Consequences:
- **No migration history, no version number, no down-migrations.** You cannot answer "what schema is this DB at?" or roll back.
- **Every deploy runs ~100 DDL statements** (guarded, so correct, but slow and noisy).
- **Schema evolution is additive-only** — a rename or a constraint change requires an *additional* `ALTER` later, so the file accumulates one-off `UPDATE … WHERE x = ''` backfills and `DO $$ … $$` blocks.
- **Two systems can drift** (e.g. a future DDL change in one path won't know about the other).

**Recommendation (highest-leverage structural fix):** adopt real versioned migrations (Drizzle/Prisma/node-pg-migrate) with committed SQL files and run them in a Fly `release_command`, exactly as the original plan intended. This is the single change that most improves the ability to evolve the schema safely.

### 2.3 · Hub-and-spoke import graph, no dependency-direction rules (P2)

The import graph centers on a few hubs that everything reaches into:

```
readers.ts → mail.ts, ntfy.ts, waiver.ts, approvals.ts, limit.ts
guard.ts   → readers.ts, db.ts, auth.ts
mail.ts    → debug.ts, mail-render.ts, signing.ts, db.ts, rules.ts
ai.ts      → mail.ts, vault.ts, sanitize.ts, ai-prompts.ts, debug.ts
store.ts   → db.ts, guided.ts, hours.ts, menu.ts, audit-areas.ts, sitemap.ts
```

`mail.ts` and `db.ts` are imported across unrelated domains. There are no enforced layer boundaries, so a change to `mail.ts` (a "service") can ripple into `readers.ts` (auth) and `ai.ts`. No obvious *cycles* were found, but the coupling is high and the direction is informal.

### 2.4 · Mid-file imports (P3)

`lib/store.ts` places an `import { removeFor, restoreMenu, … } from "./menu"` ~100 lines into the file (after many declarations). This is legal but signals a file that grew past a natural boundary — a symptom of 2.1.

### 2.5 · Hidden dependencies & global mutable state (P2)

- `lib/db.ts` caches the pool on `globalThis` keyed by the serialized config; `getConfig()` re-reads env/`data/config.json` on every `db()` call.
- `lib/debug.ts` and `lib/httplog.ts` keep global in-memory state (5-second debug-stream cache; buffered log rows).
- `lib/httplog-hook.ts` **monkey-patches `http.Server.prototype.emit`** to intercept every request. It is clever and works, but it depends on Node/Next internals and patches a global prototype — fragile across upgrades and easy to break silently (the `try/catch` would mask a regression).

None of these are wrong in isolation, but they are **initialization-order and global-state dependencies** that are hard to reason about and test.

### 2.6 · Change amplification (P2)

The `getX`/`saveX` settings pattern is copy-pasted five times with identical shape (`getHours`/`saveHours`, `getRobots`/`saveRobots`, `getPrivacy`/`savePrivacy`, `getBoard`/`saveBoard`, `setCalUrl`, `getGuided`/`saveGuided`) — each a `settings` upsert + audit-log call. Adding a sixth setting means hand-copying the same 6 lines again; a bug in one is a bug to fix in six. A single `getSetting<T>(key, fallback)` / `saveSetting(key, value, who, action)` helper would remove the duplication (and is already implied by `revertSetting`'s `else if` chain).

---

## 3. Abstraction quality & design principles

### 3.1 · Under-abstraction (the dominant failure mode) (P1)

The RPC `switch(a.op)` endpoints (§1.2) and the duplicated `conn()`/settings-upsert boilerplate (§2.2, §2.6) are the clearest cases: the codebase *repeats* low-level plumbing rather than factoring it, producing 13 near-identical switch routers and ~8 identical connection helpers.

### 3.2 · Good abstractions that prove the bar is achievable (contrast, not a finding)

These are genuinely well-factored and worth pointing at as the house style to generalize from:

- **`lib/ai.ts`** — provider/model abstraction (`PROVIDERS`, `SCENARIOS`, `complete()`), config-driven, with a **price cap** (`MAX_PRICE`) enforced before any call, and per-scenario pinning. Clean extensibility: "add a scenario to `SCENARIOS` and call `complete()`."
- **`lib/aiseo.ts`** — deliberately *pure* ("No imports from the store, so it stays pure and testable"); SEO/structured-data derivation separated from I/O.
- **`lib/vault.ts`** — 23 lines, AES-256-GCM with a clear `iv|tag|ciphertext` layout and an explicit key-rotation `shortcut:` comment.
- **`lib/redact.ts` + `lib/debug.ts`** — `tracedFetch` with secret scrubbing; debug streams that never throw.

The gap between these and the god modules in §2.1 is the core of the audit: the team knows how to abstract well but applies it inconsistently.

### 3.3 · Leaky abstractions (P3)

- `lib/ntfy.ts` exposes raw ntfy protocol details (SSE framing, token scopes, `since` cursor semantics) to the rest of the app; callers must know ntfy internals to use `notify()`.
- The RPC "framework" is a leaky abstraction in the other direction: it *hides* the HTTP contract behind `op` strings but forces callers to know the exact untyped `args` shape (client wrappers `chores<T>(op, args)` and server `switch` must be manually kept in sync).

### 3.4 · Inheritance/composition (P3)

No problematic inheritance hierarchies were found (idiomatic React function components + plain TS modules). This is a non-issue; the codebase's complexity is in module boundaries and layering, not class design.

---

## 4. Reliability, scalability & operations

### 4.1 · In-process schedulers are not safe under horizontal scaling (P1)

`web/instrumentation.ts` runs application jobs on in-process timers:

```ts
setInterval(() => tick().catch(() => {}), 60_000);            // mail queue
setInterval(() => checkReminders().catch(() => {}), 60_000);   // tour reminders
setInterval(() => checkStale().catch(() => {}), 30 * 60_000);  // walk-up expiry
```

`fly.toml` acknowledges the coupling explicitly: `auto_stop_machines = 'off'` with the comment *"the mail queue runs inside the app, so it must stay up."* Today it runs on `min_machines_running = 1`, so it is *currently* correct — but the architecture **cannot scale to 2+ machines** without (a) duplicate mail sends / duplicate reminder notifications, or (b) needing a leader election. There is no distributed lock around `tick()`/`checkReminders()`. **Recommendation:** extract scheduled work to a dedicated single-instance worker (or add a Postgres-based `pg_advisory_lock` / `FOR UPDATE SKIP LOCKED` claim around each job) so scaling the web tier never double-fires email. The mail queue already has retry bookkeeping (`mail_queue`), so adding a claim is low-risk.

### 4.2 · `force-dynamic` everywhere; no caching (P2)

The public catch-all page, the editor, and the API routes are all `force-dynamic` — **every public page render is a live Postgres read**, with no ISR/revalidate. The in-code comment (*"POC … Phase 2 moves to ISR"*) marks this as known-deferred. For a low-traffic community site this is acceptable *today*, but it is a hard scaling ceiling and a known missed optimization; the content is almost entirely read-mostly (pages change only on edit) and is an ideal ISR candidate.

### 4.3 · Secrets at rest in the `settings` table (P2)

S3 keys, SMTP2GO API key, DeepSeek key, and the ntfy upstream token are stored **in plaintext JSON** in the Postgres `settings` table (e.g. `mail.ts` `MailCfg.smtp2goKey`, `config.ts` S3 fallback, `ntfy.ts` `NtfyCfg.upstreamToken`). The code documents this as a `shortcut:` and defers it ("encrypt if the DB is ever shared"). `lib/vault.ts` (AES-256-GCM) already exists and is used for photo IDs and signed PDFs — it is just not applied to config secrets. Given the DB holds member PII (addresses, phone, photo IDs, signatures), this is a real at-rest-encryption gap. **Recommendation:** reuse `vault.seal/open` for the secret fields in `settings`-table configs, keyed by `PII_CRYPTO_SECRET` (or a dedicated `CONFIG_CRYPTO_SECRET`).

### 4.4 · `guard.ts` dev-mode full-admin bypass is a misconfiguration footgun (P2)

```ts
export const me = cache(async () => {
  if (process.env.NODE_ENV !== "production" && !process.env.AUTH_GOOGLE_ID) return { email: "dev", …, perms: ROOT };
  ...
});
```

In `NODE_ENV=production` this is inert. But any non-production deploy that omits `AUTH_GOOGLE_ID` (a staging build, or `next start` run without `NODE_ENV=production`) silently becomes **full admin for everyone**. The Dockerfile does set `ENV NODE_ENV=production`, so the production path is safe — but the footgun is real and the intent would be clearer and safer as an explicit `ALLOW_DEV_ADMIN=1` env flag (opt-in) rather than inferred from the absence of two values.

### 4.5 · Ops hygiene is otherwise strong (positive)

- Docker image pinned by digest, runs as non-root, production deps only, npm removed at runtime.
- `.env*`, `*.pem`, `*.key`, `ca.pem` are gitignored; verified nothing sensitive is tracked (only `.env.example` is present, with empty values).
- `docker-compose.yml` provides a faithful local Postgres (TLS on) + S3 (rustfs) stack.

---

## 5. Testability

### 5.1 · Pure-function coverage is good; I/O surface is untested (P2)

29 test files, ~1,030 LOC of tests, run via `node --test`. Coverage is solid for **pure logic**: `image`, `security`, `redact`, `limit`, `rules`, `priority`, `vault`, `esign`, `tours`, `calendar-feed`, `aiseo`, `httplog-util`, `waiver`.

What is **not** tested:
- **No DB integration tests.** Every module that embeds SQL (`crm.ts`, `mail.ts`, `store.ts`, `sign.ts`, `ntfy.ts`) is effectively untested end-to-end — the unit tests only exercise their pure helpers.
- **No HTTP/route tests** for the 75 API handlers or the RPC `switch` routers (which is exactly where the untyped-`any` risk in §1.2 lives).
- **No component/UI tests** for the admin surfaces or the guided renderers.

Given the `docker-compose` stack already provisions a local Postgres, a small integration test harness against a throwaway schema (or a per-run transaction) would cover the highest-risk untested surface. The codebase has already shown it values testability (`aiseo.ts`'s explicit purity comment) — extending that to a thin repository seam would make the SQL-embedding modules testable.

---

## 6. Strengths (keep doing this)

These are deliberate, well-executed properties that should be preserved through any refactor:

1. **Audit logging + revert is first-class.** Every write goes through `logAudit`, and `auditDetail`/`revertAudit` compute before/after snapshots with a working undo/restore for pages, menu, board, hours, robots, privacy, and guided pages. Rare in a site of this size.
2. **Defense-in-depth security** — timing-safe HMAC cookie comparisons, scrypt password hashing, AES-256-GCM for PII, `session_version` revocation, per-section RBAC with a locked founding admin, rate limiting (`lib/limit.ts`), honeypots, open-redirect guards (`safeNext`), middleware body-size caps, IP-hashed sign links, and secret redaction in debug/HTTP logs.
3. **`shortcut:` convention** — known limits are documented inline with an upgrade trigger (`// shortcut: <limit>, <when to upgrade>`), which is honest technical-debt bookkeeping.
4. **Image processing is isolated** in a forked worker (`workers/image-worker.mjs`) with pixel caps and timeout, so hostile files can't take down the web process.
5. **The AI and SEO modules** (§3.2) are clean, config-driven, and testable — a template for the rest of the codebase.

---

## 7. Prioritized roadmap

| # | Priority | Action | Where | Effort |
|---|---|---|---|---|
| 1 | P1 | Adopt versioned migrations; run in Fly `release_command`. Replace the `db.ts migrate()` + `mail.ts init()` inline DDL. | `lib/db.ts`, `lib/mail.ts`, `fly.toml` | Large |
| 2 | P1 | Add a claim/lock around in-process schedulers (or extract a single worker) so horizontal scaling can't double-fire email/reminders. | `instrumentation.ts`, `lib/mail.ts`, `lib/tours.ts` | Medium |
| 3 | P1 | Group `lib/` by domain/infra and split the god modules (`mail.ts`, `guided.tsx` first). | `lib/*`, `components/guided.tsx` | Medium, incremental |
| 4 | P1 | Add per-op request validation to the 13 RPC `switch` endpoints; stop reading untyped `a.*` into domain calls. | `app/api/**/route.ts` | Medium |
| 5 | P2 | Factor the duplicated `conn()` and `getX/saveX` settings helpers into shared seams; consider a thin repository layer to make SQL-embedding modules testable. | `lib/*` | Medium |
| 6 | P2 | Encrypt config secrets at rest in `settings` using `vault.ts`. | `lib/mail.ts`, `lib/config.ts`, `lib/ntfy.ts`, `lib/vault.ts` | Small |
| 7 | P2 | Replace the `me()` dev bypass with an explicit opt-in flag (`ALLOW_DEV_ADMIN=1`). | `lib/guard.ts` | Small |
| 8 | P2 | Add DB integration tests (local Postgres from compose) for the highest-risk write paths (crm, mail, sign). | `tests/*` | Medium |
| 9 | P2 | Move public page rendering off `force-dynamic` to ISR + revalidate-on-publish (close the deferred "Phase 2" item). | `app/[[...path]]/page.tsx`, `lib/store.ts` | Medium |
| 10 | P3 | Fix mid-file imports; reconcile README ("store = all queries") and the modularization plan with reality. | `lib/store.ts`, `README.md`, `docs/notes/` | Small |

---

## 8. Appendix — module inventory (LOC, top 25)

| File | LOC | Notes |
|---|---|---|
| `lib/mail.ts` | 622 | ESP monolith (config→tracking) |
| `components/guided.tsx` | 542 | 18 guided-page renderers |
| `lib/tours.ts` | 448 | tours + requests + threads |
| `lib/crm.ts` | 417 | directory/messaging/skills/tools/classes |
| `lib/sign.ts` | 346 | e-signature |
| `lib/store.ts` | 319 | pages/menu/settings/audit |
| `lib/ntfy.ts` | 317 | ntfy-compatible server |
| `lib/chores-calc.ts` | 307 | chore math |
| `lib/puck-config.tsx` | 305 | Puck component library |
| `app/members/wizard.tsx` | 292 | onboarding wizard |
| `app/admin/services/audit/audit.tsx` | 268 | audit UI |
| `lib/guided.ts` | 219 | guided schema defs |
| `app/members/chores/chores.tsx` | 219 | |
| `lib/readers.ts` | 214 | member auth (passwordless + password) |
| `lib/db.ts` | 214 | inline schema migration |
| `app/admin/mail/editor.tsx` | 209 | |
| `app/members/profile/profile.tsx` | 187 | |
| `app/admin/services/ntfy/ntfy.tsx` | 186 | |
| `app/admin/mail/emails.tsx` | 186 | |

*Full system: ~20,447 LOC across `app`/`lib`/`components`; 75 API route handlers; 29 test files (~1,030 LOC).*
