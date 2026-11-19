import { cleanHtml } from "@/lib/sanitize";

// The site-wide sanitizer lets text that doesn't start with "<" through untouched (blog posts keep plain text and escape it themselves). Here every stored value is
// shown as markup, so such text is escaped instead; anything starting with "<" goes through the allow-list.
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const feedHtml = (h: string | null | undefined) => (h ? (/^\s*</.test(h) ? cleanHtml(h) : esc(h)) : "");
