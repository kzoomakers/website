# Courses and lessons

## Shape

```
Path (optional)  ─ ordered list of courses ("Woodshop basics")
  Course         ─ title, summary, cover, tags, linked tool(s), status (draft/published)
    Section      ─ "Before you start", "The machine", "Safe cuts"
      Lesson     ─ ordered blocks; has a completion rule
        Block    ─ text | video | image | library doc | callout | checklist | quiz | divider
```

A lesson is the unit of progress. A section is only a heading and a collapse group.

## Blocks

| Block | Fields | Notes |
|---|---|---|
| Text | rich text (sanitized by `lib/sanitize.ts`) | Headings, lists, links, tables |
| Video | YouTube URL, start, end, caption, transcript | See below |
| Image | media id, alt (required), caption | Uses the media table and image worker |
| Library doc | document id, "show inline" or "link card" | Always serves the current version |
| Callout | kind: Danger / Warning / PPE / Tip, text | Danger and PPE render first-class (big, coloured, icon, not colour-only) |
| Checklist | items | "Before you power on": members tick each; the ticks count toward completion if the rule says so |
| Quiz | practice quiz id or tag filter | See `03` |
| Divider | | |

Blocks are plain JSON in one `lessons.blocks jsonb` column, validated on save by one function (same approach as `questions.ts` which cleans every question config). No block is ever stored as unsanitized HTML.

## YouTube embeds

- Paste any YouTube URL (watch, share, shorts, embed). We parse out the **11-character id** and store only that, plus start/end seconds. Anything that doesn't parse is rejected. We never store or render the pasted URL.
- Render with `https://www.youtube-nocookie.com/embed/<id>?rel=0&modestbranding=1&start=..&end=..`.
- **Click-to-load**: show our own poster (`i.ytimg.com/vi/<id>/hqdefault.jpg`, fetched once and cached in S3 by the image worker so we don't hit Google on every page view), a big play button, and the duration. The iframe only mounts on click.
- CSP: add `youtube-nocookie.com` to `frame-src` only (not `script-src` unless we adopt the IFrame API; see watch-percent below). `lib/sechead.ts` owns this.
- **Chapters**: an optional list of `{time, label}`. Rendered as clickable chips under the video that seek the player.
- **Watch-percent completion** (optional rule, "watched at least 80%"): needs the YouTube IFrame API, which loads a Google script. Only loaded after click-to-load, and only for lessons whose rule uses it. Without the API the rule falls back to "mark as watched".
- Always: caption/transcript field (accessibility), `title` on the iframe, and a visible "Open on YouTube" link.

## Completion rules (per lesson, one of)

1. **Viewed**: opening it counts (default).
2. **Mark done**: member presses "I've finished this lesson".
3. **Video watched** ≥ N% (needs the IFrame API).
4. **Checklist complete**.
5. **Practice quiz** score ≥ N%.

Lessons unlock in order by default (`course.sequential`). A trainer can toggle that off, and a trainer can always preview everything.

## Course lifecycle

- **Draft → published**. Unlike tests, courses are not immutable-versioned: lesson text is fixed in place, with an `updated_at` and a short change note shown as "Updated Nov 20: new blade-guard photos".
- If a change is **significant** (a safety procedure changed), the author flags it, and members who already completed that lesson see a "Changed since you finished" badge. This does *not* force a re-pass (that remains the test revision's major/minor mechanism).
- Duplicate, export JSON, import JSON, archive.
- Course ↔ tool link: `course_tools(course_id, tool_id)`. A tool page in Members shows the course as step 1.

## Member progress

`lesson_progress(user_id, lesson_id, state, data jsonb, updated_at)`; `course_progress` is computed, not stored. "Continue" = first incomplete unlocked lesson. Video position and checklist ticks save as they happen (debounced), so closing the phone mid-lesson loses nothing.
