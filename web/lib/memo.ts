// Small per-process cache for settings that are read on every public page view. Saves call forget() so staff see their edit at once on this machine.
// shortcut: per-process, so a second machine shows an old value for up to `ms`; use a shared cache if the app is ever scaled out.
const g = globalThis as unknown as { memo?: Map<string, { at: number; v: Promise<unknown> }> };
const m = () => (g.memo ??= new Map());

export function memo<T>(key: string, ms: number, f: () => Promise<T>): Promise<T> {
  const hit = m().get(key);
  if (hit && Date.now() - hit.at < ms) return hit.v as Promise<T>;
  const v = f().catch((e) => { if (m().get(key)?.v === v) m().delete(key); throw e; }); // a failure is not remembered
  m().set(key, { at: Date.now(), v });
  return v;
}
/** Drops every cached key that starts with `prefix` (no prefix: all of them). */
export const forget = (prefix = "") => { for (const k of m().keys()) if (k.startsWith(prefix)) m().delete(k); };
