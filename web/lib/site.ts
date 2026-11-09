// Public base URL. Kept import-free so client bundles (the page editor) can use it too.
export const SITE = (process.env.SITE_URL ?? "https://kzoomakers.org").replace(/\/$/, "");
