/** Message safe to show a visitor: our own validation errors pass through, database (pg) errors are logged and replaced. */
export function errMsg(e: any): string {
  if (e?.severity || e?.routine) { console.error(e); return "Something went wrong. Please try again."; }
  return e?.message || "Failed.";
}
