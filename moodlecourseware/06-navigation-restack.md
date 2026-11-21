# Navigation restack

`reorgzniation-plan.md` already says the admin chrome is overloaded (9 tabs, Training scattered through People). This plan adds two areas, so it also fixes the neighbourhood. Everything is one edit to `web/lib/nav-manifest.ts` (+ `access.ts` sections); that file is the single source for tabs, side menus, titles, permissions and alert badges.

## Admin: today

Top groups: Home · Members (people, tours, makerfavor, training) · Communications · Website · SignDocs · System.
Training lives as five items buried in the **People** side menu (queue, tests, reports, trainers, settings) plus a **Classes** item.

## Admin: proposed

Add one top group, **Learn**, between Members and Communications.

```
Home | Members | Learn | Communications | Website | SignDocs | System
```

**Learn** group = two tabs (sections `learning`, `library`; the existing `training` section moves in):

| Tab | Zone | Items |
|---|---|---|
| **Courses** | Work | Courses · Practice quizzes · **Tests** (moved from People) · **Sign-off queue** (moved, keeps alert badge) |
| | Records | Progress (who's stuck) · Learning reports · Training reports (moved) |
| | Settings | Paths · Trainers (moved) · Tags · Training settings (moved) |
| **Library** | Work | Documents · Upload · Pending review (drafts) |
| | Records | Share links · Acknowledgements |
| | Settings | Folders & order · Tags · Types & tiers |

Rules for the move:
- URLs under `/admin/people/training/*` **redirect** to the new ones (permanent), and permission keys keep working through an alias, so bookmarks, emails, Discord links and the lead runbook don't break. Docs in `docs/training/` get a find/replace.
- **Classes** (workshops you attend in person) stays in People; the name collision with "courses" is real, so labels are: *Classes* = in-person events, *Courses* = online learning. The members menu spells this out.
- "Tools & sign-offs" stays in People (it's the tool record) and gets the Learning panel from `05`.

## Members menu: today

Home · Membership agreement · Handbook · Member directory · Classes · Tool authorizations · MakerFavor · Gov ID · My profile.

## Members menu: proposed (grouped, with headings)

```
Home
LEARN
  Courses              (new: continue card, paths)
  Library              (new)
  Tool authorizations  (existing, now the track view)
  Classes
THE SHOP
  Handbook
  MakerFavor™
  Member directory
ME
  My profile
  Membership agreement
  Gov ID
```

Why: today's list is ordered by when things were built. Grouped by intent, a member finds "I want to use the planer" under Learn without knowing the word "authorization". The `Collapse` side menu already supports this layout style (admin uses zone headings); members get the same.

## Smaller fixes included

- Top bar on members currently has one tab ("Members"); with Learn, make **Home · Learn · Shop · Me** the top bar on mobile and keep the side menu on desktop.
- "Tool authorizations" gets a one-line description under it ("Learn it, pass it, get signed off").
- A global **⌘K / "/" search** across courses, library and handbook (members) and across admin pages (admin). One component, two data sources; this is the single biggest "feels fast" feature.
- Alert badges: `training` keeps its count; add `library-review` (drafts waiting) and `ack-needed` for staff.
