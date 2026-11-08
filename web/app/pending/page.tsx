import { redirect } from "next/navigation";

// Old address of the approval status; it now lives on the members Home.
export default function Pending() {
  redirect("/members");
}
