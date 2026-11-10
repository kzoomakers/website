# Analytics: setup and how to use it

Everything here is optional and off until an admin turns it on in **Admin > Setup > Analytics & cookies**. Reports are read at **Admin > Website > Analytics**.

## 1. Set up (admin, once)

| Step | Where | What |
|---|---|---|
| Tracking tag | GA4 Admin > Data streams | Copy the Measurement ID (`G-XXXXXXXXXX`) into the settings page and tick **Turn on Google Analytics**. |
| Reports | Google Cloud | Enable the **Google Analytics Data API**. Create a service account and a JSON key. |
| Reports | GA4 Admin > Property access management | Add the service account's email as **Viewer**. |
| Reports | GA4 Admin > Property details | Copy the numeric Property ID. Paste it and the whole JSON key into the settings page. **Test connection** checks both. |
| Search terms (optional) | Google Cloud | Enable the **Google Search Console API** in the same project. |
| Search terms (optional) | search.google.com/search-console > Settings > Users and permissions | Add the service account's email. **Restricted** is enough. Only a site owner can do this. |
| Search terms (optional) | Settings page | Paste the site exactly as Search Console lists it: `sc-domain:example.org` or `https://example.org/`. |

The key is stored encrypted and never shown again. If Search Console permission is missing, the section is left out of the Analytics page (a wrong site name or missing permission shows a short note saying what to fix).

## 2. The Analytics page

- **Range**: 7, 30 or 90 days, or **Custom range** (up to a year). Each number is compared with the period of the same length just before it.
- **Active now**: people on the site in the last 30 minutes (refreshes every minute while the page is open).
- **Per-day chart** (visitors, sessions or page views) with the average and best day. **Top sources over time** shows the five biggest sources day by day.
- **Busiest times**: weekday x hour heat map in **Eastern time** (Google's hours are converted from the property's time zone).
- **Lists**: pages, landing pages, sources (with AI assistants flagged), channels, new vs. returning, countries, cities, devices, browsers, operating systems, events.
- **What visitors do, by where they came from**: tours booked or requested, contact messages and newsletter signups, per first source.
- **Crawlers vs. people**: requests from AI and search bots, counted from the server's HTTP log (Google Analytics cannot see bots), next to the visits people made from AI assistants.
- **Search terms / pages found in search**: from Search Console. Runs about 2 days behind.
- **Download CSV** exports every table on the page.

Google reports are cached for an hour (Search Console 30 minutes, crawlers 10). Google leaves out small counts and takes about a day to finish processing, so the last day can still grow.

## 3. Alerts (push)

The special topic **`google-analytics-notices`** receives a message when yesterday had at least **2x** the usual visitors (a spike) or at most **40%** (a drop). "Usual" is the average of the 14 days before, and the site needs a usual of at least 15 visitors a day, so a quiet site doesn't raise alarms. At most one alert per day, checked after 6am on Google's clock so a day still being counted never looks like a drop. A day with no visitors at all counts as zero, so a fully broken site or tag does raise the drop alert. A drop usually means the site or the tracking tag broke.

To get them, an admin opens **Setup > Analytics & cookies > Alerts and weekly email**, picks a person and clicks **Add**. This attaches that person's own ntfy topic to `google-analytics-notices` (the same way tour notifications work). The topic also shows in **Setup > Alert delivery**.

## 4. Weekly email

Same section: tick **Send a weekly email summary**, enter one address per line (up to 20), **Save weekly email**. It goes out Mondays from 8am Eastern with visitors (and the change), top pages and sources, AI visits, busiest hour and top searches. **Send it now** mails the saved list immediately to test it. It needs email to be set up under Setup. If Google or mail fails on Monday, it is retried every hour until it works.

## 5. Where visitors came from (cookie)

After a visitor clicks **Accept**, the site stores one cookie, `ft`, for 90 days with the website or `utm_source` they first arrived from (or `direct`). When they book a tour, send a message or sign up, one row is stored: what they did and that source. **No name, email, IP or id is stored with it.** Visitors who never accepted cookies are counted as "not known". Withdrawing consent (Cookie settings link) deletes the cookie. The privacy page describes this automatically while Google Analytics is on.

Tip for campaigns: add `?utm_source=newsletter` to links you share and it will show up as its own source.

## How it works (for maintainers)

| File | Job |
|---|---|
| `web/lib/ga.ts` | Settings, service-account login, GA4 report calls, caching, shaping. |
| `web/lib/gsc.ts` | Search Console queries. Any failure becomes `{ ok: false }`. |
| `web/lib/ga-bots.ts` | Names bots from user agents; counts them in `http_log`. |
| `web/lib/ga-attr.ts` | `ga_conversions` table and the `ft` cookie reader. `convert(req, kind)` is called by the tour, contact and subscribe routes. |
| `web/lib/ga-digest.ts` | Pure spike detection and email wording (tested). |
| `web/lib/ga-notify.ts` | Alert and weekly jobs, topic subscribers. Scheduled in `web/instrumentation.ts`. |
| `web/components/ga-tag.tsx` | Loads the tag after consent and sets the `ft` cookie. |

Tests: `cd web && npm test` (`tests/ga.test.mjs`, `tests/ga-extras.test.mjs`).
