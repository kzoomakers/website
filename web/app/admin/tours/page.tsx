import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import { listBookings } from "@/lib/tours";
import Bookings from "./bookings";

export const dynamic = "force-dynamic";

export default async function ToursPage() {
  await gate("tours", "/admin/tours");
  if (!getConfig()) redirect("/admin/services");
  return <Bookings initial={await listBookings(false)} />;
}
