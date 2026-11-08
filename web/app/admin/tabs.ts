// Top-level admin sections: path, label, ribbon colour, and the permission section that unlocks it.
export const TABS = [["/admin/webmaster", "Website", "#c00", "webmaster"], ["/admin/mail", "Email", "#1b7f3b", "mail"], ["/admin/blog", "Blog", "#2563eb", "blog"], ["/admin/forms", "Messages", "#7c3aed", "forms"], ["/admin/crm", "People", "#0891b2", "crm"], ["/admin/signed-docs", "Signatures", "#0f766e", "board"], ["/admin/tours", "Tours", "#e11d48", "tours"], ["/admin/chores", "Chores", "#65a30d", "chores"], ["/admin/users", "System", "#d97706", "admin"]] as const;

// Pages that live under another section's URL but belong to a different tab (public content kept under /admin/services).
const ELSEWHERE: [string, string][] = [["/admin/services/privacy", "/admin/webmaster"], ["/admin/services/links", "/admin/webmaster"], ["/admin/services", "/admin/users"]];

/** The tab path (a TABS entry) that owns this admin URL, or undefined. */
export const tabOf = (here: string) => ELSEWHERE.find(([p]) => here === p || here.startsWith(p + "/"))?.[1] ?? TABS.find(([h]) => here === h || here.startsWith(h + "/"))?.[0];
