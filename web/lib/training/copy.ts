// What training emails and notices say. Pure (no database) so the Settings page can preview with the same code that sends. Copy is plain text with {{variables}};
// values are escaped for HTML and stripped of line breaks in subjects, and a template can't run anything.
export const VARS = { name: "Member's first name", tool: "Tool", deadline: "Re-pass deadline", trainer: "Trainer", link: "Link to the Training page", reason: "Reason or note", days: "Days left" } as const;
export type Vars = Partial<Record<keyof typeof VARS, string>>;
type Ev = { label: string; to: "member" | "lead"; subject: string; body: string };
export const EVENTS: Record<string, Ev> = {
  "attempt.passed": { label: "Member passes a test", to: "member", subject: "You passed the {{tool}} test", body: "Hi {{name}},\n\nYou passed the {{tool}} test. A trainer will be in touch to finish your sign-off. You can't use the tool until then.\n\n{{link}}" },
  "attempt.failed": { label: "Member doesn't pass", to: "member", subject: "Not yet: {{tool}} test", body: "Hi {{name}},\n\nYou didn't pass the {{tool}} test this time. You can try again from your Training page.\n\n{{link}}" },
  "attempts.exhausted": { label: "Member is out of attempts", to: "member", subject: "{{tool}} test: please talk to a trainer", body: "Hi {{name}},\n\nYou've used all your attempts on the {{tool}} test. Please talk to a trainer about getting more.\n\n{{link}}" },
  "cert.in_training": { label: "Hands-on training starts", to: "member", subject: "{{tool}} training has started", body: "Hi {{name}},\n\n{{trainer}} has started your hands-on training for {{tool}}.\n\n{{link}}" },
  "cert.rejected": { label: "Trainer sends someone back", to: "member", subject: "More work needed on {{tool}}", body: "Hi {{name}},\n\nYour trainer says you need a little more work on {{tool}}:\n\n{{reason}}\n\nYou can retake the test or keep training from your Training page.\n\n{{link}}" },
  "cert.certified": { label: "Member is signed off", to: "member", subject: "You're authorized on {{tool}}", body: "Hi {{name}},\n\nCongratulations! A trainer signed you off, and you're now authorized on {{tool}}.\n\n{{link}}" },
  "rollout.started": { label: "A re-pass is required", to: "member", subject: "Please retake the {{tool}} test by {{deadline}}", body: "Hi {{name}},\n\nThe {{tool}} test changed: {{reason}}\n\nPass the new test by {{deadline}} to keep your authorization.\n\n{{link}}" },
  "rollout.reminder": { label: "Re-pass reminder", to: "member", subject: "{{tool}}: retake the test by {{deadline}}", body: "Hi {{name}},\n\nA reminder: retake the {{tool}} test by {{deadline}} ({{days}} left) to keep your authorization.\n\n{{link}}" },
  "rollout.satisfied": { label: "Member passes the re-pass", to: "member", subject: "You're current on {{tool}}", body: "Hi {{name}},\n\nThanks for retaking the {{tool}} test. Your authorization is current.\n\n{{link}}" },
  "cert.lapsed": { label: "Authorization lapses", to: "member", subject: "Your {{tool}} authorization has lapsed", body: "Hi {{name}},\n\nYou didn't retake the {{tool}} test by the deadline, so your authorization has lapsed. Pass the new test to get it back, or ask a trainer for help.\n\n{{link}}" },
  "cert.override": { label: "A step is waived for a member", to: "member", subject: "{{tool}}: a training step was waived", body: "Hi {{name}},\n\nA lead waived a training step for you on {{tool}}: {{reason}}\n\n{{link}}" },
  "cert.revoked": { label: "Authorization revoked", to: "member", subject: "Your {{tool}} authorization was removed", body: "Hi {{name}},\n\nA lead removed your {{tool}} authorization: {{reason}}\n\nTalk to a trainer about getting it back.\n\n{{link}}" },
  "lead.override": { label: "Lead notice: a step was waived", to: "lead", subject: "Training override: {{name}}, {{tool}}", body: "{{trainer}} used a manual override for {{name}} on {{tool}}.\n\nReason: {{reason}}" },
  "lead.discord_revoked": { label: "Lead notice: Discord webhook stopped working", to: "lead", subject: "Training Discord announcements switched off", body: "Discord rejected the webhook for training announcements (it was probably deleted), so announcements are switched off. Add a new webhook under Training > Settings." },
};
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const fill = (t: string, v: Vars, f: (s: string) => string) => t.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => f(String((v as Record<string, string>)[k] ?? "")));
/** Subject: plain text, no line breaks. Text body: values as they are. HTML body: template and values escaped, blank lines make paragraphs. */
export function render(e: { subject: string; body: string }, v: Vars) {
  const link = v.link ? v.link : "";
  return {
    subject: fill(e.subject, v, (s) => s.replace(/[\r\n\t]+/g, " ")).replace(/[\r\n]+/g, " ").slice(0, 200),
    text: fill(e.body, v, (s) => s),
    html: fill(esc(e.body), v, esc).split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${p.replace(link ? esc(link) : "\u0000", () => (link ? `<a href="${esc(link)}">${esc(link)}</a>` : "")).replace(/\n/g, "<br>")}</p>`).join(""),
  };
}
