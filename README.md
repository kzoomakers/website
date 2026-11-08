# Kzoo Makers website

Next.js (App Router) site for the Kalamazoo Makerspace. Content is stored in Postgres and edited in the browser by signed-in admins; uploaded images go to S3-compatible storage.

> **This repo is PUBLIC. Never commit secrets.** Real values live in `.env` (gitignored) locally and in the host's secrets in production. `.env.example` lists every variable with empty values.

## Layout

```
web/                 the app (everything is built from here)
  app/
    [[...path]]/     public site: renders a page from the database
    edit/            Puck visual editor for free-form pages
    admin/       admin portals: webmaster/ (site) and mail/ (mailing lists)
    api/             pages, hours (public), webmaster/* (admin), auth
    uploads/         serves uploaded images from S3
  components/        site chrome (navbar, footer) and the "guided" page renderers
  lib/               db, store (all queries), guided schemas, hours, config, S3
  data/              seed content loaded on first run (pages, guided, board, globals, hours)
  public/            static assets: css, js, images, plugins, pdfs, cal.ics, ...
  scripts/migrate.mjs  historical: one-time converter from the old static HTML site
scripts/             helper scripts (google-env.mjs writes OAuth values into .env)
docs/                contact-form notes and planning notes
Dockerfile, docker-compose.yml   local production-like stack
```

The old hand-written static `.html` site was removed from this branch; every page lives in `web/data/pages/*.json` now. Recover the originals from git history if needed.

## Run it locally

```sh
cp .env.example .env     # fill in AUTH_SECRET, AUTH_GOOGLE_ID/SECRET, ADMIN_EMAILS
docker compose up --build   # site on http://localhost:3000
```

1. Open `/admin/webmaster` and sign in with Google (only `ADMIN_EMAILS` may enter; `@domain` admits a whole domain).
2. The first time, the setup screen asks for Postgres and storage. The compose file starts both; the values to enter are in the comments in `docker-compose.yml`.
3. After setup the site seeds itself from `web/data`.

Without Docker: `cd web && npm ci && npm run dev` (still needs a Postgres and an S3 endpoint). Next only reads env files inside `web/`, so put the values from `.env` in `web/.env.local` (also gitignored); otherwise Google sign-in fails with `client_id=undefined`.

Google OAuth redirect URI: `http://localhost:<port>/api/auth/callback/google` (3000 under Docker, whatever port `next dev` prints otherwise; production needs its own entry). `node scripts/google-env.mjs <client_secret.json>` copies the values into `.env`.

## How content is edited

| Kind | Where | Notes |
| --- | --- | --- |
| Free-form pages | `/edit/<slug>` (Puck) | Drag-and-drop; create and delete pages from `/admin/webmaster`. |
| Guided pages | `/admin/webmaster/guided/<slug>` | Fixed layout, edited through forms: Homepage, About, Pricing, Team, Handbook, Contact, shops, ... |
| Calendar, Board | `/admin/webmaster/calendar`, `/admin/webmaster/board` | |
| Hours & address | `/admin/webmaster/hours` | Also served at `/api/hours`; `{address}`, `{street}`, `{addressQ}` in page text are replaced with the saved address. |
| Menu | `/admin/webmaster/menu` | Site navigation. |
| Audit log | `/admin/webmaster/audit` | Every change, with before/after and revert. |
| Services | `/admin/webmaster/setup` | Postgres and storage connection. |

Every screen keeps revision history and can revert.

## Data

Postgres tables: `pages` (Puck JSON per slug), `settings` (menu, board, hours, calendar, `guided:<slug>`), `audit`, `page_revisions`. Created automatically on first connect.

Seed files in `web/data` are inserted only if the row is missing, so editing them does not change an existing database. The exception is the pages listed in `LOCKED` (`web/lib/db.ts`): those are managed by their webmaster screen and their page files are re-loaded on every start.

## Adding or changing a guided page

1. Add its schema to `web/lib/guided.ts` (fields drive the form, validation and revision diffs).
2. Add a renderer to `web/components/guided.tsx` and register it in `VIEWS`.
3. Add `web/data/guided/<slug>.json` (starting content) and the slug to `GUIDED_SEEDS` and `LOCKED` in `web/lib/db.ts`.
4. Add a `Guided` block with `kind: "<slug>"` to `web/data/pages/<slug>.json` and a link in `web/app/webmaster/nav.tsx`.

## Uploads

Images are uploaded through `/api/webmaster/upload`, resized with sharp (avatars to 240px squares, everything else to at most 2000px wide, GIFs untouched) and served from `/uploads/<key>`.

## Security notes

- `/edit`, `/admin/webmaster` and `/api/webmaster/*` return 404 or redirect to sign-in unless the Google account is in `ADMIN_EMAILS`.
- `docker-compose.yml` contains throwaway local-only passwords. Never reuse them anywhere real.
- The contact form's original design (nginx + Lua + SMTP2GO) is in `docs/contact/` and still needs a replacement here.

## More

Planning notes: `docs/notes/todo-modularization.md`.
