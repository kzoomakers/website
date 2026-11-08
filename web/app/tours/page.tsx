import Shell from "../blog/shell";
import Booking from "./booking";

export const dynamic = "force-dynamic";
export const metadata = { title: "Book a tour | Kzoo Makers", description: "Pick a time for a guided tour of Kzoo Makers." };

export default function ToursPage() {
  return <Shell title="Book a tour" search={false}><Booking /></Shell>;
}
