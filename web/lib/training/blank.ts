// Client-safe pieces of the question model (the rest, questions.ts, pulls in the HTML sanitizer, which must stay on the server).
export const TYPES = ["mc_single", "mc_multi", "true_false", "image_label", "match", "order", "fill_blank", "short_text", "numeric", "hotspot"] as const;
export type QType = (typeof TYPES)[number];
export const TYPE_LABEL: Record<QType, string> = {
  mc_single: "Multiple choice (one answer)", mc_multi: "Multiple choice (several answers)", true_false: "True / false", image_label: "Diagram: drag names onto labels",
  match: "Matching pairs", order: "Put in order", fill_blank: "Fill in the blanks", short_text: "Short answer", numeric: "Number", hotspot: "Click the spot on a picture",
};
export const BLANK: Record<QType, () => any> = {
  mc_single: () => ({ choices: ["", ""], correct: -1 }), mc_multi: () => ({ choices: ["", ""], correct: [], scoring: "all" }), true_false: () => ({ correct: true }),
  image_label: () => ({ image: "", alt: "", zones: [], labels: [], key: {}, reuse: false }), match: () => ({ left: [], right: [], key: {} }), order: () => ({ items: [] }),
  fill_blank: () => ({ text: "", slots: [] }), short_text: () => ({ accepted: [""], regex: "" }), numeric: () => ({ value: 0, tolerance: 0, unit: "" }), hotspot: () => ({ image: "", alt: "", regions: [] }),
};
