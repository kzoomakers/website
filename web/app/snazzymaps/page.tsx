import StyledMap from "@/components/styled-map";
import { getHours } from "@/lib/store";
import { mapsKey } from "@/lib/maps-key";

// Example of the styled Google map at our location. Copy this to reuse <StyledMap> elsewhere.
export const dynamic = "force-dynamic";
export const metadata = { title: "Map example", robots: { index: false } };

export default async function SnazzyMaps() {
  const [key, hours] = await Promise.all([mapsKey(), getHours()]);
  return key ? <StyledMap apiKey={key} address={hours.contact.address} /> : <main className="card"><p>Add a Google Maps API key in Admin &gt; Setup to see the map.</p></main>;
}
