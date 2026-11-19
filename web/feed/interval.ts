// interval_helper.rb time_interval: "/top/3d" -> how far back, validated. No imports.
const UNITS: Record<string, string> = { h: "Hour", d: "Day", w: "Week", m: "Month", y: "Year" };
export type Interval = { param: string; n: number; unit: "hour" | "day" | "month" | "year"; human: string; placeholder: boolean };
const PLACEHOLDER: Interval = { param: "1w", n: 7, unit: "day", human: "Week", placeholder: true };

export function timeInterval(param?: string): Interval {
  const m = /^(\d+)([hdwmy])$/.exec(param ?? "");
  if (!m) return PLACEHOLDER;
  const dur = Number(m[1]);
  if (!(dur > 0) || dur > 100000) return PLACEHOLDER;
  const name = UNITS[m[2]];
  return { param: `${dur}${m[2]}`, n: name === "Week" ? dur * 7 : dur, unit: (name === "Week" ? "day" : name.toLowerCase()) as Interval["unit"], human: `${dur === 1 ? "" : dur + " "}${name}${dur === 1 ? "" : "s"}`, placeholder: false };
}
export const INTERVALS = Object.entries(UNITS).map(([k, v]) => `<b>${k}</b>${v.slice(1).toLowerCase()}`).join(", ");
