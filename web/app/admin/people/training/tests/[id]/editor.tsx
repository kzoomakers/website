"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { alertDialog, confirmDialog, promptDialog } from "@/components/dialog";
import { useDirtyGuard } from "@/components/dirty-guard";
import QuestionView, { Rich, type MemberQ } from "@/components/training/question";
import { BLANK, TYPES, TYPE_LABEL, type QType } from "@/lib/training/blank";
import { training } from "../../rpc";
import QuestionForm, { type EQ } from "./forms";

type Meta = { test: { id: number; title: string; archived: boolean; tool: string }; revisions: { id: number; rev_no: number; status: string; change_kind: string; change_note: string; published_by: string | null; published_at: string | null; created_by: string; questions: number; attempts: number }[]; affects: number };
type Rev = { id: number; test_id: number; rev_no: number; status: string; intro_html: string; pass_pct: number; time_limit_min: number | null; max_attempts: number | null; cooldown_hours: number; shuffle_questions: boolean; shuffle_choices: boolean; pool_size: number | null; review_mode: string; grace_days: number; at: string; tampered?: boolean; change_note: string; change_kind: string };
type Data = { rev: Rev; questions: (EQ & { id: number })[] };
type Diff = { settings: { key: string; from: unknown; to: unknown }[]; added: { text: string }[]; removed: { text: string }[]; changed: { label: string; fields: string[]; keyChanged: boolean }[]; moved: boolean; suggest: "major" | "minor" };
const plain = (h: string) => h.replace(/<[^>]*>/g, "").trim() || "(no text)";
const when = (s: string | null) => (s ? new Date(s).toLocaleDateString() : "");

function DiffView({ d }: { d: Diff }) {
  const none = !d.settings.length && !d.added.length && !d.removed.length && !d.changed.length && !d.moved;
  return (
    <div className="qe-grid">
      {none && <p className="sub">No differences.</p>}
      {d.added.map((x, i) => <div key={"a" + i}>➕ Added: {x.text}</div>)}
      {d.removed.map((x, i) => <div key={"r" + i}>➖ Removed: {x.text}</div>)}
      {d.changed.map((x, i) => <div key={"c" + i}>✏️ {x.label}: changed {x.fields.join(", ")}{x.keyChanged && <span className="tag pri"> answer or points changed</span>}</div>)}
      {d.moved && <div>↕️ Questions were reordered</div>}
      {d.settings.map((s) => <div key={s.key}>⚙️ {s.key.replace(/_/g, " ")}: {String(s.from ?? "none")} → {String(s.to ?? "none")}</div>)}
    </div>
  );
}

export default function Editor({ initial, canEdit, canPublish }: { initial: Meta; canEdit: boolean; canPublish: boolean }) {
  const [meta, setMeta] = useState(initial), [revId, setRevId] = useState<number>((initial.revisions.find((r) => r.status === "draft") ?? initial.revisions[0]).id);
  const [unsaved, setUnsaved] = useState(false), [data, setData] = useState<Data | null>(null), [sel, setSel] = useState<number | null>(null), [tab, setTab] = useState("questions"), [status, setStatus] = useState(""), [stale, setStale] = useState(false);
  const at = useRef(""), chain = useRef<Promise<unknown>>(Promise.resolve()), timers = useRef(new Map<number, ReturnType<typeof setTimeout>>()), latest = useRef(new Map<number, EQ>()), revRef = useRef(revId);
  revRef.current = revId;
  const inflight = useRef(0), failed = useRef(false), staleRef = useRef(false);
  const sync = () => setUnsaved(timers.current.size > 0 || inflight.current > 0 || failed.current); // typed but not yet safely on the server
  useDirtyGuard(unsaved ? 1 : 0);
  const editable = canEdit && data?.rev.status === "draft" && !stale;

  const loadMeta = useCallback(async () => { const m = await training<Meta>("test", { id: initial.test.id }); setMeta(m); return m; }, [initial.test.id]);
  const load = useCallback(async (id: number) => {
    const d = await training<Data>("revision", { id }); at.current = d.rev.at; failed.current = false; staleRef.current = false; setData(d); setStale(false); sync();
    setSel((s) => (d.questions.some((q) => q.id === s) ? s : d.questions[0]?.id ?? null));
  }, []);
  useEffect(() => { load(revId).catch((e) => alertDialog(e.message)); }, [revId, load]);

  /** Server changes run one at a time, each carrying the version the last one returned. */
  const run = useCallback(<T,>(fn: () => Promise<T & { at?: string }>): Promise<T | undefined> => {
    inflight.current++; sync();
    const p = chain.current.then(async () => {
      setStatus("Saving…");
      try { const r = await fn(); if (r?.at) at.current = r.at; failed.current = false; setStatus("All changes saved"); return r; }
      catch (e: any) { setStatus(""); failed.current = true; if (/Someone else/.test(e.message)) { staleRef.current = true; setStale(true); } alertDialog(e.message); return undefined; }
      finally { inflight.current--; sync(); }
    });
    chain.current = p; return p as Promise<T | undefined>;
  }, []);
  const flush = useCallback(async () => {
    for (const [id, t] of timers.current) { clearTimeout(t); timers.current.delete(id); const q = latest.current.get(id); if (q) run(() => training("saveQuestion", { id: revRef.current, at: at.current, question: q })); }
    sync(); await chain.current;
  }, [run]);

  const edit = (id: number, p: Partial<EQ>) => {
    setData((d) => d && { ...d, questions: d.questions.map((q) => { if (q.id !== id) return q; const n = { ...q, ...p }; latest.current.set(id, n); return n; }) });
    clearTimeout(timers.current.get(id));
    timers.current.set(id, setTimeout(() => { timers.current.delete(id); const q = latest.current.get(id); if (q) run(() => training("saveQuestion", { id: revRef.current, at: at.current, question: q })); sync(); }, 700));
    sync();
  };
  const add = async (type: QType) => {
    await flush();
    const r = await run<{ id: number }>(() => training("saveQuestion", { id: revId, at: at.current, question: { type, prompt_html: "", points: 1, config: BLANK[type](), feedback_html: "", required_correct: false } }));
    if (r) { setData((d) => d && { ...d, questions: [...d.questions, { id: r.id, type, prompt_html: "", points: 1, config: BLANK[type](), feedback_html: "", required_correct: false }] }); setSel(r.id); }
  };
  const remove = async (id: number) => {
    if (!(await confirmDialog("Delete this question?", { ok: "Delete", danger: true }))) return;
    await flush(); clearTimeout(timers.current.get(id)); timers.current.delete(id); latest.current.delete(id);
    const r = await run(() => training("deleteQuestion", { id: revId, at: at.current, qid: id }));
    if (r) setData((d) => d && { ...d, questions: d.questions.filter((q) => q.id !== id) });
  };
  const move = async (i: number, dir: number) => {
    if (!data) return; await flush();
    const qs = data.questions.slice(); [qs[i], qs[i + dir]] = [qs[i + dir], qs[i]]; setData({ ...data, questions: qs });
    run(() => training("reorder", { id: revId, at: at.current, ids: qs.map((q) => q.id) }));
  };
  const setting = (key: string, value: unknown) => { setData((d) => d && { ...d, rev: { ...d.rev, [key]: value } as Rev }); return run(() => training("saveSettings", { id: revId, at: at.current, settings: { [key]: value } })).then((r) => { if (!r && !staleRef.current) load(revRef.current); return r; }); };
  const go = async (t: string) => { await flush(); setTab(t); };

  if (!data) return <p className="sub">Loading…</p>;
  const { rev, questions } = data, q = questions.find((x) => x.id === sel), draft = meta.revisions.find((r) => r.status === "draft"), live = meta.revisions.find((r) => r.status === "published");
  const num = (k: keyof Rev, label: string, o: { min: number; max: number; blank?: string }) => (
    <label>{label}<input type="number" min={o.min} max={o.max} disabled={!editable} placeholder={o.blank} value={(rev[k] as number | null) ?? ""} onChange={(e) => setData({ ...data, rev: { ...rev, [k]: e.target.value === "" ? null : +e.target.value } })} onBlur={(e) => { const v = e.target.value === "" ? (o.blank ? null : o.min) : +e.target.value; setting(k, v); }} style={{ width: 140 }} /></label>
  );
  const check = (k: keyof Rev, label: string) => <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" style={{ width: "auto", margin: 0 }} disabled={!editable} checked={!!rev[k]} onChange={(e) => setting(k, e.target.checked)} />{label}</label>;

  return (
    <>
      <p style={{ margin: "0 0 4px" }}><Link href="/admin/people/training/tests">← All tests</Link></p>
      <h1>{meta.test.tool}: {meta.test.title}{meta.test.archived && <span className="tag"> (archived)</span>}</h1>
      <div className="bar" style={{ marginBottom: 8 }}>
        <span className="tag pri">Revision {rev.rev_no}: {rev.status}</span>
        {rev.tampered && <span className="qe-warn"><b>Warning:</b> this published revision no longer matches its fingerprint; it was changed outside the site.</span>}
        <select aria-label="Revision" value={revId} onChange={async (e) => { await flush(); setRevId(+e.target.value); }}>{meta.revisions.map((r) => <option key={r.id} value={r.id}>Revision {r.rev_no} ({r.status})</option>)}</select>
        <span className="qe-status" role="status">{stale ? "Out of date: reload to keep editing" : status}</span>
        <span className="grow" />
        {canEdit && rev.status !== "draft" && !draft && !meta.test.archived && <button className="pri" onClick={async () => { try { const r = await training<{ id: number }>("newDraft", { id: meta.test.id }); await loadMeta(); setRevId(r.id); setTab("questions"); } catch (x: any) { alertDialog(x.message); } }}>Start a new draft</button>}
        {rev.status === "draft" && draft && rev.rev_no > 1 && canEdit && <button onClick={async () => { if (await confirmDialog("Discard this draft? The published revision stays as it is.", { ok: "Discard", danger: true })) { try { await training("discardDraft", { id: revId }); const m = await loadMeta(); setRevId(m.revisions[0].id); } catch (x: any) { alertDialog(x.message); } } }}>Discard draft</button>}
        {canEdit && <button onClick={async () => { const t = await promptDialog("Rename this test", meta.test.title, { ok: "Rename" }); if (t === null) return; try { await training("renameTest", { id: meta.test.id, title: t }); await loadMeta(); } catch (x: any) { alertDialog(x.message); } }}>Rename</button>}
        {canEdit && <button onClick={async () => { try { await training("archiveTest", { id: meta.test.id, on: !meta.test.archived }); await loadMeta(); } catch (x: any) { alertDialog(x.message); } }}>{meta.test.archived ? "Restore test" : "Archive test"}</button>}
        {canEdit && meta.revisions.every((r) => r.status === "draft") && <button className="danger" onClick={async () => { if (await confirmDialog("Delete this test and its draft? This can't be undone.", { ok: "Delete", danger: true })) { try { await training("deleteTest", { id: meta.test.id }); location.href = "/admin/people/training/tests"; } catch (x: any) { alertDialog(x.message); } } }}>Delete test</button>}
        <button onClick={async () => { const x = await training("export", { id: revId }); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(x, null, 2)], { type: "application/json" })); a.download = `${meta.test.tool}-rev${rev.rev_no}.json`.replace(/\s+/g, "-"); a.click(); }}>Export</button>
        {editable && <label style={{ margin: 0 }}><span className="sub" style={{ margin: 0 }}>Import: </span><input type="file" accept="application/json" style={{ display: "inline-block", width: "auto" }} onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f || !(await confirmDialog("Replace this draft's questions with the file's?", { ok: "Replace", danger: true }))) return; let json; try { json = JSON.parse(await f.text()); } catch { alertDialog("That file isn't valid JSON."); return; } await flush(); if (await run(() => training("import", { id: revId, at: at.current, data: json }))) load(revId); }} /></label>}
      </div>
      {rev.status !== "draft" && <p className="sub">This revision is published and can't be edited. {live?.id === rev.id ? "Members take this one." : ""}</p>}

      <div className="qe-tabs" role="tablist">
        {[["questions", `Questions (${questions.length})`], ["settings", "Settings"], ["preview", "Preview"], ["history", "History"], ...(rev.status === "draft" ? [["publish", "Publish"]] : [])].map(([k, l]) => <button key={k} role="tab" aria-current={tab === k} onClick={() => go(k)}>{l}</button>)}
      </div>

      {tab === "questions" && (
        <div className="qe-list">
          <div>
            {questions.map((x, i) => (
              <div key={x.id} className="qe-row" style={{ gap: 4 }}>
                <button className="qe-q" aria-current={sel === x.id} onClick={() => setSel(x.id)}><b>{i + 1}</b><span className="t">{plain(x.prompt_html)}</span>{x.required_correct && <span title="Critical">⚠️</span>}</button>
                {editable && <><button aria-label={`Move question ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button><button aria-label={`Move question ${i + 1} down`} disabled={i === questions.length - 1} onClick={() => move(i, 1)}>↓</button></>}
              </div>
            ))}
            {!questions.length && <p className="sub">No questions yet.</p>}
            {editable && <label>Add a question<select value="" onChange={(e) => e.target.value && add(e.target.value as QType)}><option value="">Choose a type…</option>{TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select></label>}
          </div>
          <div className="card" style={{ padding: 16 }}>
            {q ? <>
              <QuestionForm q={q} set={(p) => edit(q.id, p)} disabled={!editable} />
              {editable && <div className="bar" style={{ marginTop: 12 }}><button className="danger" onClick={() => remove(q.id)}>Delete question</button></div>}
            </> : <p className="sub">Select a question, or add one.</p>}
          </div>
        </div>
      )}

      {tab === "settings" && (
        <div className="card qe-grid" style={{ padding: 16, maxWidth: 640 }}>
          <label>Introduction shown before the test<textarea rows={4} maxLength={10000} disabled={!editable} value={rev.intro_html} onChange={(e) => setData({ ...data, rev: { ...rev, intro_html: e.target.value } })} onBlur={(e) => setting("intro_html", e.target.value)} /></label>
          {num("pass_pct", "Pass mark (%)", { min: 1, max: 100 })}
          {num("time_limit_min", "Time limit (minutes)", { min: 1, max: 480, blank: "No limit" })}
          {num("max_attempts", "Attempts allowed", { min: 1, max: 50, blank: "Unlimited" })}
          {num("cooldown_hours", "Wait between attempts (hours)", { min: 0, max: 720 })}
          {num("pool_size", "Questions drawn per attempt", { min: 1, max: 100, blank: "All of them" })}
          {check("shuffle_questions", "Shuffle the order of questions")}
          {check("shuffle_choices", "Shuffle the order of choices")}
          <label>After a test, members see<select disabled={!editable} value={rev.review_mode} onChange={(e) => setting("review_mode", e.target.value)}><option value="score">Only their score</option><option value="missed">Which questions they missed (not the answers)</option><option value="all">The correct answers too</option></select></label>
          {num("grace_days", "Days to re-pass after a major change", { min: 1, max: 365 })}
        </div>
      )}

      {tab === "preview" && <Preview revId={revId} intro={rev.intro_html} pass={rev.pass_pct} key={revId + ":" + questions.length} />}

      {tab === "history" && <History meta={meta} onView={(id) => { setRevId(id); setTab("questions"); }} />}

      {tab === "publish" && editable && <Publish meta={meta} rev={rev} liveId={live?.id} canPublish={canPublish} onDone={async (id) => { await loadMeta(); setRevId(id); await load(id); setTab("questions"); }} at={() => at.current} />}
    </>
  );
}

function Preview({ revId, intro, pass }: { revId: number; intro: string; pass: number }) {
  const [seed, setSeed] = useState(1), [qs, setQs] = useState<MemberQ[] | null>(null), [ans, setAns] = useState<Record<number, any>>({}), [res, setRes] = useState<any>(null);
  useEffect(() => { setQs(null); setRes(null); setAns({}); training<{ questions: MemberQ[] }>("preview", { id: revId, seed }).then((r) => setQs(r.questions), (e) => alertDialog(e.message)); }, [revId, seed]);
  if (!qs) return <p className="sub">Loading…</p>;
  return (
    <div style={{ maxWidth: 720 }}>
      <p className="sub">This is what a member sees. Nothing you do here is recorded. Pass mark: {pass}%.</p>
      {intro && <div className="card" style={{ padding: 12, marginBottom: 16 }}><Rich html={intro} /></div>}
      {qs.map((q, i) => {
        const r = res?.per.find((p: any) => p.id === q.id);
        return <div key={q.id}><QuestionView q={q} n={i + 1} value={ans[q.id]} onChange={(v) => setAns({ ...ans, [q.id]: v })} disabled={!!res} />
          {r && <div className={"tq-result " + (r.correct ? "ok" : "no")}><b>{r.correct ? "Correct" : r.points > 0 ? "Partly right" : "Not right"}</b> ({r.points}/{r.max}). Answer: {r.answer}{r.feedback_html && <Rich html={r.feedback_html} />}</div>}</div>;
      })}
      {!qs.length && <p className="sub">No questions yet.</p>}
      <div className="bar">
        {!res ? <button className="pri" disabled={!qs.length} onClick={() => training("previewGrade", { id: revId, answers: ans }).then(setRes, (e) => alertDialog(e.message))}>Check my answers</button> : <button onClick={() => { setRes(null); setAns({}); }}>Try again</button>}
        <button onClick={() => setSeed(seed + 1)}>Shuffle again</button>
        {res && <b>{res.pct}%: {res.passed ? "Pass" : res.criticalMissed ? `Fail (${res.criticalMissed} critical question${res.criticalMissed === 1 ? "" : "s"} missed)` : "Fail"}</b>}
      </div>
    </div>
  );
}

function History({ meta, onView }: { meta: Meta; onView: (id: number) => void }) {
  const [d, setD] = useState<{ id: number; diff: Diff } | null>(null);
  return (
    <div className="card">
      {meta.revisions.map((r, i) => {
        const prev = meta.revisions[i + 1];
        return (
          <div key={r.id}>
            <div className="row">
              <b>Revision {r.rev_no}</b><span className="tag">{r.status}</span>{r.status !== "draft" && <span className="tag">{r.change_kind}</span>}
              <span className="grow sub" style={{ margin: 0 }}>{r.status === "draft" ? `Started by ${r.created_by}` : `${r.change_note} (${r.published_by}, ${when(r.published_at)})`}</span>
              <span className="tag">{r.questions} questions</span>{r.attempts > 0 && <span className="tag">{r.attempts} attempts</span>}
              <button onClick={() => onView(r.id)}>View</button>
              {prev && <button onClick={() => training<Diff>("compare", { a: prev.id, b: r.id }).then((diff) => setD({ id: r.id, diff }), (e) => alertDialog(e.message))}>Changes since {prev.rev_no}</button>}
            </div>
            {d?.id === r.id && <div style={{ padding: "4px 0 12px 12px" }}><DiffView d={d.diff} /></div>}
          </div>
        );
      })}
    </div>
  );
}

function Publish({ meta, rev, liveId, canPublish, onDone, at }: { meta: Meta; rev: Rev; liveId?: number; canPublish: boolean; onDone: (id: number) => void; at: () => string }) {
  const [problems, setProblems] = useState<string[] | null>(null), [diff, setDiff] = useState<Diff | null>(null), [kind, setKind] = useState<"major" | "minor">("major"), [note, setNote] = useState(""), [busy, setBusy] = useState(false);
  const [force, setForce] = useState(false), [deadline, setDeadline] = useState(() => new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10)), [who, setWho] = useState<Record<string, number>>({}), [inc, setInc] = useState<string[]>(["training"]);
  const first = rev.rev_no === 1;
  useEffect(() => {
    training<{ problems: string[] }>("publishCheck", { id: rev.id }).then((r) => setProblems(r.problems), (e) => alertDialog(e.message));
    training("rolloutPreview", { id: meta.test.id }).then(setWho, () => {});
    if (liveId) training<Diff>("compare", { a: liveId, b: rev.id }).then((d) => { setDiff(d); setKind(d.suggest); }, () => {});
  }, [rev.id, liveId]);
  return (
    <div className="card qe-grid" style={{ padding: 16, maxWidth: 720 }}>
      <h2 style={{ margin: 0 }}>Publish revision {rev.rev_no}</h2>
      {problems === null ? <p className="sub">Checking…</p> : problems.length ? <div><b className="qe-warn">Fix these first:</b><ul>{problems.map((p, i) => <li key={i}>{p}</li>)}</ul></div> : <p>✅ The test is ready to publish.</p>}
      {liveId && <><h3 style={{ margin: 0, fontSize: 15 }}>Changes since the live revision</h3>{diff ? <DiffView d={diff} /> : <p className="sub">Comparing…</p>}</>}
      {!first && <>
        <fieldset style={{ border: 0, padding: 0 }}>
          <legend><b>Is this a major or a minor change?</b></legend>
          <label style={{ display: "flex", gap: 8 }}><input type="radio" style={{ width: "auto", margin: 0 }} checked={kind === "major"} onChange={() => setKind("major")} /><span>Major: an answer, a question, or the pass mark changed. Members who already passed will have to pass this one{meta.affects ? ` (${meta.affects} member${meta.affects === 1 ? " holds" : "s hold"} an active authorization on this tool)` : ""}. </span></label>
          <label style={{ display: "flex", gap: 8 }}><input type="radio" style={{ width: "auto", margin: 0 }} checked={kind === "minor"} onChange={() => setKind("minor")} /><span>Minor: wording, a typo, an explanation. Nobody has to retake it.</span></label>
          {diff && kind !== diff.suggest && <p className="qe-warn">The changes look {diff.suggest}. Check this is what you mean.</p>}
        </fieldset>
        {kind === "major" && Object.values(who).some((n) => n > 0) && (
          <fieldset style={{ border: 0, padding: 0 }}>
            <label style={{ display: "flex", gap: 8 }}><input type="checkbox" style={{ width: "auto", margin: 0 }} checked={force} onChange={(e) => setForce(e.target.checked)} /><span>Make current holders re-pass by a deadline. Anyone who doesn't loses the authorization until they pass (you can extend or undo this later).</span></label>
            {force && <>
              <label>Deadline <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></label>
              {(["training", "legacy", "manual", "override"] as const).filter((s) => who[s] > 0).map((s) => <label key={s} style={{ display: "flex", gap: 8 }}><input type="checkbox" style={{ width: "auto", margin: 0 }} checked={inc.includes(s)} onChange={(e) => setInc(e.target.checked ? [...inc, s] : inc.filter((x) => x !== s))} />{who[s]} {s === "training" ? "signed off through training" : s === "legacy" ? "authorized before training existed" : s === "manual" ? "granted by hand" : "overridden"}</label>)}
            </>}
          </fieldset>
        )}
        <label>What changed? (members are told this for a major change)<textarea rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      </>}
      {!canPublish && <p className="qe-warn">You need the special permission “Publish a training test revision” to publish. Ask an administrator.</p>}
      <div className="bar"><button className="pri" disabled={busy || !canPublish || !!problems?.length || problems === null} onClick={async () => {
        setBusy(true);
        try { const r = await training<{ id: number }>("publish", { id: rev.id, at: at(), kind, note, ...(kind === "major" && force ? { deadline, sources: inc } : {}) }); onDone(r.id); } catch (x: any) { alertDialog(x.message); } finally { setBusy(false); }
      }}>Publish revision {rev.rev_no}</button></div>
    </div>
  );
}
