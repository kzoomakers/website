# Cutover: point kzoomakers.org at the Fly app

Do this once the site works at `https://kzoomakers-org-website.fly.dev` (see `fly.md`). Until then keep `SITE_URL` on the `fly.dev` address: emailed links and the sitemap are built from it, so setting the real domain early sends people to the old site.

No real values go in this file or in git.

## Before you start

- [ ] Sign in works on the `fly.dev` URL, and `/admin/services` shows storage and the signing certificate as set.
- [ ] A test email (mail settings) sends and its link opens the Fly app.
- [ ] You can edit DNS for `kzoomakers.org`, and you know the TTL (lower it a day ahead if you want a fast rollback).

## Steps

1. **Add the certificates**
   ```sh
   fly certs add kzoomakers.org
   fly certs add www.kzoomakers.org     # only if you use www
   fly certs show kzoomakers.org        # prints the DNS records to create
   ```
2. **Create the DNS records** `fly certs show` printed (A/AAAA for the apex, CNAME for www), at your DNS provider. Wait until `fly certs show kzoomakers.org` says the certificate is issued.
3. **Add the Google redirect URI** in Google Cloud: `https://kzoomakers.org/api/auth/callback/google`. Keep the `fly.dev` one until you are sure.
4. **Switch `SITE_URL`** (needs the `https://` prefix; this restarts the machine):
   ```sh
   fly secrets set SITE_URL=https://kzoomakers.org
   ```
   Also change it in your local `.env.prod`, so a later `fly secrets import < .env.prod` does not put the old value back.
5. **Check the mail Site address** in the admin mail settings. A value saved there wins over `SITE_URL` (`baseUrl` in `lib/mail.ts`), so clear it or make it match.
6. **Verify**
   - `https://kzoomakers.org` loads over HTTPS and sign in works.
   - Send a test email and a tour/subscribe confirmation: the links start with `https://kzoomakers.org`.
   - `https://kzoomakers.org/sitemap.xml` lists `kzoomakers.org` URLs.

## Rollback

Point DNS back at the old host (this is why a short TTL helps), then `fly secrets set SITE_URL=https://kzoomakers-org-website.fly.dev`. Nothing in the database depends on the domain, so there is nothing to undo there.

## After

Once happy, remove the `fly.dev` redirect URI from Google Cloud. If the old host stays around, make sure it does not also serve the site (duplicate content).
