import { MEASURES } from "@/lib/chores-calc";

export const every = (d: number | null) => !d ? "as needed" : d === 1 ? "every day" : d % 30 === 0 ? (d === 30 ? "every month" : `every ${d / 30} months`) : d % 7 === 0 ? (d === 7 ? "every week" : `every ${d / 7} weeks`) : `every ${d} days`;
export const dueText = (c: { due_at: number | null; overdue_days: number | null }) => c.due_at === null || c.overdue_days === null ? "never due" : c.overdue_days > 0 ? `${c.overdue_days} day${c.overdue_days === 1 ? "" : "s"} over` : c.overdue_days === 0 ? "due today" : `due in ${-c.overdue_days} day${c.overdue_days === -1 ? "" : "s"}`;
export const when = (ts: number | null) => (ts ? new Date(ts * 1000).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "never");
export const hrs = (h: number) => (h < 1 ? `${Math.round(h * 60)} min` : `${h} h`);
export const MEASURE_OPTIONS = Object.entries(MEASURES);
export const measureText = (m: string) => MEASURES[m] ?? m;

const L = (n: unknown, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const day = (ts: unknown) => new Date(Number(ts) * 1000).toLocaleDateString([], { month: "short", day: "numeric" });
/** An award's facts, in words. */
export function awardText(a: any): [string, string] {
  const w = a.who, t = a.task;
  switch (a.kind) {
    case "marathon": return ["Marathon", `${w} gave ${a.minutes} minutes in one go on ${t}.`];
    case "speedrun": return ["Speedrun", `${w} did ${t} in ${a.minutes} minutes; it usually takes ${a.usual}.`];
    case "rescuer": return ["Rescuer", `${w} got to ${L(a.n, "overdue chore", "overdue chores")} just in time.`];
    case "explorer": return ["Explorer", `${w} tried ${L(a.n, "different chore", "different chores")}.`];
    case "early": return ["Early bird", `${w} started ${L(a.n, "shift", "shifts")} before 9am.`];
    case "owl": return ["Night owl", `${w} started ${L(a.n, "shift", "shifts")} after 8pm.`];
    case "streak": return ["On a streak", `${w} has given time ${L(a.n, "week", "weeks")} in a row.`];
    case "loyal": return ["Loyal", `${w} did ${t} ${a.n} times.`];
    case "double": return ["Double shift", `${w} did ${a.n} shifts on ${day(a.at)}.`];
    case "busy_bee": return ["Busy bee", `${w} did ${a.n} different chores in one day.`];
    case "weekend": return ["Weekend warrior", `${w} gave ${L(a.n, "weekend shift", "weekend shifts")}.`];
    case "lunch": return ["Lunch break", `${w} gave ${L(a.n, "shift", "shifts")} over lunch.`];
    case "midnight": return ["Midnight oil", `${w} was on ${t} in the small hours of ${day(a.at)}.`];
    case "steady": return ["Steady", `${w} did ${a.n} chores on time.`];
    case "ahead": return ["Ahead of the game", `${w} did ${a.n} chores a day or more early.`];
    case "firefighter": return ["Firefighter", `${w} did ${t} when it was ${a.days} days late.`];
    case "regular": return ["Regular", `${w} showed up on ${L(a.n, "different day", "different days")}.`];
    case "day_after_day": return ["Day after day", `${w} gave time ${a.n} days in a row.`];
    case "in_and_out": return ["In and out", `${w} averages ${a.minutes} minutes a shift.`];
    case "deep_focus": return ["Deep focus", `${w} averages ${a.minutes} minutes a shift.`];
    case "unsung": return ["Unsung", `${w} did ${a.n} as-needed chores nobody scheduled.`];
    case "clean_sweep": return ["Clean sweep", `${w} did all ${a.n} chores.`];
    case "holiday": return ["Holiday spirit", `${w} did ${t} on ${day(a.at)}.`];
    case "opening_act": return ["Opening act", `${w} was first on the board with ${t}.`];
    case "rookie": return ["Rookie", `${w} joined in and gave ${hrs(a.hours)}.`];
    case "comeback": return ["Comeback", `${w} returned after ${a.days} days away.`];
    case "tag_team": return ["Tag team", `${w} and ${a.who2} did the same chore on ${L(a.n, "day", "days")}.`];
    case "barn_raising": return ["Barn raising", `${a.n} people gave ${hrs(a.hours)} on ${day(a.at)}.`];
    case "club": return ["Club", `${w} passed ${a.n} lifetime hours.`];
    case "big_shift": return ["Big shift", `${w}'s ${t} was the space's shift number ${a.n}.`];
    case "trailblazer": return ["Trailblazer", `${w} was first to do ${t}.`];
    case "neglected": return ["Neglected", `${t} waits ${a.days} days on average past due; the longest was ${a.longest}.`];
    case "clockwork": return ["Clockwork", `${t} was on time ${a.pct}% of ${a.n} visits.`];
    case "crowd_favorite": return ["Crowd favorite", `${a.n} different people did ${t}.`];
    case "solo": return ["Solo act", `${w} has done every ${t} (${a.n}).`];
    default: return [a.kind, JSON.stringify(a)];
  }
}
