"use client";
import type { ReactNode } from "react";

/** One status/error message. Errors are announced at once (role=alert); success and info politely (role=status). Pass a falsy `children` to render nothing. */
export default function Notice({ kind = "info", children, onClose }: { kind?: "error" | "success" | "info"; children?: ReactNode; onClose?: () => void }) {
  if (!children) return null;
  return <div className={"notice " + kind} role={kind === "error" ? "alert" : "status"}><span>{children}</span>{onClose && <button type="button" aria-label="Dismiss" onClick={onClose}>×</button>}</div>;
}

/** Picks a Notice kind for a free-text message: failures read as errors, anything else as success. */
export const msgKind = (s: string): "error" | "success" => (/\b(couldn'?t|can'?t|cannot|fail(ed|ure)?|error|invalid|unable|network|not allowed|too (large|big|long))\b/i.test(s) ? "error" : "success");
