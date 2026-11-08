import { seqDiff } from "./diff";

// Semantic diff of Puck page data: components are matched by id (not position), so edits, moves,
// additions and removals are reported separately, with word-level diffs for text.
type Comp = { id: string; type: string; props: Record<string, unknown>; parent: string };
const isComp = (v: any) => v && typeof v === "object" && typeof v.type === "string" && typeof v.props?.id === "string";

function collect(data: any) {
  const comps = new Map<string, Comp>();
  const order = new Map<string, string[]>(); // parent slot -> child ids in order
  const walk = (list: any[], parent: string) => {
    const ids: string[] = [];
    for (const it of list.filter(isComp)) {
      const props: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(it.props)) {
        if (Array.isArray(v) && v.length && v.every(isComp)) walk(v, `${it.props.id}.${k}`);
        else if (k !== "id") props[k] = v;
      }
      comps.set(it.props.id, { id: it.props.id, type: it.type, props, parent });
      ids.push(it.props.id);
    }
    order.set(parent, ids);
  };
  walk(data?.content ?? [], "page");
  for (const [z, list] of Object.entries<any[]>(data?.zones ?? {})) walk(list, `zone ${z}`);
  return { comps, order, root: (data?.root?.props ?? {}) as Record<string, unknown> };
}

export type Tok = { t: "+" | "-" | " "; s: string };
export type FieldChange = { key: string; words?: Tok[]; before?: string; after?: string };
export type Change = { kind: "added" | "removed" | "changed" | "moved" | "page"; type: string; label: string; fields: FieldChange[]; where?: string };

const show = (v: unknown) => (v === undefined || v === "" ? "(empty)" : typeof v === "string" ? v : JSON.stringify(v));
const words = (s: string) => s.split(/(\s+)/).filter(Boolean);

function fieldDiff(a: Record<string, unknown>, b: Record<string, unknown>): FieldChange[] {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).map((key) => {
    const x = a[key], y = b[key];
    if (typeof x === "string" && typeof y === "string" && (x.length > 20 || y.length > 20))
      return { key, words: seqDiff(words(x), words(y)).map((d) => ({ t: d.t, s: d.v })) };
    return { key, before: show(x), after: show(y) };
  });
}

// First readable string prop, so "Hero · Welcome to Kzoo Makers" beats "Hero-3".
const labelOf = (c: Comp) => String(Object.values(c.props).find((v) => typeof v === "string" && v.trim()) ?? c.id).slice(0, 60);
const clean = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

export function diffPages(before: any, after: any): Change[] {
  const A = collect(before), B = collect(after), out: Change[] = [];
  const root = fieldDiff(A.root, B.root);
  if (root.length) out.push({ kind: "page", type: "Page settings", label: "", fields: root });

  // Moves: among components present in both and in the same parent, anything outside the longest common order moved.
  const moved = new Set<string>();
  for (const [parent, ids] of B.order) {
    const common = (l: string[], o: Map<string, Comp>) => l.filter((id) => A.comps.get(id)?.parent === parent && B.comps.get(id)?.parent === parent && o.has(id));
    for (const d of seqDiff(common(A.order.get(parent) ?? [], A.comps), common(ids, B.comps))) if (d.t === "+") moved.add(d.v);
  }
  for (const [id, b] of B.comps) {
    const a = A.comps.get(id);
    if (!a) { out.push({ kind: "added", type: b.type, label: clean(labelOf(b)), fields: [], where: b.parent }); continue; }
    const fields = fieldDiff(a.props, b.props);
    if (fields.length || a.type !== b.type) out.push({ kind: "changed", type: b.type, label: clean(labelOf(b)), fields });
    if (moved.has(id) || a.parent !== b.parent) out.push({ kind: "moved", type: b.type, label: clean(labelOf(b)), fields: [], where: b.parent });
  }
  for (const [id, a] of A.comps) if (!B.comps.has(id)) out.push({ kind: "removed", type: a.type, label: clean(labelOf(a)), fields: [], where: a.parent });
  return out;
}
