// Profile facts that the member directory can search and filter by. Add a line to add a dimension (and an input in profile.tsx to edit it).
export const FIELDS = {
  occupation: { label: "Occupation", multi: false },
  company: { label: "Company", multi: false },
  industry: { label: "Industry", multi: false },
  city: { label: "City", multi: false },
  neighborhood: { label: "Neighborhood", multi: false },
  interests: { label: "Interests", multi: true },
} as const;
export type Fields = Record<string, string[]>;

// Offered in the profile's industry picker; anything else is typed under "Other" and is stored as typed.
export const INDUSTRIES = [
  "Arts & design", "Construction & trades", "Education", "Engineering", "Finance & insurance", "Food & hospitality", "Government & nonprofit",
  "Healthcare", "Manufacturing", "Real estate", "Retail", "Science & research", "Technology", "Transportation & logistics",
  "Student", "Retired", "Between jobs",
];
