// Plain-text questions (Aiken-style) so 40 questions can be pasted instead of clicked. Pure; tested in tests/courses-quiztext.test.mjs.
//
//   Which guard stops kickback?          <- question (may span lines)
//   A. Riving knife                      <- choices A. or A)
//   B. Fence
//   ANSWER: A                            <- A, or "A, C" for several; "True"/"False" with no choices
//   FEEDBACK: The knife keeps the kerf open.   (optional)
//   TAGS: table saw, kickback                  (optional)
//
// Questions are separated by blank lines. Only multiple choice (one or several answers) and true/false are supported here; other types are edited in Training.
export type TextQ = { prompt: string; type: "mc_single" | "mc_multi" | "true_false"; choices: string[]; correct: number | number[] | boolean; feedback: string; tags: string[] };
export const MAX_IMPORT = 100;

export function parseQuestions(text: string): { questions: TextQ[]; errors: string[] } {
  const questions: TextQ[] = [], errors: string[] = [];
  const blocks = text.replace(/\r/g, "").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  if (blocks.length > MAX_IMPORT) errors.push(`At most ${MAX_IMPORT} questions at a time (found ${blocks.length}).`);
  blocks.slice(0, MAX_IMPORT).forEach((b, n) => {
    const bad = (m: string) => errors.push(`Question ${n + 1}: ${m}`);
    const prompt: string[] = [], choices: string[] = [], tags: string[] = [];
    let answer = "", feedback = "";
    for (const line of b.split("\n")) {
      const l = line.trim(), a = l.match(/^answers?\s*:\s*(.*)$/i), f = l.match(/^feedback\s*:\s*(.*)$/i), t = l.match(/^tags?\s*:\s*(.*)$/i), c = l.match(/^([A-Za-z])[.)]\s+(.+)$/);
      if (a) answer = a[1].trim();
      else if (f) feedback = f[1].trim();
      else if (t) tags.push(...t[1].split(",").map((x) => x.trim()).filter(Boolean));
      else if (c && prompt.length && c[1].toUpperCase().charCodeAt(0) - 65 === choices.length) choices.push(c[2].trim());
      else if (!choices.length && !answer) prompt.push(l);
      else return bad(`couldn't read the line "${l.slice(0, 40)}". Choices look like "A. text".`);
    }
    if (!prompt.length) return bad("there's no question text.");
    if (!answer) return bad("add a line like \"ANSWER: B\".");
    const base = { prompt: prompt.join(" "), feedback, tags };
    if (!choices.length) {
      const tf = answer.toLowerCase();
      return tf === "true" || tf === "false" ? void questions.push({ ...base, type: "true_false", choices: [], correct: tf === "true" }) : bad("without choices the answer must be True or False.");
    }
    if (choices.length < 2 || choices.length > 12) return bad("use 2 to 12 choices.");
    const toks = answer.split(/[\s,;]+/).filter(Boolean), letters = toks.map((t) => (/^[A-Za-z]$/.test(t) ? t.toUpperCase().charCodeAt(0) - 65 : -1));
    if (!letters.length || letters.some((i) => i < 0 || i >= choices.length)) return bad(`the answer must be letters from A to ${String.fromCharCode(64 + choices.length)}.`);
    const uniq = [...new Set(letters)].sort((x, y) => x - y);
    questions.push(uniq.length === 1 ? { ...base, type: "mc_single", choices, correct: uniq[0] } : { ...base, type: "mc_multi", choices, correct: uniq });
  });
  return { questions, errors };
}

/** Back to text. Returns the text and how many questions of other types were left out. */
export function formatQuestions(qs: { type: string; prompt: string; config: any; feedback: string; tags: string[] }[]): { text: string; skipped: number } {
  let skipped = 0;
  const out = qs.flatMap((q) => {
    const tail = [q.feedback && `FEEDBACK: ${q.feedback}`, q.tags.length && `TAGS: ${q.tags.join(", ")}`].filter(Boolean) as string[];
    if (q.type === "true_false") return [[q.prompt, `ANSWER: ${q.config.correct ? "True" : "False"}`, ...tail].join("\n")];
    if (q.type === "mc_single" || q.type === "mc_multi") {
      const ch: string[] = (q.config.choices ?? []).map((c: any) => (typeof c === "string" ? c : c.text)), right: number[] = q.type === "mc_single" ? [q.config.correct] : q.config.correct ?? [];
      return [[q.prompt, ...ch.map((c, i) => `${String.fromCharCode(65 + i)}. ${c}`), `ANSWER: ${right.map((i) => String.fromCharCode(65 + i)).join(", ")}`, ...tail].join("\n")];
    }
    skipped++; return [];
  });
  return { text: out.join("\n\n"), skipped };
}
