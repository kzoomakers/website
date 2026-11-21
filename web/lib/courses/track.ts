// The six-step track on a member's tool card (moodlecourseware/05): Read, Learn, Practise, Test, Sign-off, Done. Pure; tested in tests/courses-track.test.mjs.
// A step only appears when the tool has it (no course -> no Learn). The first step not done is "current"; the test shows "locked" while its requirements are open.
export type Status = "done" | "current" | "todo" | "locked";
export type Step = { key: string; label: string; status: Status };
export type TrackIn = {
  read: { total: number; acked: number } | null; // SOP/safety documents the member can see, and how many they have acknowledged
  course: { done: number; total: number } | null; // every linked course, summed
  practised: boolean | null; // null: this tool's test has no practice questions
  hasTest: boolean;
  state: string | undefined; // "certified", "awaiting_trainer", or another card state
  blocked: boolean; // require_course / require_ack still open
};

export function trackSteps(t: TrackIn): Step[] {
  const cert = t.state === "certified", passed = cert || t.state === "awaiting_trainer";
  const all: [string, string, boolean, boolean][] = [ // key, label, applies, done
    ["read", "Read", !!t.read && t.read.total > 0, !!t.read && t.read.acked >= t.read.total],
    ["learn", "Learn", !!t.course && t.course.total > 0, !!t.course && t.course.done >= t.course.total],
    ["practise", "Practise", t.practised !== null, t.practised === true],
    ["test", "Test", t.hasTest || passed, passed],
    ["signoff", "Sign-off", t.hasTest || passed, cert],
    ["done", "Done", true, cert],
  ];
  let current = false;
  return all.filter((s) => s[2]).map(([key, label, , done]) => {
    if (done) return { key, label, status: "done" as const };
    if (current) return { key, label, status: key === "test" && t.blocked ? "locked" as const : "todo" as const };
    current = true;
    return { key, label, status: key === "test" && t.blocked ? "locked" as const : "current" as const };
  });
}
