import { redirect } from "next/navigation";
import { gate } from "@/lib/guard";
import { getConfig } from "@/lib/config";
import MapsKey from "../maps-key";
import { mapsKey } from "@/lib/maps-key";

export const dynamic = "force-dynamic";

export default async function MapsPage() {
  if ((await gate("system", "/admin/system/maps")) !== "write") redirect("/admin");
  if (!getConfig()) redirect("/admin/system");
  return <><h1>Google Maps</h1><MapsKey initial={await mapsKey()} /></>;
}
