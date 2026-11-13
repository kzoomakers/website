// Pure maths for the Tracking screens (no database), so it can be unit-tested.
/** Minutes after sending at which the burn-up chart reads its totals. */
export const MARKS = [5, 15, 30, 60, 120, 240, 480, 720, 1440, 2880, 4320, 7200, 10080, 20160];
export const markLabel = (m: number) => (m < 60 ? `${m} min` : m < 1440 ? `${m / 60} h` : `${m / 1440} d`);
/** Seconds after sending that this person first opened / first clicked (null: never), and the hour (club time) of the first open. */
export type Touch = { opened: number | null; clicked: number | null; hour: number | null };
const SPEED: [string, number][] = [["Under 5 min", 5 * 60], ["5 to 30 min", 30 * 60], ["30 min to 2 h", 2 * 3600], ["2 to 6 h", 6 * 3600], ["6 to 24 h", 24 * 3600], ["1 to 3 days", 3 * 86400], ["Over 3 days", Infinity]];
export function engagement(rows: Touch[]) {
  const opens = rows.filter((r) => r.opened != null).map((r) => Math.max(0, r.opened!)).sort((a, b) => a - b);
  const curve = MARKS.map((m) => ({ min: m, opened: opens.filter((o) => o <= m * 60).length, clicked: rows.filter((r) => r.clicked != null && Math.max(0, r.clicked) <= m * 60).length }));
  const speed = SPEED.map(([label, max], i) => [label, opens.filter((o) => o < max && o >= (i ? SPEED[i - 1][1] : -1)).length] as [string, number]);
  const hours = Array<number>(24).fill(0);
  for (const r of rows) if (r.hour != null) hours[r.hour]++;
  const half = opens.length ? MARKS.find((m) => curve[MARKS.indexOf(m)].opened >= opens.length / 2) ?? null : null;
  return { curve, speed, hours, medianSec: opens.length ? opens[Math.floor((opens.length - 1) / 2)] : null, halfMin: half };
}
