/** Where /admin-login may send someone after sign-in: a path under /admin, otherwise the panel itself. Keeps `//evil.com` and `/admin-login` (a loop) out. */
export const adminNext = (n?: string | null) => (n && /^\/admin(\/[\w\-\/.%?=&#~+]*)?$/.test(n) ? n : "/admin");
