# DocuSeal port plan

Goal: bring the parts of `/Users/jon_k/workspace/docuseal` we like (signing order, field markup, auto-detect, signer UX) into the eSign admin (`web/app/admin/esign`, `web/lib/sign*.ts`, `web/lib/pdf-*.ts`).

## 0. Read this first

- **We are not starting from zero.** eSign already has: roles (signer / approver / viewer / cc), `sequential` flag + per-signer `ord` (`sign.ts advance()`), a click-to-place field editor with drag/resize (`new-paper.tsx`), heuristic auto-detect (`lib/pdf-detect.ts`: AcroForm fields, `{{type, r1}}` tags, blank lines, caption labels, checkbox glyphs), templates + public link, password / email-code lock, decline, reminders, due dates, audit trail, encrypted PDFs. This plan covers only the **gaps**.
- **Licence.** DocuSeal is AGPL-3 plus a clause requiring its attribution to stay in interactive UI. Copying its Ruby/Vue code into this repo makes our site AGPL. **Plan = re-implement the ideas in TypeScript, copy no code.** Its ONNX field model (`tmp/model.onnx`) is not in the repo, so there is nothing to port there anyway (see 3).
- Each phase ships as its own PR. Order is by value for effort.

## 1. Signing order (small, do first)

What DocuSeal does that we don't:

| DocuSeal | Us today | Port |
|---|---|---|
| Order is per submission: `random` or `preserved` (`submitters_order`), and it is a **template default** the sender can override | One boolean `sequential`; template stores it in `setup` | Keep the boolean, add "Order: anyone / in order" as a template default (already stored in setup, just confirm the UI shows it) |
| Position = the order of signers in the list; reorder by dragging | Manual `ord` number; equal numbers = parallel | **Drag-to-reorder signer list** that rewrites `ord`. Keep equal `ord` = parallel stage (better than DocuSeal). Show "Step 1, 2, 3" badges |
| Later signers see a "waiting for X" screen, not an error (`authorized_for_form`) | Link works only after `advance()` mails it | Add a "waiting on {name}" page for a token whose `sent_at` is null instead of a generic invalid-link |
| Signers' fields are **prefilled from earlier signers** and read-only | no | Show earlier signers' completed values/stamps on the page the next signer sees |
| `require_all_submitters` | have `needed` (N of M) | already covered |
| Delegate / reassign a signer | no | `POST` reassign: new name+email, new token, old one invalidated, audit row |
| Auto-reminders (`reminder_durations`) | manual "remind" only | cron: re-mail unsigned signers at +1d/+3d/+7d (setup option) |
| Expiry per submission | `due_at` exists | done |

Files: `lib/sign.ts` (`advance`, new `reassign`), `app/sign/[token]/*`, `new-paper.tsx` (list UI), worker for reminders (`web/workers`).

## 2. Field markup (the biggest gap)

DocuSeal fields carry more than our `{type,x,y,w,h,label,options,required}`:

| Feature | Port |
|---|---|
| **More types**: number, radio, multiple choice, select, image, file upload, cells (one box per character), stamp, phone, payment, verification | Add `number`, `radio`, `multiple`, `image`, `file`, `cells`, `phone` first. Skip payment/KBA/verification (not needed) |
| **Per-field options**: default value, readonly, placeholder/description, font, size, color, bold/italic, alignment (`preferences`) | Add a `prefs jsonb` column on `sign_fields` and a small field-settings popover in the editor |
| **Conditions**: show a field only if another field equals/is-filled | `prefs.condition = {field, op, value}`; evaluate client-side in signer UI and again server-side on submit (hidden fields not required) |
| **Formulas**: computed number fields | Phase 3 at the earliest; tiny expression evaluator, no `eval` |
| **Multiple areas per field**: one field drawn on several pages (same value) | Split `sign_fields` into field + `sign_field_areas(field_id, page, x,y,w,h)` so one answer stamps many places |
| **Per-field "appears on"** (e.g. initials on every page) | One-click "repeat on all pages" in the editor, creates areas |
| **Final PDF stamping** with real fonts, text autosize/wrap, images fit-to-box, flattening (`generate_result_attachments`) | Extend `lib/pdf-seal.ts` / `sign-pdf.ts`: embed a Unicode font (we currently `ascii()`-mangle text), autosize to box, draw image/file thumbnails, then flatten. This is the "how markup is handled" piece |
| **Stamp**: signer ID, IP, timestamp printed under the signature | Optional per-signature "stamp" line using data we already store (ip, ua, signed_at) |
| **Document revisions / page editing** (reorder, delete, crop, redact pages) | Later. `pdf-lib` can reorder/delete; redact needs flattening of the page |
| Editor UX: multi-select, copy/paste, align, arrow-key nudge, undo | Add copy/paste + arrow nudge + undo to `new-paper.tsx` (largest UX win for small cost) |

Schema (all `ADD COLUMN IF NOT EXISTS`, matching `lib/db.ts`): `sign_fields.prefs jsonb`, `sign_fields.name text`, new `sign_field_areas`. Backfill one area per existing field in the migration so nothing in-flight breaks.

## 3. Auto-detect fields

DocuSeal uses two layers: (a) an **ONNX object-detection model** that finds boxes/lines on the rendered page image, (b) **text regexes** (signature/date/number labels, multilingual) plus **merging with PDF text lines** (`detect_fields.rb`).

We already have layer (b) in English. Port plan:

1. **Cheap wins in `lib/pdf-detect.ts`** (do now):
   - Multilingual labels (fr / de / es) alongside the existing English regexes, same shape as DocuSeal's `SIGNATURE_REGEXP` etc.
   - `number` type (price, total, quantity, `$`).
   - Detect **ruled lines and boxes from vector paths** (pdf.js operator list) so "Signature ____" drawn as a line rather than underscores is found. Today those only match through the caption label.
   - Return a **confidence** per field and let the editor show low-confidence ones dashed so the user knows to check them.
   - Add `test` fixtures (the file is pure, easy to unit test; add 5-6 sample page fixtures).
2. **Image model (optional, later)**: render each page with `@napi-rs/canvas` (already a dependency), run an ONNX model with `onnxruntime-node`, merge with the text results. Blockers: DocuSeal's model file isn't in the repo, so we would have to train or source one with a compatible licence, and `onnxruntime-node` adds ~100 MB to the image on Fly. **Recommendation: don't, unless the heuristics prove too weak on real board paperwork.** Revisit after step 1.
3. UX: "Detect fields" button per page and for "all pages", and the existing per-recipient assignment (`cur`) stays. Add "Undo detect".

## 4. Signer-side UX

What we like in DocuSeal's form (`submission_form/*`):

- One-field-at-a-time **guided mode** with a progress bar and "next" button; jumps to the field on the PDF (good on phones). Free-scroll mode stays as a toggle.
- Signature step: **draw / type (several fonts) / upload image**, and "remember my signature" for the session.
- Resume: partial values are saved as the signer goes, so a closed tab doesn't lose input (`submit_form_values_controller`).
- Per-field validation messages; completed page with download + "copy sent to your email".
- Multi-language UI strings.

Files: `app/sign/[token]/sign.tsx` (+ new `sign-steps.tsx`), `POST /api/sign/values` for autosave (rate limited like the other public endpoints).

## 5. Sending, webhooks, extras (pick later)

- `bcc_completed`, `reply_to`, per-template email subject/body for invite and completion, attach audit trail PDF (we have `hide_audit`; add attach option).
- Webhooks on viewed / started / completed / declined → fits our existing API keys; could reuse ntfy for board notifications.
- Bulk send (one template, many recipients as CSV) → useful for member waivers.
- API: create-from-template endpoint behind the existing API keys.
- Skipped on purpose: SMS, KBA, payments, multi-tenant accounts, SSO, Google Drive picker, dynamic (HTML-templated) documents.

## Suggested order

1. **PR A**: signing order (section 1) + auto-reminders. ~1 day.
2. **PR B**: detect improvements + tests (section 3.1). ~1 day.
3. **PR C**: field model change (`prefs`, areas) + new types + stamping rewrite (section 2). Biggest; ~3-4 days, needs the migration and a pass over `sign-pdf.ts`.
4. **PR D**: editor UX (copy/paste, nudge, undo, conditions).
5. **PR E**: guided signer mode + autosave (section 4).
6. Section 5 as requested.

## Open questions

- OK with re-implementing instead of copying (AGPL)? If you want a literal port, the whole site has to be AGPL with DocuSeal attribution kept in the UI.
- Do board papers need conditions / formulas, or are extra types + multi-page fields enough?
- Is the ML detector worth the Docker image growth, or do we stay heuristic?
