// Runs once when the server starts: a minute timer for scheduled emails (and to resume interrupted sends).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { tick } = await import("./lib/mail");
    setInterval(() => tick().catch(() => {}), 60_000);
  }
}
