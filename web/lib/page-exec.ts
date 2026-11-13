// What on a page can run code or take over the browser: the page's own scripts, raw-HTML blocks and its redirect.
// A page editor without full admin may not change these (script on a public page runs as any admin who visits it).
export function execParts(data: unknown): string {
  const out: unknown[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, any>;
    if (o.type === "HtmlSection") out.push(o.props?.html ?? "");
    for (const k of Object.keys(o)) walk(o[k]);
  };
  walk((data as any)?.content); walk((data as any)?.zones);
  const p = (data as any)?.root?.props ?? {};
  return JSON.stringify([out, p.inline ?? null, p.scripts ?? null, p.refresh ?? null]);
}
