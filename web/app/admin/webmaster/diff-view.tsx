"use client";
import { diffPages, type Change } from "./pagediff";

const ICON = { added: "＋", removed: "－", changed: "✎", moved: "↕", page: "⚙" };
const VERB = { added: "Added", removed: "Removed", changed: "Edited", moved: "Moved", page: "Changed" };

export default function DiffView({ before, after }: { before: unknown; after: unknown }) {
  const ch: Change[] = diffPages(before, after);
  if (!ch.length) return <p className="sub">No visible changes.</p>;
  const n = (k: string) => ch.filter((c) => c.kind === k).length;
  return (
    <div className="pdiff">
      <div className="diffsum">
        {(["added", "changed", "moved", "removed"] as const).filter(n).map((k) => <span key={k} className={`chip c-${k}`}>{n(k)} {k}</span>)}
      </div>
      {ch.map((c, i) => (
        <div key={i} className={`pc c-${c.kind}`}>
          <div className="pch"><span className="pci" aria-hidden>{ICON[c.kind]}</span><b>{VERB[c.kind]}</b> {c.kind !== "page" && <span className="tag">{c.type}</span>} {c.label}{c.where && <span className="tag"> in {c.where}</span>}</div>
          {c.fields.map((f) => (
            <div key={f.key} className="pf">
              <span className="pk">{f.key}</span>
              {f.words
                ? <span className="pw">{f.words.map((w, j) => w.t === " " ? w.s : w.t === "+" ? <ins key={j}>{w.s}</ins> : <del key={j}>{w.s}</del>)}</span>
                : <span className="pw"><del>{f.before}</del> → <ins>{f.after}</ins></span>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
