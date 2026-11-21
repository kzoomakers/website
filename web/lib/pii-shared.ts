// PII access: constants shared by the server and the screens (no imports, so the tests and client code can load it).
export const PII_KINDS = { personal: "Personal information", emergency: "Emergency contacts", id: "ID", signed_doc: "Signed document", id_renewal: "ID renewal", training: "Training record", training_attempt: "Test attempt (evidence)" } as const;
export type PiiKind = keyof typeof PII_KINDS;
/** The special permission that unlocks each kind. Full admins skip this check (never the modal, the reason or the log). */
export const PII_PERM: Record<PiiKind, string> = { personal: "pii.personal", emergency: "pii.emergency", id: "pii.ids", signed_doc: "pii.personal", id_renewal: "pii.ids", training: "pii.personal", training_attempt: "pii.personal" };
export const PII_AUDIT_PERM = "pii.audit";
export const PII_PERMS = { "pii.personal": "View personal information (phone, address, signed documents)", "pii.emergency": "View emergency contacts", "pii.ids": "View IDs (Gov ID, ID renewals, guest photos)", "pii.audit": "Audit PII (open the Audit PII page)" } as const;
export const REASONS = { tour: "Tour", emergency: "Emergency", id_renewal: "ID renewal", safety: "Safety / incident", legal: "Legal", other: "Other (explain below)" } as const;
export type Reason = keyof typeof REASONS;
// The requests that return personal data, as [method, path]. The HTTP log copy and the "no access record" check look at exactly these (editing a member or uploading a photo is not a read).
export const PII_ROUTES: [string, string][] = [["POST", "/api/pii/retrieve"], ["GET", "/api/members/id/image"], ["GET", "/api/guests/pdf"], ["GET", "/api/guests/contacts"]];
export const BULK_DEFAULT = 10;
export const MODAL_TEXT = ["This is someone's PII (Personally Identifiable Information).", "It must be kept in strict confidentiality and requested only because you need it.", "If you view this, your request will be logged, and the board is sent monthly updates on this."];
export type Subject = { type: "member" | "guest"; id: number; renewal?: number; side?: string; doc?: number; attempt?: number };
/** Checks what the person typed in the modal. Returns the cleaned reason and note, or an error message. */
export function checkReason(reason: unknown, note: unknown): { reason: Reason; note: string } | string {
  const r = String(reason ?? "");
  if (!(r in REASONS)) return "Choose a reason.";
  const n = String(note ?? "").trim().slice(0, 500);
  if (r === "other" && n.length < 3) return "Explain the reason.";
  return { reason: r as Reason, note: n };
}
