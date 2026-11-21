# Practice quizzes

## Principle

Reuse the grader and the editor, change only what is shown and what is recorded.

## How it works

- A practice quiz is a **named set of questions** drawn from a test's question bank: either the tool's test (current published or draft revision) or a standalone quiz not tied to any test (e.g. "PPE basics").
- Grading calls the same `grade()` in `lib/training/questions.ts`. No second grader, so practice and real test can never disagree.
- Differences from a real attempt:

| | Real test | Practice |
|---|---|---|
| Counts toward certification | Yes | **Never** |
| Table | `attempts` | `practice_attempts` (separate) |
| Time limit, tries, wait | Per test settings | None |
| Feedback | Per "review after a try" setting | **Immediate, per question**: right/wrong, correct answer, the question's `feedback_html` |
| Question order | Shuffle / pool per settings | Shuffle by default; "missed first" on retry |
| Critical questions | Fail the test | Highlighted, no consequence |
| Answers leave the server | Never during attempt | Only **after** the member submits that question |

- The answer key for a question is returned only in response to submitting an answer for it, one question at a time. That keeps the "correct answers never leave the server" rule intact for real tests, because practice questions are fetched through a different route and the real attempt route is untouched.
- **Risk to name**: if the practice quiz draws from the same questions as the real test, a member can memorise the real test. Mitigations, pick per tool: (a) practice draws only questions flagged `practice_ok`; (b) real test uses a bigger pool than practice shows; (c) accept it, since the point of the test is knowing the material. Default (a), with a one-click "make all practice-ok".

## Practice flow (member)

1. Question appears alone on screen, large.
2. Submit → instant verdict with a short animation, the explanation, and "Next".
3. Wrong ones go into a **"review these"** stack; at the end, "Retry the ones you missed" loops until clear.
4. End screen: score ring, streak, missed list, and a single big button: **"Take the real test"** (if the member is eligible) or **"Back to the lesson"** linked to the lesson that covers the missed topic (via question tags → lesson).
5. Progress saved after every answer, so leaving halfway resumes.

## Admin side

- In the lesson editor, a **Quiz block** picks: this tool's questions, a tag filter, or a standalone quiz; number of questions; pass mark for the completion rule.
- The question editor from `tests/[id]/editor.tsx` gets two additions: **tags** (free text with autocomplete) and a **practice_ok** switch. Standalone quizzes use the same editor.
- Per-question explanation is the existing `feedback_html`.

## Reports

Per question: % correct in practice vs in the real test, and the lessons students visited before. Drives "which lesson is failing people".
