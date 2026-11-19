"use client";
import { useEffect, useState } from "react";
import { PiiModal } from "@/components/pii-retrieve";
import "../../../../members/id/id.css";

// The member's Gov ID: a blurred sample until an admin asks for it (reason modal, logged), then the real image wipes in. Hide puts it away again.
export default function IdPhoto({ id }: { id: number }) {
  const [ask, setAsk] = useState(false), [d, setD] = useState<{ image: string; kind: string; expires_on: string | null } | null>(null), [open, setOpen] = useState(false);
  useEffect(() => { if (!d) return setOpen(false); const t = requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true))); return () => cancelAnimationFrame(t); }, [d]);
  return (
    <div style={{ display: "grid", gap: 10, maxWidth: 520 }}>
      <button type="button" className="idc" data-open={open} aria-label={d ? "Gov ID" : "Gov ID is hidden. Activate to show it."} onClick={() => !d && setAsk(true)}>
        {d && <img src={d.image} alt="Gov ID" />}
        <span className="idc-veil" aria-hidden><img className="idc-blur" src="/images/id-sample.jpg" alt="" /><span className="idc-edge" /></span>
        {!d && <span className="idc-hint">🔒 Click to show the Gov ID</span>}
      </button>
      {d && <div className="bar"><span className="sub">{d.kind}{d.expires_on ? ` · expires ${d.expires_on}` : ""}</span><button type="button" onClick={() => setD(null)}>Hide</button></div>}
      {ask && <PiiModal kind="id" subject={{ type: "member", id }} onData={setD} onClose={() => setAsk(false)} />}
    </div>
  );
}
