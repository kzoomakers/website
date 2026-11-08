"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { confirmDialog } from "@/components/dialog";

/**
 * Warns before the tab is closed or reloaded while `value` differs from what it was when the form opened or when `savedKey` last changed
 * (bump it after a successful save). Clicking an in-app link asks first too.
 */
export function useDirtyGuard(value: unknown, savedKey: unknown = 0) {
  const now = JSON.stringify(value), base = useRef<string | null>(value === undefined ? null : now), key = useRef(savedKey);
  if (base.current === null && value !== undefined) base.current = now; // data that loads after the first render: the loaded copy is the baseline
  if (key.current !== savedKey) { key.current = savedKey; base.current = now; }
  const router = useRouter();
  const dirty = base.current !== null && now !== base.current;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    const click = (e: MouseEvent) => {
      const a = (e.target as Element).closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || a.target || a.origin !== location.origin || a.pathname + a.search === location.pathname + location.search) return;
      e.preventDefault(); e.stopPropagation();
      confirmDialog("You have unsaved changes. Leave this page and lose them?", { ok: "Leave", danger: true }).then((ok) => ok && (dirty && window.removeEventListener("beforeunload", warn), router.push(a.pathname + a.search + a.hash)));
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", click, true);
    return () => { window.removeEventListener("beforeunload", warn); document.removeEventListener("click", click, true); };
  }, [dirty, router]);
  return dirty;
}
