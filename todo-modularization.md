# TODO: Modularize the site → everything editable in Puck

Branch: `poc` (local only, not pushed). Repo is **PUBLIC**: no secrets in git, ever.

## Goal
1. Every currently-static page is editable WYSIWYG (visual mode) via [Puck](https://github.com/puckeditor/puck).
2. Editors can **create new pages** and **delete existing pages** from the UI.
3. Visual styling stays identical (Bootstrap 4 + Themefisher + `css/style.css`). The *framework* may change; the *look* may not.

## Current state (what we're migrating from)
- ~106 hand-written `.html` files at repo root, Bootstrap 4, jQuery, Themefisher icon font, `plugins/*`.
- Shared chrome is already half-modular: `dynamic/js/{navbar,footer,hours,counters}.js` render from `dynamic/json/*.json`. These JSONs become DB rows / Puck globals.
- Calendar: `cal.ics` (~600KB) + `ical/` parser + `dynamic/js/calendar*.js`, all client-side.
- Inventory pages: `dynamic/json/inventory-*.json` + `dynamic/js/inventory*.js`.
- Contact form: OpenResty/Lua + SMTP2GO + HMAC tokens (`docs/contact/`), needs replacing since we're leaving nginx.
- Hosting today: static (nginx / `wrangler.toml` Cloudflare assets).
- Junk to delete before migrating: `*.bak`, `*.html-bak`, `index.html-bak`, `contact copy.html`, `calendar.html.backup-do-not-touch` (**ask owner first**), `demo*.html`, `calendar2.html`, `onepage-*.html`, `index-text.html`, `contact-new.html`.
- Many near-duplicate templated pages (`s-makerspace-<city>.html`, `s-wood-shop-*`, `s-welding-shop-*`, `s-tool-rental-*`, `how-to-*`, `meetup-*`). These should become **one component/template + data**, not N pages.

## Target architecture
```
Browser ──> Fly.io app (Next.js, Node)  ──> Aiven (shared SQL)  : pages, globals, users
                │                         └─> Fly volume or S3  : uploaded images/PDFs
                ├─ /[...path]   renders Puck JSON with <Render/> (public, SSR/ISR)
                ├─ /edit/[...path]  <Puck/> editor (auth required)
                └─ /api/*       publish, create, delete, upload, contact form
```
- **Framework: Next.js (App Router)** — Puck's first-class integration; dynamic catch-all route gives create/delete pages for free.
- **Puck data model:** each page = one row `{ path, title, data(JSON), published, updated_at }`. Puck `Data` JSON is stored as-is.
- **Globals:** navbar, footer, hours, counters = single-row "globals" table (or Puck `root` props) edited in the same UI.
- **Styling:** keep `css/style.css` + `plugins/*` served from `public/`; Puck components emit the *same markup/classes* as today's HTML. Do not rewrite CSS to Tailwind.

## Infrastructure checklist (the stuff not to forget)

### Secrets: PUBLIC repo rules
- [x] `.gitignore` blocks `.env*`, `*.pem`, `*.key` (done on `poc`).
- [x] `.env.example` documents every variable with **empty** values.
- [ ] Enable GitHub **secret scanning + push protection** (Settings → Code security).
- [ ] Audit git history for leaked keys before going further (`gitleaks detect`). Rotate anything found (SMTP2GO key, HMAC secret in `docs/contact/lua/*`).
- [ ] Prod secrets: `fly secrets set DATABASE_URL=... AUTH_SECRET=... SMTP2GO_API_KEY=...`
- [ ] CI secrets: GitHub → Settings → Secrets and variables → Actions (`FLY_API_TOKEN` from `fly tokens create deploy`).

### Aiven (shared SQL)
- [ ] Create service (MySQL or PostgreSQL; **recommend Postgres**: JSONB fits Puck data). Free/shared tier has small limits: connection cap, storage, **no HA**; keep pool size ≤ 5.
- [ ] Download CA cert; require TLS from the app.
- [ ] Create a least-privilege app user + separate DB; don't use `avnadmin` in the app.
- [ ] Aiven IP allow-list: Fly egress IPs aren't static by default → allocate a static egress IP (`fly ips allocate-egress`) and allow-list it (and your dev IP).
- [ ] Backups: confirm retention on the plan; add a weekly `pg_dump` to somewhere else (shared tier backups are limited).
- [ ] Migrations tool (Drizzle or Prisma) with migration files committed; run in a Fly `release_command`.

### Fly.io
- [ ] `fly launch` → `fly.toml` (no secrets in it), `Dockerfile` (Node, `output: "standalone"`).
- [ ] Volume mounted at `/data` for uploads (or S3-compatible bucket; volumes are single-region/single-machine).
- [ ] Custom domain `kzoomakers.org`: `fly certs add`, update DNS.
- [ ] Health check endpoint, 1 machine to start (cost), auto-stop off if cold starts hurt.
- [ ] GitHub Action: deploy on push to `main` with `flyctl deploy --remote-only`.
- [ ] Remove `wrangler.toml` and nginx assumptions once cut over.

### Auth for the editor
- [ ] `/edit/*` and all write APIs require login. Start simple: Auth.js (GitHub or email magic-link) + `ADMIN_EMAILS` allow-list. Public site never needs auth.
- [ ] CSRF / origin checks on write APIs; validate Puck JSON with a schema before saving.

### Contact form / email
- [ ] Port the Lua flow to a Next.js route handler: validation, Cyrillic filter, rate limit (per IP), SMTP2GO API call, HMAC token. Secrets from env only.

### Uploads / media
- [ ] Move `images/` to `public/images/` (existing refs keep working). Editor uploads go to `/data/uploads` or S3; Puck image field uses an upload API.
- [ ] Keep `pdfs/`, `pdfjs/`, `download/` as static assets.

### SEO / redirects (don't lose rankings)
- [ ] Keep URL paths. Old `/about.html` → 301 to `/about` (or serve both).
- [ ] Generate `sitemap.xml` and `robots.txt` from DB pages.
- [ ] `<title>`, meta description, OG tags editable per page (Puck `root` fields).

## Phases

### Phase 0: POC (this branch)
- [ ] Scaffold Next.js in `app/` (or `/web`) alongside the legacy HTML; legacy untouched.
- [ ] Install `@measured/puck` (check current package name in puckeditor/puck README).
- [ ] Port theme: copy `css/`, `plugins/`, `images/` into `public/`; load in root layout; verify identical render of one page.
- [ ] Components for ONE page (`about.html`): `PageHeader`, `TwoColumnText`, `ImageBlock`, `VideoEmbed`, `CallToAction`.
- [ ] Persist to local SQLite/JSON for the POC; edit at `/edit/about`, view at `/about`.
- [ ] Shared `Navbar`/`Footer` rendered from globals.
- **Exit criteria:** side-by-side screenshot of `about.html` vs `/about` matches; edit + publish works.

### Phase 1: Component library
- [ ] Inventory every section pattern across the 106 pages (hero/page-header, text+image, card grid, gallery/lightbox, team grid, FAQ/accordion, pricing, CTA, timeline, table, form, embed, markdown/rich-text).
- [ ] One Puck component per pattern; fields mirror the classes actually used.
- [ ] Rich-text field for long-form content (handbook, how-to guides, SOPs).
- [ ] Data-driven components: Hours, Counters, Events list, Inventory table, Team.

### Phase 2: Database + CRUD
- [ ] Schema: `pages`, `globals`, `users`, `page_revisions` (undo/restore).
- [ ] Pages UI (`/edit`): list, **create** (choose template), **duplicate**, **delete** (soft-delete + confirm), publish/unpublish, change slug (auto-redirect).
- [ ] Protect core pages (home, 404, contact) from deletion.

### Phase 3: Content migration
- [ ] Script: parse each legacy `.html` `<section>` → Puck component JSON (cheerio). Hand-fix leftovers.
- [ ] Collapse templated families (`s-makerspace-*` etc.) into a template component + per-city data.
- [ ] Import `dynamic/json/*.json` into globals/tables.
- [ ] Diff each page visually (Playwright screenshots) old vs new.

### Phase 4: Dynamic features
- [ ] Calendar: decide source of truth (keep `cal.ics` feed from external calendar vs. DB events). Server-side or client-side `ical/` parsing; "add whole series" + print button must keep working.
- [ ] Inventory editors (woodshop / donations needed) as editable tables.
- [ ] Contact form (see above).

### Phase 5: Deploy + cutover
- [ ] Fly staging app + Aiven staging DB.
- [ ] Content freeze, final migration run, DNS cutover, 301 map verified.
- [ ] Keep legacy static site reachable for rollback for 2 weeks.

## Open questions for owner
- Who gets editor accounts? (drives auth choice)
- MySQL vs Postgres on Aiven? (recommend Postgres)
- Is `cal.ics` fed from Google Calendar or hand-maintained?
- OK to delete the `.bak` / demo / duplicate pages listed above?
- Uploads: Fly volume (simple) or S3-compatible bucket (survives machine loss)?
