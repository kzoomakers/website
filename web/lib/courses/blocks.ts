import { randomUUID } from "node:crypto";
import { cleanHtml } from "../sanitize";
import { cleanTags } from "../library/rules";

// Pure lesson rules (no database): every block is cleaned here on save, so nothing unsanitized is ever stored. Tested in tests/courses-blocks.test.mjs.
export type Chapter = { time: number; label: string };
export type Block =
  | { id: string; type: "text"; html: string }
  | { id: string; type: "video"; yt: string; start?: number; end?: number; caption: string; transcript: string; chapters: Chapter[] }
  | { id: string; type: "image"; src: string; alt: string; caption: string }
  | { id: string; type: "doc"; docId: number; mode: "inline" | "card" }
  | { id: string; type: "callout"; kind: "danger" | "warning" | "ppe" | "tip"; text: string }
  | { id: string; type: "checklist"; items: string[] }
  | { id: string; type: "quiz"; testId: number; tags?: string[]; count?: number }
  | { id: string; type: "divider" };
export type Completion = { rule: "viewed" | "done" | "video" | "checklist" | "quiz"; percent?: number };
export const RULES = ["viewed", "done", "video", "checklist", "quiz"] as const;
export const KINDS = ["danger", "warning", "ppe", "tip"] as const;
export const MAX_BLOCKS = 100;

const YT_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com", "youtu.be"]);
const ID = /^[A-Za-z0-9_-]{11}$/;
/** The 11-character video id from any YouTube link (watch, share, shorts, embed, live) or a bare id; null for anything else, including lookalike hosts. We store only the id, never the pasted URL. */
export function parseYoutubeId(input: unknown): string | null {
  const s = typeof input === "string" ? input.trim() : "";
  if (ID.test(s)) return s;
  let u: URL;
  try { u = new URL(/^[a-z]+:/i.test(s) ? s : "https://" + s); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || !YT_HOSTS.has(u.hostname.toLowerCase())) return null;
  const part = u.hostname.toLowerCase() === "youtu.be" ? u.pathname.split("/")[1] : u.pathname.startsWith("/watch") ? u.searchParams.get("v") : u.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/]+)/)?.[1];
  return part && ID.test(part) ? part : null;
}

const str = (x: unknown, max: number) => (typeof x === "string" ? x.trim().slice(0, max) : "");
const secs = (x: unknown) => { const n = Math.floor(Number(x)); return Number.isFinite(n) && n > 0 && n < 86400 ? n : undefined; };
const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Cleans one block from the editor, or returns null if it is unusable (the editor shows what was dropped). */
export function cleanBlock(b: any): Block | null {
  if (!b || typeof b !== "object") return null;
  const id = typeof b.id === "string" && /^[\w-]{1,40}$/.test(b.id) ? b.id : randomUUID().slice(0, 8);
  switch (b.type) {
    case "text": {
      const t = str(b.html, 50_000);
      return { id, type: "text", html: /^\s*</.test(t) ? cleanHtml(t) : t.split(/\n{2,}/).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join("") };
    }
    case "video": {
      const yt = parseYoutubeId(b.yt ?? b.url);
      if (!yt) return null;
      const start = secs(b.start), end = secs(b.end);
      const chapters = (Array.isArray(b.chapters) ? b.chapters : []).slice(0, 50).map((c: any) => ({ time: secs(c?.time) ?? 0, label: str(c?.label, 80) })).filter((c: Chapter) => c.label);
      return { id, type: "video", yt, ...(start ? { start } : {}), ...(end && end > (start ?? 0) ? { end } : {}), caption: str(b.caption, 300), transcript: str(b.transcript, 50_000), chapters };
    }
    case "image": { // only our own uploads, and an alt text is required (members who can't see the picture still need the point)
      const src = str(b.src, 300), alt = str(b.alt, 300);
      return /^\/uploads\/[\w\-./]+$/.test(src) && !src.includes("..") && alt ? { id, type: "image", src, alt, caption: str(b.caption, 300) } : null;
    }
    case "doc": {
      const docId = Number(b.docId);
      return Number.isInteger(docId) && docId > 0 ? { id, type: "doc", docId, mode: b.mode === "inline" ? "inline" : "card" } : null;
    }
    case "callout": return (KINDS as readonly string[]).includes(b.kind) && str(b.text, 1000) ? { id, type: "callout", kind: b.kind, text: str(b.text, 1000) } : null;
    case "checklist": {
      const items = (Array.isArray(b.items) ? b.items : []).map((i: unknown) => str(i, 200)).filter(Boolean).slice(0, 30);
      return items.length ? { id, type: "checklist", items } : null;
    }
    case "quiz": {
      const testId = Number(b.testId), tags = cleanTags(b.tags), count = Math.floor(Number(b.count));
      return Number.isInteger(testId) && testId > 0 ? { id, type: "quiz", testId, ...(tags.length ? { tags } : {}), ...(count >= 1 && count <= 100 ? { count } : {}) } : null;
    }
    case "divider": return { id, type: "divider" };
    default: return null;
  }
}

/** Cleans the whole list; `dropped` counts blocks that were unusable (a bad video link, an empty callout). */
export function cleanBlocks(xs: unknown): { blocks: Block[]; dropped: number } {
  const all = Array.isArray(xs) ? xs : [], list = all.slice(0, MAX_BLOCKS), seen = new Set<string>(), blocks: Block[] = [];
  for (const x of list) {
    const b = cleanBlock(x);
    if (!b) continue;
    if (seen.has(b.id)) b.id = randomUUID().slice(0, 8);
    seen.add(b.id); blocks.push(b);
  }
  return { blocks, dropped: all.length - blocks.length }; // blocks past the limit count as dropped too
}

export function cleanCompletion(c: any): Completion {
  const rule = (RULES as readonly string[]).includes(c?.rule) ? c.rule : "viewed";
  const percent = Math.floor(Number(c?.percent));
  return rule === "video" || rule === "quiz" ? { rule, percent: percent >= 1 && percent <= 100 ? percent : 80 } : { rule };
}

/** Things an author should fix before publishing (shown in the editor; they don't block saving a draft). */
export function lessonProblems(title: string, blocks: Block[], completion: Completion): string[] {
  const p: string[] = [];
  if (!blocks.length) p.push("This lesson is empty.");
  if (completion.rule === "video" && !blocks.some((b) => b.type === "video")) p.push("Completion needs a video, but there is none.");
  if (completion.rule === "checklist" && !blocks.some((b) => b.type === "checklist")) p.push("Completion needs a checklist, but there is none.");
  if (completion.rule === "quiz" && !blocks.some((b) => b.type === "quiz")) p.push("Completion needs a quiz block, but there is none.");
  if (!title.trim()) p.push("The lesson needs a title.");
  return p;
}
