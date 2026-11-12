import { redirect } from "next/navigation";
import { gate, me } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { listBookings } from "@/lib/tours";
import Bookings from "./bookings";
import WeekCalendar from "./week-calendar";

export const dynamic = "force-dynamic";

export default async function ToursPage() {
  await gate("tours", "/admin/tours");
  if (!getConfig()) redirect("/admin/services");
  const m = await me();
  return <><WeekCalendar /><Bookings initial={await listBookings(false)} email={m?.email.includes("@") ? m.email : ""} /></>;
}
