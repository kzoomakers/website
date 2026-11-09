"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { TABS, tabOf } from "./tabs";
import { labelOf } from "./nav";

// Admin pages don't set their own metadata, so this keeps the browser tab title in step with the page: "Tour bookings · Tours · Admin".
export default function DocTitle() {
  const here = usePathname();
  useEffect(() => {
    const tab = TABS.find(([h]) => h === tabOf(here))?.[1], page = labelOf(here);
    document.title = [page && page !== tab ? page : "", tab, "Admin"].filter(Boolean).join(" · ");
  }, [here]);
  return null;
}
