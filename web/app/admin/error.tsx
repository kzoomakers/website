"use client";

// A failing admin page shows this inside the admin chrome (menu still works) instead of the blank "Application error" screen.
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card" role="alert" style={{ padding: 16 }}>
      <h1>This page hit a problem</h1>
      <p className="sub">It's usually temporary (the database was busy, or a setup step didn't finish). Try again; if it keeps happening, tell the webmaster this code: <code>{error.digest ?? "none"}</code>. It matches a line in the server log.</p>
      <button className="pri" onClick={reset}>Try again</button>
    </div>
  );
}
