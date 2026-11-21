// Shared by the library screen and triage mode.
export type Folder = { id: number; parent_id: number | null; title: string };
export const TYPES = ["manual", "safety", "sop", "spec", "form", "other"], TIERS = [["staff", "Staff only"], ["authorized", "Authorized members"], ["members", "All members"], ["public", "Public"]];

export const ordered = (fs: Folder[], parent: number | null = null, depth = 0): (Folder & { depth: number })[] => fs.filter((f) => f.parent_id === parent).flatMap((f) => [{ ...f, depth }, ...ordered(fs, f.id, depth + 1)]);
