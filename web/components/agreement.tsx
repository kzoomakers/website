import type { Change, Section } from "@/lib/waiver-diff";

const CSS = `.ag-sec{margin:0 0 12px;line-height:1.5;white-space:pre-wrap}.ag-sec b{text-decoration:underline}
.ag-ch{border:1px solid #ddd;border-left-width:4px;border-radius:8px;padding:10px 14px;margin:0 0 10px;background:#fff;color:#111}
.ag-ch.added{border-left-color:#1b7f3b}.ag-ch.removed{border-left-color:#c62828}.ag-ch.changed{border-left-color:#d6a21f}
.ag-badge{font:700 11px/1 system-ui;letter-spacing:.5px;text-transform:uppercase;padding:3px 7px;border-radius:99px;margin-right:8px;color:#fff}
.added .ag-badge{background:#1b7f3b}.removed .ag-badge{background:#c62828}.changed .ag-badge{background:#b8860b}
.ag-ch ins{background:#d4f4dd;text-decoration:none;border-radius:3px}.ag-ch del{background:#fbd5d5;border-radius:3px}
.ag-body{white-space:pre-wrap;margin:8px 0 0;line-height:1.5;font-size:14px}`;
const LABEL = { added: "New", removed: "Removed", changed: "Edited" };

/** The agreement as readable text: underlined run-in headings, like the paper form. */
export function Agreement({ sections, closing }: { sections: Section[]; closing?: string }) {
  return <><style>{CSS}</style>{sections.map((s) => <p key={s.heading} className="ag-sec"><b>{s.heading}</b>: {s.body}</p>)}{closing && <p className="ag-sec"><strong>{closing}</strong></p>}</>;
}

/** Section-by-section changes: new, edited (with the exact words highlighted) and removed. */
export function Changes({ changes }: { changes: Change[] }) {
  if (!changes.length) return <p className="sub">The wording is identical.</p>;
  return (
    <>
      <style>{CSS}</style>
      {changes.map((c) => (
        <div key={c.kind + c.heading} className={`ag-ch ${c.kind}`}>
          <span className="ag-badge">{LABEL[c.kind]}</span><strong>{c.heading}</strong>
          {c.words ? <p className="ag-body">{c.words.map((w, i) => (w.t === "+" ? <ins key={i}>{w.s}</ins> : w.t === "-" ? <del key={i}>{w.s}</del> : w.s))}</p>
            : <details open={c.kind === "added"}><summary className="sub" style={{ cursor: "pointer" }}>{c.kind === "added" ? "Read the new section" : "What it used to say"}</summary><p className="ag-body">{c.body}</p></details>}
        </div>
      ))}
    </>
  );
}
