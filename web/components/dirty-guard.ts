"use client";
import { useEffect, useRef } from "react";

/**
 * Warns before the tab is closed or reloaded while `value` differs from what it was when the form opened or when `savedKey` last changed
 * (bump it after a successful save). In-app link clicks are not intercepted.
 */
export function useDirtyGuard(value: unknown, savedKey: unknown = 0) {
  const now = JSON.stringify(value), base = useRef<string | null>(value === undefined ? null : now), key = useRef(savedKey);
  if (base.current === null && value !== undefined) base.current = now; // data that loads after the first render: the loaded copy is the baseline
  if (key.current !== savedKey) { key.current = savedKey; base.current = now; }
  const dirty = base.current !== null && now !== base.current;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  return dirty;
}
