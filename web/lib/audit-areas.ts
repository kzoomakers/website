// Which admin section an audit action belongs to (client-safe: no database imports). Patterns are SQL LIKE patterns.
export const AUDIT_SECTIONS: Record<string, { label: string; color: string; like: string[] }> = {
  webmaster: { label: "Webmaster", color: "#4f7cff", like: ["page.%", "menu.%", "board.import", "board.save", "calendar.%", "hours.%", "robots.%", "guided.%", "review.%", "financials.%"] },
  blog: { label: "Blog", color: "#e0833a", like: ["post.%", "author.%", "category.%", "comment.%", "media.%"] },
  mail: { label: "Mail", color: "#2fa37a", like: ["mail.%"] },
  forms: { label: "Forms", color: "#b559d6", like: ["form.%"] },
  crm: { label: "CRM", color: "#d6a21f", like: ["crm.%", "user.membership", "user.authorize", "user.deauthorize"] },
  board: { label: "Signed Docs", color: "#0f766e", like: ["board.sign.%"] },
  tours: { label: "Tours", color: "#e11d48", like: ["tour.%"] },
  chores: { label: "MakerFavor™", color: "#65a30d", like: ["chore.%"] },
  admin: { label: "Users & access", color: "#d85b6a", like: ["privacy.%", "ntfy.%", "apikey.%", "debug.%", "user.edit", "user.delete", "user.enable", "user.disable", "user.access", "user.reset_email", "user.set_password"] },
};
const rx = (p: string) => new RegExp("^" + p.replace(/[.]/g, "\\.").replace(/%/g, ".*") + "$");
const tests = Object.entries(AUDIT_SECTIONS).map(([k, s]) => [k, s.like.map(rx)] as const);
export const sectionOf = (action: string) => tests.find(([, r]) => r.some((x) => x.test(action)))?.[0] ?? "other";
