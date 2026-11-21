/** "Attempt 2 of 3 (retake 1)": which try this is, out of how many are allowed (null = unlimited). */
export const attemptLabel = (n: number, max: number | null) => `Attempt ${n}${max ? ` of ${max}` : ""}${n > 1 ? ` (retake ${n - 1})` : ""}`;
