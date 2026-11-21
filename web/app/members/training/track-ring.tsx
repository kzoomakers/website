import type { Step } from "@/lib/courses/track";

// The six-step track as a segmented ring with the same steps listed beside it, so nothing depends on colour alone.
const MARK = { done: "✓", current: "→", todo: "", locked: "🔒" } as const;
export default function TrackRing({ steps }: { steps: Step[] }) {
  if (steps.length < 2) return null;
  const r = 15.9155, c = 100, n = steps.length, gap = n > 1 ? 4 : 0, seg = c / n - gap, cur = steps.find((s) => s.status === "current" || s.status === "locked");
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", margin: "8px 0" }}>
      <svg width="56" height="56" viewBox="0 0 36 36" role="img" aria-label={`${steps.filter((s) => s.status === "done").length} of ${n} steps done${cur ? `; next: ${cur.label}` : ""}`} style={{ flex: "none" }}>
        {steps.map((s, i) => <circle key={s.key} cx="18" cy="18" r={r} fill="none" strokeWidth={s.status === "current" ? 4 : 3} stroke="currentColor" strokeOpacity={s.status === "done" ? 1 : s.status === "current" ? 0.7 : 0.2}
          strokeDasharray={`${seg} ${c - seg}`} strokeDashoffset={-(i * (c / n))} transform="rotate(-90 18 18)" />)}
      </svg>
      <ol style={{ display: "flex", flexWrap: "wrap", gap: "2px 12px", listStyle: "none", margin: 0, padding: 0 }}>
        {steps.map((s) => <li key={s.key} style={{ fontWeight: s.status === "current" ? 700 : undefined, opacity: s.status === "todo" ? 0.6 : 1 }}>{MARK[s.status]} {s.label}{s.status === "locked" ? " (finish the steps above first)" : ""}</li>)}
      </ol>
    </div>
  );
}
