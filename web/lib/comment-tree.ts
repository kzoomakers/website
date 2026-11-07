// Pure comment-thread helpers shared by server and client.
export type Item = { id: number; parent: number | null; name: string; body: string; at: string; likes: number; liked: boolean;
  mine: boolean; pending: boolean; removed: boolean; staff: boolean };
export type Node = Item & { kids: Node[] };
export type Sort = "best" | "new" | "old";

/** Wilson lower bound (95%) of the positive share, as emdash ranks comments: a few likes can't beat many. Likes only, so down = 0. */
export const wilson = (up: number) => up / (up + 3.8416); // closed form of the bound when there are no downvotes: wilson(1)=.21, wilson(10)=.72

/** Flat list -> forest, any depth. Orphans (parent missing) become roots. Siblings sorted per `sort`. */
export function buildTree(items: Item[], sort: Sort): Node[] {
  const by = new Map<number, Node>(items.map((i) => [i.id, { ...i, kids: [] }]));
  const roots: Node[] = [];
  for (const n of by.values()) (n.parent != null && by.get(n.parent) ? by.get(n.parent)!.kids : roots).push(n);
  const cmp = (a: Node, b: Node) => (sort === "new" ? b.id - a.id : sort === "best" && wilson(b.likes) !== wilson(a.likes) ? wilson(b.likes) - wilson(a.likes) : a.id - b.id);
  const sortAll = (l: Node[]) => { l.sort(cmp); l.forEach((n) => sortAll(n.kids)); };
  sortAll(roots);
  return roots;
}

export const countAll = (n: Node): number => 1 + n.kids.reduce((s, k) => s + countAll(k), 0);
