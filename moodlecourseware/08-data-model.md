# Data model

Follow the training schema style: `CREATE TABLE IF NOT EXISTS` in a `lib/courses/schema.ts` and `lib/library/schema.ts` (one `ensure` function each, run like `lib/training/schema.ts`). New code in `web/lib/courses/` and `web/lib/library/` as small files.

## Courses

```
courses        (id, slug unique, title, summary, cover_media_id, status draft|published|archived,
                sequential bool default true, created_by, created_at, updated_at, change_note)
course_sections(id, course_id, position, title)
lessons        (id, section_id, position, title, blocks jsonb, completion jsonb,
                updated_at, significant_at)             -- significant_at drives "changed since you finished"
lesson_revisions(id, lesson_id, blocks jsonb, at, by)   -- last 20 kept
course_tools   (course_id, tool_id, PRIMARY KEY both)
paths          (id, slug, title, summary)
path_courses   (path_id, course_id, position)
lesson_progress(user_id, lesson_id, state todo|doing|done, data jsonb, updated_at, PRIMARY KEY (user_id, lesson_id))
```

## Practice

```
rev_questions  + tags text[] , practice_ok bool default false      -- existing table, two new columns
quizzes        (id, title, kind 'standalone'|'tool', test_id null)  -- standalone sets have their own question rows
practice_attempts(id, user_id, quiz_or_test_ref, started_at, finished_at, score, answers jsonb)
```

Practice attempts never reference `attempts`. Deleting practice data has no effect on certification.

## Library

```
lib_folders    (id, parent_id, position, title, slug)             -- depth ≤ 3 enforced in code
lib_docs       (id, slug unique, title, description, type, tier public|members|authorized|staff,
                listed bool, status draft|published|archived, current_version int, pinned bool,
                created_by, created_at, updated_at, tsv tsvector)
lib_versions   (doc_id, version, s3_key, size, pages, has_text bool, text_extract text,
                thumb_key, change_note, requires_reread bool, uploaded_by, at, PRIMARY KEY (doc_id, version))
lib_placements (doc_id, folder_id, position, PRIMARY KEY (doc_id, folder_id))   -- a doc can sit in several folders
lib_tags       (id, name unique, slug)
lib_doc_tags   (doc_id, tag_id)
tool_docs      (tool_id, doc_id, role manual|sop|safety)
lib_shares     (id, doc_id, token_hash unique, allow_download bool, expires_at, passcode_hash,
                revoked_at, created_by, created_at, opens int, last_open timestamptz)
lib_acks       (user_id, doc_id, version, at, PRIMARY KEY (user_id, doc_id, version))
lib_bookmarks  (user_id, doc_id)
```

Indexes: GIN on `lib_docs.tsv`, btree on `lib_placements (folder_id, position)`, `lib_shares (token_hash)`, `lesson_progress (lesson_id)`.

## Changes to existing tables

```
tool_training + require_course bool default false, require_ack bool default false
```

## Ordering

All "drag to reorder" lists use a `position int` renumbered in one transaction on drop (`UPDATE … FROM unnest(ids) WITH ORDINALITY`). Fine for these list sizes; no fractional-index complexity.

## Storage keys

`lib/<random-id>/v<version>.pdf`, `lib/<random-id>/thumb.webp`, `courses/<course>/<media>`. Never the filename.

## Retention

Share link `opens`/`last_open` only; no IPs. Practice attempts older than 12 months are summarised then dropped by the existing retention job (`lib/retention.ts`).
