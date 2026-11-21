# Document Library

A separate product from courses. Think "the shop's filing cabinet that actually works": manuals, safety guides, SOPs, spec sheets, forms. Courses and tool pages *link into* it.

## Document types

Manual · Safety guide · SOP · Spec sheet · Form · Other. A type drives the icon, the default tier, and whether "acknowledge" is offered (SOP and Safety guide by default).

## Organisation (three ways to find anything)

1. **Tiered index** (the browse tree). Up to 3 levels, e.g. `Wood shop › Table saw › Manuals`. Admins create and **drag to reorder** folders and documents; documents may appear in more than one place (a "shortcut", not a copy).
2. **Tags** (flat, many per document): `table-saw`, `PPE`, `lockout`, `Powermatic`. Tag pages list everything with that tag; tags autocomplete; admins can merge and rename.
3. **Search**: Postgres `tsvector` over title, tags, description, and **extracted PDF text** (pulled once at upload by a worker with `pdfjs-dist`; scanned PDFs without text are flagged "not searchable" so someone can OCR them).

Also: **Pinned** (top of the library), **Recently updated**, **My bookmarks** (members).

## Tiers (who can see it without a token)

| Tier | Who |
|---|---|
| Public | Anyone, no login (also listed on the public site if "listed" is on) |
| Members | Any approved member |
| Authorized | Members with an effective `tool_auths` row for the linked tool(s) |
| Staff | Trainers and admins |

Tier is per document; folders only group. A document in a folder you can't see is simply absent for you, with no "locked" teasers leaking titles of staff-only docs.

## Sharing

- **Share link**: `/d/<token>`, token is 128 bits random, stored hashed. Options: view-only or allow download, expiry (1 day, 7 days, 30 days, never), optional passcode, and **revoke** at any time.
- Links serve the **current version**. A revoke or expiry is immediate.
- Each link records open counts and last open (no IP stored; consistent with the site's PII rules in `docs/pii-audit-access-system.md`).
- A stable **permalink** for members, `/library/<slug>`, is separate from share links and obeys the tier.
- Social/preview: Share links render an Open Graph card (title, first-page thumbnail) only for Public-tier documents. Tokened links to non-public docs send `noindex` and no preview image.
- QR code per document (generated server-side) for printing and sticking on the machine. This is the killer shop feature: scan the QR on the table saw, get the manual and SOP, and a button for the course.

## Versioning and acknowledgement

- Upload a new file to a document → new version with a change note. Old versions are kept, visible to staff, never served by default.
- **Acknowledge**: for SOP/Safety types, members tap "I've read version 3". Records `(user, doc, version, at)`. Staff see "who hasn't read the current version". A new version flagged "requires re-read" prompts holders. Member-facing prompt is a notice, not an email, unless the lead chooses email.

## Upload pipeline

1. Drag files onto the page (many at once). PDFs only in v1; (images/Docx later).
2. Server validates: magic bytes (`lib/pdf-detect.ts`), size limit from the existing Upload limits setting, filename sanitised.
3. Store in S3 (`lib/s3.ts`), key by random id, never by filename.
4. Worker: page count, first-page thumbnail (webp), text extraction, "has text" flag.
5. Document starts as **draft**, with title guessed from the filename, so a bulk upload of 40 manuals then needs only tagging and sorting.
6. **Bulk edit**: select many, set tier/tags/folder in one go.

## Viewing

- In-page viewer using the already-installed `@embedpdf/viewer-react`; fall back to download. Bigger controls, jump-to-page, search in doc, remembers last page per member.
- Downloads set `Content-Disposition` and `X-Content-Type-Options: nosniff`; PDFs never rendered from the site's own origin with scripts enabled (serve via the viewer, not `<iframe src=pdf>` from a user-controlled path). The nginx MIME note in `docs/nginx-pdfjs-mime-types.conf` applies.

## Admin screens

- **Library home**: tree on the left, document grid/list on the right, drag to reorder, drag between folders, drag a file in from the desktop to upload into the open folder.
- **Document detail**: metadata, tags, tier, linked tools, versions, share links, acknowledgement report, "used in courses" list (so you know what breaks if you delete it).
- **Tags**, **Share links** (all links, with revoke), **Acknowledgements** report.

## Reordering and accessibility

Drag handles plus keyboard (focus a row, Space to pick up, arrows to move, Space to drop, Esc to cancel) and a live-region announcement. A "Move to…" menu is the non-drag fallback, which also covers touch.
