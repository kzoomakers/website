# Phase 6: Discord announcements

A webhook posts "newly certified" messages to a channel of the admins' choosing. Optional, off by default, opt-in per member.

> Note: the Discord MCP server in this Claude Code session failed to connect (`CONNECTION_CLOSED`). It is not needed: this feature uses a plain Discord **webhook** (an HTTPS POST), not a bot connection. Don't build a gateway bot for v1.

## Webhook vs bot

| | Webhook | Bot |
|---|---|---|
| Needs | One URL from channel settings | App, token, gateway or interactions, hosting |
| Can | Post messages/embeds, name, avatar | Mentions by lookup, slash commands, react, roles |
| Risk | URL is a secret | Token is a secret, plus more moving parts |

**v1 = webhook.** The member's profile already stores a `discord` username (`site_users.discord`, lowercase 2 to 32 chars, with a `show_discord` flag). Usernames can't be turned into pings through a webhook (that needs a numeric user ID), so v1 prints the username as plain text. A v2 bot (or asking members for their numeric ID) can enable real `<@id>` mentions and role grants.

## Settings (`training.discord` permission)

- Webhook URL: stored with `sealText` (`lib/vault.ts`), shown masked, validated to match `https://discord.com/api/webhooks/{id}/{token}` (also `discordapp.com`, `ptb.`/`canary.` subdomains), **host allow-listed** so the setting can't be abused to make the server request arbitrary URLs (SSRF).
- Bot display name and avatar URL.
- Message style: embed on/off, colour, which fields appear (name, tool, shop/category, date, trainer), a list of congratulation templates picked at random with `{{name}}`, `{{tool}}`.
- Master switch, **test post** button, last result and last 20 sends (status, error).
- Optional second webhook for staff-only events (lapses, stale queue). Default none.

## Member opt-in

On `/members/training` and the profile: "Announce my certifications in the club Discord" (default **off**). Stored on the member. Choice of *what* is shown: first name only vs name + Discord username. The announcement uses the preference at send time; withdrawing consent stops future posts (past posts are Discord's and the admin's to delete; say so in the help text).

## Posting (`lib/training/discord.ts`)

```
emit('cert.certified') -> if enabled and member opted in -> INSERT outbox(kind='discord', payload)
job 7351942 (every minute, withLock) -> POST webhook
   2xx          mark sent
   429          honour Retry-After, requeue without counting a try
   5xx/network  exponential backoff, max N tries, then status failed (visible on Settings)
   404/401      webhook revoked: disable the integration, alert the lead
```

- Always send `allowed_mentions: { parse: [] }` so no payload can ping `@everyone`/`@here`/roles. Escape Discord markdown in names and tool names.
- Content limits: embed title/description/field sizes capped to Discord's limits; no images from user input (member photos are **not** posted).
- Only the minimum is posted: first name (or chosen), tool, optional shop, a congratulation line. No scores, no trainer notes, no email.
- A short random delay (0 to 60s) and batching ("3 members were certified today") during bulk certification so a rollout re-pass doesn't flood the channel. Setting: `announce_recerts` (default **off**: re-passes are not newsworthy).
- Failure never affects certification.

## Tests

Payload builder (escaping, caps, `allowed_mentions`), outbox state machine against a mocked fetch (200, 429 with Retry-After, 500, 404), consent respected (no post when opted out, withdraw before send), SSRF validation of the URL, webhook never appears in any API response or log line.

## Done when

An opted-in member's sign-off posts a congratulation in the test channel within a minute, an opted-out member's does not, a revoked webhook disables itself and alerts the lead, and the URL is never visible after it's saved.
