"use client";
import { useState } from "react";
import GuestWizard from "@/app/members/guest-wizard";

export default function GuestPage({ token, name, host }: { token: string; name: string; host: string }) {
  const [go, setGo] = useState(false);
  return go ? <GuestWizard token={token} onClose={() => setGo(false)} /> : <main className="card" style={{ maxWidth: 520, display: "grid", gap: 12 }}>
    <h1 style={{ margin: 0 }}>Welcome{name ? `, ${name}` : ""}!</h1>
    <p>{host} invited you to Kzoo Makers. Before your visit we need a few details, an emergency contact, your signature on our guest agreement, and a photo of your ID. It takes a few minutes, and you can stop and come back with the same link.</p>
    <button className="pri" style={{ minHeight: 48 }} onClick={() => setGo(true)}>Start</button>
  </main>;
}
