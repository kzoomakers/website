import { redirect } from "next/navigation";

// Services moved to the Admin section.
export default function Old() { redirect("/admin/services"); }
