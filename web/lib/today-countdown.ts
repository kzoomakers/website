export type Span = { start: number; end: number; allDay: boolean };
export type Countdown = { state: "allday" | "before" | "now" | "over"; label: string; big: string };

const fmt = (ms: number) => { const m = Math.max(1, Math.round(ms / 60000)), h = Math.floor(m / 60); return h ? `${h}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`; };

/** Countdown text for one event at time `t` (ms). An event with end === start is a point in time, so it never "ends". */
export function countdown(r: Span, t: number): Countdown {
  if (r.allDay) return { state: "allday", label: "TODAY", big: "All day" };
  if (t < r.start) return { state: "before", label: "STARTS IN", big: fmt(r.start - t) };
  if (r.end > r.start && t >= r.end) return { state: "over", label: "ENDED", big: "Done" };
  return { state: "now", label: "HAPPENING NOW", big: r.end > r.start ? `${fmt(r.end - t)} left` : "Now" };
}
