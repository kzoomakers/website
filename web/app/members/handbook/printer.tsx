"use client";
import { useEffect, useRef, useState } from "react";
import "./printer.css";

// Click: three logo sheets shoot out in one second, half a second later the print dialog opens. Idle: perfectly still.
// What gets printed is the handbook document on this page (components/handbook-print.css), not the screen.
const Sheet = ({ className, style }: { className: string; style?: React.CSSProperties }) => (
  <span className={className} style={style}><img src="/images/favicon.png" alt="" /><i /><i /><i /></span>
);

export default function Printer() {
  const [go, setGo] = useState(false), t = useRef(0), busy = useRef(false);
  useEffect(() => () => clearTimeout(t.current), []);
  const click = () => {
    if (busy.current) return;
    busy.current = true;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    setGo(!still);
    t.current = window.setTimeout(() => { window.print(); busy.current = false; setGo(false); }, still ? 0 : 1500);
  };
  return (
    <button type="button" className={"hbpr" + (go ? " go" : "")} onClick={click}>
      <span className="pr" aria-hidden="true">
        <span className="ramp" />
        <span className="shell" />
        <span className="exit" />
        <Sheet className="sheet feed" />
        {[0, 1, 2].map((i) => <Sheet key={i} className="sheet fly" style={{ ["--i" as any]: i, ["--dx" as any]: [-6, 5, -1][i], ["--r" as any]: [-6, 5, -2][i] + "deg" }} />)}
        <span className="top"><b className="l1" /><b className="l2" /><b className="l3" /></span>
        <span className="sep" />
        <span className="front" />
      </span>
      <span>Click to print</span>
    </button>
  );
}
