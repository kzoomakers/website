// The community site's own, enforced Content-Security-Policy (the main site's is report-only and allows maps, analytics and captcha scripts this site never loads).
// Scripts keep 'unsafe-inline' only because Next writes its page data into inline script tags; a per-request nonce would remove it. Everything else is closed down.
export const FEED_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'self' https:",
  "frame-src https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");
