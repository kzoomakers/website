/** May this token read (or publish to) all of these topics? A token with no topic list covers every topic. */
export const tokenAllows = (t: { scopes: string[]; topics: string[] }, topics: string[], write: boolean) =>
  t.scopes.includes(write ? "publish" : "read") && (!t.topics.length || topics.every((n) => t.topics.includes(n)));
