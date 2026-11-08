# AI optimization for every page, editable per page

Goal: make every page easy for search engines and AI assistants (ChatGPT, Perplexity, Google AI) to read, quote and cite, and let editors override the result per page in the page editor.

## Where it hooks in

- Per-page settings are Puck **root fields** in `lib/puck-config.tsx` (`root.fields`, `RootProps`). Title and description already live there. Any new root field shows up in the editor and is saved with the page, with revisions, for free.
- The public page reads them in `generateMetadata` in `app/[[...path]]/page.tsx`.
- AI calls go through `lib/ai.ts` (`SCENARIOS`, `complete()`); prompts live in `lib/ai-prompts.ts` and are editable in Admin > AI.

## Part 1: Automatic defaults for every page

New `lib/aiseo.ts` builds the optimization data from page data:

1. **Metadata:** title, description, canonical URL, OpenGraph/Twitter, via `generateMetadata`.
2. **JSON-LD** (`<script type="application/ld+json">`): `LocalBusiness`/`Organization` on home (address and hours from `getHours()`), `FAQPage` where a page has FAQ blocks, `Article` for blog posts, `BreadcrumbList` everywhere.
3. **`/llms.txt` and `/llms-full.txt`:** new route like `app/robots.txt/route.ts`; lists each page with title, one-line summary and URL, built from `listPages()`.
4. **Plain-text summary per page:** extracted from the Puck content so it is never stale.

## Part 2: Per-page editing (root fields, group "AI / SEO")

All optional overrides; blank means use the Part 1 default.

- `aiSummary` (textarea): 2-3 factual sentences, used in `llms.txt` and JSON-LD description.
- `aiFaqs` (array of question + answer): becomes `FAQPage` schema.
- `schemaType` (select): auto, LocalBusiness, Event, Course, Article, FAQ, none.
- `canonical` (text), `noindex` (radio).
- `aiExclude` (radio): omit from `llms.txt`, optionally `Disallow` AI crawlers for that path in robots.

## Part 3: AI fills in the defaults

- Add scenario `page-seo` to `SCENARIOS` in `lib/ai.ts`; prompt in `lib/ai-prompts.ts`, editable in Admin > AI.
- "Suggest with AI" button in the editor sends the page text to the model and fills `description`, `aiSummary`, `aiFaqs`.
- Editor reviews and edits before saving. Never auto-publish.

## Part 4: Bulk run

Admin button "Generate for all pages missing a summary": loops pages, writes only to empty fields, never overwrites hand edits.

## Build order

1. Part 2 fields + metadata and JSON-LD wiring.
2. `llms.txt` route.
3. AI suggest button, then bulk run.

Steps 1-2 are small and have no AI cost. Step 3 adds model spend, kept low by the price cap in `ai-prompts.ts`.

## Not checked / risks

- How Puck's `Render` handles head tags in this setup.
- Whether existing pages have FAQ-style blocks to map to `FAQPage`.
- AI-generated summaries can state untrue things; keep human review.
