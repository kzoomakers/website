import type { Block, Completion } from "./blocks";

// Pure progress rules (no database). A lesson's progress `data` is { viewed?, done?, video?, ticks?: { [blockId]: number[] } }. Tested in tests/courses-progress.test.mjs.
export type Data = { viewed?: boolean; done?: boolean; video?: boolean; quiz?: number; ticks?: Record<string, number[]> };
export type Action = { action: "view" } | { action: "done" } | { action: "video" } | { action: "tick"; block: string; idx: number; on: boolean };

/** Has the member met the lesson's completion rule? */
export function isComplete(c: Completion, blocks: Block[], d: Data): boolean {
  switch (c.rule) {
    case "done": return !!d.done;
    case "video": return !!d.video; // watch-percent needs the YouTube script; until then "I watched it" is the rule (moodlecourseware/02)
    case "quiz": return (d.quiz ?? -1) >= (c.percent ?? 80); // d.quiz is the best finished practice score, copied in by recordProgress
    case "checklist": return blocks.every((b) => b.type !== "checklist" || b.items.every((_, i) => d.ticks?.[b.id]?.includes(i)));
    default: return !!d.viewed;
  }
}

/** The new progress data after one member action, or null if the action makes no sense for this lesson (the route answers 400). */
export function applyAction(blocks: Block[], d: Data, a: Action): Data | null {
  switch (a.action) {
    case "view": return { ...d, viewed: true };
    case "done": return { ...d, done: true };
    case "video": return blocks.some((b) => b.type === "video") ? { ...d, video: true } : null;
    case "tick": {
      const b = blocks.find((x) => x.id === a.block);
      if (!b || b.type !== "checklist" || !Number.isInteger(a.idx) || a.idx < 0 || a.idx >= b.items.length) return null;
      const cur = new Set(d.ticks?.[b.id] ?? []);
      a.on ? cur.add(a.idx) : cur.delete(a.idx);
      return { ...d, ticks: { ...d.ticks, [b.id]: [...cur].sort((x, y) => x - y) } };
    }
    default: return null;
  }
}

/** Lesson ids in the order they unlock. With `sequential`, a lesson opens once every earlier one is done; otherwise all are open. */
export const unlockedIds = (order: number[], done: Set<number>, sequential: boolean) => {
  if (!sequential) return new Set(order);
  const open = new Set<number>();
  for (const id of order) { open.add(id); if (!done.has(id)) break; }
  return open;
};

/** Where "Continue" goes: the first lesson not done (it is always unlocked), or null when everything is done. */
export const continueAt = (order: number[], done: Set<number>) => order.find((id) => !done.has(id)) ?? null;
