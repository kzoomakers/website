# Parity check against the real Lobsters (dev only)

Runs the Rails Lobsters in Docker with its own fake data, loads the same rows into the feed schema, and diffs the pages. Never run it against production; nothing here is part of CI.

```
./run.sh          # build image (first time, ~10 min), make data, import, start both, compare
```

Needs Docker, Node and a scratch Postgres (`run.sh` starts one on port 54329). `compare.mjs` ignores branding, times' text and avatars (see the top of the file); every other difference is a bug in the port or an entry for the expected-differences list below.

## Expected differences
Left out of the comparison on purpose (compare.mjs strips them):
- Branding, `<title>`/meta, times' text (the unix value is compared), error-page bodies (only the status), and the Rails development-only boxes (slow-query notice, user stats).
- Avatars (`#gravatar`, `img.avatar`, `avatar_url`): the feed has none yet.
- The profile "Homepage" row: Mastodon/GitHub/homepage links are not ported.
- Hat grant dates: shown in our time zone (America/Detroit), Rails shows Central.
- Redirect codes: Rails sends 302/301, Next 307/308 (treated as equal).

Known real differences kept on purpose:
- `~user/comments.rss` is capped at the newest 500 comments (Lobsters has no cap).
- `about` text is plain paragraphs until the markdown renderer is ported (phase 3).

Last run: 72 pages, feeds and JSON documents, all equal apart from the above. The fake data is random per run; `run.sh` makes a fresh set each time.
