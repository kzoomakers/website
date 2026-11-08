# Deploying to Fly.io

App: `kzoomakers-org-website` (region `ord`, config in `fly.toml`). This repo is public: **never commit real values**. Secrets live in Fly (`fly secrets`) and in the database, not in git.

## Where each setting lives

| Setting | Where | How to change |
|---|---|---|
| `DATABASE_URL`, `DATABASE_CA` | Fly secrets | `fly secrets set` |
| `AUTH_SECRET`, `PII_CRYPTO_SECRET` | Fly secrets | `fly secrets set` (see warning below) |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `ADMIN_EMAILS`, `SITE_URL`, `AUTH_TRUST_HOST` | Fly secrets | `fly secrets set` |
| Image storage (S3) | Database, encrypted-at-rest by your provider | `/admin/services` |
| Signed-PDF certificate | Database, encrypted with `PII_CRYPTO_SECRET` | `/admin/services` |
| Mail, AI keys, ntfy | Database | their admin pages |

Only the database connection is needed to boot. The app's disk is wiped on every deploy, so nothing is saved there (the app refuses to write `config.json` on Fly).

> **Back up `PII_CRYPTO_SECRET`** (password manager). Losing or changing it makes photo IDs, signed PDFs and the stored certificate unreadable.

## First deploy

```sh
# 1. local file with real values; .env.* is gitignored, check with: git check-ignore .env.prod
cp .env.example .env.prod      # fill in; also add SITE_URL=https://... and AUTH_TRUST_HOST=true
# 2. secrets (the CA is multiline, so set it from the file; ca.pem is gitignored)
fly secrets import < .env.prod
fly secrets set DATABASE_CA="$(cat ca.pem)"
# 3. ship it
fly deploy
fly logs                        # watch for Postgres / certificate errors
```

Then:
1. Add `https://<app>.fly.dev/api/auth/callback/google` (and your own domain's) as a redirect URI in Google Cloud.
2. Sign in, open `/admin/services`, save the storage settings, and click "Generate a certificate".

Moving the real domain over: see `fly-cutover.md`.

## Updating

| What changed | Do |
|---|---|
| Code | `git push`, then `fly deploy` |
| One secret | `fly secrets set NAME=value` (restarts the machine) |
| Several secrets | edit `.env.prod`, then `fly secrets import < .env.prod` (replaces matching names; others stay) |
| Remove a secret | `fly secrets unset NAME` |
| Storage / certificate / mail | the admin pages, no deploy |

Check what is set (names and digests only, never values): `fly secrets list`.

## Keeping secrets out of git

- Real values go only in `.env.prod`, `ca.pem`, and Fly. `.gitignore` covers `.env`, `.env.*` (except `.env.example`), `*.pem`, `*.key`.
- Before committing: `git status` and `git diff --staged`; nothing named `.env*` or `*.pem` should appear.
- `fly.toml` is safe to commit: it holds no secrets. Do not add secrets under `[env]`; that section is plain text in git.
- Never paste secrets into `fly deploy --build-secret`, issues, PR text or logs.
- If a secret leaks: rotate it (`openssl rand -base64 32` for `AUTH_SECRET`, new Google client secret, new database password), run `fly secrets set`, and treat git history as compromised. Rotating `PII_CRYPTO_SECRET` is **not** safe without a re-encrypt step.

## Optional: deploy on push

`.github/workflows/fly-deploy.yml` (made by `fly launch`) runs `fly deploy` on every push to `main`. It needs a token stored in GitHub, never in the repo:

```sh
fly tokens create deploy -a kzoomakers-org-website   # copy the output
# GitHub: Settings > Secrets and variables > Actions > New secret: FLY_API_TOKEN
```

Without that secret the workflow fails. Delete the file if you would rather deploy by hand.

## Useful commands

```sh
fly status          # machine state
fly logs            # live logs
fly ssh console     # shell on the machine
fly releases        # deploy history
fly deploy --image <ref>   # roll back to an earlier image (see `fly releases --image`)
```
