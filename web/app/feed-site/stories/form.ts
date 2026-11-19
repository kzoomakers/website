import type { Submission } from "@/feed/models/submit";

/** The story form's fields, size-capped (the model validates the rest). */
export function readSubmission(f: FormData): Submission {
  const str = (k: string, max: number) => { const x = f.get(k); return typeof x === "string" ? x.slice(0, max) : ""; };
  return { title: str("title", 400), url: str("url", 400), description: str("description", 70_000), tags: f.getAll("tags").filter((t): t is string => typeof t === "string").slice(0, 20).map((t) => t.slice(0, 40)), userIsAuthor: f.get("user_is_author") === "on" };
}
